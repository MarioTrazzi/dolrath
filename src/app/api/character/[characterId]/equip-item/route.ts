import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { EquipmentSlotType } from '@prisma/client'
import { recordEquipmentChange } from '@/lib/characterHistory'

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
    const characterInventoryItem = await prisma.characterInventory.findFirst({
      where: {
        characterId: params.characterId,
        itemId: itemId,
      },
      include: {
        item: true,
      },
    });

    if (!characterInventoryItem) {
      console.log('Item not found in character inventory');
      return NextResponse.json({ error: 'Item not found in character inventory' }, { status: 404 });
    }

    // Verificar se o personagem tem nível suficiente para equipar o item
    if (character.level < characterInventoryItem.item.level) {
      return NextResponse.json({ 
        error: `Level insuficiente. Você precisa ser nível ${characterInventoryItem.item.level} para equipar este item.` 
      }, { status: 400 });
    }

    // Para anéis, verificar qual slot está disponível
    let finalSlotType = slotType as EquipmentSlotType;
    if (slotType === 'RING_1') {
      // Verificar se RING_1 está ocupado, se sim, usar RING_2
      const ring1Equipment = await prisma.characterEquipment.findFirst({
        where: {
          characterId: params.characterId,
          slot: 'RING_1',
        },
      });
      
      if (ring1Equipment) {
        // RING_1 ocupado, verificar se RING_2 está livre
        const ring2Equipment = await prisma.characterEquipment.findFirst({
          where: {
            characterId: params.characterId,
            slot: 'RING_2',
          },
        });
        
        if (ring2Equipment) {
          // Ambos slots de anel estão ocupados, desequipar RING_1
          await prisma.characterEquipment.delete({
            where: {
              id: ring1Equipment.id,
            },
          });
          console.log('Removed existing ring from RING_1');
        } else {
          // RING_2 está livre, usar ele
          finalSlotType = 'RING_2';
          console.log('Using RING_2 slot instead');
        }
      }
    } else {
      // Para outros tipos de equipamento, verificar se já existe um item equipado no slot
      const existingEquipment = await prisma.characterEquipment.findFirst({
        where: {
          characterId: params.characterId,
          slot: finalSlotType,
        },
      });

      // Se existe um item equipado no slot, desequipar primeiro
      if (existingEquipment) {
        await prisma.characterEquipment.delete({
          where: {
            id: existingEquipment.id,
          },
        });
        console.log(`Removed existing item from ${finalSlotType} slot`);
      }
    }

    // Equipar o novo item
    const newEquipment = await prisma.characterEquipment.create({
      data: {
        characterId: params.characterId,
        itemId: itemId,
        slot: finalSlotType,
      },
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
