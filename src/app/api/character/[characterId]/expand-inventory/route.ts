import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { recordInventoryExpansion } from '@/lib/characterHistory';

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const session = await auth();

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { slots } = await req.json();

    if (!slots || slots <= 0) {
      return NextResponse.json(
        { error: 'Invalid number of slots' },
        { status: 400 }
      );
    }

    // Verificar se o personagem pertence ao usuário
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

    // Buscar o usuário para verificar o gold
    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Calcular custo: 100 gold por slot adicional, aumentando progressivamente
    const currentSlots = character.inventorySlots;
    const baseCost = 100;
    let totalCost = 0;

    // Custo progressivo: cada slot fica mais caro
    for (let i = 0; i < slots; i++) {
      const slotNumber = currentSlots + i;
      const slotCost = baseCost * Math.floor(slotNumber / 10 + 1);
      totalCost += slotCost;
    }

    // Verificar se o usuário tem gold suficiente
    if (user.goldBalance < totalCost) {
      return NextResponse.json({
        error: `Gold insuficiente! Você precisa de ${totalCost} gold, mas tem apenas ${user.goldBalance}.`
      }, { status: 400 });
    }

    // Usar uma transação para garantir atomicidade
    const result = await prisma.$transaction(async (tx) => {
      // Deduzir gold do usuário
      await tx.user.update({
        where: {
          id: session.user!.id,
        },
        data: {
          goldBalance: {
            decrement: totalCost,
          },
        },
      });

      // Atualizar slots do personagem
      const updatedCharacter = await tx.character.update({
        where: {
          id: params.characterId,
        },
        data: {
          inventorySlots: {
            increment: slots,
          },
        },
      });

      return updatedCharacter;
    });

    // Registrar no histórico
    try {
      await recordInventoryExpansion(params.characterId, currentSlots, result.inventorySlots, totalCost);
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }

    return NextResponse.json({
      character: result,
      cost: totalCost,
      newSlots: result.inventorySlots,
    });
  } catch (error) {
    console.error('Error expanding inventory slots:', error);
    return NextResponse.json(
      { error: 'Failed to expand inventory slots' },
      { status: 500 }
    );
  }
}
