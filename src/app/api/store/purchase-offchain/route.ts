import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { assertInventoryRoom } from '@/lib/inventoryMutations'

export const dynamic = 'force-dynamic'

// 💰 Compra do ferreiro paga com GOLD OFF-CHAIN (User.goldBalance) — sem tx
// on-chain e sem mint de NFT. O item nasce como linha normal de inventário
// (DB). Isto torna o goldBalance um SINK real: queima o mesmo pote que o
// faucet enche, ANTES do claim — menos gold vira token. A NFT só é cunhada
// depois, ao listar no marketplace (lazy mint). Preço é servidor-autoritativo
// (item.goldPrice do catálogo); o cliente nunca envia o valor.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { itemId, characterId, quantity } = await req.json()
    if (!itemId || !characterId) {
      return NextResponse.json({ error: 'itemId e characterId são obrigatórios' }, { status: 400 })
    }
    const qty = Math.max(1, Math.min(99, Math.floor(Number(quantity) || 1)))

    const [item, character] = await Promise.all([
      prisma.item.findUnique({ where: { id: itemId } }),
      prisma.character.findFirst({ where: { id: characterId, userId } }),
    ])
    if (!item) return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })
    if (!character) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })

    const unitPrice = Math.max(0, Math.floor(item.goldPrice ?? 0))
    const totalCost = unitPrice * qty

    const result = await prisma.$transaction(async (tx) => {
      // Paga com a CARTEIRA DO PERSONAGEM (Character.gold — "dinheiro na mão").
      // Para usar o gold do banco, o jogador saca antes em /inventory. [[bank — Opção B]]
      const charGold = await tx.character.findUnique({ where: { id: characterId }, select: { gold: true } })
      if (!charGold || charGold.gold < totalCost) {
        throw new Error(`GOLD insuficiente na carteira do personagem: precisa de ${totalCost} 🪙.`)
      }

      await tx.character.update({ where: { id: characterId }, data: { gold: { decrement: totalCost } } })

      const isConsumable = item.type === 'CONSUMABLE'
      if (isConsumable) {
        // Consumível empilha numa única linha (enhancementLevel 0).
        const existing = await tx.characterInventory.findFirst({
          where: { characterId, itemId: item.id, enhancementLevel: 0 },
        })
        if (existing) {
          await tx.characterInventory.update({ where: { id: existing.id }, data: { quantity: { increment: qty } } })
        } else {
          await assertInventoryRoom(tx, characterId, 1)
          await tx.characterInventory.create({ data: { characterId, itemId: item.id, quantity: qty, enhancementLevel: 0 } })
        }
      } else {
        // Equipamento NÃO agrupa: cada peça é um slot próprio (+0) — precisa de `qty` linhas novas.
        await assertInventoryRoom(tx, characterId, qty)
        for (let i = 0; i < qty; i++) {
          await tx.characterInventory.create({ data: { characterId, itemId: item.id, quantity: 1, enhancementLevel: 0 } })
        }
      }

      const updated = await tx.character.findUnique({ where: { id: characterId }, select: { gold: true } })
      return { characterGold: updated?.gold ?? 0 }
    })

    return NextResponse.json({
      success: true,
      added: qty,
      cost: totalCost,
      characterGold: result.characterGold,
      message: `🛒 Comprou ${qty}× ${item.name} por ${totalCost} GOLD.`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na compra'
    const status = message.includes('insuficiente') || message.includes('Inventário cheio') ? 400 : 500
    if (status === 500) console.error('Error in off-chain purchase:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
