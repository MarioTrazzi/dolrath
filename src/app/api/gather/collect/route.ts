import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { collectGatheringSession, findOpenGatheringSession, syncGatheringSession } from '@/lib/gatheringServer'
import { getProfessionLevelInfo } from '@/lib/professionSystem'
import { addHistoryEntry } from '@/lib/characterHistory'

export const dynamic = 'force-dynamic'

// ⛏️ Coleta o rendimento acumulado SEM encerrar a sessão (se ativa, ela segue
// rendendo). Deposita o que couber no inventário (padrão addDropToInventoryTx:
// consumível empilha, então cada item ocupa no máx. 1 slot) e credita gatherXp.
// O que não coube permanece pendente — nada é descartado aqui.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { characterId } = await req.json()
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

    const synced = await syncGatheringSession(open)

    // Um "aguardar último ciclo" pendente já fechou a sessão sozinho nesta
    // sincronização — nada mais a coletar, ela não está mais 'active'.
    if (synced.autoStopped) {
      const itens = synced.autoStopped.deposited.map((d) => `${d.qty}× ${d.name}`).join(', ')
      addHistoryEntry({
        characterId,
        activityType: 'ITEM_GAINED',
        description: `⛏️ Coletou ${itens || 'nada'} (+${synced.autoStopped.xpGained} XP de Coleta).`,
      }).catch(() => {})

      return NextResponse.json({
        deposited: synced.autoStopped.deposited,
        skipped: synced.autoStopped.skipped,
        xpGained: synced.autoStopped.xpGained,
        gather: getProfessionLevelInfo(synced.autoStopped.gatherXp),
        sessionClosed: true,
        stamina: synced.stamina,
      })
    }

    const result = await collectGatheringSession(synced.session, 'collect')

    if (result.deposited.length > 0 || result.xpGained > 0) {
      const itens = result.deposited.map((d) => `${d.qty}× ${d.name}`).join(', ')
      addHistoryEntry({
        characterId,
        activityType: 'ITEM_GAINED',
        description: `⛏️ Coletou ${itens || 'nada'} (+${result.xpGained} XP de Coleta).`,
      }).catch(() => {})
    }

    return NextResponse.json({
      deposited: result.deposited,
      skipped: result.skipped,
      xpGained: result.xpGained,
      gather: getProfessionLevelInfo(result.gatherXp),
      sessionClosed: result.closed,
      stamina: synced.stamina,
    })
  } catch (error) {
    console.error('Error collecting gathering session:', error)
    return NextResponse.json({ error: 'Failed to collect gathering session' }, { status: 500 })
  }
}
