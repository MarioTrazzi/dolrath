const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { tries = 5, baseDelayMs = 750 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = baseDelayMs * attempt;
      console.warn(`Prisma call failed (attempt ${attempt}/${tries}). Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    dryRun: args.has('--dry-run') || args.has('-n'),
  };
}

const TEST_ITEM_IMAGE_BY_NAME = {
  // Items (from prisma/seed-fixed.ts)
  'Espada do Dragão Carmesim': 'items/sword',
  'Espada de Ferro': 'items/sword',
  'Cajado do Arcano': 'items/staff',
  'Cajado de Madeira': 'items/staff',
  'Armadura de Couro': 'items/armor',
  'Vestes do Sábio': 'items/armor',
  'Armadura de Placas do Guardião': 'items/armor',
  'Capuz do Ocultista': 'items/helmet',
  'Elmo do Comandante': 'items/helmet',
  'Manoplas do Titã': 'items/gloves',
  'Luvas do Conjurador': 'items/gloves',
  'Botas do Viajante': 'items/boots',
  'Botas Resistentes': 'items/boots',
  'Anel do Poder': 'items/ring',
  'Anel de Força': 'items/ring',
  'Colar do Sábio': 'items/necklace',
  'Amuleto da Vida': 'items/necklace',

  // Consumables (from seed-battle-consumables.ts)
  'Poção de Vida Pequena': 'consumables/health_potion',
  'Poção de Vida': 'consumables/health_potion',
  'Poção de Vida Grande': 'consumables/health_potion',
  'Poção de Mana': 'consumables/mana_potion',
  'Poção de Mana Grande': 'consumables/mana_potion',
  'Poção de Stamina': 'consumables/stamina_potion',
  'Elixir de Energia': 'consumables/stamina_potion',
  'Elixir Menor': 'consumables/elixir',
  'Elixir Maior': 'consumables/elixir',
  'Elixir Supremo': 'consumables/elixir',
  'Poção de Força': 'consumables/strength_buff',
  'Poção de Defesa': 'consumables/defense_buff',
  'Poção de Agilidade': 'consumables/agility_buff',
  'Poção de Reviver': 'consumables/revive_potion',

  // Materials/test consumables currently in DB
  'Cristal Azul': 'consumables/cristal_azul',
  'Moedas Antigas': 'consumables/moedas_antigas',
};

async function main() {
  const { dryRun } = parseArgs(process.argv);

  const names = Object.keys(TEST_ITEM_IMAGE_BY_NAME);

  const items = await withRetry(() =>
    prisma.item.findMany({
      where: {
        name: { in: names },
        OR: [{ image: null }, { image: '' }],
      },
      select: { id: true, name: true, image: true },
    })
  );

  if (items.length === 0) {
    console.log('No test items found missing image. Nothing to do.');
    return;
  }

  console.log(`Found ${items.length} test items missing image.`);
  const uniquePublicIds = new Set();

  for (const item of items) {
    const image = TEST_ITEM_IMAGE_BY_NAME[item.name];
    if (!image) continue;
    uniquePublicIds.add(image);

    if (dryRun) {
      console.log(`[dry-run] would set image for "${item.name}" -> ${image}`);
      continue;
    }

    await withRetry(() =>
      prisma.item.update({
        where: { id: item.id },
        data: { image },
      })
    );

    console.log(`Updated: "${item.name}" -> ${image}`);
  }

  console.log(`\nDone. ${dryRun ? 'Dry-run only.' : 'Applied updates.'}`);
  console.log('PublicIds used (upload these in Cloudinary if not present):');
  for (const publicId of Array.from(uniquePublicIds).sort()) {
    console.log(`- ${publicId}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
