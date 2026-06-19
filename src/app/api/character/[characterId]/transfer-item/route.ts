import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const session = await auth();

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { itemId, quantity = 1 } = await req.json();
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));

    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Verify character belongs to the user
    const character = await prisma.character.findFirst({
      where: {
        id: params.characterId,
        userId: session.user.id,
      },
    });

    if (!character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      );
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { type: true },
    });
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    // Equipamento NÃO agrupa (cada peça ocupa seu próprio slot, para a economia
    // de slots). Consumíveis empilham normalmente.
    const isConsumable = item.type === 'CONSUMABLE';

    // Check if user has the item in their global inventory
    const userInventoryItem = await prisma.userInventory.findFirst({
      where: {
        userId: session.user.id,
        itemId: itemId,
      },
    });

    if (!userInventoryItem || userInventoryItem.quantity < qty) {
      return NextResponse.json(
        { error: 'Not enough items in user inventory' },
        { status: 400 }
      );
    }

    // Verificar se o personagem tem slots suficientes no inventário.
    const currentInventoryCount = await prisma.characterInventory.count({
      where: {
        characterId: character.id,
      },
    });

    // Consumível empilha numa pilha existente (≤ 1 slot novo); equipamento
    // precisa de 1 slot por unidade.
    const existingConsumable = isConsumable
      ? await prisma.characterInventory.findFirst({
          where: { characterId: character.id, itemId, enhancementLevel: 0 },
        })
      : null;
    const slotsNeeded = isConsumable ? (existingConsumable ? 0 : 1) : qty;

    if (currentInventoryCount + slotsNeeded > character.inventorySlots) {
      const free = Math.max(0, character.inventorySlots - currentInventoryCount);
      return NextResponse.json({
        error: `Inventário cheio! Precisa de ${slotsNeeded} slot(s) livre(s), mas só há ${free}. Expanda seus slots ou mova itens para o inventário global.`
      }, { status: 400 });
    }

    // Start transaction to transfer items
    const result = await prisma.$transaction(async (tx) => {
      // Remove item from user inventory
      if (userInventoryItem.quantity === qty) {
        await tx.userInventory.delete({ where: { id: userInventoryItem.id } });
      } else {
        await tx.userInventory.update({
          where: { id: userInventoryItem.id },
          data: { quantity: { decrement: qty } },
        });
      }

      if (isConsumable) {
        // Consumível: empilha numa única linha.
        if (existingConsumable) {
          return tx.characterInventory.update({
            where: { id: existingConsumable.id },
            data: { quantity: { increment: qty } },
            include: { item: true },
          });
        }
        return tx.characterInventory.create({
          data: { characterId: character.id, itemId, quantity: qty },
          include: { item: true },
        });
      }

      // Equipamento: cria uma linha (slot) por unidade — não agrupa.
      let last = null;
      for (let i = 0; i < qty; i++) {
        last = await tx.characterInventory.create({
          data: { characterId: character.id, itemId, quantity: 1 },
          include: { item: true },
        });
      }
      return last;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error transferring item:', error);
    return NextResponse.json(
      { error: 'Failed to transfer item' },
      { status: 500 }
    );
  }
}
