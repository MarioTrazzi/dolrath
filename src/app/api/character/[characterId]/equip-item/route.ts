import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { EquipmentSlotType } from '@prisma/client'
import { recordEquipmentChange } from '@/lib/characterHistory'
import { canEquip, ItemTypeStr, RaceId } from '@/lib/itemCatalog'
import { restoreItemToInventory, removeOneFromInventory } from '@/lib/inventoryMutations'

export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  console.log("=== EQUIP API WORKING ===");
  console.log("Character ID:", params.characterId);
  
  try {
    const session = await auth();
    console.log('Session user ID:', session?.user?.id);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { itemId, slotType } = await request.json();
    console.log("Request body:", { itemId, slotType });

    if (!itemId || !slotType) {
      return NextResponse.json({ error: 'Item ID and slot type are required' }, { status: 400 });
    }

    // Verificar se o personagem pertence ao usuário
    const character = await prisma.character.findFirst({
      where: {
        id: params.characterId,
        userId: user.id,
      },
    });

    if (!character) {
      console.log('Character not found or not owned by user');
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    // Verificar se o personagem possui o item no inventário
    // (se houver instâncias aprimoradas, equipa a de maior nível)
    const characterInventoryItem = await prisma.characterInventory.findFirst({
      where: {
        characterId: params.characterId,
        itemId: itemId,
      },
      include: {
        item: true,
      },
      orderBy: [
        { enhancementLevel: 'desc' },
        { durability: 'desc' },
      ],
    });

    if (!characterInventoryItem) {
      console.log('Item not found in character inventory');
      return NextResponse.json({ error: 'Item not found in character inventory' }, { status: 404 });
    }

    // Anti-duplicação: peça travada por um lazy-mint em andamento não pode ser
    // equipada (senão sairia do inventário e ainda viraria NFT). Trava expira só.
    const lockedAt = (characterInventoryItem as any).listingLockedAt as Date | null
    if (lockedAt && Date.now() - new Date(lockedAt).getTime() < 20 * 60_000) {
      return NextResponse.json({ error: 'Esta peça está sendo listada no mercado. Aguarde alguns minutos.' }, { status: 409 });
    }

    // Verificar se o personagem tem nível suficiente para equipar o item
    if (character.level < characterInventoryItem.item.level) {
      return NextResponse.json({
        error: `Level insuficiente. Você precisa ser nível ${characterInventoryItem.item.level} para equipar este item.`
      }, { status: 400 });
    }

    // Restrição de equipamento: exclusividade de RAÇA + arma/peso por CLASSE 🧬⚔️
    const itemStats = (characterInventoryItem.item.stats as Record<string, any>) || {};
    const equipCheck = canEquip(
      character.race,
      character.class,
      characterInventoryItem.item.type as ItemTypeStr,
      (itemStats.raceRestriction as RaceId | null) || undefined
    );
    if (!equipCheck.ok) {
      return NextResponse.json({ error: `🧬 ${equipCheck.reason}` }, { status: 400 });
    }

    // Determina o slot final (anéis podem cair em RING_1 ou RING_2).
    let finalSlotType = slotType as EquipmentSlotType;
    if (slotType === 'RING_1') {
      const ring1Equipment = await prisma.characterEquipment.findFirst({
        where: { characterId: params.characterId, slot: 'RING_1' },
      });
      if (ring1Equipment) {
        const ring2Equipment = await prisma.characterEquipment.findFirst({
          where: { characterId: params.characterId, slot: 'RING_2' },
        });
        // RING_2 livre → usa RING_2; ambos ocupados → troca o de RING_1.
        if (!ring2Equipment) {
          finalSlotType = 'RING_2';
          console.log('Using RING_2 slot instead');
        }
      }
    }

    // Exclusão mútua "mão a mão" 🥊: manopla (arma do Monge) e luva ocupam as
    // mesmas mãos — nunca acumulam. Equipar uma devolve a outra ao inventário.
    //   • equipar MANOPLA  → desequipa a luva.
    //   • equipar LUVA     → desequipa as manoplas (principal + offhand de punhos).
    const equippingType = characterInventoryItem.item.type as string;
    const GLOVE_TYPES = ['LIGHT_GLOVES', 'MEDIUM_GLOVES', 'HEAVY_GLOVES'];

    // Tudo que muda estado roda em transação: devolve item trocado ao inventário,
    // remove o item equipado do inventário e cria o registro de equipamento.
    const newEquipment = await prisma.$transaction(async (tx) => {
      // Item atualmente equipado no slot final (se houver) volta para o inventário.
      const existingEquipment = await tx.characterEquipment.findFirst({
        where: { characterId: params.characterId, slot: finalSlotType },
      });
      if (existingEquipment) {
        await tx.characterEquipment.delete({ where: { id: existingEquipment.id } });
        await restoreItemToInventory(
          tx,
          params.characterId,
          existingEquipment.itemId,
          existingEquipment.enhancementLevel,
          existingEquipment.durability,
          existingEquipment.maxDurability,
        );
        console.log(`Unequipped existing item from ${finalSlotType} back to inventory`);
      }

      // Resolve a exclusão mútua manopla ↔ luva (slots diferentes das mãos).
      let mutexRows: { id: string; itemId: string; enhancementLevel: number; durability: number; maxDurability: number }[] = [];
      if (equippingType === 'GAUNTLET') {
        // Manopla nas mãos → tira qualquer luva equipada.
        mutexRows = await tx.characterEquipment.findMany({
          where: { characterId: params.characterId, slot: 'GLOVES' },
        });
      } else if (GLOVE_TYPES.includes(equippingType)) {
        // Luva nas mãos → tira manoplas (arma e/ou offhand de punhos), preservando
        // qualquer outra arma/secundária que não seja manopla.
        const handRows = await tx.characterEquipment.findMany({
          where: { characterId: params.characterId, slot: { in: ['WEAPON', 'SHIELD'] } },
          include: { item: true },
        });
        mutexRows = handRows.filter((row) => row.item.type === 'GAUNTLET');
      }
      for (const row of mutexRows) {
        await tx.characterEquipment.delete({ where: { id: row.id } });
        await restoreItemToInventory(
          tx, params.characterId, row.itemId, row.enhancementLevel, row.durability, row.maxDurability,
        );
        console.log(`Mutex hands: unequipped ${row.itemId} back to inventory`);
      }

      // O item equipado sai do inventário.
      await removeOneFromInventory(tx, characterInventoryItem.id);

      // Cria o equipamento com o aprimoramento E a durabilidade da instância escolhida.
      return tx.characterEquipment.create({
        data: {
          characterId: params.characterId,
          itemId: itemId,
          slot: finalSlotType,
          enhancementLevel: characterInventoryItem.enhancementLevel,
          durability: characterInventoryItem.durability,
          maxDurability: characterInventoryItem.maxDurability,
        },
      });
    });

    console.log(`Item ${itemId} equipped in slot ${finalSlotType}`);
    
    // Registrar no histórico
    try {
      await recordEquipmentChange(
        params.characterId, 
        itemId, 
        characterInventoryItem.item.name, 
        'equipped'
      );
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Item equipped successfully",
      equipment: newEquipment
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
