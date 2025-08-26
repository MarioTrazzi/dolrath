import { PrismaClient, ItemType } from '@prisma/client';

const prisma = new PrismaClient();

const items = [
  {
    name: "Espada do Dragão Carmesim",
    description: "Uma lâmina lendária forjada com escamas de dragão vermelho.",
    type: ItemType.WEAPON,
    level: 10,
    goldPrice: 1500,
    stats: {
      str: 5,
      bonusDamage: 15,
      bonusSpeed: 2,
      specialEffect: "Chance de causar dano de fogo"
    }
  },
  {
    name: "Cajado do Arcano",
    description: "Um cajado antigo imbuído com poder mágico ancestral.",
    type: ItemType.WEAPON,
    level: 8,
    goldPrice: 1200,
    stats: {
      int: 8,
      mp: 20,
      bonusDamage: 12,
      specialEffect: "Aumenta regeneração de mana"
    }
  },
  {
    name: "Armadura de Placas do Guardião",
    description: "Uma armadura robusta feita para os mais bravos guerreiros.",
    type: ItemType.ARMOR,
    level: 10,
    goldPrice: 1400,
    stats: {
      def: 8,
      hp: 30,
      bonusDefense: 15,
      specialEffect: "Reduz dano físico"
    }
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
