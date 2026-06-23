import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Encerra a run ativa (ao sair da masmorra). Recompensas já foram creditadas
// por nó/abate; não há nada a "salvar" aqui — só fecha a sessão.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { runId } = await req.json()
    if (!runId) return NextResponse.json({ error: 'runId é obrigatório' }, { status: 400 })

    await prisma.dungeonRun.updateMany({
      where: { id: runId, userId, status: 'active' },
      data: { status: 'abandoned' },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error abandoning dungeon run:', error)
    return NextResponse.json({ error: 'Failed to abandon run' }, { status: 500 })
  }
}
