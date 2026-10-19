import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// 🏦 SACAR: move GOLD do BANCO (User.goldBalance) para a carteira de um
// personagem (Character.gold), habilitando-o a comprar no ferreiro/alquimista.
// Qualquer personagem da conta pode sacar do banco compartilhado.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { characterId, amount } = await req.json()
    const value = Math.floor(Number(amount))
    if (!characterId) return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'Quantia inválida' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({ where: { id: characterId, userId }, select: { id: true } })
      if (!character) throw new Error('Personagem não encontrado')
      // Débito condicional: dois saques simultâneos não podem os dois passar no
      // mesmo saldo lido (o banco ia a negativo e o gold aparecia em dobro).
      const debit = await tx.user.updateMany({
        where: { id: userId, goldBalance: { gte: value } },
        data: { goldBalance: { decrement: value } },
      })
      if (debit.count === 0) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { goldBalance: true } })
        throw new Error(`Saldo do banco insuficiente (tem ${user?.goldBalance ?? 0} 🪙).`)
      }

      const [bank, char] = await Promise.all([
        tx.user.findUnique({ where: { id: userId }, select: { goldBalance: true } }),
        tx.character.update({ where: { id: characterId }, data: { gold: { increment: value } }, select: { gold: true } }),
      ])
      return { characterGold: char.gold, bankGold: bank?.goldBalance ?? 0 }
    })

    return NextResponse.json({ success: true, moved: value, ...result, message: `🏦 Sacou ${value} 🪙 do banco.` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao sacar'
    const status = /insuficiente|não encontrado/.test(message) ? 400 : 500
    if (status === 500) console.error('Error in bank withdraw:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
