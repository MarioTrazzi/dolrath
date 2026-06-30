import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { isRunLive } from '@/lib/dungeonRunServer'

export const dynamic = 'force-dynamic'

// Diz se a CONTA tem alguma run VIVA agora (heartbeat recente em alguma aba), não
// importa o personagem. A tela de seleção usa isto para bloquear o "Entrar" de
// QUALQUER herói enquanto outro já está numa masmorra em outra aba/janela — só dá
// pra farmar um personagem de cada vez.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const run = await prisma.dungeonRun.findFirst({
    where: { userId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
    include: { character: { select: { id: true, name: true } } },
  })
  const active = !!run && isRunLive(run)
  return NextResponse.json({
    active,
    dungeonId: active ? run!.dungeonId : null,
    characterId: active ? run!.characterId : null,
    characterName: active ? run!.character.name : null,
  })
}
