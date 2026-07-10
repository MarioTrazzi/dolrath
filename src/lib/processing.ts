// ⚙️ Sistema de Processamento — beneficiamento de insumos do Dolrath
//
// A Bancada de Processamento transforma matéria-prima CRUA (coleta/fazenda/
// masmorra) em INSUMOS PROCESSADOS (PROCESSED_CATALOG) que as receitas
// INCOMUNS da forja e as poções da alquimia exigem. É a camada intermediária
// do ecossistema: coleta → processar → forjar/transmutar.
//
// Modelo do REFINO de pedra (craftingProfession.ts): conversão, não fabricação
// — SEM falha (chance 1), XP FIXO por receita e gating por nível de
// Processamento. Por isso as receitas carregam minLevel/xp/goldCost explícitos
// (a tabela por raridade do rollCraftBatch não se aplica aqui).
//
// Exceções de saída: Ração e Bandagem de Linho saíram da alquimia ("alquimia é
// só poções") e são produzidas aqui, mas o item de saída delas vive no
// CONSUMABLE_CATALOG (são consumíveis de verdade, não stats.kind='processed').
//
// Módulo 100% puro (sem prisma) — tunável via scripts/crafting-profession-sim.ts.

import {
  getConsumableByName,
  getForgeMaterialByName,
  getIngredientByName,
  getProcessedByName,
  type ConsumableItem,
  type ProcessedMaterial,
  type Rarity,
} from './itemCatalog';

export interface ProcessingInputReq {
  name: string;
  quantity: number;
}

export interface ProcessingRecipe {
  id: string;
  /** Nome do item produzido (PROCESSED_CATALOG; Ração/Bandagem → CONSUMABLE_CATALOG). */
  outputName: string;
  rarity: Rarity;
  /** Categoria de agrupamento na UI da bancada. */
  group: 'smelt' | 'wood' | 'textile' | 'mill' | 'still';
  inputs: ProcessingInputReq[];
  /** Nível de Processamento que destrava a receita. */
  minLevel: number;
  /** XP fixo por unidade processada (sem falha — modelo do refino). */
  xp: number;
  /** Taxa de processamento em gold (mão de obra). */
  goldCost: number;
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
): ProcessingRecipe {
  return { id, outputName, rarity, group, inputs, minLevel, xp, goldCost };
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
  proc('proc_extrato_herbal', 'Extrato Herbal', 'COMMON', 'still', [
    { name: 'Erva Medicinal', quantity: 2 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),
  proc('proc_essencia_mana', 'Essência de Mana', 'COMMON', 'still', [
    { name: 'Flor de Mana', quantity: 2 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),
  proc('proc_extrato_raiz', 'Extrato de Raiz', 'COMMON', 'still', [
    { name: 'Raiz Vigorosa', quantity: 2 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),
];

const RECIPE_BY_ID = new Map(PROCESSING_RECIPES.map((r) => [r.id, r]));

export function getProcessingRecipeById(id: string): ProcessingRecipe | undefined {
  return RECIPE_BY_ID.get(id);
}

/** Receitas que consomem um dado insumo — pré-seleção do dialog e tooltip "usado em". */
export function processingRecipesUsingInput(name: string): ProcessingRecipe[] {
  return PROCESSING_RECIPES.filter((r) => r.inputs.some((i) => i.name === name));
}

export const PROCESSING_GROUP_LABEL: Record<ProcessingRecipe['group'], string> = {
  smelt: 'Fundição',
  wood: 'Madeira',
  textile: 'Têxtil',
  mill: 'Moagem',
  still: 'Destilaria',
};

const PROCESSING_GROUP_ORDER: ProcessingRecipe['group'][] = ['smelt', 'wood', 'textile', 'mill', 'still'];

/** Receitas agrupadas por bancada (fundição → madeira → têxtil → moagem → destilaria),
 *  ordenadas por nível de desbloqueio. */
export function processingRecipesByGroup(): { group: ProcessingRecipe['group']; recipes: ProcessingRecipe[] }[] {
  return PROCESSING_GROUP_ORDER.map((group) => ({
    group,
    recipes: PROCESSING_RECIPES.filter((r) => r.group === group).sort((a, b) => a.minLevel - b.minLevel),
  }));
}

export interface ProcessingOutput {
  /** Saída padrão: insumo processado do PROCESSED_CATALOG. */
  processed?: ProcessedMaterial;
  /** Saídas-exceção (Ração/Bandagem): consumível do CONSUMABLE_CATALOG. */
  consumable?: ConsumableItem;
}

/** Resolve o item de saída de uma receita (processado OU consumível migrado). */
export function getProcessingOutput(recipe: ProcessingRecipe): ProcessingOutput {
  const processed = getProcessedByName(recipe.outputName);
  if (processed) return { processed };
  const consumable = getConsumableByName(recipe.outputName);
  return { consumable };
}

// Emojis das saídas-exceção (consumíveis não têm emoji no catálogo).
const CONSUMABLE_OUTPUT_EMOJI: Record<string, string> = {
  'Ração': '🐄',
  'Bandagem de Linho': '🩹',
};

/** Emoji de um insumo/saída da bancada (material cru, ingrediente ou processado). */
export function processingItemEmoji(name: string): string {
  return (
    getForgeMaterialByName(name)?.emoji ??
    getIngredientByName(name)?.emoji ??
    getProcessedByName(name)?.emoji ??
    CONSUMABLE_OUTPUT_EMOJI[name] ??
    '⚙️'
  );
}
