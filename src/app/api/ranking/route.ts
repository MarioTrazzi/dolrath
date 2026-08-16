import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getGlobalLeaderboard } from '@/lib/pvpGlobalRanking'

// 🏆 Placar GLOBAL da arena: permanente, sem ciclo e sem premiação. Não há mais
// temporada consultável, pot, inscrição nem prévia de pagamento — o sistema de
// recompensa será redesenhado do zero.

// Lê a sessão do jogador (bloco "sua posição") — nunca estático.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const board = await getGlobalLeaderboard(50)

    const session = await auth()
    let me: {
      characterId: string
      name: string
      points: number
      wins: number
      losses: number
      rank: number | null
    } | null = null

    if (session?.user?.id) {
      const chars = await prisma.character.findMany({
        where: { userId: session.user.id },
        select: { id: true, name: true },
      })
      const ids = chars.map((c) => c.id)

      if (ids.length) {
        const ratings = await prisma.pvpGlobalRating.findMany({
          where: { characterId: { in: ids } },
          orderBy: { points: 'desc' },
        })
        if (ratings[0]) {
          const above = await prisma.pvpGlobalRating.count({
            where: {
              OR: [
                { points: { gt: ratings[0].points } },
                { points: ratings[0].points, wins: { gt: ratings[0].wins } },
              ],
            },
          })
          const char = chars.find((c) => c.id === ratings[0].characterId)
          me = {
            characterId: ratings[0].characterId,
            name: char?.name ?? '—',
            points: ratings[0].points,
            wins: ratings[0].wins,
            losses: ratings[0].losses,
            rank: above + 1,
          }
        }
      }
    }

    return NextResponse.json({
      leaderboard: board.map((r, i) => ({
        rank: i + 1,
        characterId: r.characterId,
        name: r.character.name,
        level: r.character.level,
        class: r.character.class,
        race: r.character.race,
        avatar: r.character.avatar,
        points: r.points,
        wins: r.wins,
        losses: r.losses,
      })),
      me,
    })
  } catch (e) {
    console.error('ranking GET', e)
    return NextResponse.json({ error: 'Failed to load ranking' }, { status: 500 })
  }
}
