import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// ⛏️ Sessões de coleta EM ABERTO de todos os personagens da conta — leitura
// pura (sem sincronizar tiques), para o dashboard e a página /gathering
// marcarem quem está trabalhando com uma chamada só.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sessions = await prisma.gatheringSession.findMany({
      where: { userId: session.user.id, status: { in: ['active', 'exhausted'] } },
      select: { characterId: true, fieldId: true, status: true, startedAt: true },
    })
    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Error listing gathering sessions:', error)
    return NextResponse.json({ error: 'Failed to list gathering sessions' }, { status: 500 })
  }
}
