// Catálogo de materiais do Dolrath RPG (crafting, reparo, aprimoramento, alquimia).
//
// NOTA: o antigo sistema de masmorras (monstros rank F–S) foi removido. As
// masmorras ativas vivem em `dungeonAdventures.ts` e as "Aventuras" semanais
// (TODO) ainda serão projetadas. Este arquivo mantém apenas os MATERIAIS.

import {
  Rarity,
  Material,
  MaterialType,
  MaterialUse
} from '@/types/game'

// === MATERIAIS DISPONÍVEIS ===

export const MATERIALS: Material[] = [
  // Materiais Comuns
  {
    id: 'iron_ore',
    name: 'Minério de Ferro',
    description: 'Minério básico usado para forjar armas e armaduras',
    rarity: Rarity.COMMON,
    type: MaterialType.METAL,
    useFor: [MaterialUse.WEAPON_CRAFT, MaterialUse.ARMOR_CRAFT, MaterialUse.WEAPON_REPAIR],
    tokenValue: 5,
    imageUrl: '/materials/iron_ore.png'
  },
  {
    id: 'stone',
    name: 'Pedra',
    description: 'Pedra comum encontrada em cavernas',
    rarity: Rarity.COMMON,
    type: MaterialType.RARE_EARTH,
    useFor: [MaterialUse.ARMOR_CRAFT, MaterialUse.ENHANCEMENT],
    tokenValue: 2,
    imageUrl: '/materials/stone.png'
  },
  {
    id: 'leather',
    name: 'Couro',
    description: 'Couro resistente de animais',
    rarity: Rarity.COMMON,
    type: MaterialType.ORGANIC,
    useFor: [MaterialUse.ARMOR_CRAFT, MaterialUse.ARMOR_REPAIR],
    tokenValue: 8,
    imageUrl: '/materials/leather.png'
  },
  {
    id: 'herb',
    name: 'Erva Medicinal',
    description: 'Erva com propriedades curativas',
    rarity: Rarity.COMMON,
    type: MaterialType.ORGANIC,
    useFor: [MaterialUse.ALCHEMY],
    tokenValue: 12,
    imageUrl: '/materials/herb.png'
  },

  // Materiais Raros
  {
    id: 'silver_ore',
    name: 'Minério de Prata',
    description: 'Minério mais puro que o ferro, excelente para armas',
    rarity: Rarity.RARE,
    type: MaterialType.METAL,
    useFor: [MaterialUse.WEAPON_CRAFT, MaterialUse.ENHANCEMENT],
    tokenValue: 25,
    imageUrl: '/materials/silver_ore.png'
  },
  {
    id: 'blue_crystal',
    name: 'Cristal Azul',
    description: 'Cristal que pulsa com energia mágica',
    rarity: Rarity.RARE,
    type: MaterialType.GEM,
    useFor: [MaterialUse.ENHANCEMENT, MaterialUse.ALCHEMY],
    tokenValue: 50,
    imageUrl: '/materials/blue_crystal.png'
  },
  {
    id: 'dragon_scale_minor',
    name: 'Escama Menor de Dragão',
    description: 'Escama pequena mas resistente de dragões jovens',
    rarity: Rarity.RARE,
    type: MaterialType.ORGANIC,
    useFor: [MaterialUse.ARMOR_CRAFT, MaterialUse.ENHANCEMENT],
    tokenValue: 100,
    imageUrl: '/materials/dragon_scale_minor.png'
  },
  {
    id: 'magic_herb',
    name: 'Erva Mágica',
    description: 'Erva rara imbuída com poder arcano',
    rarity: Rarity.RARE,
    type: MaterialType.MAGICAL,
    useFor: [MaterialUse.ALCHEMY, MaterialUse.ENHANCEMENT],
    tokenValue: 75,
    imageUrl: '/materials/magic_herb.png'
  },

  // Materiais Épicos
  {
    id: 'gold_ore',
    name: 'Minério de Ouro',
    description: 'Minério precioso que conduz energia mágica',
    rarity: Rarity.EPIC,
    type: MaterialType.METAL,
    useFor: [MaterialUse.WEAPON_CRAFT, MaterialUse.ENHANCEMENT, MaterialUse.TRADING],
    tokenValue: 200,
    imageUrl: '/materials/gold_ore.png'
  },
  {
    id: 'mithril_ore',
    name: 'Minério de Mithril',
    description: 'Metal lendário, leve como uma pluma mas forte como o aço',
    rarity: Rarity.EPIC,
    type: MaterialType.METAL,
    useFor: [MaterialUse.WEAPON_CRAFT, MaterialUse.ARMOR_CRAFT, MaterialUse.ENHANCEMENT],
    tokenValue: 500,
    imageUrl: '/materials/mithril_ore.png'
  },
  {
    id: 'dragon_scale',
    name: 'Escama de Dragão',
    description: 'Escama completa de dragão adulto, extremamente resistente',
    rarity: Rarity.EPIC,
    type: MaterialType.ORGANIC,
    useFor: [MaterialUse.ARMOR_CRAFT, MaterialUse.ENHANCEMENT],
    tokenValue: 750,
    imageUrl: '/materials/dragon_scale.png'
  },
  {
    id: 'arcane_crystal',
    name: 'Cristal Arcano',
    description: 'Cristal pulsante com poder mágico concentrado',
    rarity: Rarity.EPIC,
    type: MaterialType.GEM,
    useFor: [MaterialUse.ENHANCEMENT, MaterialUse.ALCHEMY],
    tokenValue: 600,
    imageUrl: '/materials/arcane_crystal.png'
  },

  // Materiais Lendários
  {
    id: 'adamantite_ore',
    name: 'Minério de Adamantite',
    description: 'O metal mais forte conhecido, forjado nas profundezas do mundo',
    rarity: Rarity.LEGENDARY,
    type: MaterialType.METAL,
    useFor: [MaterialUse.WEAPON_CRAFT, MaterialUse.ARMOR_CRAFT, MaterialUse.ENHANCEMENT],
    tokenValue: 2000,
    imageUrl: '/materials/adamantite_ore.png'
  },
  {
    id: 'divine_essence',
    name: 'Essência Divina',
    description: 'Essência pura dos deuses, extremamente rara',
    rarity: Rarity.LEGENDARY,
    type: MaterialType.ESSENCE,
    useFor: [MaterialUse.ENHANCEMENT, MaterialUse.ALCHEMY],
    tokenValue: 5000,
    imageUrl: '/materials/divine_essence.png'
  },
  {
    id: 'dragon_heart',
    name: 'Coração de Dragão',
    description: 'Coração ainda pulsante de um dragão ancião',
    rarity: Rarity.LEGENDARY,
    type: MaterialType.ORGANIC,
    useFor: [MaterialUse.WEAPON_CRAFT, MaterialUse.ENHANCEMENT, MaterialUse.ALCHEMY],
    tokenValue: 10000,
    imageUrl: '/materials/dragon_heart.png'
  }
]
// === FUNÇÕES UTILITÁRIAS ===

export const getMaterialById = (id: string): Material | undefined => {
  return MATERIALS.find(material => material.id === id)
}

export const getMaterialsByRarity = (rarity: Rarity): Material[] => {
  return MATERIALS.filter(material => material.rarity === rarity)
}

export const getMaterialsByType = (type: MaterialType): Material[] => {
  return MATERIALS.filter(material => material.type === type)
}
