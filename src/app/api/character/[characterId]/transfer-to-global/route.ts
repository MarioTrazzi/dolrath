import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { takeFromCharacterInventory, InventoryQuantityError } from '@/lib/inventoryMutations';
import { getT } from '@/lib/i18n/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const t = getT()
  const session = await auth();

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const body = await req.json();
    const itemId = body?.itemId;
    // Saneado: antes o `quantity` cru ia direto pro decrement, e um valor
    // negativo AUMENTAVA a pilha do personagem (−5 ⇒ +5 itens do nada).
    const quantity = Math.max(1, Math.floor(Number(body?.quantity ?? 1) || 1));

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
        { error: t('A worn item cannot go to the Global Chest. Repair it at the blacksmith before transferring.') },
        { status: 400 }
      );
    }

    // Anti-duplicação: peça travada por um lazy-mint em andamento não sai da
    // mochila (mesma regra da venda ao ferreiro).
    const lockedAt = (characterInventoryItem as any).listingLockedAt as Date | null;
    if (lockedAt && Date.now() - new Date(lockedAt).getTime() < 20 * 60_000) {
      return NextResponse.json(
        { error: 'This piece is being listed on the market. Wait a few minutes.' },
        { status: 409 }
      );
    }

    // ⚠️ Não existe checagem de "item equipado" aqui de propósito: equipar move a
    // peça para CharacterEquipment e a REMOVE do inventário. Toda linha em
    // CharacterInventory está, por definição, desequipada — checar por itemId
    // bloqueava a CÓPIA guardada quando outra igual estava vestida.

    // Start transaction to transfer items back to global inventory
    const result = await prisma.$transaction(async (tx) => {
      // Remove item from character inventory — atômico: duas transferências
      // simultâneas da mesma pilha não podem as duas passar (duplicava item).
      await takeFromCharacterInventory(tx, characterInventoryItem.id, quantity);

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
    if (error instanceof InventoryQuantityError) {
      return NextResponse.json(
        { error: 'Not enough items in character inventory' },
        { status: 409 }
      );
    }
    console.error('Error transferring item to global inventory:', error);
    return NextResponse.json(
      { error: 'Failed to transfer item to global inventory' },
      { status: 500 }
    );
  }
}
