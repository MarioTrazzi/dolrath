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
