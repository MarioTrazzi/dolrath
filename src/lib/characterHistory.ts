import { prisma } from './prisma';
import { ActivityType } from '@prisma/client';

interface HistoryEntry {
  characterId: string;
  activityType: ActivityType;
  description: string;
  details?: any;
  itemId?: string;
  goldAmount?: number;
  xpAmount?: number;
  oldLevel?: number;
  newLevel?: number;
}

export async function addHistoryEntry(entry: HistoryEntry) {
  try {
    return await prisma.characterHistory.create({
      data: {
        characterId: entry.characterId,
        activityType: entry.activityType,
        description: entry.description,
        details: entry.details || null,
        itemId: entry.itemId || null,
        goldAmount: entry.goldAmount || null,
        xpAmount: entry.xpAmount || null,
        oldLevel: entry.oldLevel || null,
        newLevel: entry.newLevel || null,
      },
    });
  } catch (error) {
    console.error('Erro ao adicionar entrada de histórico:', error);
    throw error;
  }
}

export async function getCharacterHistory(characterId: string, limit: number = 50) {
  try {
    return await prisma.characterHistory.findMany({
      where: { characterId },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            type: true,
            goldPrice: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    console.error('Erro ao buscar histórico do personagem:', error);
    throw error;
  }
}

// Funções específicas para diferentes tipos de atividade
export async function recordItemPurchase(characterId: string, itemId: string, itemName: string, goldAmount: number) {
  return addHistoryEntry({
    characterId,
    activityType: ActivityType.ITEM_PURCHASE,
    description: `Comprou ${itemName} por ${goldAmount} gold`,
    itemId,
    goldAmount,
    details: { action: 'purchase', itemName, price: goldAmount },
  });
}

export async function recordItemGained(characterId: string, itemId: string, itemName: string, source: string) {
  return addHistoryEntry({
    characterId,
    activityType: ActivityType.ITEM_GAINED,
    description: `Obteve ${itemName} (${source})`,
    itemId,
    details: { action: 'gained', itemName, source },
  });
}

export async function recordItemConsumed(characterId: string, itemId: string, itemName: string, effect: string) {
  return addHistoryEntry({
    characterId,
    activityType: ActivityType.ITEM_CONSUMED,
    description: `Consumiu ${itemName} - ${effect}`,
    itemId,
    details: { action: 'consumed', itemName, effect },
  });
}

export async function recordXpGained(characterId: string, xpAmount: number, source: string, oldLevel?: number, newLevel?: number) {
  const description = newLevel && newLevel > (oldLevel || 0) 
    ? `Ganhou ${xpAmount} XP (${source}) e subiu para o nível ${newLevel}!`
    : `Ganhou ${xpAmount} XP (${source})`;
    
  return addHistoryEntry({
    characterId,
    activityType: newLevel && newLevel > (oldLevel || 0) ? ActivityType.LEVEL_UP : ActivityType.XP_GAINED,
    description,
    xpAmount,
    oldLevel,
    newLevel,
    details: { action: 'xp_gained', source, xpAmount, oldLevel, newLevel },
  });
}

export async function recordGoldTransaction(characterId: string, goldAmount: number, type: 'gained' | 'spent', description: string) {
  return addHistoryEntry({
    characterId,
    activityType: type === 'gained' ? ActivityType.GOLD_GAINED : ActivityType.GOLD_SPENT,
    description,
    goldAmount: Math.abs(goldAmount),
    details: { action: type, amount: goldAmount, description },
  });
}

export async function recordEquipmentChange(characterId: string, itemId: string, itemName: string, action: 'equipped' | 'unequipped') {
  return addHistoryEntry({
    characterId,
    activityType: action === 'equipped' ? ActivityType.ITEM_EQUIPPED : ActivityType.ITEM_UNEQUIPPED,
    description: action === 'equipped' ? `Equipou ${itemName}` : `Desequipou ${itemName}`,
    itemId,
    details: { action, itemName },
  });
}

export async function recordDungeonCompleted(characterId: string, dungeonName: string, reward: any) {
  return addHistoryEntry({
    characterId,
    activityType: ActivityType.DUNGEON_COMPLETED,
    description: `Completou a dungeon: ${dungeonName}`,
    details: { action: 'dungeon_completed', dungeonName, reward },
  });
}

export async function recordCharacterCreated(characterId: string, characterName: string, race: string, characterClass: string) {
  return addHistoryEntry({
    characterId,
    activityType: ActivityType.CHARACTER_CREATED,
    description: `Personagem criado: ${characterName} (${race} ${characterClass})`,
    details: { action: 'character_created', characterName, race, class: characterClass },
  });
}

export async function recordAttributeDistribution(characterId: string, attributesChanged: any) {
  return addHistoryEntry({
    characterId,
    activityType: ActivityType.ATTRIBUTE_DISTRIBUTED,
    description: `Distribuiu pontos de atributo`,
    details: { action: 'attribute_distribution', attributesChanged },
  });
}

export async function recordInventoryExpansion(characterId: string, oldSlots: number, newSlots: number, goldCost: number) {
  return addHistoryEntry({
    characterId,
    activityType: ActivityType.INVENTORY_EXPANDED,
    description: `Expandiu inventário de ${oldSlots} para ${newSlots} slots por ${goldCost} gold`,
    goldAmount: goldCost,
    details: { action: 'inventory_expansion', oldSlots, newSlots, goldCost },
  });
}
