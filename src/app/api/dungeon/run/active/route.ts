import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { isRunLive } from '@/lib/dungeonRunServer'

export const dynamic = 'force-dynamic'

// Diz se um herói tem uma run VIVA agora (heartbeat recente em alguma aba). A tela
// de seleção usa isto para detectar e bloquear o "Entrar" do mesmo personagem em
// outra aba/janela (anti-duplicata), antes mesmo de tentar abrir a run.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const characterId = searchParams.get('characterId')
  if (!characterId) {
    return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
  }

  const run = await prisma.dungeonRun.findFirst({
    where: { characterId, userId, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  })
  const active = !!run && isRunLive(run)
  return NextResponse.json({ active, dungeonId: active ? run!.dungeonId : null })
}
