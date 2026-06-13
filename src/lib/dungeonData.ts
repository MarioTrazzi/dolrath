// Dados estáticos das dungeons do Dolrath RPG

import {
  RewardType,
  Rarity,
  Material,
  MaterialType,
  MaterialUse,
  DungeonMonster
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

// === MONSTROS DE DUNGEON ===

export const DUNGEON_MONSTERS: DungeonMonster[] = [
  // Monstros Rank F (Level 1)
  {
    id: 'cave_bat',
    name: 'Morcego da Caverna',
    level: 1,
    attributes: {
      strength: 40,
      dexterity: 80,
      intelligence: 30,
      constitution: 50,
      wisdom: 60,
      charisma: 20
    },
    hp: 12,
    maxHp: 12,
    abilities: ['Voo', 'Ecolocalização'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'leather', rarity: Rarity.COMMON, dropRate: 0.3, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 5,
    description: 'Pequeno morcego que habita cavernas escuras'
  },
  {
    id: 'stone_spider',
    name: 'Aranha de Pedra',
    level: 1,
    attributes: {
      strength: 45,
      dexterity: 90,
      intelligence: 35,
      constitution: 55,
      wisdom: 70,
      charisma: 15
    },
    hp: 10,
    maxHp: 10,
    abilities: ['Teia', 'Camuflagem'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'stone', rarity: Rarity.COMMON, dropRate: 0.4, minQuantity: 1, maxQuantity: 2 }
    ],
    xpReward: 6,
    description: 'Aranha que se camufla entre as rochas da mina'
  },
  {
    id: 'goblin_scout',
    name: 'Batedor Goblin',
    level: 1,
    attributes: {
      strength: 60,
      dexterity: 85,
      intelligence: 55,
      constitution: 65,
      wisdom: 45,
      charisma: 25
    },
    hp: 15,
    maxHp: 15,
    abilities: ['Ataque Furtivo', 'Esquiva'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'leather', rarity: Rarity.COMMON, dropRate: 0.2, minQuantity: 1, maxQuantity: 1 },
      { itemType: RewardType.MATERIAL, itemName: 'iron_ore', rarity: Rarity.COMMON, dropRate: 0.1, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 8,
    description: 'Pequeno goblin ágil que explora cavernas em busca de tesouros'
  },
  {
    id: 'goblin_guard',
    name: 'Guarda Goblin',
    level: 2,
    attributes: {
      strength: 75,
      dexterity: 70,
      intelligence: 50,
      constitution: 80,
      wisdom: 40,
      charisma: 30
    },
    hp: 22,
    maxHp: 22,
    abilities: ['Golpe Forte', 'Defesa'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'iron_ore', rarity: Rarity.COMMON, dropRate: 0.4, minQuantity: 1, maxQuantity: 2 },
      { itemType: RewardType.MATERIAL, itemName: 'leather', rarity: Rarity.COMMON, dropRate: 0.3, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 12,
    description: 'Goblin robusto que protege as passagens das cavernas'
  },
  {
    id: 'goblin_shaman',
    name: 'Xamã Goblin',
    level: 2,
    attributes: {
      strength: 50,
      dexterity: 60,
      intelligence: 90,
      constitution: 70,
      wisdom: 85,
      charisma: 65
    },
    hp: 18,
    maxHp: 18,
    abilities: ['Cura Menor', 'Raio Mágico', 'Enfraquecer'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'herb', rarity: Rarity.COMMON, dropRate: 0.6, minQuantity: 1, maxQuantity: 3 },
      { itemType: RewardType.MATERIAL, itemName: 'iron_ore', rarity: Rarity.COMMON, dropRate: 0.2, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 15,
    description: 'Goblin místico com poderes de cura e magia elemental'
  },
  {
    id: 'cave_troll',
    name: 'Troll das Cavernas',
    level: 3,
    attributes: {
      strength: 120,
      dexterity: 40,
      intelligence: 30,
      constitution: 110,
      wisdom: 35,
      charisma: 20
    },
    hp: 35,
    maxHp: 35,
    abilities: ['Esmagar', 'Regeneração', 'Berro Intimidador'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'stone', rarity: Rarity.COMMON, dropRate: 0.7, minQuantity: 2, maxQuantity: 4 },
      { itemType: RewardType.MATERIAL, itemName: 'iron_ore', rarity: Rarity.COMMON, dropRate: 0.4, minQuantity: 1, maxQuantity: 2 }
    ],
    xpReward: 25,
    description: 'Criatura gigante e brutal que domina as profundezas das cavernas'
  },

  // Monstros Rank E
  {
    id: 'goblin',
    name: 'Goblin',
    level: 3,
    attributes: {
      strength: 80,
      dexterity: 90,
      intelligence: 60,
      constitution: 70,
      wisdom: 50,
      charisma: 30
    },
    hp: 25,
    maxHp: 25,
    abilities: ['Ataque Rápido', 'Esquiva'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'iron_ore', rarity: Rarity.COMMON, dropRate: 0.6, minQuantity: 1, maxQuantity: 2 },
      { itemType: RewardType.MATERIAL, itemName: 'leather', rarity: Rarity.COMMON, dropRate: 0.4, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 15,
    description: 'Pequeno humanóide verde com dentes afiados e olhos maliciosos'
  },
  {
    id: 'cave_rat',
    name: 'Rato das Cavernas',
    level: 2,
    attributes: {
      strength: 50,
      dexterity: 110,
      intelligence: 40,
      constitution: 60,
      wisdom: 70,
      charisma: 20
    },
    hp: 15,
    maxHp: 15,
    abilities: ['Mordida Venenosa', 'Furtividade'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'herb', rarity: Rarity.COMMON, dropRate: 0.3, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 8,
    description: 'Roedor gigante com pelos escuros e dentes afiados'
  },

  // Monstros Rank D
  {
    id: 'skeleton_warrior',
    name: 'Guerreiro Esqueleto',
    level: 8,
    attributes: {
      strength: 120,
      dexterity: 80,
      intelligence: 70,
      constitution: 100,
      wisdom: 60,
      charisma: 10
    },
    hp: 60,
    maxHp: 60,
    abilities: ['Golpe Ósseo', 'Regeneração Menor'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'iron_ore', rarity: Rarity.COMMON, dropRate: 0.8, minQuantity: 2, maxQuantity: 3 },
      { itemType: RewardType.MATERIAL, itemName: 'silver_ore', rarity: Rarity.RARE, dropRate: 0.2, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 40,
    description: 'Esqueleto animado por magia negra, empunhando uma espada enferrujada'
  },
  {
    id: 'crystal_spider',
    name: 'Aranha de Cristal',
    level: 10,
    attributes: {
      strength: 90,
      dexterity: 140,
      intelligence: 80,
      constitution: 85,
      wisdom: 90,
      charisma: 40
    },
    hp: 50,
    maxHp: 50,
    abilities: ['Teia Cristalina', 'Ataque Venenoso'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'blue_crystal', rarity: Rarity.RARE, dropRate: 0.7, minQuantity: 1, maxQuantity: 2 },
      { itemType: RewardType.MATERIAL, itemName: 'magic_herb', rarity: Rarity.RARE, dropRate: 0.3, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 60,
    description: 'Aranha com carapaça cristalina que reflete a luz de forma hipnótica'
  },

  // Monstros Rank C
  {
    id: 'earth_golem',
    name: 'Golem de Terra',
    level: 20,
    attributes: {
      strength: 180,
      dexterity: 60,
      intelligence: 90,
      constitution: 200,
      wisdom: 80,
      charisma: 30
    },
    hp: 150,
    maxHp: 150,
    abilities: ['Punho de Pedra', 'Pele de Rocha', 'Terremoto'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'stone', rarity: Rarity.COMMON, dropRate: 0.9, minQuantity: 3, maxQuantity: 5 },
      { itemType: RewardType.MATERIAL, itemName: 'gold_ore', rarity: Rarity.EPIC, dropRate: 0.1, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 120,
    description: 'Colossal construto de pedra e terra, animado por magia ancestral'
  },
  {
    id: 'fire_elemental',
    name: 'Elemental do Fogo',
    level: 25,
    attributes: {
      strength: 140,
      dexterity: 120,
      intelligence: 160,
      constitution: 130,
      wisdom: 110,
      charisma: 80
    },
    hp: 120,
    maxHp: 120,
    abilities: ['Bola de Fogo', 'Imunidade ao Fogo', 'Explosão Flamejante'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'arcane_crystal', rarity: Rarity.EPIC, dropRate: 0.4, minQuantity: 1, maxQuantity: 2 },
      { itemType: RewardType.MATERIAL, itemName: 'magic_herb', rarity: Rarity.RARE, dropRate: 0.6, minQuantity: 2, maxQuantity: 3 }
    ],
    xpReward: 180,
    description: 'Ser feito de puro fogo e energia mágica, irradiando calor intenso'
  },

  // Monstros Rank B
  {
    id: 'young_dragon',
    name: 'Dragão Jovem',
    level: 35,
    attributes: {
      strength: 220,
      dexterity: 150,
      intelligence: 180,
      constitution: 200,
      wisdom: 160,
      charisma: 120
    },
    hp: 300,
    maxHp: 300,
    abilities: ['Sopro de Fogo', 'Voo', 'Garras Dracônicas', 'Escamas Protetoras'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'dragon_scale_minor', rarity: Rarity.RARE, dropRate: 0.8, minQuantity: 2, maxQuantity: 4 },
      { itemType: RewardType.MATERIAL, itemName: 'dragon_scale', rarity: Rarity.EPIC, dropRate: 0.3, minQuantity: 1, maxQuantity: 2 },
      { itemType: RewardType.MATERIAL, itemName: 'mithril_ore', rarity: Rarity.EPIC, dropRate: 0.2, minQuantity: 1, maxQuantity: 1 }
    ],
    xpReward: 400,
    description: 'Dragão em sua juventude, mas já poderoso e ameaçador'
  },

  // Monstros Rank A
  {
    id: 'shadow_lord',
    name: 'Lorde das Sombras',
    level: 50,
    attributes: {
      strength: 180,
      dexterity: 250,
      intelligence: 220,
      constitution: 190,
      wisdom: 200,
      charisma: 150
    },
    hp: 450,
    maxHp: 450,
    abilities: ['Lâmina Sombria', 'Teletransporte', 'Domínio das Trevas', 'Regeneração'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'adamantite_ore', rarity: Rarity.LEGENDARY, dropRate: 0.1, minQuantity: 1, maxQuantity: 1 },
      { itemType: RewardType.MATERIAL, itemName: 'divine_essence', rarity: Rarity.LEGENDARY, dropRate: 0.05, minQuantity: 1, maxQuantity: 1 },
      { itemType: RewardType.MATERIAL, itemName: 'arcane_crystal', rarity: Rarity.EPIC, dropRate: 0.4, minQuantity: 2, maxQuantity: 3 }
    ],
    xpReward: 800,
    description: 'Senhor das trevas envolto em sombras, mestre da magia negra'
  },

  // Monstros Rank S
  {
    id: 'ancient_dragon',
    name: 'Dragão Ancião',
    level: 80,
    attributes: {
      strength: 350,
      dexterity: 200,
      intelligence: 280,
      constitution: 320,
      wisdom: 250,
      charisma: 200
    },
    hp: 1000,
    maxHp: 1000,
    abilities: ['Sopro Devastador', 'Magia Dracônica', 'Fúria Ancestral', 'Presença Intimidadora'],
    dropTable: [
      { itemType: RewardType.MATERIAL, itemName: 'dragon_heart', rarity: Rarity.LEGENDARY, dropRate: 0.8, minQuantity: 1, maxQuantity: 1 },
      { itemType: RewardType.MATERIAL, itemName: 'divine_essence', rarity: Rarity.LEGENDARY, dropRate: 0.3, minQuantity: 1, maxQuantity: 2 },
      { itemType: RewardType.MATERIAL, itemName: 'adamantite_ore', rarity: Rarity.LEGENDARY, dropRate: 0.5, minQuantity: 1, maxQuantity: 2 }
    ],
    xpReward: 2000,
    description: 'Dragão milenário, uma das criaturas mais poderosas do mundo'
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

export const getMonsterById = (id: string): DungeonMonster | undefined => {
  return DUNGEON_MONSTERS.find(monster => monster.id === id)
}

export const getMonstersByLevel = (minLevel: number, maxLevel: number): DungeonMonster[] => {
  return DUNGEON_MONSTERS.filter(monster => 
    monster.level >= minLevel && monster.level <= maxLevel
  )
} 