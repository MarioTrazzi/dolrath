// 📦 Catálogo de Itens do Dolrath — fonte única de verdade
//
// Cada item declara:
//  - rarity:          COMMON | UNCOMMON | RARE | EPIC | LEGENDARY
//  - dungeons:        ids das masmorras onde o item pode cair (drop exclusivo)
//  - raceRestriction: (opcional) só esta raça pode EQUIPAR/encontrar o item
//
// Sem dependência de Prisma/React para poder ser usado no servidor, no
// seed (Node) e no cliente (diálogo de exploração).

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type RaceId = 'draconiano' | 'metamorfo' | 'humano' | 'elfo';

// Mesmos valores do enum ItemType do Prisma (string).
export type ItemTypeStr =
  | 'SWORD' | 'AXE' | 'DAGGER' | 'STAFF' | 'BOW'
  | 'LIGHT_ARMOR' | 'MEDIUM_ARMOR' | 'HEAVY_ARMOR'
  | 'LIGHT_HELMET' | 'MEDIUM_HELMET' | 'HEAVY_HELMET'
  | 'LIGHT_GLOVES' | 'MEDIUM_GLOVES' | 'HEAVY_GLOVES'
  | 'LIGHT_BOOTS' | 'MEDIUM_BOOTS' | 'HEAVY_BOOTS'
  | 'RING' | 'NECKLACE' | 'SHIELD';

export interface CatalogItem {
  name: string;
  description: string;
  type: ItemTypeStr;
  level: number;
  rarity: Rarity;
  stats: Record<string, any>;
  goldPrice: number;
  /** Masmorras onde o item pode cair. */
  dungeons: string[];
  /** Se definido, apenas esta raça pode encontrar/equipar o item. */
  raceRestriction?: RaceId;
}

// === CATÁLOGO ===
// Inclui os itens que já existiam (seed-fixed) reorganizados com raridade,
// masmorra de origem e restrição de raça, além de novos itens temáticos.

export const ITEM_CATALOG: CatalogItem[] = [
  // ---------- COMUNS (níveis baixos, masmorras E/D) ----------
  {
    name: 'Espada de Ferro', description: 'Uma espada básica de ferro, confiável para iniciantes.',
    type: 'SWORD', level: 1, rarity: 'COMMON', goldPrice: 100,
    stats: { str: 2, bonusDamage: 5 }, dungeons: ['iron_mine', 'goblin_caves'],
  },
  {
    name: 'Adaga Enferrujada', description: 'Uma adaga velha mas ainda afiada o suficiente.',
    type: 'DAGGER', level: 1, rarity: 'COMMON', goldPrice: 90,
    stats: { agi: 2, bonusDamage: 4, bonusSpeed: 3 }, dungeons: ['goblin_caves'],
  },
  {
    name: 'Cajado de Madeira', description: 'Um cajado simples de madeira para magos iniciantes.',
    type: 'STAFF', level: 1, rarity: 'COMMON', goldPrice: 80,
    stats: { int: 2, mp: 10, bonusDamage: 3 }, dungeons: ['goblin_caves', 'whispering_woods'],
  },
  {
    name: 'Arco Curto de Caça', description: 'Um arco leve usado por caçadores da floresta.',
    type: 'BOW', level: 2, rarity: 'COMMON', goldPrice: 110,
    stats: { agi: 3, bonusDamage: 6 }, dungeons: ['whispering_woods'],
  },
  {
    name: 'Machado do Lenhador', description: 'Mais ferramenta que arma, mas corta bem.',
    type: 'AXE', level: 2, rarity: 'COMMON', goldPrice: 120,
    stats: { str: 3, bonusDamage: 7 }, dungeons: ['whispering_woods', 'iron_mine'],
  },
  {
    name: 'Escudo de Madeira', description: 'Um escudo rústico de tábuas reforçadas.',
    type: 'SHIELD', level: 1, rarity: 'COMMON', goldPrice: 90,
    stats: { def: 2, bonusDefense: 4 }, dungeons: ['goblin_caves'],
  },
  {
    name: 'Armadura de Couro', description: 'Uma armadura leve de couro, boa para movimento.',
    type: 'LIGHT_ARMOR', level: 2, rarity: 'COMMON', goldPrice: 200,
    stats: { def: 3, hp: 10, bonusSpeed: 5 }, dungeons: ['goblin_caves', 'whispering_woods'],
  },

  // ---------- INCOMUNS ----------
  {
    name: 'Escudo de Ferro', description: 'Um escudo de ferro batido, resistente a golpes.',
    type: 'SHIELD', level: 4, rarity: 'UNCOMMON', goldPrice: 350,
    stats: { def: 4, bonusDefense: 8 }, dungeons: ['iron_mine', 'scorching_dunes'],
  },
  {
    name: 'Anel de Força', description: 'Um anel que aumenta a força física.',
    type: 'RING', level: 5, rarity: 'UNCOMMON', goldPrice: 600,
    stats: { str: 5, bonusDamage: 10 }, dungeons: ['goblin_caves', 'sunken_crypt'],
  },
  {
    name: 'Botas do Viajante', description: 'Botas para a longa jornada à frente.',
    type: 'LIGHT_BOOTS', level: 6, rarity: 'UNCOMMON', goldPrice: 750,
    stats: { agi: 3, bonusSpeed: 10, specialEffect: 'Aumenta velocidade de movimento' },
    dungeons: ['whispering_woods', 'sunken_crypt'],
  },
  {
    name: 'Amuleto da Vida', description: 'Um amuleto que protege o portador.',
    type: 'NECKLACE', level: 6, rarity: 'UNCOMMON', goldPrice: 800,
    stats: { hp: 25, bonusDefense: 10, specialEffect: 'Regeneração lenta de HP' },
    dungeons: ['sunken_crypt'],
  },
  {
    name: 'Botas Resistentes', description: 'Botas pesadas que fornecem estabilidade.',
    type: 'HEAVY_BOOTS', level: 7, rarity: 'UNCOMMON', goldPrice: 950,
    stats: { def: 4, hp: 15, bonusDefense: 8, specialEffect: 'Reduz chance de ser derrubado' },
    dungeons: ['scorching_dunes'],
  },

  // ---------- RAROS ----------
  {
    name: 'Capuz do Ocultista', description: 'Um capuz místico que aumenta a concentração mágica.',
    type: 'LIGHT_HELMET', level: 7, rarity: 'RARE', goldPrice: 800,
    stats: { int: 4, mp: 15, bonusDefense: 5, specialEffect: 'Aumenta regeneração de mana' },
    dungeons: ['whispering_woods', 'arcane_sanctum'],
  },
  {
    name: 'Luvas do Conjurador', description: 'Luvas delicadas tecidas com fios mágicos.',
    type: 'LIGHT_GLOVES', level: 7, rarity: 'RARE', goldPrice: 850,
    stats: { int: 3, mp: 10, bonusSpeed: 5, specialEffect: 'Reduz custo de mana' },
    dungeons: ['whispering_woods', 'arcane_sanctum'],
  },
  {
    name: 'Cajado do Arcano', description: 'Um cajado antigo imbuído com poder mágico ancestral.',
    type: 'STAFF', level: 8, rarity: 'RARE', goldPrice: 1200,
    stats: { int: 8, mp: 20, bonusDamage: 12, specialEffect: 'Aumenta regeneração de mana' },
    dungeons: ['arcane_sanctum'],
  },
  {
    name: 'Vestes do Sábio', description: 'Vestes encantadas que amplificam o poder mágico.',
    type: 'LIGHT_ARMOR', level: 8, rarity: 'RARE', goldPrice: 1000,
    stats: { int: 5, mp: 25, bonusDefense: 8, specialEffect: 'Aumenta poder mágico' },
    dungeons: ['arcane_sanctum'],
  },
  {
    name: 'Manoplas do Titã', description: 'Luvas pesadas que aumentam a força física.',
    type: 'HEAVY_GLOVES', level: 8, rarity: 'RARE', goldPrice: 900,
    stats: { str: 4, def: 3, bonusDamage: 8, specialEffect: 'Aumenta dano crítico' },
    dungeons: ['scorching_dunes', 'molten_depths'],
  },
  {
    name: 'Colar do Sábio', description: 'Um colar que aumenta a sabedoria e conhecimento.',
    type: 'NECKLACE', level: 8, rarity: 'RARE', goldPrice: 1300,
    stats: { int: 6, mp: 30, specialEffect: 'Aumenta experiência ganha' },
    dungeons: ['arcane_sanctum'],
  },
  {
    name: 'Elmo do Comandante', description: 'Um elmo ornamentado usado por grandes líderes.',
    type: 'HEAVY_HELMET', level: 9, rarity: 'RARE', goldPrice: 1100,
    stats: { def: 5, hp: 15, bonusDefense: 10, specialEffect: 'Resistência a status negativos' },
    dungeons: ['scorching_dunes'],
  },
  {
    name: 'Armadura de Placas do Guardião', description: 'Uma armadura robusta feita para os mais bravos guerreiros.',
    type: 'HEAVY_ARMOR', level: 10, rarity: 'RARE', goldPrice: 1400,
    stats: { def: 8, hp: 30, bonusDefense: 15, specialEffect: 'Reduz dano físico' },
    dungeons: ['scorching_dunes', 'molten_depths'],
  },

  // ---------- ÉPICOS ----------
  {
    name: 'Espada do Dragão Carmesim', description: 'Uma lâmina lendária forjada com escamas de dragão vermelho.',
    type: 'SWORD', level: 12, rarity: 'EPIC', goldPrice: 1500,
    stats: { str: 5, bonusDamage: 15, bonusSpeed: 2, specialEffect: 'Chance de causar dano de fogo' },
    dungeons: ['molten_depths'],
  },
  {
    name: 'Anel do Poder', description: 'Um anel que amplifica todas as habilidades.',
    type: 'RING', level: 12, rarity: 'EPIC', goldPrice: 2000,
    stats: { str: 3, int: 3, agi: 3, def: 3, specialEffect: 'Aumenta todos os atributos' },
    dungeons: ['arcane_sanctum', 'dragons_roost'],
  },

  // ---------- EXCLUSIVOS DE RAÇA ----------
  // 🐉 Draconiano — armas/armaduras de fogo pesadas
  {
    name: 'Escamas do Dragão Ancião', description: 'Couraça forjada das escamas de um dragão milenar. Só um descendente dracônico suporta seu peso ardente.',
    type: 'HEAVY_ARMOR', level: 16, rarity: 'EPIC', goldPrice: 3200, raceRestriction: 'draconiano',
    stats: { def: 12, hp: 45, str: 4, bonusDefense: 20, specialEffect: 'Imunidade parcial a fogo' },
    dungeons: ['molten_depths'],
  },
  {
    name: 'Presas Dracônicas', description: 'Lâmina gêmea feita das presas de um dragão. Pulsa com fúria ancestral.',
    type: 'SWORD', level: 30, rarity: 'LEGENDARY', goldPrice: 8000, raceRestriction: 'draconiano',
    stats: { str: 12, bonusDamage: 35, bonusSpeed: 4, specialEffect: 'Dano de fogo massivo em crítico' },
    dungeons: ['dragons_roost'],
  },
  // 🧝 Elfo — arcos e cajados élficos
  {
    name: 'Arco Élfico de Lúthien', description: 'Arco esculpido em madeira-luar pelos artesãos élficos. Leve como uma folha.',
    type: 'BOW', level: 8, rarity: 'RARE', goldPrice: 1400, raceRestriction: 'elfo',
    stats: { agi: 7, int: 3, bonusDamage: 14, bonusSpeed: 6 }, dungeons: ['whispering_woods'],
  },
  {
    name: 'Cajado da Lua Crescente', description: 'Canaliza a magia arcana dos elfos antigos sob a luz da lua.',
    type: 'STAFF', level: 18, rarity: 'EPIC', goldPrice: 3600, raceRestriction: 'elfo',
    stats: { int: 14, mp: 50, bonusDamage: 22, specialEffect: 'Reduz drasticamente o custo de mana' },
    dungeons: ['arcane_sanctum'],
  },
  // 🐺 Metamorfo — garras e vestes mutáveis
  {
    name: 'Garras da Fera', description: 'Garras que se fundem às mãos do metamorfo, afiadas como navalhas.',
    type: 'DAGGER', level: 11, rarity: 'RARE', goldPrice: 1500, raceRestriction: 'metamorfo',
    stats: { agi: 8, str: 3, bonusDamage: 16, bonusSpeed: 8 }, dungeons: ['frostfang_caverns'],
  },
  {
    name: 'Manto Mutável', description: 'Tecido vivo que se adapta à forma do metamorfo.',
    type: 'MEDIUM_ARMOR', level: 17, rarity: 'EPIC', goldPrice: 3400, raceRestriction: 'metamorfo',
    stats: { agi: 8, def: 7, hp: 30, bonusSpeed: 10, specialEffect: 'Aumenta a esquiva' },
    dungeons: ['frostfang_caverns'],
  },
  // ⚔️ Humano — equipamento versátil
  {
    name: 'Lâmina do Andarilho', description: 'Espada equilibrada forjada para a versatilidade humana.',
    type: 'SWORD', level: 9, rarity: 'RARE', goldPrice: 1300, raceRestriction: 'humano',
    stats: { str: 5, agi: 4, bonusDamage: 13, bonusSpeed: 4 }, dungeons: ['scorching_dunes'],
  },
  {
    name: 'Estandarte do Herói', description: 'Amuleto que carrega a determinação inquebrável da humanidade.',
    type: 'NECKLACE', level: 15, rarity: 'EPIC', goldPrice: 3000, raceRestriction: 'humano',
    stats: { str: 4, agi: 4, int: 4, def: 4, hp: 30, specialEffect: 'Bônus de todos os atributos e XP' },
    dungeons: ['sunken_crypt'],
  },

  // ---------- LENDÁRIOS (qualquer raça, masmorra S) ----------
  {
    name: 'Coração de Dragão', description: 'O coração ainda pulsante de um dragão ancião, fonte de poder incomensurável.',
    type: 'NECKLACE', level: 32, rarity: 'LEGENDARY', goldPrice: 12000,
    stats: { str: 6, int: 6, def: 6, hp: 60, mp: 40, specialEffect: 'Regeneração acelerada de HP/MP' },
    dungeons: ['dragons_roost'],
  },
  {
    name: 'Couraça de Adamantite Real', description: 'Forjada com o metal mais raro do mundo, praticamente indestrutível.',
    type: 'HEAVY_ARMOR', level: 35, rarity: 'LEGENDARY', goldPrice: 14000,
    stats: { def: 18, hp: 80, bonusDefense: 30, specialEffect: 'Reflete parte do dano físico' },
    dungeons: ['dragons_roost'],
  },
  {
    name: 'Lâmina Etérea', description: 'Uma espada que existe entre os planos, cortando até a própria realidade.',
    type: 'SWORD', level: 38, rarity: 'LEGENDARY', goldPrice: 16000,
    stats: { str: 10, agi: 8, int: 6, bonusDamage: 40, bonusSpeed: 6, specialEffect: 'Ignora parte da defesa inimiga' },
    dungeons: ['dragons_roost'],
  },
];

// === ÍNDICES E HELPERS ===

const BY_NAME = new Map(ITEM_CATALOG.map((i) => [i.name, i]));

export function getCatalogItemByName(name: string): CatalogItem | undefined {
  return BY_NAME.get(name);
}

export function getItemsForDungeon(dungeonId: string): CatalogItem[] {
  return ITEM_CATALOG.filter((i) => i.dungeons.includes(dungeonId));
}

export function getItemsByRarity(rarity: Rarity): CatalogItem[] {
  return ITEM_CATALOG.filter((i) => i.rarity === rarity);
}

// Pesos relativos de drop por raridade (quanto maior, mais comum).
export const RARITY_DROP_WEIGHT: Record<Rarity, number> = {
  COMMON: 100,
  UNCOMMON: 45,
  RARE: 18,
  EPIC: 5,
  LEGENDARY: 1,
};

// Restrições de peso de armadura por raça (texto em characterCreationData).
// 'LIGHT' = peças leves; 'HEAVY' = peças pesadas.
const RACE_FORBIDDEN_WEIGHT: Record<RaceId, 'LIGHT' | 'HEAVY' | null> = {
  draconiano: 'LIGHT', // "Não pode usar armaduras leves"
  metamorfo: 'HEAVY',  // "Não pode usar armaduras pesadas"
  elfo: 'HEAVY',       // "Não pode usar armaduras pesadas"
  humano: null,
};

function armorWeightOf(type: ItemTypeStr): 'LIGHT' | 'MEDIUM' | 'HEAVY' | null {
  if (type.startsWith('LIGHT_')) return 'LIGHT';
  if (type.startsWith('MEDIUM_')) return 'MEDIUM';
  if (type.startsWith('HEAVY_')) return 'HEAVY';
  return null;
}

const RACE_LABEL: Record<RaceId, string> = {
  draconiano: 'Draconiano',
  metamorfo: 'Metamorfo',
  humano: 'Humano',
  elfo: 'Elfo',
};

function isRaceId(v: string): v is RaceId {
  return v === 'draconiano' || v === 'metamorfo' || v === 'humano' || v === 'elfo';
}

/**
 * Verifica se uma raça pode equipar um item.
 * Considera tanto a exclusividade do item (raceRestriction) quanto a
 * restrição de peso de armadura da raça.
 */
export function canRaceEquip(
  race: string | null | undefined,
  itemType: ItemTypeStr,
  raceRestriction?: RaceId | null,
): { ok: boolean; reason?: string } {
  const r = (race || '').toLowerCase();

  // 1. Item exclusivo de raça
  if (raceRestriction && r !== raceRestriction) {
    return { ok: false, reason: `Item exclusivo da raça ${RACE_LABEL[raceRestriction]}.` };
  }

  // 2. Restrição de peso de armadura
  if (isRaceId(r)) {
    const forbidden = RACE_FORBIDDEN_WEIGHT[r];
    const weight = armorWeightOf(itemType);
    if (forbidden && weight === forbidden) {
      const label = forbidden === 'LIGHT' ? 'leves' : 'pesadas';
      return { ok: false, reason: `${RACE_LABEL[r]} não pode usar armaduras ${label}.` };
    }
  }

  return { ok: true };
}

/**
 * Sorteia um item de uma masmorra, respeitando:
 *  - nível do personagem (item.level <= level + folga)
 *  - raça (itens exclusivos só caem para a raça certa)
 *  - pesos de raridade
 * Retorna null se nenhum item elegível.
 */
export function rollDungeonDrop(
  dungeonId: string,
  characterLevel: number,
  race?: string | null,
  rng: () => number = Math.random,
): CatalogItem | null {
  const r = (race || '').toLowerCase();
  const levelCap = characterLevel + 3; // pequena folga para itens um pouco acima

  const eligible = getItemsForDungeon(dungeonId).filter((item) => {
    if (item.level > levelCap) return false;
    if (item.raceRestriction && item.raceRestriction !== r) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, i) => sum + RARITY_DROP_WEIGHT[i.rarity], 0);
  let pick = rng() * totalWeight;
  for (const item of eligible) {
    pick -= RARITY_DROP_WEIGHT[item.rarity];
    if (pick < 0) return item;
  }
  return eligible[eligible.length - 1];
}
