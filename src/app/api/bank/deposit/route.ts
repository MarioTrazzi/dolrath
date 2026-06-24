import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// 🏦 DEPOSITAR: move GOLD da carteira do personagem (Character.gold) para o
// BANCO (User.goldBalance). Só o que está no banco pode dar claim on-chain.
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
      const character = await tx.character.findFirst({ where: { id: characterId, userId }, select: { gold: true } })
      if (!character) throw new Error('Personagem não encontrado')
      if (character.gold < value) throw new Error(`Saldo do personagem insuficiente (tem ${character.gold} 🪙).`)

      const [char, user] = await Promise.all([
        tx.character.update({ where: { id: characterId }, data: { gold: { decrement: value } }, select: { gold: true } }),
        tx.user.update({ where: { id: userId }, data: { goldBalance: { increment: value } }, select: { goldBalance: true } }),
      ])
      return { characterGold: char.gold, bankGold: user.goldBalance }
    })

    return NextResponse.json({ success: true, moved: value, ...result, message: `🏦 Depositou ${value} 🪙 no banco.` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao depositar'
    const status = /insuficiente|não encontrado/.test(message) ? 400 : 500
    if (status === 500) console.error('Error in bank deposit:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
