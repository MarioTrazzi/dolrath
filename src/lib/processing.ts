// ⚙️ Sistema de Processamento — beneficiamento de insumos do Dolrath
//
// A Bancada de Processamento transforma matéria-prima CRUA (coleta/fazenda/
// masmorra) em INSUMOS PROCESSADOS (PROCESSED_CATALOG) que as receitas
// INCOMUNS da forja e as poções da alquimia exigem. É a camada intermediária
// do ecossistema: coleta → processar → forjar/transmutar.
//
// Também faz o REFINO BÁSICO de pedra: 10 Estilhaços → 1 Pedra Negra
// (Arma/Armadura). A Concentrada (10 pedras → 1) continua na Forja.
//
// Modelo de conversão (não fabricação): SEM falha (chance 1), XP FIXO por
// receita e gating por nível de Processamento. Por isso as receitas carregam
// minLevel/xp/goldCost explícitos (a tabela por raridade do rollCraftBatch
// não se aplica aqui).
//
// Exceções de saída: Ração e Bandagem de Linho saíram da alquimia ("alquimia é
// só poções") e são produzidas aqui, mas o item de saída delas vive no
// CONSUMABLE_CATALOG (são consumíveis de verdade, não stats.kind='processed').
// Pedra Negra sai com stats.enhancementStone (mesmo item do seed/aprimoramento).
//
// Módulo 100% puro (sem prisma) — tunável via scripts/crafting-profession-sim.ts.

import {
  getConsumableByName,
  getForgeMaterialByName,
  getIngredientByName,
  getProcessedByName,
  type AlchemyIngredient,
  type ConsumableItem,
  type ProcessedMaterial,
  type Rarity,
} from './itemCatalog';
import { STONE_META, STONE_NAMES } from './enhancementSystem';
import { REFINE_XP_BASIC } from './craftingProfession';

export interface ProcessingInputReq {
  name: string;
  quantity: number;
}

export interface ProcessingRecipe {
  id: string;
  /** Nome do item produzido (PROCESSED_CATALOG; Ração/Bandagem → CONSUMABLE; estilhaço → Pedra Negra). */
  outputName: string;
  rarity: Rarity;
  /** Categoria de agrupamento na UI da bancada. */
  group: 'smelt' | 'wood' | 'textile' | 'mill' | 'still' | 'refine';
  inputs: ProcessingInputReq[];
  /** Nível de Processamento que destrava a receita. */
  minLevel: number;
  /** XP fixo por unidade processada (sem falha — modelo do refino). */
  xp: number;
  /** Taxa de processamento em gold (mão de obra). */
  goldCost: number;
  /** Receita SEM rendimento extra (rendimento fixo 1:1 por unidade). Ver PROC_YIELD_*. */
  noYield?: boolean;
}

function proc(
  id: string,
  outputName: string,
  rarity: Rarity,
  group: ProcessingRecipe['group'],
  inputs: ProcessingInputReq[],
  minLevel: number,
  xp: number,
  goldCost: number,
  noYield = false,
): ProcessingRecipe {
  return { id, outputName, rarity, group, inputs, minLevel, xp, goldCost, ...(noYield ? { noYield } : {}) };
}

// Ratio padrão 2:1 (2 crus → 1 processado). Receitas nv1 são o caminho de
// leveling da profissão (XP 6, na escala do refino básico = 8 por 10 estilhaços);
// os degraus nv5/8/10/15 dão senso de progressão e seguram os processados de
// arma avançada atrás do farm de Processamento.
export const PROCESSING_RECIPES: ProcessingRecipe[] = [
  // ---------- FUNDIÇÃO ----------
  proc('proc_barra_ferro', 'Barra de Ferro', 'COMMON', 'smelt', [
    { name: 'Ferro', quantity: 2 },
  ], 1, 6, 5),
  proc('proc_barra_aco', 'Barra de Aço', 'UNCOMMON', 'smelt', [
    { name: 'Ferro Pesado', quantity: 2 },
  ], 5, 10, 10),
  proc('proc_lamina_polida', 'Lâmina Polida', 'UNCOMMON', 'smelt', [
    { name: 'Metal Leve', quantity: 2 },
  ], 5, 10, 10),
  proc('proc_cristal_lapidado', 'Cristal Lapidado', 'RARE', 'smelt', [
    { name: 'Cristal Bruto', quantity: 2 },
  ], 10, 18, 20),
  proc('proc_joia_lapidada', 'Joia Lapidada', 'RARE', 'smelt', [
    { name: 'Fragmentos de Joias', quantity: 2 },
  ], 15, 25, 30),

  // ---------- MADEIRA ----------
  proc('proc_tabua_aparelhada', 'Tábua Aparelhada', 'COMMON', 'wood', [
    { name: 'Madeira Flexível', quantity: 2 },
  ], 1, 6, 5),
  proc('proc_verniz_ent', 'Verniz de Ent', 'UNCOMMON', 'wood', [
    { name: 'Seiva de Ent', quantity: 2 },
  ], 8, 14, 15),

  // ---------- TÊXTIL / CURTUME ----------
  proc('proc_couro_curtido', 'Couro Curtido', 'COMMON', 'textile', [
    { name: 'Couro', quantity: 2 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),
  proc('proc_tecido_linho', 'Tecido de Linho', 'COMMON', 'textile', [
    { name: 'Fibra de Linho', quantity: 2 },
  ], 1, 6, 5),
  proc('proc_bandagem', 'Bandagem de Linho', 'COMMON', 'textile', [
    { name: 'Tecido de Linho', quantity: 1 }, { name: 'Erva Medicinal', quantity: 1 },
  ], 3, 8, 8),

  // ---------- MOAGEM ----------
  proc('proc_farinha', 'Farinha', 'COMMON', 'mill', [
    { name: 'Trigo', quantity: 2 },
  ], 1, 6, 5),
  proc('proc_racao', 'Ração', 'COMMON', 'mill', [
    { name: 'Trigo', quantity: 2 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),

  // ---------- DESTILARIA (princípios ativos das poções) ----------
  // Purificação: Água crua (poço/coleta) → Água Pura (solvente de craft).
  proc('proc_agua_pura', 'Água Pura', 'COMMON', 'still', [
    { name: 'Água', quantity: 1 },
  ], 1, 4, 2),
  proc('proc_extrato_herbal', 'Extrato Herbal', 'COMMON', 'still', [
    { name: 'Erva Medicinal', quantity: 2 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),
  proc('proc_essencia_mana', 'Essência de Mana', 'COMMON', 'still', [
    { name: 'Flor de Mana', quantity: 2 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),
  proc('proc_extrato_raiz', 'Extrato de Raiz', 'COMMON', 'still', [
    { name: 'Raiz Vigorosa', quantity: 2 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),

  // ---------- REFINO DE PEDRA (10 estilhaços → 1 Pedra Negra) ----------
  // Mesma conversão garantida que o resto da bancada; XP/taxa iguais ao
  // REFINE_XP_BASIC / taxa antiga. Concentrada (10 pedras → 1) continua na Forja.
  // noYield: Pedra Negra é a MOEDA do aprimoramento — rendimento extra aqui
  // inflacionaria o gear de todo mundo e quebraria a âncora do economy-sim.
  proc('proc_pedra_arma', STONE_NAMES.WEAPON_BASIC, 'UNCOMMON', 'refine', [
    { name: 'Estilhaço de Pedra Negra (Arma)', quantity: 10 },
  ], 1, REFINE_XP_BASIC, 20, true),
  proc('proc_pedra_armadura', STONE_NAMES.ARMOR_BASIC, 'UNCOMMON', 'refine', [
    { name: 'Estilhaço de Pedra Negra (Armadura)', quantity: 10 },
  ], 1, REFINE_XP_BASIC, 20, true),
];

// ============================================================
// Lote e RENDIMENTO EXTRA (perk de nível da profissão)
// ============================================================

/**
 * Teto de unidades por lote. A transação da rota faz O(linhas de inventário)
 * queries — não O(quantidade) —, então o lote grande não custa tempo de tx.
 * Constante única: UI (stepper) e rota (clamp do body) leem daqui.
 */
export const PROCESSING_BATCH_MAX = 500;

/** Chance de rendimento extra por nível acima do 1 (+1 p.p./nível). */
export const PROC_YIELD_PER_LEVEL = 0.01;
/** Teto do rendimento extra (atingido no nv41). */
export const PROC_YIELD_CAP = 0.4;

/**
 * Chance de UMA unidade processada sair dobrada, pelo nível de Processamento:
 * nv1 = 0% · nv10 = 9% · nv25 = 24% · nv41+ = 40% (teto).
 *
 * É o perk de rendimento da profissão — o molde é o mesmo da Coleta/Fazenda
 * (gatherSeedChance/farmStoneChance): parte inteira garantida + fração vira
 * chance. Não mexe na promessa "sem falha": o piso continua sendo 1 por
 * unidade, o bônus só ADICIONA. Receitas `noYield` (refino de estilhaço)
 * ficam sempre em 0.
 */
export function processingYieldChance(recipe: Pick<ProcessingRecipe, 'noYield'>, level: number): number {
  if (recipe.noYield) return 0;
  const lv = Math.max(1, Math.floor(level));
  return Math.min(PROC_YIELD_CAP, PROC_YIELD_PER_LEVEL * (lv - 1));
}

export interface ProcessingUnitResult {
  /** Esta unidade saiu dobrada (perk de rendimento da profissão). */
  bonus: boolean;
}

export interface ProcessingBatchResult {
  /** Unidades processadas (o que consome insumo e taxa). */
  attempted: number;
  /** Itens de saída creditados (attempted + bonus). */
  produced: number;
  /** Unidades que saíram dobradas. */
  bonus: number;
  /** Chance de rendimento extra usada no lote. */
  chance: number;
  /** XP do lote — por TENTATIVA, o extra é brinde e não acelera a profissão. */
  xpGained: number;
  /**
   * Uma entrada por unidade, NA ORDEM em que foi rolada. É o que a bancada
   * encena unidade a unidade (o agregado acima continua sendo a verdade do
   * que o banco creditou). [[useBatchReveal]]
   */
  units: ProcessingUnitResult[];
}

/**
 * Rola um lote de processamento — cada unidade é resolvida SOZINHA (é o que
 * dá a chance independente de rendimento extra por unidade).
 * O servidor chama isto FORA da $transaction e injeta o resultado como dado
 * (retry de transação não pode re-rolar o RNG) — mesmo contrato do
 * rollCraftBatch de craftingProfession.ts.
 */
export function rollProcessingBatch(
  recipe: ProcessingRecipe,
  level: number,
  quantity: number,
  rng: () => number = Math.random,
): ProcessingBatchResult {
  const attempted = Math.max(1, Math.min(PROCESSING_BATCH_MAX, Math.floor(quantity)));
  const chance = processingYieldChance(recipe, level);
  const units: ProcessingUnitResult[] = [];
  let bonus = 0;
  for (let i = 0; i < attempted; i++) {
    const doubled = chance > 0 && rng() < chance;
    if (doubled) bonus++;
    units.push({ bonus: doubled });
  }
  return {
    attempted,
    produced: attempted + bonus,
    bonus,
    chance,
    xpGained: recipe.xp * attempted,
    units,
  };
}

const RECIPE_BY_ID = new Map(PROCESSING_RECIPES.map((r) => [r.id, r]));

export function getProcessingRecipeById(id: string): ProcessingRecipe | undefined {
  return RECIPE_BY_ID.get(id);
}

/** Receitas que consomem um dado insumo — pré-seleção do dialog e tooltip "usado em". */
export function processingRecipesUsingInput(name: string): ProcessingRecipe[] {
  return PROCESSING_RECIPES.filter((r) => r.inputs.some((i) => i.name === name));
}

// Chave EN (i18n EN-as-key): a UI passa por t(); o dict pt/processing.ts traduz.
export const PROCESSING_GROUP_LABEL: Record<ProcessingRecipe['group'], string> = {
  smelt: 'Smelting',
  wood: 'Woodwork',
  textile: 'Textile',
  mill: 'Milling',
  still: 'Distillery',
  refine: 'Refining',
};

const PROCESSING_GROUP_ORDER: ProcessingRecipe['group'][] = [
  'smelt',
  'wood',
  'textile',
  'mill',
  'still',
  'refine',
];

/** Receitas agrupadas por bancada (fundição → … → destilaria → refino),
 *  ordenadas por nível de desbloqueio. */
export function processingRecipesByGroup(): { group: ProcessingRecipe['group']; recipes: ProcessingRecipe[] }[] {
  return PROCESSING_GROUP_ORDER.map((group) => ({
    group,
    recipes: PROCESSING_RECIPES.filter((r) => r.group === group).sort((a, b) => a.minLevel - b.minLevel),
  }));
}

export interface ProcessingStoneOutput {
  name: string;
  description: string;
  emoji: string;
  rarity: Rarity;
  goldPrice: number;
  sellPrice: number;
  level: number;
  code: string;
}

export interface ProcessingOutput {
  /** Saída padrão: insumo processado do PROCESSED_CATALOG. */
  processed?: ProcessedMaterial;
  /** Saídas-exceção (Ração/Bandagem): consumível do CONSUMABLE_CATALOG. */
  consumable?: ConsumableItem;
  /** Refino de pedra: Pedra Negra (Arma/Armadura) a partir de 10 estilhaços. */
  stone?: ProcessingStoneOutput;
  /** Purificação e similares: ingrediente do INGREDIENT_CATALOG (ex.: Água Pura). */
  ingredient?: AlchemyIngredient;
}

/** Resolve o item de saída de uma receita (processado, consumível, pedra ou ingrediente). */
export function getProcessingOutput(recipe: ProcessingRecipe): ProcessingOutput {
  const processed = getProcessedByName(recipe.outputName);
  if (processed) return { processed };
  const stoneMeta = STONE_META[recipe.outputName];
  if (stoneMeta) {
    return {
      stone: {
        name: recipe.outputName,
        description: stoneMeta.description,
        emoji: stoneMeta.emoji,
        rarity: stoneMeta.rarity as Rarity,
        goldPrice: stoneMeta.goldPrice,
        sellPrice: stoneMeta.sellPrice,
        level: stoneMeta.level,
        code: stoneMeta.code,
      },
    };
  }
  const ingredient = getIngredientByName(recipe.outputName);
  if (ingredient) return { ingredient };
  const consumable = getConsumableByName(recipe.outputName);
  return { consumable };
}

// Emojis das saídas-exceção (consumíveis não têm emoji no catálogo).
const CONSUMABLE_OUTPUT_EMOJI: Record<string, string> = {
  'Ração': '🐄',
  'Bandagem de Linho': '🩹',
};

/** Emoji de um insumo/saída da bancada (material cru, ingrediente, processado ou pedra). */
export function processingItemEmoji(name: string): string {
  return (
    getForgeMaterialByName(name)?.emoji ??
    getIngredientByName(name)?.emoji ??
    getProcessedByName(name)?.emoji ??
    STONE_META[name]?.emoji ??
    CONSUMABLE_OUTPUT_EMOJI[name] ??
    '⚙️'
  );
}
