import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { collectGatheringSession, findOpenGatheringSession, syncGatheringSession } from '@/lib/gatheringServer'
import { getProfessionLevelInfo } from '@/lib/professionSystem'

export const dynamic = 'force-dynamic'

// ⛏️ Encerra a sessão de coleta: sincroniza os últimos tiques, deposita o que
// couber, credita o XP e fecha ('collected'). Itens que não couberam no
// inventário são DESCARTADOS e devolvidos em `skipped` para a UI avisar —
// é a única rota que abre mão de espólio (o /collect preserva).
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
