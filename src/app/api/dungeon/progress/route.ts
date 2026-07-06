import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// 🏆 Progresso de TIER de um personagem em cada masmorra. Retorna um mapa
// { [dungeonId]: maxTier }. Masmorra sem registro = Tier 1 (o cliente assume 1 no
// fallback). A tela de seleção usa isto para montar as abas de tier de cada card.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const characterId = new URL(req.url).searchParams.get('characterId')
  if (!characterId) {
    return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
  }

  // Posse: o personagem tem de ser do usuário logado.
  const owns = await prisma.character.findFirst({ where: { id: characterId, userId }, select: { id: true } })
  if (!owns) {
    return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
  }

  const rows = await prisma.dungeonProgress.findMany({
    where: { characterId },
    select: { dungeonId: true, maxTier: true },
  })
  const progress: Record<string, number> = {}
  for (const r of rows) progress[r.dungeonId] = r.maxTier
  return NextResponse.json({ progress })
}
