// 🛠️ Sistema de PROFISSÕES — Coleta e Fazenda
//
// Cada personagem tem dois XPs de profissão independentes do nível de combate
// (Character.gatherXp / Character.farmXp). O nível é DERIVADO do XP acumulado
// (função pura, sem persistir nível — mesmo princípio do experienceSystem.ts),
// e os perks abaixo são a única leitura de "o que o nível dá":
//
//  - Coleta  → mais itens por tique + recursos raros destravados por nível
//              (minLevel nas tabelas de src/lib/gathering.ts) + mais sementes.
//  - Fazenda → mais canteiros, cercado destravado, crescimento mais rápido.
//
// A curva é bem mais barata que a de combate (idle rende ~150-200 XP/dia):
// nv10 em ~1,5 semana de coleta diária; nv50 é meta de longo prazo.

export const PROFESSION_MAX_LEVEL = 50;

const PROFESSION_XP = {
  multiplier: 60,
  exponent: 1.5,
};

/** XP TOTAL acumulado necessário para ESTAR no nível `level` (nível 1 = 0). */
export function professionXpForLevel(level: number): number {
  const lv = Math.max(1, Math.min(PROFESSION_MAX_LEVEL, Math.floor(level)));
  return Math.round(PROFESSION_XP.multiplier * Math.pow(lv - 1, PROFESSION_XP.exponent));
}

/** Nível de profissão derivado do XP acumulado. */
export function getProfessionLevel(xp: number): number {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < PROFESSION_MAX_LEVEL && total >= professionXpForLevel(level + 1)) level++;
  return level;
}

export interface ProfessionLevelInfo {
  level: number;
  /** XP já ganho dentro do nível atual. */
  xpIntoLevel: number;
  /** XP que o nível atual pede para virar o próximo (0 no nível máximo). */
  xpForNext: number;
  /** Progresso 0..1 dentro do nível (1 no máximo). */
  progress: number;
  isMax: boolean;
}

export function getProfessionLevelInfo(xp: number): ProfessionLevelInfo {
  const level = getProfessionLevel(xp);
  const isMax = level >= PROFESSION_MAX_LEVEL;
  const base = professionXpForLevel(level);
  const next = isMax ? base : professionXpForLevel(level + 1);
  const xpIntoLevel = Math.max(0, Math.floor(xp) - base);
  const xpForNext = isMax ? 0 : next - base;
  return {
    level,
    xpIntoLevel,
    xpForNext,
    progress: isMax || xpForNext === 0 ? 1 : Math.min(1, xpIntoLevel / xpForNext),
    isMax,
  };
}

// ============================================================
// Perks de COLETA
// ============================================================

/**
 * Itens rendidos por tique de coleta (fração resolvida probabilisticamente
 * por quem sorteia): nv1 ≈ 1,5, nv25 ≈ 2,9, nv50 ≈ 4,4.
 * ⚖️ Lançamento (P1 coleta, 2026-07-05): era 1+0,04L — a coleta rendia ~11% do
 * gold/stamina da masmorra em qualquer nível. Com a curva nova + revalorização
 * dos materiais gated por nível (itemCatalog), a rampa fica ~10% (nv1) → ~18%
 * (nv10) → ~34% (nv25) → ~52% (nv50): idle vale menos que jogo ativo, mas a
 * PROFISSÃO progride até virar relevante. [docs/balance-report-launch.md]
 */
export function gatherYieldPerTick(gatherLevel: number): number {
  return 1.4 + 0.06 * Math.max(1, gatherLevel);
}

/** Chance de uma semente extra por tique (só nos Campos de Ervas). */
export function gatherSeedChance(gatherLevel: number): number {
  return Math.min(0.25, 0.08 + 0.004 * Math.max(1, gatherLevel));
}

// ============================================================
// Perks de FAZENDA
// ============================================================

/** Total de canteiros do canteiro único (layout v2, mockup Fazenda.html). */
export const FARM_TOTAL_PLOTS = 16;

/** Nº de canteiros liberados: 8 no nv1, +1 por nível até o teto de 16 (nv9). */
export function farmPlotCount(farmLevel: number): number {
  return Math.min(FARM_TOTAL_PLOTS, 7 + Math.max(1, farmLevel));
}

/** Nível de Fazenda que libera o slot `slotIndex` (0-based) — inverso de farmPlotCount. */
export function farmPlotUnlockLevel(slotIndex: number): number {
  return Math.max(1, slotIndex - 6);
}

/** Multiplicador do tempo de crescimento (−1%/nível, piso −25%). */
export function farmGrowthMult(farmLevel: number): number {
  return Math.max(0.75, 1 - 0.01 * Math.max(1, farmLevel));
}

/**
 * Multiplicador do RENDIMENTO da colheita (nv1 = 40% do range do cultivo,
 * sobe +4%/nível até 100% no nv16+). Nv1 num Trigo (3–5) vira 1–2 — combina
 * com a curva de progressão idle da Fazenda: cedo rende pouco, o range cheio
 * do cultivo (as constantes em CROPS) só sai depois de investir em nível.
 */
export function farmYieldMult(farmLevel: number): number {
  return Math.min(1, 0.4 + 0.04 * (Math.max(1, farmLevel) - 1));
}

/** Nível de Fazenda que destrava o Cercado (Ração → Couro). */
export const FARM_PEN_MIN_LEVEL = 5;
