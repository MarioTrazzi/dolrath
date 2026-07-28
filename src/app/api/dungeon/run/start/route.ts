import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { buildTrail, getDungeon, isRunLive, flushStaleRuns } from '@/lib/dungeonRunServer'
import { clampDungeonTier } from '@/lib/dungeonAdventures'
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
    const { characterId, dungeonId, tier: rawTier } = await req.json()
    if (!characterId || !dungeonId) {
      return NextResponse.json({ error: 'characterId e dungeonId são obrigatórios' }, { status: 400 })
    }
    const tier = clampDungeonTier(rawTier)

    const dungeon = getDungeon(String(dungeonId))
    if (!dungeon) {
      return NextResponse.json({ error: 'Masmorra inválida' }, { status: 400 })
    }

    // ⚡ Uma onda só: estas quatro leituras não dependem umas das outras, e em fila
    // elas eram metade da espera de "entrar na masmorra" (cada round-trip até o
    // Postgres custa dezenas de ms).
    const [rawCharacter, progress, inventoryUsed, existing] = await Promise.all([
      prisma.character.findFirst({ where: { id: characterId, userId } }),
      prisma.dungeonProgress.findUnique({
        where: { characterId_dungeonId: { characterId, dungeonId: dungeon.id } },
        select: { maxTier: true },
      }),
      prisma.characterInventory.count({ where: { characterId } }),
      // 🔒 Anti-duplicata entre abas: se a CONTA já tem alguma run VIVA (heartbeat
      // recente em outra aba/janela), bloqueia — não importa qual personagem, só dá
      // pra farmar um herói de cada vez.
      prisma.dungeonRun.findFirst({
        where: { userId, status: 'active' },
        orderBy: { updatedAt: 'desc' },
        include: { character: { select: { name: true } } },
      }),
    ])
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    // Stamina viva ao abrir a sessão (regen passivo aplicado e persistido). Já
    // devolve a sessão de coleta ativa, se houver — antes essa mesma linha era
    // consultada duas vezes por request.
    const character = await regenAndPersist(rawCharacter)

    // Sem gate de nível na ENTRADA: toda masmorra é acessível. Quem está sub-nivelado
    // limpa as salas (que acompanham seu nível) mas apanha do BOSS (ancorado no
    // clearLevel + gear-alvo) — a dificuldade e o boss são o gate, não o levelReq.

    // 🏆 Gate de TIER: só dá pra rodar um tier já DESBLOQUEADO (≤ maxTier). O maxTier
    // começa em 1 (Tier I sempre disponível) e sobe vencendo o boss (ver /finish).
    const maxTier = progress?.maxTier ?? 1
    if (tier > maxTier) {
      return NextResponse.json(
        { error: `Tier ${tier} ainda não desbloqueado (máximo: ${maxTier}). Vença o boss no tier ${maxTier} para liberar o próximo.`, maxTier },
        { status: 403 }
      )
    }

    const trail = buildTrail(dungeon)

    // Aviso (não bloqueia): se o inventário já está no limite, os drops que
    // exigirem uma linha nova não serão coletados durante a run.
    const inventoryFull = inventoryUsed >= character.inventorySlots

    // ⛏️ Herói ocupado coletando não entra em masmorra (o inverso também vale —
    // gather/start bloqueia herói em run viva). Sessão 'exhausted' (só aguardando
    // coleta do espólio) não bloqueia: o herói já parou de trabalhar.
    const gathering = character.gathering?.status === 'active' ? character.gathering : null
    if (gathering) {
      return NextResponse.json(
        {
          error: 'Este herói está numa sessão de coleta. Encerre a coleta antes de entrar na masmorra.',
          code: 'HERO_GATHERING',
          fieldId: gathering.fieldId,
        },
        { status: 409 }
      )
    }

    // Runs órfãs (aba caiu) já passaram da janela do lock e são drenadas abaixo.
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

    // Uma única run ativa por personagem: DRENA o espólio de qualquer anterior
    // (órfã) antes de abandoná-la. Como o crédito da run agora acontece só no
    // /finish, uma aba que fechou no meio deixaria o acumulado pendurado — é aqui
    // que ele chega ao jogador. Só roda quando existe run órfã de verdade.
    if (existing) await flushStaleRuns({ userId })

    const run = await prisma.dungeonRun.create({
      data: {
        userId,
        characterId,
        dungeonId: dungeon.id,
        tier,
        nodeCount: trail.length,
        cursor: 0,
        status: 'active',
      },
    })

    return NextResponse.json({
      runId: run.id,
      dungeonId: dungeon.id,
      nodeCount: trail.length,
      cursor: 0,
      stamina: character.stamina,
      maxStamina: character.maxStamina,
      inventoryFull,
      // O cliente prevê os drops que não caberão (a mochila só é escrita no
      // /finish) — precisa saber de onde partiu.
      inventoryUsed,
      inventorySlots: character.inventorySlots,
    })
  } catch (error) {
    console.error('Error starting dungeon run:', error)
    return NextResponse.json({ error: 'Failed to start dungeon run' }, { status: 500 })
  }
}
