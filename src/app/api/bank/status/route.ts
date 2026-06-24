import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 🏦 Estado do banco para a UI: saldo do BANCO (User.goldBalance, claimável) +
// a carteira de cada personagem (Character.gold, "na mão", usada nas compras).
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const [user, characters] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { goldBalance: true } }),
    prisma.character.findMany({
      where: { userId },
      select: { id: true, name: true, class: true, gold: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return NextResponse.json({
    bankGold: Number(user?.goldBalance ?? 0),
    characters: characters.map((c) => ({ id: c.id, name: c.name, class: c.class, gold: Number(c.gold ?? 0) })),
  })
}
