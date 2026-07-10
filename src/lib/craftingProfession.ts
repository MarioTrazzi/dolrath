// ⚒️⚗️ Profissões de CRAFT — Forja e Alquimia (nível + XP + chance de falha)
//
// Forja e Alquimia deixaram de ser serviços determinísticos de NPC e viraram
// profissões do jogador: cada craft rola chance de sucesso (a falha consome os
// materiais e a taxa de gold, sem produzir nada) e credita XP. O XP fica em
// Character.forgeXp / Character.alchemyXp, mas o NÍVEL é GLOBAL da conta —
// soma do XP de todos os personagens (mesmo modelo da Fazenda; a soma vive em
// src/lib/craftingServer.ts). A curva de nível é a mesma das outras profissões
// (professionSystem.ts: nv máx 50, 60·(L−1)^1.5).
//
// Chance: base por RARIDADE da receita + 1 p.p. por nível acima do minLevel
// (também derivado da raridade — gating de receitas), com teto de 95%. A
// receita ÉPICA nunca encosta no teto (~75% no nv50): tensão de late-game,
// no espírito do softcap/hardcap do enhancementSystem.ts.
//
// REFINO de pedra (10:1) é a exceção deliberada: conversão, não fabricação —
// continua SEM falha (é o caminho determinístico da Concentrada), com XP fixo
// reduzido e gating leve de nível para não virar farm de XP.
//
// PROCESSAMENTO (processing.ts) segue o modelo do refino, mas 100% sem falha:
// minLevel/xp/goldCost vivem NA RECEITA (ProcessingRecipe), não nas tabelas por
// raridade daqui — decisão consciente: sem RNG, a tabela de chance não se aplica.
//
// Módulo 100% puro (sem prisma) — tunável via scripts/crafting-profession-sim.ts.

import type { Rarity } from './itemCatalog';
import type { ForgeRecipe } from './forge';

export type CraftKind = 'forge' | 'alchemy' | 'process';

// ============================================================
// Tabelas por raridade
// ============================================================

/** Chance base de sucesso no nível mínimo da receita. */
export const CRAFT_BASE_CHANCE: Record<Rarity, number> = {
  COMMON: 0.9,
  UNCOMMON: 0.75,
  RARE: 0.6,
  EPIC: 0.45,
  LEGENDARY: 0.3,
};

/** Nível de profissão que DESTRAVA receitas da raridade. */
export const CRAFT_MIN_LEVEL: Record<Rarity, number> = {
  COMMON: 1,
  UNCOMMON: 5,
  RARE: 12,
  EPIC: 20,
  LEGENDARY: 30,
};

/** XP por unidade craftada com SUCESSO (falha paga CRAFT_FAIL_XP_RATIO disso). */
export const CRAFT_XP: Record<Rarity, number> = {
  COMMON: 12,
  UNCOMMON: 25,
  RARE: 50,
  EPIC: 90,
  LEGENDARY: 150,
};

/** Fração do XP creditada quando o craft FALHA (aprende-se errando). */
export const CRAFT_FAIL_XP_RATIO = 0.4;

/** Teto de chance — nem receita comum em nível alto vira 100%. */
export const CRAFT_CHANCE_CAP = 0.95;

/** Bônus de chance por nível acima do minLevel da receita (+1 p.p./nível). */
export const CRAFT_LEVEL_BONUS_PER_LEVEL = 0.01;

// ============================================================
// Refino de pedra (Forja) — sem falha, XP fixo
// ============================================================

/** XP do refino básico (10 estilhaços → 1 Pedra Negra). */
export const REFINE_XP_BASIC = 8;
/** XP do refino concentrado (10 Pedras Negras → 1 Concentrada). */
export const REFINE_XP_CONCENTRATED = 35;
/** Gating do refino: básico desde o nv1; Concentrada pede Forja nv10. */
export const REFINE_MIN_LEVEL = { basic: 1, concentrated: 10 } as const;

/** Receita de refino (kind 'stone') — sem RNG, XP fixo. */
export function isRefineRecipe(recipe: Pick<ForgeRecipe, 'kind'>): boolean {
  return recipe.kind === 'stone';
}

/** XP e nível mínimo de uma receita de refino (EPIC = Concentrada). */
export function refineXpAndLevel(rarity: Rarity): { xp: number; minLevel: number } {
  const concentrated = rarity === 'EPIC' || rarity === 'LEGENDARY';
  return concentrated
    ? { xp: REFINE_XP_CONCENTRATED, minLevel: REFINE_MIN_LEVEL.concentrated }
    : { xp: REFINE_XP_BASIC, minLevel: REFINE_MIN_LEVEL.basic };
}

// ============================================================
// Chance / XP / gating
// ============================================================

export function getCraftMinLevel(rarity: Rarity): number {
  return CRAFT_MIN_LEVEL[rarity] ?? 1;
}

/** Chance de sucesso de uma receita da `rarity` para quem está no `level`. */
export function getCraftChance(rarity: Rarity, level: number): number {
  const base = CRAFT_BASE_CHANCE[rarity] ?? 0.9;
  const bonus = CRAFT_LEVEL_BONUS_PER_LEVEL * Math.max(0, Math.floor(level) - getCraftMinLevel(rarity));
  return Math.min(CRAFT_CHANCE_CAP, base + bonus);
}

export function getCraftXp(rarity: Rarity, success: boolean): number {
  const full = CRAFT_XP[rarity] ?? CRAFT_XP.COMMON;
  return success ? full : Math.round(full * CRAFT_FAIL_XP_RATIO);
}

export interface CraftBatchResult {
  attempted: number;
  succeeded: number;
  failed: number;
  /** XP total do lote (cheio nos sucessos + reduzido nas falhas). */
  xpGained: number;
  /** Chance usada por unidade (mesma para o lote todo). */
  chance: number;
}

/**
 * Rola um lote de crafts — cada unidade é uma rolagem INDEPENDENTE.
 * O servidor chama isto FORA da $transaction e injeta o resultado como dado
 * (retry de transação não pode re-rolar o RNG).
 */
export function rollCraftBatch(
  rarity: Rarity,
  level: number,
  quantity: number,
  rng: () => number = Math.random,
): CraftBatchResult {
  const attempted = Math.max(1, Math.floor(quantity));
  const chance = getCraftChance(rarity, level);
  let succeeded = 0;
  for (let i = 0; i < attempted; i++) if (rng() < chance) succeeded++;
  const failed = attempted - succeeded;
  return {
    attempted,
    succeeded,
    failed,
    xpGained: succeeded * getCraftXp(rarity, true) + failed * getCraftXp(rarity, false),
    chance,
  };
}
