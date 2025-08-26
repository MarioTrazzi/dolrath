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
  // Weapons - Swords
  {
    name: "Espada do Dragão Carmesim",
    description: "Uma lâmina lendária forjada com escamas de dragão vermelho.",
    type: ItemType.SWORD,
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
    name: "Espada de Ferro",
    description: "Uma espada básica de ferro, confiável para iniciantes.",
    type: ItemType.SWORD,
    level: 1,
    stats: {
      str: 2,
      bonusDamage: 5
    },
    goldPrice: 100
  },
  // Weapons - Staff
  {
    name: "Cajado do Arcano",
    description: "Um cajado antigo imbuído com poder mágico ancestral.",
    type: ItemType.STAFF,
    level: 8,
    stats: {
      int: 8,
      mp: 20,
      bonusDamage: 12,
      specialEffect: "Aumenta regeneração de mana"
    },
    goldPrice: 1200
  },
  {
    name: "Cajado de Madeira",
    description: "Um cajado simples de madeira para magos iniciantes.",
    type: ItemType.STAFF,
    level: 1,
    stats: {
      int: 2,
      mp: 10,
      bonusDamage: 3
    },
    goldPrice: 80
  },
  // Armor - Light
  {
    name: "Armadura de Couro",
    description: "Uma armadura leve de couro, boa para movimento.",
    type: ItemType.LIGHT_ARMOR,
    level: 2,
    stats: {
      def: 3,
      hp: 10,
      bonusSpeed: 5
    },
    goldPrice: 200
  },
  {
    name: "Vestes do Sábio",
    description: "Vestes encantadas que amplificam o poder mágico.",
    type: ItemType.LIGHT_ARMOR,
    level: 8,
    stats: {
      int: 5,
      mp: 25,
      bonusDefense: 8,
      specialEffect: "Aumenta poder mágico"
    },
    goldPrice: 1000
  },
  // Armor - Heavy
  {
    name: "Armadura de Placas do Guardião",
    description: "Uma armadura robusta feita para os mais bravos guerreiros.",
    type: ItemType.HEAVY_ARMOR,
    level: 10,
    stats: {
      def: 8,
      hp: 30,
      bonusDefense: 15,
      specialEffect: "Reduz dano físico"
    },
    goldPrice: 1400
  },
  // Helmets - Light
  {
    name: "Capuz do Ocultista",
    description: "Um capuz místico que aumenta a concentração mágica.",
    type: ItemType.LIGHT_HELMET,
    level: 7,
    stats: {
      int: 4,
      mp: 15,
      bonusDefense: 5,
      specialEffect: "Aumenta regeneração de mana"
    },
    goldPrice: 800
  },
  // Helmets - Heavy
  {
    name: "Elmo do Comandante",
    description: "Um elmo ornamentado usado por grandes líderes.",
    type: ItemType.HEAVY_HELMET,
    level: 9,
    stats: {
      def: 5,
      hp: 15,
      bonusDefense: 10,
      specialEffect: "Aumenta resistência a status negativos"
    },
    goldPrice: 1100
  },
  // Gloves - Heavy
  {
    name: "Manoplas do Titã",
    description: "Luvas pesadas que aumentam a força física.",
    type: ItemType.HEAVY_GLOVES,
    level: 8,
    stats: {
      str: 4,
      def: 3,
      bonusDamage: 8,
      specialEffect: "Aumenta dano crítico"
    },
    goldPrice: 900
  },
  // Gloves - Light
  {
    name: "Luvas do Conjurador",
    description: "Luvas delicadas tecidas com fios mágicos.",
    type: ItemType.LIGHT_GLOVES,
    level: 7,
    stats: {
      int: 3,
      mp: 10,
      bonusSpeed: 5,
      specialEffect: "Reduz custo de mana"
    },
    goldPrice: 850
  },
  // Boots - Light
  {
    name: "Botas do Viajante",
    description: "Botas para a longa jornada à frente.",
    type: ItemType.LIGHT_BOOTS,
    level: 6,
    stats: {
      agi: 3,
      bonusSpeed: 10,
      specialEffect: "Aumenta velocidade de movimento"
    },
    goldPrice: 750
  },
  // Boots - Heavy
  {
    name: "Botas Resistentes",
    description: "Botas pesadas que fornecem estabilidade.",
    type: ItemType.HEAVY_BOOTS,
    level: 7,
    stats: {
      def: 4,
      hp: 15,
      bonusDefense: 8,
      specialEffect: "Reduz chance de ser derrubado"
    },
    goldPrice: 950
  },
  // Rings
  {
    name: "Anel do Poder",
    description: "Um anel que amplifica todas as habilidades.",
    type: ItemType.RING,
    level: 10,
    stats: {
      str: 3,
      int: 3,
      agi: 3,
      def: 3,
      specialEffect: "Aumenta todos os atributos"
    },
    goldPrice: 2000
  },
  {
    name: "Anel de Força",
    description: "Um anel que aumenta a força física.",
    type: ItemType.RING,
    level: 5,
    stats: {
      str: 5,
      bonusDamage: 10
    },
    goldPrice: 600
  },
  // Necklaces
  {
    name: "Colar do Sábio",
    description: "Um colar que aumenta a sabedoria e conhecimento.",
    type: ItemType.NECKLACE,
    level: 8,
    stats: {
      int: 6,
      mp: 30,
      specialEffect: "Aumenta experiência ganha"
    },
    goldPrice: 1300
  },
  {
    name: "Amuleto da Vida",
    description: "Um amuleto que protege o portador.",
    type: ItemType.NECKLACE,
    level: 6,
    stats: {
      hp: 25,
      bonusDefense: 10,
      specialEffect: "Regeneração lenta de HP"
    },
    goldPrice: 800
  }
];

async function main() {
  console.log('Iniciando seed de itens...');
  
  for (const item of items) {
    await prisma.item.create({
      data: item
    });
    console.log(`✅ Item criado: ${item.name}`);
  }
  
  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
