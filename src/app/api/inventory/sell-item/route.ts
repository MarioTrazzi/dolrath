import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getDisplayName } from '@/lib/enhancementSystem'

// Vende um item do BAÚ GERAL (UserInventory) para o ferreiro por METADE do preço
// base. Espelha /api/character/[id]/sell-item, mas o item é da conta (não de um
// personagem): o gold vai direto pro BANCO (User.goldBalance, claimável), que é o
// mesmo saldo exibido no rodapé do Baú Geral. Serve como "burn" da conta.
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const inventoryId: string | undefined = body?.inventoryId
    const requestedQty = Math.floor(Number(body?.quantity ?? 1))
    if (!inventoryId) {
      return NextResponse.json({ error: 'inventoryId é obrigatório' }, { status: 400 })
    }

    const inventoryItem = await prisma.userInventory.findFirst({
      where: { id: inventoryId, userId: session.user.id },
      include: { item: true },
    })
    if (!inventoryItem) {
      return NextResponse.json({ error: 'Item não encontrado no Baú Geral' }, { status: 404 })
    }

    const qty = Math.max(1, Math.min(inventoryItem.quantity, requestedQty || 1))
    const unitPrice = Math.max(0, Math.floor((inventoryItem.item.goldPrice ?? 0) / 2))
    const goldEarned = unitPrice * qty
    const displayName = getDisplayName(inventoryItem.item.name, 0)

    const updatedUser = await prisma.$transaction(async (tx) => {
      if (inventoryItem.quantity > qty) {
        await tx.userInventory.update({
          where: { id: inventoryItem.id },
          data: { quantity: { decrement: qty } },
        })
      } else {
        await tx.userInventory.delete({ where: { id: inventoryItem.id } })
      }

      if (goldEarned > 0) {
        return tx.user.update({
          where: { id: session.user!.id },
          data: { goldBalance: { increment: goldEarned } },
          select: { goldBalance: true },
        })
      }
      return tx.user.findUnique({ where: { id: session.user!.id }, select: { goldBalance: true } })
    })

    return NextResponse.json({
      success: true,
      sold: qty,
      goldEarned,
      bankGold: Number(updatedUser?.goldBalance ?? 0),
      message: `💰 Vendeu ${qty}x ${displayName} por ${goldEarned} gold!`,
    })
  } catch (error) {
    console.error('Error selling global item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
