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

export type GearCategory = 'WEAPON' | 'ARMOR' | 'ACCESSORY' | 'TOOL';

// ⚠️ Mantenha em sincronia com ItemTypeStr / WEAPON_TYPES de itemCatalog.ts.
// GAUNTLET = arma do Monge (manoplas); ORB = secundária do Mago (orbe).
const WEAPON_TYPES = ['SWORD', 'AXE', 'DAGGER', 'STAFF', 'BOW', 'SHIELD', 'GAUNTLET', 'ORB', 'PARRY_DAGGER', 'TALISMAN'];
const ARMOR_TYPES = [
  'LIGHT_ARMOR', 'MEDIUM_ARMOR', 'HEAVY_ARMOR',
  'LIGHT_HELMET', 'MEDIUM_HELMET', 'HEAVY_HELMET',
  'LIGHT_GLOVES', 'MEDIUM_GLOVES', 'HEAVY_GLOVES',
  'LIGHT_BOOTS', 'MEDIUM_BOOTS', 'HEAVY_BOOTS',
];
// BELT (cinto) é tratado como acessório (ver ACCESSORY_TYPES em dungeonAdventures.ts).
const ACCESSORY_TYPES = ['RING', 'NECKLACE', 'BELT'];
// Ferramentas/trajes de coleta (TOOL_CATALOG em itemCatalog.ts): mesma escada
// de chances/failstack das armas (+1..+15, PRI..PEN), NUNCA destrói na falha e
// o reparo é por CÓPIA craftada (são COMMON → caminho de duplicata nível-0 do
// repair-item). O stat que escala é gatherYield (SCALING_STAT_KEYS).
const TOOL_TYPES = ['PICKAXE', 'HERB_SICKLE', 'LOGGING_AXE', 'FISHING_ROD', 'HUNTING_KNIFE', 'GATHER_GARB'];

export function getGearCategory(itemType: string): GearCategory | null {
  if (WEAPON_TYPES.includes(itemType)) return 'WEAPON';
  if (ARMOR_TYPES.includes(itemType)) return 'ARMOR';
  if (ACCESSORY_TYPES.includes(itemType)) return 'ACCESSORY';
  if (TOOL_TYPES.includes(itemType)) return 'TOOL';
  return null;
}

// === TABELAS DE CHANCE BASE (chance de alcançar o nível alvo) ===

// Armas e armaduras: +8..+15 e PRI..PEN.
// ⚖️ BALANCE DE LANÇAMENTO (2026-07-05, docs/balance-report-launch.md P0): os
// valores do BDO em DUO..PEN tornavam o topo inalcançável POR CAUSA DA CASCATA
// de regressão (falha em TET volta pro TRI, que custava ~323 concentradas →
// TET ~3.330 ≈ 2 anos, sendo o gear-alvo das Ruínas). Tiers altos afrouxados
// (DUO 0.075→0.10, TRI 0.04→0.08, TET 0.02→0.05, PEN 0.003→0.012) — validado
// no scripts/enhancement-cost-sim.ts (meta: TET ≤ ~90 dias de farm dedicado).
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
  [DUO]: 0.10,
  [TRI]: 0.08,
  [TET]: 0.05,
  [PEN]: 0.012,
};

// Acessórios: PRI..PEN (mesma passada de lançamento — acessório destrói na
// falha, então o custo esperado explode ainda mais rápido que o de gear)
const ACCESSORY_BASE_CHANCE: Record<number, number> = {
  [PRI]: 0.25,
  [DUO]: 0.125,
  [TRI]: 0.09,
  [TET]: 0.05,
  [PEN]: 0.015,
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
// a valer ~90% do poder de combate no end-game — desproporcional à base.
// ⚖️ TIERS REFORÇADOS (2026-07-09): a curva achatada deixou os tiers I–V quase
// sem valor (I→V = 1.9→2.5) e uma COMUM TRI perdia p/ uma INCOMUM +8 — esforço
// invertido (TRI = correntes de 8–15% com regressão; +8 = uma rolagem de 20%).
// Regra: mult(TRI) > 1.4 × 1.6 (ratio máx entre raridades adjacentes, U/C) = 2.24
// ⇒ raridade N em TRI supera raridade N+1 em +8, p/ todo par adjacente, sem que
// incomum TRI (0.4×2.45=0.98) passe um lendário cru (1.0). Validada em
// scripts/late-game-gear-sim.js e scripts/gear-ordering-check.js.
const TIER_MULTIPLIERS: Record<number, number> = {
  [PRI]: 2.0,
  [DUO]: 2.2,
  [TRI]: 2.45,
  [TET]: 2.8,
  [PEN]: 3.3,
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
  // Ferramentas/trajes de coleta: o rendimento por tique escala com o +N
  // (0.15 base → ~0.26 em +15 → ~0.50 em PEN).
  'gatherYield',
];

export function applyEnhancementToStats(stats: Record<string, any> | null | undefined, level: number): Record<string, any> {
  const result: Record<string, any> = { ...(stats || {}) };
  const mult = getStatMultiplier(level);
  if (mult === 1) return result;
  for (const key of SCALING_STAT_KEYS) {
    if (typeof result[key] === 'number') {
      // 1 casa decimal (sem arredondar pra inteiro): assim cada nível MEXE o
      // stat de forma visível (2.0 → 2.1 → 2.2…) em vez de arredondar 2.1→2 e
      // dar a impressão de que o aprimoramento não fez nada.
      result[key] = Math.round(result[key] * mult * 10) / 10;
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

/** Metadados para criar a pedra on-demand (forja concentrada / processamento básico). */
export const STONE_META: Record<
  string,
  { code: string; rarity: string; goldPrice: number; sellPrice: number; level: number; description: string; emoji: string }
> = {
  [STONE_NAMES.WEAPON_BASIC]: {
    code: 'WEAPON_BASIC',
    rarity: 'UNCOMMON',
    goldPrice: 250,
    sellPrice: 150,
    level: 1,
    description:
      'Pedra imbuída de energia sombria. Usada para aprimorar armas e escudos de +1 a +15. Obtida em masmorras e pelo processamento de estilhaços.',
    emoji: '🔸',
  },
  [STONE_NAMES.ARMOR_BASIC]: {
    code: 'ARMOR_BASIC',
    rarity: 'UNCOMMON',
    goldPrice: 220,
    sellPrice: 130,
    level: 1,
    description:
      'Pedra imbuída de energia sombria. Usada para aprimorar armaduras, elmos, luvas e botas de +1 a +15. Obtida em masmorras e pelo processamento de estilhaços.',
    emoji: '🔹',
  },
  [STONE_NAMES.WEAPON_CONCENTRATED]: {
    code: 'WEAPON_CONCENTRATED',
    rarity: 'EPIC',
    goldPrice: 2500,
    sellPrice: 1500,
    level: 30,
    description:
      'Pedra negra condensada com poder mágico imenso. Necessária para aprimorar armas e escudos aos níveis I a V. Muito rara.',
    emoji: '💎',
  },
  [STONE_NAMES.ARMOR_CONCENTRATED]: {
    code: 'ARMOR_CONCENTRATED',
    rarity: 'EPIC',
    goldPrice: 2200,
    sellPrice: 1300,
    level: 30,
    description:
      'Pedra negra condensada com poder mágico imenso. Necessária para aprimorar armaduras aos níveis I a V. Muito rara.',
    emoji: '💎',
  },
};

export type MaterialRequirement =
  | { kind: 'STONE'; name: string }
  | { kind: 'DUPLICATE' };

export function getRequiredMaterial(category: GearCategory, targetLevel: number, itemType?: string): MaterialRequirement {
  if (category === 'ACCESSORY') return { kind: 'DUPLICATE' };
  const concentrated = targetLevel >= PRI;
  // Ferramenta de coleta aprimora como ARMA (pedra de arma); o traje
  // (GATHER_GARB, slot de armadura) usa pedra de armadura.
  if (category === 'WEAPON' || (category === 'TOOL' && itemType !== 'GATHER_GARB')) {
    return { kind: 'STONE', name: concentrated ? STONE_NAMES.WEAPON_CONCENTRATED : STONE_NAMES.WEAPON_BASIC };
  }
  return { kind: 'STONE', name: concentrated ? STONE_NAMES.ARMOR_CONCENTRATED : STONE_NAMES.ARMOR_BASIC };
}

// Durabilidade recuperada por cópia do item ao reparar (como no BDO).
// 25 = reparo total em 4 cópias; com o desgaste por uso, +10 tornava reparar
// sempre pior do que comprar peça nova (10 cópias pra encher a barra).
export const REPAIR_PER_DUPLICATE = 25;

// Acessório (anel/colar/cinto) não acumula cópia nem usa Estilhaço de Memória —
// dropa raro demais pra isso. Repara com Pó de Joia (Coleta, Vale dos Minérios)
// + gold (fração do goldPrice do item), mesma cadência de 25 de durabilidade
// por unidade que cópia/estilhaço.
export const ACCESSORY_REPAIR_DUST_NAME = 'Pó de Joia';
export const ACCESSORY_REPAIR_GOLD_FRACTION = 0.1;
export const ACCESSORY_REPAIR_GOLD_MIN = 10;

export function accessoryRepairGoldCost(goldPrice: number | null | undefined, units: number): number {
  const perUnit = Math.max(ACCESSORY_REPAIR_GOLD_MIN, Math.floor((goldPrice ?? 0) * ACCESSORY_REPAIR_GOLD_FRACTION));
  return perUnit * units;
}

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
