import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { isRunLive } from '@/lib/dungeonRunServer'
import { regenAndPersist } from '@/lib/staminaServer'
import { getGatherField, GATHER_TICK_STAMINA } from '@/lib/gathering'
import { findOpenGatheringSession } from '@/lib/gatheringServer'

export const dynamic = 'force-dynamic'

// ⛏️ Abre uma sessão de COLETA idle (servidor-autoritativa, espelha
// dungeon/run/start). Diferença deliberada do lock de masmorra: a coleta é
// POR PERSONAGEM — vários heróis da mesma conta podem coletar em paralelo
// (é o objetivo: os reservas trabalham enquanto o principal batalha) — mas o
// mesmo herói não pode coletar e estar em masmorra ao mesmo tempo.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { characterId, fieldId } = await req.json()
    if (!characterId || !fieldId) {
      return NextResponse.json({ error: 'characterId e fieldId são obrigatórios' }, { status: 400 })
    }

    const field = getGatherField(String(fieldId))
    if (!field) {
      return NextResponse.json({ error: 'Campo de coleta inválido' }, { status: 400 })
    }

    const rawCharacter = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    if (!rawCharacter.isAlive) {
      return NextResponse.json({ error: 'Herói caído não pode coletar. Reviva-o antes.' }, { status: 400 })
    }

    // Regen pendente entra ANTES de abrir a sessão (depois dela ativa, o regen
    // fica suspenso — o relógio da coleta vira a autoridade da stamina).
    const character = await regenAndPersist(rawCharacter)
    if (character.stamina < GATHER_TICK_STAMINA) {
      return NextResponse.json(
        { error: `Stamina insuficiente para coletar (precisa de ${GATHER_TICK_STAMINA}).` },
        { status: 400 }
      )
    }

    // Sessão em aberto (ativa ou esgotada com espólio não coletado) trava outra.
    const open = await findOpenGatheringSession(characterId)
    if (open) {
      return NextResponse.json(
        {
          error: open.status === 'active'
            ? 'Este herói já está coletando. Encerre ou colete a sessão atual antes.'
            : 'Este herói tem espólio de coleta aguardando. Colete-o antes de começar outra sessão.',
          code: 'HERO_GATHERING',
          fieldId: open.fieldId,
        },
        { status: 409 }
      )
    }

    // Herói em masmorra viva (outra aba) não pode coletar.
    const run = await prisma.dungeonRun.findFirst({
      where: { characterId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    })
    if (run && isRunLive(run)) {
      return NextResponse.json(
        { error: 'Este herói está em uma masmorra. Saia da run antes de coletar.', code: 'HERO_IN_USE' },
        { status: 409 }
      )
    }

    const created = await prisma.gatheringSession.create({
      data: { userId, characterId, fieldId: field.id },
    })

    return NextResponse.json({
      sessionId: created.id,
      fieldId: field.id,
      startedAt: created.startedAt,
      stamina: character.stamina,
      maxStamina: character.maxStamina,
    })
  } catch (error) {
    console.error('Error starting gathering session:', error)
    return NextResponse.json({ error: 'Failed to start gathering session' }, { status: 500 })
  }
}
