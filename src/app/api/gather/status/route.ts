import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { findOpenGatheringSession, syncGatheringSession } from '@/lib/gatheringServer'
import { getProfessionLevelInfo } from '@/lib/professionSystem'
import { GATHER_TICK_SECONDS, GATHER_TICK_STAMINA } from '@/lib/gathering'

export const dynamic = 'force-dynamic'

// ⛏️ Estado vivo da sessão de coleta do personagem. É o "relógio" da coleta:
// cada chamada computa lazy os tiques decorridos (debita stamina, acumula
// rendimento em pendingYield) e devolve o retrato atual. Idempotente — chamar
// duas vezes seguidas não rende nada a mais.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { searchParams } = new URL(req.url)
    const characterId = searchParams.get('characterId')
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }

    const character = await prisma.character.findFirst({
      where: { id: characterId, userId },
      select: { id: true, stamina: true, maxStamina: true, gatherXp: true },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const open = await findOpenGatheringSession(characterId)
    if (!open) {
      return NextResponse.json({
        session: null,
        stamina: character.stamina,
        maxStamina: character.maxStamina,
        gather: getProfessionLevelInfo(character.gatherXp),
        tickSeconds: GATHER_TICK_SECONDS,
        tickStamina: GATHER_TICK_STAMINA,
      })
    }

    const synced = await syncGatheringSession(open)
    const gatherXp = await prisma.character.findUnique({
      where: { id: characterId },
      select: { gatherXp: true },
    })

    return NextResponse.json({
      session: {
        id: synced.session.id,
        fieldId: synced.session.fieldId,
        status: synced.session.status,
        startedAt: synced.session.startedAt,
        lastTickAt: synced.session.lastTickAt,
      },
      pending: synced.pending,
      stamina: synced.stamina,
      maxStamina: character.maxStamina,
      secondsToNextTick: synced.secondsToNextTick,
      gather: getProfessionLevelInfo(gatherXp?.gatherXp ?? character.gatherXp),
      tickSeconds: GATHER_TICK_SECONDS,
      tickStamina: GATHER_TICK_STAMINA,
    })
  } catch (error) {
    console.error('Error syncing gathering session:', error)
    return NextResponse.json({ error: 'Failed to sync gathering session' }, { status: 500 })
  }
}
