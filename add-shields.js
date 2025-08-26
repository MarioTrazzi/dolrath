const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const shields = [
  {
    name: "Guardian Shield",
    description: "An imposing shield made for maximum protection.",
    type: "SHIELD",
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
    type: "SHIELD",
    level: 9,
    stats: {
      def: 7,
      mp: 15,
      bonusDefense: 12,
      specialEffect: "Reduces magic damage taken"
    },
    goldPrice: 1500
  },
  {
    name: "Escudo de Ferro",
    description: "Um escudo básico e resistente feito de ferro forjado.",
    type: "SHIELD",
    level: 3,
    stats: {
      def: 5,
      hp: 10,
      bonusDefense: 8,
      specialEffect: "Durabilidade aumentada"
    },
    goldPrice: 400
  }
];

async function addShields() {
  console.log('Adicionando shields...');
  
  for (const shield of shields) {
    try {
      const created = await prisma.item.create({
        data: shield
      });
      console.log(`Shield criado: ${created.name}`);
    } catch (error) {
      console.log(`Erro ao criar shield ${shield.name}:`, error.message);
    }
  }
  
  console.log('Shields adicionados com sucesso!');
}

addShields()
  .then(() => process.exit())
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
