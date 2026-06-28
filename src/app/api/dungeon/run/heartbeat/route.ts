import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// 💓 Mantém o LOCK VIVO da run (anti-duplicata entre abas). A aba que está jogando
// chama isto a cada ~25s para tocar updatedAt, mantendo a run "viva" enquanto o
// jogador explora ocioso (entre /step e /combat). Devolve `active` — se vier false,
// a run foi encerrada/assumida em outro lugar e o cliente deve parar.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { runId } = await req.json()
    if (!runId) return NextResponse.json({ error: 'runId é obrigatório' }, { status: 400 })

    const run = await prisma.dungeonRun.findFirst({ where: { id: runId, userId } })
    if (!run) return NextResponse.json({ active: false, status: 'missing' }, { status: 404 })
    if (run.status !== 'active') {
      return NextResponse.json({ active: false, status: run.status })
    }

    // Reescreve um valor existente (no-op) só para forçar o @updatedAt a avançar.
    await prisma.dungeonRun.update({ where: { id: run.id }, data: { cursor: run.cursor } })
    return NextResponse.json({ active: true })
  } catch (error) {
    console.error('Error on dungeon run heartbeat:', error)
    return NextResponse.json({ error: 'Failed to heartbeat' }, { status: 500 })
  }
}
