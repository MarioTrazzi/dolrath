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

  const userId = session.user.id;

  try {
    const { itemId, quantity = 1 } = await req.json();

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
        userId: userId,
      },
    });

    if (!character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      );
    }

    // Check if character has the item. O Baú Geral empilha por itemId (sem
    // aprimoramento nem durabilidade), então só instâncias ÍNTEGRAS (nível 0 e
    // durabilidade cheia) podem ir — senão o estado da peça seria apagado.
    const characterInventoryItem = await prisma.characterInventory.findFirst({
      where: {
        characterId: params.characterId,
        itemId: itemId,
        enhancementLevel: 0,
      },
      orderBy: { quantity: 'desc' },
    });

    if (!characterInventoryItem || characterInventoryItem.quantity < quantity) {
      return NextResponse.json(
        { error: 'Not enough items in character inventory' },
        { status: 400 }
      );
    }

    if (characterInventoryItem.durability < characterInventoryItem.maxDurability) {
      return NextResponse.json(
        { error: 'Item desgastado não pode ir ao Baú Geral. Repare-o no ferreiro antes de transferir.' },
        { status: 400 }
      );
    }

    // Check if item is currently equipped
    const equippedItem = await prisma.characterEquipment.findFirst({
      where: {
        characterId: params.characterId,
        itemId: itemId,
      },
    });

    if (equippedItem) {
      return NextResponse.json(
        { error: 'Cannot transfer equipped items. Please unequip the item first.' },
        { status: 400 }
      );
    }

    // Start transaction to transfer items back to global inventory
    const result = await prisma.$transaction(async (tx) => {
      // Remove item from character inventory
      if (characterInventoryItem.quantity === quantity) {
        // Delete the record if transferring all items
        await tx.characterInventory.delete({
          where: {
            id: characterInventoryItem.id,
          },
        });
      } else {
        // Decrease quantity
        await tx.characterInventory.update({
          where: {
            id: characterInventoryItem.id,
          },
          data: {
            quantity: {
              decrement: quantity,
            },
          },
        });
      }

      // Check if user already has this item in global inventory
      const existingUserItem = await tx.userInventory.findFirst({
        where: {
          userId: userId,
          itemId: itemId,
        },
      });

      if (existingUserItem) {
        // Update quantity if user already has the item
        return await tx.userInventory.update({
          where: {
            id: existingUserItem.id,
          },
          data: {
            quantity: {
              increment: quantity,
            },
          },
          include: {
            item: true,
          },
        });
      } else {
        // Add new item to user's global inventory
        return await tx.userInventory.create({
          data: {
            userId: userId,
            itemId: itemId,
            quantity: quantity,
          },
          include: {
            item: true,
          },
        });
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error transferring item to global inventory:', error);
    return NextResponse.json(
      { error: 'Failed to transfer item to global inventory' },
      { status: 500 }
    );
  }
}
