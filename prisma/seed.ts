import { PrismaClient, ItemType } from '@prisma/client';

const prisma = new PrismaClient();

type ItemData = {
  name: string;
  description: string;
  type: ItemType;
  level: number;
  stats: Record<string, any>;
  goldPrice: number;
};

const items: ItemData[] = [
  // Weapons
  {
    name: "Espada do Dragão Carmesim",
    description: "Uma lâmina lendária forjada com escamas de dragão vermelho.",
    type: "WEAPON",
    level: 10,
    stats: {
      str: 5,
      bonusDamage: 15,
      bonusSpeed: 2,
      specialEffect: "Chance de causar dano de fogo"
    },
    goldPrice: 1500
  },
  {
    name: "Cajado do Arcano",
    description: "Um cajado antigo imbuído com poder mágico ancestral.",
    type: ItemType.WEAPON,
    level: 8,
    stats: {
      int: 8,
      mp: 20,
      bonusDamage: 12,
      specialEffect: "Aumenta regeneração de mana"
    },
    goldPrice: 1200
  },
  // Armor
  {
    name: "Armadura de Placas do Guardião",
    description: "Uma armadura robusta feita para os mais bravos guerreiros.",
    type: ItemType.ARMOR,
    level: 10,
    stats: {
      def: 8,
      hp: 30,
      bonusDefense: 15,
      specialEffect: "Reduz dano físico"
    },
    goldPrice: 1400
  },
  {
    name: "Vestes do Sábio",
    description: "Vestes encantadas que amplificam o poder mágico.",
    type: ItemType.ARMOR,
    level: 8,
    stats: {
      int: 5,
      mp: 25,
      bonusDefense: 8,
      specialEffect: "Aumenta poder mágico"
    },
    goldPrice: 1000
  },
  // Helmets
  {
    name: "Elmo do Comandante",
    description: "Um elmo ornamentado usado por grandes líderes.",
    type: ItemType.HELMET,
    level: 9,
    stats: {
      def: 5,
      hp: 15,
      bonusDefense: 10,
      specialEffect: "Aumenta resistência a status negativos"
    },
    goldPrice: 1100
  },
  {
    name: "Capuz do Ocultista",
    description: "Um capuz místico que aumenta a concentração mágica.",
    type: ItemType.HELMET,
    level: 7,
    stats: {
      int: 4,
      mp: 15,
      bonusDefense: 5,
      specialEffect: "Aumenta regeneração de mana"
    },
    goldPrice: 800
  },
  // Gloves
  {
    name: "Titan's Gauntlets",
    description: "Heavy gauntlets that increase physical strength.",
    type: ItemType.GLOVES,
    level: 8,
    stats: {
      str: 4,
      def: 3,
      bonusDamage: 8,
      specialEffect: "Increases critical damage"
    },
    goldPrice: 900
  },
  {
    name: "Conjurer's Gloves",
    description: "Delicate gloves woven with magical threads.",
    type: ItemType.GLOVES,
    level: 7,
    stats: {
      int: 3,
      mp: 10,
      bonusSpeed: 5,
      specialEffect: "Reduces mana cost"
    },
    goldPrice: 850
  },
  // Boots
  {
    name: "Traveler's Boots",
    description: "Boots for the long journey ahead.",
    type: ItemType.BOOTS,
    level: 6,
    stats: {
      agi: 3,
      bonusSpeed: 10,
      specialEffect: "Increases movement speed"
    },
    goldPrice: 750
  },
  {
    name: "Sturdy Boots",
    description: "Heavy boots that provide stability.",
    type: ItemType.BOOTS,
    level: 7,
    stats: {
      def: 4,
      hp: 15,
      bonusDefense: 8,
      specialEffect: "Reduces knockdown chance"
    },
    goldPrice: 950
  },
  // Rings
  {
    name: "Ring of Power",
    description: "A ring that enhances all attributes.",
    type: ItemType.RING,
    level: 9,
    stats: {
      str: 3,
      int: 3,
      bonusDamage: 5,
      specialEffect: "Increases all attributes"
    },
    goldPrice: 1300
  },
  {
    name: "Ring of Vitality",
    description: "A ring that pulses with life force.",
    type: ItemType.RING,
    level: 8,
    stats: {
      hp: 20,
      mp: 20,
      bonusHealth: 10,
      specialEffect: "Regenerates HP over time"
    },
    goldPrice: 1200
  },
  {
    name: "Ring of Elements",
    description: "A ring forged with elemental protection.",
    type: ItemType.RING,
    level: 10,
    stats: {
      str: 4,
      int: 4,
      bonusDamage: 8,
      specialEffect: "Chance to resist elemental damage"
    },
    goldPrice: 1400
  },
  {
    name: "Healer's Necklace",
    description: "A necklace that enhances healing magic.",
    type: ItemType.NECKLACE,
    level: 9,
    stats: {
      int: 6,
      mp: 25,
      bonusMana: 10,
      specialEffect: "Increases healing effectiveness"
    },
    goldPrice: 1300
  },
  {
    name: "Guardian Shield",
    description: "An imposing shield made for maximum protection.",
    type: ItemType.SHIELD,
    level: 10,
    stats: {
      def: 10,
      hp: 25,
      bonusDefense: 15,
      specialEffect: "Chance to block attacks"
    },
    goldPrice: 1600
  },
  {
    name: "Mystic Guardian Shield",
    description: "An enchanted shield that protects against magic.",
    type: ItemType.SHIELD,
    level: 9,
    stats: {
      def: 7,
      mp: 15,
      bonusDefense: 12,
      specialEffect: "Reduces magic damage taken"
    },
    goldPrice: 1500
  }
];

async function main() {
  console.log('Iniciando seed de itens...');
  
  for (const item of items) {
    await prisma.item.create({
      data: item
    });
    console.log(`Item criado: ${item.name}`);
  }

  console.log('Seed de itens concluído!');
}

main()
  .catch((e) => {
    console.error('Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
