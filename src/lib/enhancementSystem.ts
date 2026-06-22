// ⚒️ Sistema de Aprimoramento de Itens — regras no estilo Black Desert Online
//
// Níveis internos (campo enhancementLevel):
//   0        → item base
//   1..15    → +1 a +15 (armas/armaduras; falha custa durabilidade, sem downgrade)
//   16..20   → I (PRI), II (DUO), III (TRI), IV (TET), V (PEN)
//              falha em II..V faz o item regredir 1 nível
//   Acessórios pulam +1..+15: vão direto de base para I, consumindo uma cópia
//   do próprio acessório como material; falha DESTRÓI o acessório.
//
// Failstacks (por personagem): cada falha acumula stacks que aumentam a chance
// da próxima tentativa. Sucesso zera os stacks.
//   chance = base + (base/10) × FS          até atingir 70% (softcap)
//   acima do softcap cada FS adiciona base/50, com teto rígido de 90%.

export const PRI = 16;
export const DUO = 17;
export const TRI = 18;
export const TET = 19;
export const PEN = 20;
export const MAX_ENHANCEMENT_LEVEL = PEN;

// Até +7 o aprimoramento é garantido (como armas no BDO)
export const SAFE_ENHANCE_MAX = 7;

export type GearCategory = 'WEAPON' | 'ARMOR' | 'ACCESSORY';

const WEAPON_TYPES = ['SWORD', 'AXE', 'DAGGER', 'STAFF', 'BOW', 'SHIELD'];
const ARMOR_TYPES = [
  'LIGHT_ARMOR', 'MEDIUM_ARMOR', 'HEAVY_ARMOR',
  'LIGHT_HELMET', 'MEDIUM_HELMET', 'HEAVY_HELMET',
  'LIGHT_GLOVES', 'MEDIUM_GLOVES', 'HEAVY_GLOVES',
  'LIGHT_BOOTS', 'MEDIUM_BOOTS', 'HEAVY_BOOTS',
];
const ACCESSORY_TYPES = ['RING', 'NECKLACE'];

export function getGearCategory(itemType: string): GearCategory | null {
  if (WEAPON_TYPES.includes(itemType)) return 'WEAPON';
  if (ARMOR_TYPES.includes(itemType)) return 'ARMOR';
  if (ACCESSORY_TYPES.includes(itemType)) return 'ACCESSORY';
  return null;
}

// === TABELAS DE CHANCE BASE (chance de alcançar o nível alvo) ===

// Armas e armaduras: +8..+15 e PRI..PEN (valores do BDO)
const GEAR_BASE_CHANCE: Record<number, number> = {
  8: 0.20,
  9: 0.175,
  10: 0.15,
  11: 0.125,
  12: 0.10,
  13: 0.075,
  14: 0.05,
  15: 0.025,
  [PRI]: 0.15,
  [DUO]: 0.075,
  [TRI]: 0.04,
  [TET]: 0.02,
  [PEN]: 0.003,
};

// Acessórios: PRI..PEN (valores do BDO)
const ACCESSORY_BASE_CHANCE: Record<number, number> = {
  [PRI]: 0.25,
  [DUO]: 0.10,
  [TRI]: 0.075,
  [TET]: 0.025,
  [PEN]: 0.005,
};

const SOFTCAP_CHANCE = 0.70;
const HARDCAP_CHANCE = 0.90;

export function getNextLevel(category: GearCategory, currentLevel: number): number | null {
  if (currentLevel >= MAX_ENHANCEMENT_LEVEL) return null;
  if (category === 'ACCESSORY') {
    return currentLevel === 0 ? PRI : currentLevel + 1;
  }
  return currentLevel + 1;
}

export function getBaseChance(category: GearCategory, targetLevel: number): number {
  if (category === 'ACCESSORY') {
    return ACCESSORY_BASE_CHANCE[targetLevel] ?? 0;
  }
  if (targetLevel <= SAFE_ENHANCE_MAX) return 1;
  return GEAR_BASE_CHANCE[targetLevel] ?? 0;
}

// Chance final aplicando failstacks (regra do BDO: +10% da base por stack,
// softcap em 70% — depois disso cada stack vale 1/5 do ganho — e teto de 90%)
export function getEnhanceChance(category: GearCategory, targetLevel: number, failstacks: number): number {
  const base = getBaseChance(category, targetLevel);
  if (base >= 1) return 1;
  if (base <= 0) return 0;

  const perStack = base / 10;
  let chance = base;
  let remaining = Math.max(0, failstacks);

  if (chance < SOFTCAP_CHANCE) {
    const stacksToSoftcap = Math.ceil((SOFTCAP_CHANCE - chance) / perStack);
    const used = Math.min(remaining, stacksToSoftcap);
    chance += used * perStack;
    remaining -= used;
  }
  if (remaining > 0) {
    chance += remaining * (perStack / 5);
  }
  return Math.min(chance, HARDCAP_CHANCE);
}

// Failstacks ganhos ao falhar (BDO: níveis altos dão mais stacks)
export function getFailstackGainOnFail(targetLevel: number): number {
  switch (targetLevel) {
    case DUO: return 2;
    case TRI: return 3;
    case TET: return 4;
    case PEN: return 5;
    default: return 1;
  }
}

// Durabilidade perdida ao falhar
export function getDurabilityLossOnFail(targetLevel: number): number {
  return targetLevel >= PRI ? 10 : 5;
}

// Falha em II..V regride o item 1 nível (I apenas mantém o +15/PRI atual)
export function downgradesOnFail(targetLevel: number): boolean {
  return targetLevel >= DUO;
}

export function isDestroyedOnFail(category: GearCategory): boolean {
  return category === 'ACCESSORY';
}

// === RÓTULOS ===

const ROMAN_LABELS: Record<number, string> = {
  [PRI]: 'I',
  [DUO]: 'II',
  [TRI]: 'III',
  [TET]: 'IV',
  [PEN]: 'V',
};

export function getLevelLabel(level: number): string {
  if (level <= 0) return '';
  if (level <= 15) return `+${level}`;
  return ROMAN_LABELS[level] ?? '';
}

export function getDisplayName(itemName: string, level: number): string {
  const label = getLevelLabel(level);
  if (!label) return itemName;
  return level <= 15 ? `${label} ${itemName}` : `${label}: ${itemName}`;
}

// === BÔNUS DE STATS ===

// Multiplicador aplicado aos stats do item: +5% por nível até +15,
// depois saltos menores em I..V.
//
// ⚖️ CURVA ACHATADA (2026-06-21): antes a curva explodia (+8%/nv, IV ×4.0). Com
// stats de lendário já altos (arma str51 → 204 STR numa peça IV), o gear passava
// a valer ~90% do poder de combate no end-game — desproporcional à base. A curva
// nova mantém o aprimoramento relevante (IV dobra os stats) sem deixá-lo eclipsar
// os atributos por nível. Validada em scripts/late-game-gear-sim.js.
const TIER_MULTIPLIERS: Record<number, number> = {
  [PRI]: 1.9,
  [DUO]: 2.0,
  [TRI]: 2.1,
  [TET]: 2.2,
  [PEN]: 2.5,
};

export function getStatMultiplier(level: number): number {
  if (level <= 0) return 1;
  if (level <= 15) return 1 + level * 0.05;
  return TIER_MULTIPLIERS[level] ?? 1;
}

// Chaves de stats que escalam com o aprimoramento (demais chaves são metadados)
const SCALING_STAT_KEYS = [
  'agi', 'str', 'int', 'res', 'def', 'dex', 'con',
  'damage', 'attack', 'defense', 'strength', 'dexterity',
  'constitution', 'intelligence', 'hp', 'mp',
];

export function applyEnhancementToStats(stats: Record<string, any> | null | undefined, level: number): Record<string, any> {
  const result: Record<string, any> = { ...(stats || {}) };
  const mult = getStatMultiplier(level);
  if (mult === 1) return result;
  for (const key of SCALING_STAT_KEYS) {
    if (typeof result[key] === 'number') {
      result[key] = Math.round(result[key] * mult);
    }
  }
  return result;
}

// === MATERIAIS ===

export const STONE_NAMES = {
  WEAPON_BASIC: 'Pedra Negra (Arma)',
  ARMOR_BASIC: 'Pedra Negra (Armadura)',
  WEAPON_CONCENTRATED: 'Pedra Negra Mágica Concentrada (Arma)',
  ARMOR_CONCENTRATED: 'Pedra Negra Mágica Concentrada (Armadura)',
} as const;

export type MaterialRequirement =
  | { kind: 'STONE'; name: string }
  | { kind: 'DUPLICATE' };

export function getRequiredMaterial(category: GearCategory, targetLevel: number): MaterialRequirement {
  if (category === 'ACCESSORY') return { kind: 'DUPLICATE' };
  const concentrated = targetLevel >= PRI;
  if (category === 'WEAPON') {
    return { kind: 'STONE', name: concentrated ? STONE_NAMES.WEAPON_CONCENTRATED : STONE_NAMES.WEAPON_BASIC };
  }
  return { kind: 'STONE', name: concentrated ? STONE_NAMES.ARMOR_CONCENTRATED : STONE_NAMES.ARMOR_BASIC };
}

// Durabilidade recuperada por cópia do item ao reparar (como no BDO)
export const REPAIR_PER_DUPLICATE = 10;

// === RESOLUÇÃO DA TENTATIVA ===

export interface EnhanceOutcome {
  success: boolean;
  destroyed: boolean;
  downgraded: boolean;
  targetLevel: number;
  resultLevel: number;       // nível do item após a tentativa (irrelevante se destroyed)
  durabilityLoss: number;    // 0 em sucesso
  failstackGain: number;     // 0 em sucesso (sucesso zera os stacks)
  chance: number;
  roll: number;
}

export function rollEnhancement(
  category: GearCategory,
  currentLevel: number,
  failstacks: number,
  rng: () => number = Math.random,
): EnhanceOutcome | null {
  const targetLevel = getNextLevel(category, currentLevel);
  if (targetLevel === null) return null;

  const chance = getEnhanceChance(category, targetLevel, failstacks);
  const roll = rng();
  const success = roll < chance;

  if (success) {
    return {
      success: true,
      destroyed: false,
      downgraded: false,
      targetLevel,
      resultLevel: targetLevel,
      durabilityLoss: 0,
      failstackGain: 0,
      chance,
      roll,
    };
  }

  const destroyed = isDestroyedOnFail(category);
  // Downgrade em II..V, mas PRI (I) é o piso: uma vez em I, o item nunca regride de volta para +15
  const downgraded = !destroyed && downgradesOnFail(targetLevel) && currentLevel > PRI;
  return {
    success: false,
    destroyed,
    downgraded,
    targetLevel,
    resultLevel: downgraded ? Math.max(PRI, currentLevel - 1) : currentLevel,
    durabilityLoss: destroyed ? 0 : getDurabilityLossOnFail(targetLevel),
    failstackGain: getFailstackGainOnFail(targetLevel),
    chance,
    roll,
  };
}

// Texto de risco exibido na UI antes da tentativa
export function getRiskDescription(category: GearCategory, targetLevel: number, currentLevel: number): string {
  if (category === 'ACCESSORY') {
    return '⚠️ Se falhar, o acessório e a cópia usada serão DESTRUÍDOS!';
  }
  if (getBaseChance(category, targetLevel) >= 1) {
    return '✅ Aprimoramento seguro — sucesso garantido.';
  }
  // PRI é o piso: ao tentar DUO partindo de PRI, a falha não regride (mantém I)
  if (downgradesOnFail(targetLevel) && currentLevel > PRI) {
    return `⚠️ Se falhar, o item perde ${getDurabilityLossOnFail(targetLevel)} de durabilidade e REGRIDE 1 nível.`;
  }
  return `Se falhar, o item perde ${getDurabilityLossOnFail(targetLevel)} de durabilidade.`;
}
