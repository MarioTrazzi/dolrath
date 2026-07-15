import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { collectGatheringSession, findOpenGatheringSession, syncGatheringSession } from '@/lib/gatheringServer'
import { getProfessionLevelInfo } from '@/lib/professionSystem'

export const dynamic = 'force-dynamic'

// ⛏️ Encerra a sessão de coleta. Três modos:
// - 'now' (padrão): sincroniza os últimos tiques, deposita o que couber,
//   credita o XP e fecha ('collected') JÁ. Itens que não couberam no
//   inventário são DESCARTADOS e devolvidos em `skipped` para a UI avisar.
// - 'after_cycle': se ainda ativa, só marca `stopRequested` — o ciclo em
//   curso termina normalmente e o PRÓPRIO syncGatheringSession fecha sozinho
//   assim que aquele tique render (sem abrir um novo). Se já não há mais
//   ciclo vindo (sessão 'exhausted'), não há o que esperar: encerra na hora.
// - 'cancel': desiste do encerramento agendado, a coleta segue normal.
export async function POST(req: Request) {
  const resolved = await requireApiActor(req)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const { characterId, mode } = await req.json()
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }
    const character = await prisma.character.findFirst({ where: { id: characterId, userId }, select: { id: true } })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const open = await findOpenGatheringSession(characterId)
    if (!open) {
      return NextResponse.json({ error: 'Nenhuma sessão de coleta em aberto' }, { status: 404 })
    }

    if (mode === 'cancel') {
      if (open.status === 'active' && open.stopRequested) {
        await prisma.gatheringSession.update({ where: { id: open.id }, data: { stopRequested: false } })
      }
      return NextResponse.json({ cancelled: true })
    }

    const synced = await syncGatheringSession(open)

    // O próprio sync já fechou (um ciclo agendado terminou nesta chamada).
    if (synced.autoStopped) {
      return NextResponse.json({
        deposited: synced.autoStopped.deposited,
        skipped: synced.autoStopped.skipped,
        xpGained: synced.autoStopped.xpGained,
        gather: getProfessionLevelInfo(synced.autoStopped.gatherXp),
        sessionClosed: true,
        stamina: synced.stamina,
      })
    }

    if (mode === 'after_cycle' && synced.session.status === 'active') {
      await prisma.gatheringSession.update({ where: { id: synced.session.id }, data: { stopRequested: true } })
      return NextResponse.json({
        waiting: true,
        secondsToNextTick: synced.secondsToNextTick,
        stamina: synced.stamina,
      })
    }

    const result = await collectGatheringSession(synced.session, 'stop')

    return NextResponse.json({
      deposited: result.deposited,
      skipped: result.skipped,
      xpGained: result.xpGained,
      gather: getProfessionLevelInfo(result.gatherXp),
      sessionClosed: true,
      stamina: synced.stamina,
    })
  } catch (error) {
    console.error('Error stopping gathering session:', error)
    return NextResponse.json({ error: 'Failed to stop gathering session' }, { status: 500 })
  }
}
