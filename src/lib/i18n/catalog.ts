import { Locale } from './config'
import { CATALOG_EN, SPECIAL_EFFECT_EN } from './catalogNames'

// Display de entidades de catálogo/Itens do banco: o `name` PT é a chave
// interna congelada; em locale EN o mapa devolve o nome/descrição em inglês.
// Nome fora do mapa cai no PT (e o check-i18n-catalog acusa o buraco).

export function localizeItemName(ptName: string, locale: Locale): string {
  if (locale === 'pt') return ptName
  return CATALOG_EN[ptName]?.en ?? ptName
}

export function localizeItemDesc(
  ptName: string,
  ptDesc: string | null | undefined,
  locale: Locale
): string | null | undefined {
  if (locale === 'pt') return ptDesc
  return CATALOG_EN[ptName]?.descEn ?? ptDesc
}

export function localizeSpecialEffect(ptEffect: string, locale: Locale): string {
  if (locale === 'pt') return ptEffect
  return SPECIAL_EFFECT_EN[ptEffect] ?? ptEffect
}

/** Nome EN canônico p/ contextos permanentes (NFT metadata) — independe de locale. */
export function catalogNameEn(ptName: string): string {
  return CATALOG_EN[ptName]?.en ?? ptName
}

const ITEM_TYPE_LABEL_EN: Record<string, string> = {
  Espada: 'Sword',
  Machado: 'Axe',
  Adaga: 'Dagger',
  Arco: 'Bow',
  Cajado: 'Staff',
  'Armadura Leve': 'Light Armor',
  'Armadura Média': 'Medium Armor',
  'Armadura Pesada': 'Heavy Armor',
  'Elmo Leve': 'Light Helmet',
  'Elmo Médio': 'Medium Helmet',
  'Elmo Pesado': 'Heavy Helmet',
  'Luvas Leves': 'Light Gloves',
  'Luvas Médias': 'Medium Gloves',
  'Luvas Pesadas': 'Heavy Gloves',
  'Botas Leves': 'Light Boots',
  'Botas Médias': 'Medium Boots',
  'Botas Pesadas': 'Heavy Boots',
  Anel: 'Ring',
  Colar: 'Necklace',
  Escudo: 'Shield',
  Manoplas: 'Gauntlets',
  Orbe: 'Orb',
  Cinto: 'Belt',
  'Adaga de Parada': 'Parry Dagger',
  Talismã: 'Talisman',
  Consumível: 'Consumable',
  Item: 'Item',
}

/** Rótulo do TIPO do item (itemVisuals.getItemTypeLabel) — Espada/Machado/Armadura
 *  Leve/... usado em toda card/tooltip/badge de item do jogo. */
export function localizeItemTypeLabel(ptLabel: string, locale: Locale): string {
  if (locale === 'pt') return ptLabel
  return ITEM_TYPE_LABEL_EN[ptLabel] ?? ptLabel
}

const RARITY_LABEL_EN: Record<string, string> = {
  Comum: 'Common',
  Incomum: 'Uncommon',
  Rara: 'Rare',
  Raro: 'Rare',
  Épica: 'Epic',
  Épico: 'Epic',
  Lendária: 'Legendary',
  Lendário: 'Legendary',
}

/** Rótulo de raridade (bdoTheme.RARITY_UI[rarity].label e a cópia local de
 *  CraftItemThumb.tsx) — mesma fonte PT usada em toda bancada de craft. */
export function localizeRarityLabel(ptLabel: string, locale: Locale): string {
  if (locale === 'pt') return ptLabel
  return RARITY_LABEL_EN[ptLabel] ?? ptLabel
}
