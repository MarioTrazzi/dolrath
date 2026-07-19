import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { dailyLoginGold } from '@/lib/questCatalog'
import { utcDayKey } from '@/lib/questServer'

export const dynamic = 'force-dynamic'

// 🎁 Recompensa de login diário — nível de CONTA: ouro vai pro banco
// (User.goldBalance), não pra carteira de um personagem. Uma linha por dia UTC;
// o unique (userId, dayKey) transforma corrida/reenvio em P2002 → 409 deduped
// (mesmo padrão de idempotência do PvP). Streak = streak de ontem + 1.
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const now = new Date()
    const dayKey = utcDayKey(now)
    const yesterdayKey = utcDayKey(new Date(now.getTime() - 86400000))

    const result = await prisma.$transaction(async (tx) => {
      const prev = await tx.dailyLoginClaim.findUnique({
        where: { userId_dayKey: { userId, dayKey: yesterdayKey } },
      })
      const streak = (prev?.streak ?? 0) + 1
      const gold = dailyLoginGold(streak)

      await tx.dailyLoginClaim.create({ data: { userId, dayKey, streak, gold } })
      await tx.user.update({ where: { id: userId }, data: { goldBalance: { increment: gold } } })

      return { gold, streak }
    })

    return NextResponse.json(result)
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Recompensa de hoje já resgatada.', deduped: true }, { status: 409 })
    }
    console.error('Error claiming daily login:', error)
    return NextResponse.json({ error: 'Failed to claim daily login' }, { status: 500 })
  }
}
