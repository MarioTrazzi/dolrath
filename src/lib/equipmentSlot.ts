import type { EquipmentSlotType } from '@prisma/client';

/** Mapeia o tipo do item pro slot de equipamento ao clicar em "Equipar" (fora do
 *  drag-and-drop, que já valida por slot em EquipmentSlot.tsx#canEquipInSlot).
 *  GAUNTLET (punhos do Monge) e DAGGER (adaga do Ladino) são armas primárias por
 *  padrão aqui; ORB (Mago), PARRY_DAGGER (Ladino) e TALISMAN (Monge) são offhands e
 *  sempre vão pra secundária (SHIELD), nunca pra WEAPON — não substituem a primária. */
export function getSlotTypeFromItemType(itemType: string): EquipmentSlotType {
  switch (itemType) {
    case 'LIGHT_HELMET':
    case 'MEDIUM_HELMET':
    case 'HEAVY_HELMET':
      return 'HELMET';
    case 'LIGHT_ARMOR':
    case 'MEDIUM_ARMOR':
    case 'HEAVY_ARMOR':
    // Traje de coleta substitui a armadura de corpo (peça única de profissão).
    case 'GATHER_GARB':
      return 'ARMOR';
    case 'SWORD':
    case 'AXE':
    case 'DAGGER':
    case 'STAFF':
    case 'BOW':
    case 'GAUNTLET':
    // Ferramentas de coleta SUBSTITUEM a arma (coletar te deixa "desarmado").
    case 'PICKAXE':
    case 'HERB_SICKLE':
    case 'LOGGING_AXE':
    case 'FISHING_ROD':
    case 'HUNTING_KNIFE':
      return 'WEAPON';
    case 'SHIELD':
    case 'ORB':
    case 'PARRY_DAGGER':
    case 'TALISMAN':
      return 'SHIELD';
    case 'LIGHT_GLOVES':
    case 'MEDIUM_GLOVES':
    case 'HEAVY_GLOVES':
      return 'GLOVES';
    case 'LIGHT_BOOTS':
    case 'MEDIUM_BOOTS':
    case 'HEAVY_BOOTS':
      return 'BOOTS';
    case 'NECKLACE':
      return 'NECKLACE';
    case 'RING':
      return 'RING_1'; // Sempre tentar RING_1 primeiro, a API decide o slot final
    case 'BELT':
      return 'BELT';
    default:
      return 'WEAPON';
  }
}

/** Mesma tabela do drag-and-drop (EquipmentSlot.tsx#canEquipInSlot). */
const SLOT_ITEM_TYPES: Record<EquipmentSlotType, readonly string[]> = {
  WEAPON: ['SWORD', 'AXE', 'DAGGER', 'STAFF', 'BOW', 'GAUNTLET',
    'PICKAXE', 'HERB_SICKLE', 'LOGGING_AXE', 'FISHING_ROD', 'HUNTING_KNIFE'],
  ARMOR: ['LIGHT_ARMOR', 'MEDIUM_ARMOR', 'HEAVY_ARMOR', 'GATHER_GARB'],
  // Secundária: escudo (guerreiro), orbe (mago), adaga de parada (ladino), talismã (monge).
  SHIELD: ['SHIELD', 'ORB', 'PARRY_DAGGER', 'TALISMAN'],
  BELT: ['BELT'],
  HELMET: ['LIGHT_HELMET', 'MEDIUM_HELMET', 'HEAVY_HELMET'],
  BOOTS: ['LIGHT_BOOTS', 'MEDIUM_BOOTS', 'HEAVY_BOOTS'],
  GLOVES: ['LIGHT_GLOVES', 'MEDIUM_GLOVES', 'HEAVY_GLOVES'],
  NECKLACE: ['NECKLACE'],
  RING_1: ['RING'],
  RING_2: ['RING'],
}

/** Validação do SERVIDOR: o slot pedido aceita este tipo de item? Sem isto o
 *  equip-item aceitava qualquer slot que o cliente mandasse (material na mão,
 *  duas armas em WEAPON + SHIELD etc.). */
export function isSlotValidForItemType(slot: string, itemType: string): slot is EquipmentSlotType {
  const allowed = (SLOT_ITEM_TYPES as Record<string, readonly string[] | undefined>)[slot]
  return !!allowed && allowed.includes(itemType)
}
