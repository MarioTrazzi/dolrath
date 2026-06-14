// ============================================================
// Identidade visual dos itens da loja
// - Agrupa os 21 ItemType em 6 categorias visuais
// - Cada categoria tem cor de destaque (accent) + tema de cenário
//   animado (ItemCardBackdrop), no mesmo estilo das masmorras
// ============================================================

export type ItemVisualCategory =
  | 'weapon'
  | 'arcane'
  | 'armor'
  | 'leather'
  | 'jewelry'
  | 'consumable'

export interface ItemVisualDef {
  category: ItemVisualCategory
  /** Rótulo amigável da categoria */
  label: string
  emoji: string
  /** Cor de destaque (hex) para bordas/brilhos/botões */
  accent: string
  /** Versão suave (rgba) para sombras/glow */
  accentSoft: string
  /** Classe de cor de texto Tailwind para o chip do tipo */
  chipText: string
  /** Classe de fundo Tailwind para o chip do tipo */
  chipBg: string
}

export const ITEM_VISUALS: Record<ItemVisualCategory, ItemVisualDef> = {
  weapon: {
    category: 'weapon',
    label: 'Arma',
    emoji: '⚔️',
    accent: '#ef4444',
    accentSoft: 'rgba(239,68,68,0.35)',
    chipText: 'text-red-300',
    chipBg: 'bg-red-500/20',
  },
  arcane: {
    category: 'arcane',
    label: 'Arcano',
    emoji: '🔮',
    accent: '#a855f7',
    accentSoft: 'rgba(168,85,247,0.35)',
    chipText: 'text-purple-300',
    chipBg: 'bg-purple-500/20',
  },
  armor: {
    category: 'armor',
    label: 'Proteção',
    emoji: '🛡️',
    accent: '#3b82f6',
    accentSoft: 'rgba(59,130,246,0.35)',
    chipText: 'text-sky-300',
    chipBg: 'bg-sky-500/20',
  },
  leather: {
    category: 'leather',
    label: 'Couro',
    emoji: '🧤',
    accent: '#c2701c',
    accentSoft: 'rgba(194,112,28,0.35)',
    chipText: 'text-orange-300',
    chipBg: 'bg-orange-500/20',
  },
  jewelry: {
    category: 'jewelry',
    label: 'Joia',
    emoji: '💎',
    accent: '#fbbf24',
    accentSoft: 'rgba(251,191,36,0.4)',
    chipText: 'text-amber-300',
    chipBg: 'bg-amber-500/20',
  },
  consumable: {
    category: 'consumable',
    label: 'Consumível',
    emoji: '🧪',
    accent: '#22c55e',
    accentSoft: 'rgba(34,197,94,0.35)',
    chipText: 'text-emerald-300',
    chipBg: 'bg-emerald-500/20',
  },
}

// Mapeia cada ItemType (string vinda da API) para uma categoria visual
const TYPE_TO_CATEGORY: Record<string, ItemVisualCategory> = {
  // Armas
  SWORD: 'weapon',
  AXE: 'weapon',
  DAGGER: 'weapon',
  BOW: 'weapon',
  // Arcano
  STAFF: 'arcane',
  // Proteção (peitorais, elmos e escudo)
  LIGHT_ARMOR: 'armor',
  MEDIUM_ARMOR: 'armor',
  HEAVY_ARMOR: 'armor',
  LIGHT_HELMET: 'armor',
  MEDIUM_HELMET: 'armor',
  HEAVY_HELMET: 'armor',
  SHIELD: 'armor',
  // Couro (luvas e botas)
  LIGHT_GLOVES: 'leather',
  MEDIUM_GLOVES: 'leather',
  HEAVY_GLOVES: 'leather',
  LIGHT_BOOTS: 'leather',
  MEDIUM_BOOTS: 'leather',
  HEAVY_BOOTS: 'leather',
  // Joias
  RING: 'jewelry',
  NECKLACE: 'jewelry',
  // Consumíveis
  CONSUMABLE: 'consumable',
}

/** Resolve a categoria visual a partir do tipo do item (tolerante a maiúsc/minúsc) */
export function getItemCategory(type?: string | null): ItemVisualCategory {
  if (!type) return 'consumable'
  return TYPE_TO_CATEGORY[type.toUpperCase()] ?? 'consumable'
}

/** Atalho: retorna a definição visual completa a partir do tipo */
export function getItemVisual(type?: string | null): ItemVisualDef {
  return ITEM_VISUALS[getItemCategory(type)]
}

/** Rótulos amigáveis (PT-BR) para exibir o tipo cru da API */
export const ITEM_TYPE_LABELS: Record<string, string> = {
  SWORD: 'Espada',
  AXE: 'Machado',
  DAGGER: 'Adaga',
  BOW: 'Arco',
  STAFF: 'Cajado',
  LIGHT_ARMOR: 'Armadura Leve',
  MEDIUM_ARMOR: 'Armadura Média',
  HEAVY_ARMOR: 'Armadura Pesada',
  LIGHT_HELMET: 'Elmo Leve',
  MEDIUM_HELMET: 'Elmo Médio',
  HEAVY_HELMET: 'Elmo Pesado',
  LIGHT_GLOVES: 'Luvas Leves',
  MEDIUM_GLOVES: 'Luvas Médias',
  HEAVY_GLOVES: 'Luvas Pesadas',
  LIGHT_BOOTS: 'Botas Leves',
  MEDIUM_BOOTS: 'Botas Médias',
  HEAVY_BOOTS: 'Botas Pesadas',
  RING: 'Anel',
  NECKLACE: 'Colar',
  SHIELD: 'Escudo',
  CONSUMABLE: 'Consumível',
}

export function getItemTypeLabel(type?: string | null): string {
  if (!type) return 'Item'
  return ITEM_TYPE_LABELS[type.toUpperCase()] ?? type
}
