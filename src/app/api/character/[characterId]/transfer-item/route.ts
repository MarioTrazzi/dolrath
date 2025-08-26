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

    // Check if user has the item in their global inventory
    const userInventoryItem = await prisma.userInventory.findFirst({
      where: {
        userId: session.user.id,
        itemId: itemId,
      },
    });

    if (!userInventoryItem || userInventoryItem.quantity < quantity) {
      return NextResponse.json(
        { error: 'Not enough items in user inventory' },
        { status: 400 }
      );
    }

    // Verificar se o personagem tem slots suficientes no inventário
    const currentInventoryCount = await prisma.characterInventory.count({
      where: {
        characterId: character.id,
      },
    });

    // Verificar se já tem o item (para não contar duplicatas)
    const existingItem = await prisma.characterInventory.findFirst({
      where: {
        characterId: character.id,
        itemId: itemId,
      },
    });

    // Se não tem o item e está no limite de slots
    if (!existingItem && currentInventoryCount >= character.inventorySlots) {
      return NextResponse.json({
        error: `Inventário cheio! Você tem ${character.inventorySlots} slots. Expanda seus slots ou mova itens para o inventário global.`
      }, { status: 400 });
    }

    // Start transaction to transfer items
    const result = await prisma.$transaction(async (tx) => {
      // Remove item from user inventory
      if (userInventoryItem.quantity === quantity) {
        // Delete the record if transferring all items
        await tx.userInventory.delete({
          where: {
            id: userInventoryItem.id,
          },
        });
      } else {
        // Decrease quantity
        await tx.userInventory.update({
          where: {
            id: userInventoryItem.id,
          },
          data: {
            quantity: {
              decrement: quantity,
            },
          },
        });
      }

      // Check if character already has this item
      const existingCharacterItem = await tx.characterInventory.findFirst({
        where: {
          characterId: character.id,
          itemId: itemId,
        },
      });

      if (existingCharacterItem) {
        // Update quantity if character already has the item
        return await tx.characterInventory.update({
          where: {
            id: existingCharacterItem.id,
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
        // Add new item to character's inventory
        return await tx.characterInventory.create({
          data: {
            characterId: character.id,
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
    console.error('Error transferring item:', error);
    return NextResponse.json(
      { error: 'Failed to transfer item' },
      { status: 500 }
    );
  }
}
