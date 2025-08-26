import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { recordItemPurchase } from '@/lib/characterHistory';

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { itemId } = await req.json();

    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Get the item to check price
    const item = await prisma.item.findUnique({
      where: {
        id: itemId,
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      );
    }

    // Get user to check gold balance
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user has enough gold
    if (user.goldBalance < item.goldPrice) {
      return NextResponse.json(
        { error: `Gold insuficiente! Você precisa de ${item.goldPrice} gold, mas tem apenas ${user.goldBalance}.` },
        { status: 400 }
      );
    }

    // Check if user already has this item in global inventory
    const existingItem = await prisma.userInventory.findFirst({
      where: {
        userId: userId,
        itemId: itemId,
      },
    });

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Deduct gold from user
      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          goldBalance: {
            decrement: item.goldPrice,
          },
        },
      });

      if (existingItem) {
        // Update quantity if user already has the item
        return await tx.userInventory.update({
          where: {
            id: existingItem.id,
          },
          data: {
            quantity: {
              increment: 1,
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
            quantity: 1,
          },
          include: {
            item: true,
          },
        });
      }
    });

    // Registrar no histórico para todos os personagens do usuário
    try {
      // Buscar todos os personagens do usuário
      const userCharacters = await prisma.character.findMany({
        where: { userId: userId },
      });

      // Registrar a compra para todos os personagens
      for (const character of userCharacters) {
        await recordItemPurchase(character.id, item.id, item.name, item.goldPrice);
      }
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }

    return NextResponse.json({
      item: result,
      goldSpent: item.goldPrice,
      remainingGold: user.goldBalance - item.goldPrice,
    });
  } catch (error) {
    console.error('Error purchasing item:', error);
    return NextResponse.json(
      { error: 'Failed to purchase item' },
      { status: 500 }
    );
  }
}
