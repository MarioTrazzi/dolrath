import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { buildTrail, getDungeon, isRunLive } from '@/lib/dungeonRunServer'
import { regenAndPersist } from '@/lib/staminaServer'

export const dynamic = 'force-dynamic'

// Abre uma sessão de masmorra SERVIDOR-AUTORITATIVA. Valida posse + gating de
// nível e cria o registro DungeonRun (cursor 0). A partir daqui, todo gold/xp/
// loot é creditado pelo servidor em /step e /combat — nunca pelo cliente.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { characterId, dungeonId } = await req.json()
    if (!characterId || !dungeonId) {
      return NextResponse.json({ error: 'characterId e dungeonId são obrigatórios' }, { status: 400 })
    }

    const dungeon = getDungeon(String(dungeonId))
    if (!dungeon) {
      return NextResponse.json({ error: 'Masmorra inválida' }, { status: 400 })
    }

    const rawCharacter = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    // Stamina viva ao abrir a sessão (regen passivo aplicado e persistido).
    const character = await regenAndPersist(rawCharacter)

    // Gating de progressão: nível mínimo da masmorra.
    if (character.level < dungeon.levelReq) {
      return NextResponse.json(
        { error: `Nível ${dungeon.levelReq} necessário para entrar em ${dungeon.name}.`, levelReq: dungeon.levelReq },
        { status: 403 }
      )
    }

    const trail = buildTrail(dungeon)

    // Aviso (não bloqueia): se o inventário já está no limite, os drops que
    // exigirem uma linha nova não serão coletados durante a run.
    const inventoryUsed = await prisma.characterInventory.count({ where: { characterId } })
    const inventoryFull = inventoryUsed >= character.inventorySlots

    // 🔒 Anti-duplicata entre abas: se a CONTA já tem alguma run VIVA (heartbeat
    // recente em outra aba/janela), bloqueia — não importa qual personagem, só dá
    // pra farmar um herói de cada vez. Runs órfãs (aba caiu) já passaram da janela
    // e são abandonadas abaixo (só as do próprio personagem que está entrando).
    const existing = await prisma.dungeonRun.findFirst({
      where: { userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      include: { character: { select: { name: true } } },
    })
    if (existing && isRunLive(existing)) {
      const sameHero = existing.characterId === characterId
      return NextResponse.json(
        {
          error: sameHero
            ? 'Este herói já está em uma masmorra em outra aba ou janela. Saia da outra sessão para liberá-lo.'
            : `${existing.character.name} já está em uma masmorra em outra aba ou janela. Saia daquela sessão antes de entrar com outro herói.`,
          code: 'HERO_IN_USE',
          dungeonId: existing.dungeonId,
          characterId: existing.characterId,
          characterName: existing.character.name,
        },
        { status: 409 }
      )
    }

    // Uma única run ativa por personagem: encerra qualquer anterior (órfã) como abandonada.
    const run = await prisma.$transaction(async (tx) => {
      await tx.dungeonRun.updateMany({
        where: { characterId, status: 'active' },
        data: { status: 'abandoned' },
      })
      return tx.dungeonRun.create({
        data: {
          userId,
          characterId,
          dungeonId: dungeon.id,
          nodeCount: trail.length,
          cursor: 0,
          status: 'active',
        },
      })
    })

    return NextResponse.json({
      runId: run.id,
      dungeonId: dungeon.id,
      nodeCount: trail.length,
      cursor: 0,
      stamina: character.stamina,
      maxStamina: character.maxStamina,
      inventoryFull,
    })
  } catch (error) {
    console.error('Error starting dungeon run:', error)
    return NextResponse.json({ error: 'Failed to start dungeon run' }, { status: 500 })
  }
}
