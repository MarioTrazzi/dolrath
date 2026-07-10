// 🍳 Sistema de Culinária — pratos com buff por TEMPO REAL do Dolrath
//
// A quarta bancada do ecossistema de craft: transforma insumos da fazenda/
// coleta/masmorra (crus e processados da moagem) em COMIDA (FOOD_CATALOG).
// Comida dá bônus PLANO de atributo (str/int/agi/def/all) por 15/30 minutos
// REAIS — mais fraca que poção de combate, porém acompanha o farm inteiro
// (o motor do buff vive em src/lib/foodBuff.ts; comer = /api/inventory/use-item).
//
// Modelo do PROCESSAMENTO (processing.ts): conversão, não fabricação — SEM
// falha (chance 1), XP FIXO por receita e gating por nível de Culinária.
// O Pão nv1 é o caminho de leveling; os pratos de buff seguram-se atrás dos
// degraus nv3/5/10 (na escala das receitas da bancada de processamento).
//
// Módulo 100% puro (sem prisma) — tunável via scripts/crafting-profession-sim.ts.

import {
  getFoodByName,
  getIngredientByName,
  getProcessedByName,
  type ConsumableItem,
  type Rarity,
} from './itemCatalog';

export interface CookingInputReq {
  name: string;
  quantity: number;
}

export interface CookingRecipe {
  id: string;
  /** Nome do prato produzido (FOOD_CATALOG). */
  outputName: string;
  rarity: Rarity;
  /** Estação de agrupamento na UI da cozinha. */
  group: 'oven' | 'pot' | 'fresh';
  inputs: CookingInputReq[];
  /** Nível de Culinária que destrava a receita. */
  minLevel: number;
  /** XP fixo por prato cozinhado (sem falha — modelo do processamento). */
  xp: number;
  /** Taxa de cozinha em gold (lenha e tempero). */
  goldCost: number;
}

function cook(
  id: string,
  outputName: string,
  rarity: Rarity,
  group: CookingRecipe['group'],
  inputs: CookingInputReq[],
  minLevel: number,
  xp: number,
  goldCost: number,
): CookingRecipe {
  return { id, outputName, rarity, group, inputs, minLevel, xp, goldCost };
}

// Receitas esboçadas junto do FOOD_CATALOG: cada prato de buff cobre um
// atributo (STR/AGI/INT/DEF) e o Banquete (RARE, nv10) dá +1 em tudo.
// Farinha vem da moagem (Processamento) — a Culinária é consumidora da
// cadeia coleta → processar → cozinhar.
export const COOKING_RECIPES: CookingRecipe[] = [
  // ---------- FORNO ----------
  cook('cook_pao', 'Pão', 'COMMON', 'oven', [
    { name: 'Farinha', quantity: 1 }, { name: 'Água Pura', quantity: 1 },
  ], 1, 6, 5),
  cook('cook_assado_fazenda', 'Assado da Fazenda', 'COMMON', 'oven', [
    { name: 'Ração', quantity: 1 }, { name: 'Raiz Vigorosa', quantity: 1 },
  ], 3, 8, 8),
  cook('cook_torta_cogumelo', 'Torta de Cogumelo', 'UNCOMMON', 'oven', [
    { name: 'Farinha', quantity: 1 }, { name: 'Cogumelo Lunar', quantity: 2 },
  ], 5, 10, 10),

  // ---------- PANELA ----------
  cook('cook_ensopado_rustico', 'Ensopado Rústico', 'UNCOMMON', 'pot', [
    { name: 'Farinha', quantity: 1 }, { name: 'Cogumelo Lunar', quantity: 1 }, { name: 'Água Pura', quantity: 1 },
  ], 5, 10, 12),
  cook('cook_banquete_aventureiro', 'Banquete do Aventureiro', 'RARE', 'pot', [
    { name: 'Farinha', quantity: 2 }, { name: 'Cogumelo Lunar', quantity: 1 }, { name: 'Seiva Ancestral', quantity: 1 },
  ], 10, 18, 25),

  // ---------- FRESCOS ----------
  cook('cook_salada_ervas', 'Salada de Ervas', 'COMMON', 'fresh', [
    { name: 'Erva Medicinal', quantity: 1 }, { name: 'Raiz Vigorosa', quantity: 1 },
  ], 3, 8, 8),
];

const RECIPE_BY_ID = new Map(COOKING_RECIPES.map((r) => [r.id, r]));

export function getCookingRecipeById(id: string): CookingRecipe | undefined {
  return RECIPE_BY_ID.get(id);
}

/** Receitas que consomem um dado insumo — pré-seleção do dialog e tooltip "usado em". */
export function cookingRecipesUsingInput(name: string): CookingRecipe[] {
  return COOKING_RECIPES.filter((r) => r.inputs.some((i) => i.name === name));
}

export const COOKING_GROUP_LABEL: Record<CookingRecipe['group'], string> = {
  oven: 'Forno',
  pot: 'Panela',
  fresh: 'Frescos',
};

const COOKING_GROUP_ORDER: CookingRecipe['group'][] = ['oven', 'pot', 'fresh'];

/** Receitas agrupadas por estação (forno → panela → frescos), ordenadas por nível. */
export function cookingRecipesByGroup(): { group: CookingRecipe['group']; recipes: CookingRecipe[] }[] {
  return COOKING_GROUP_ORDER.map((group) => ({
    group,
    recipes: COOKING_RECIPES.filter((r) => r.group === group).sort((a, b) => a.minLevel - b.minLevel),
  }));
}

/** Resolve o prato de saída de uma receita (FOOD_CATALOG). */
export function getCookingOutput(recipe: CookingRecipe): ConsumableItem | undefined {
  return getFoodByName(recipe.outputName);
}

// Emojis dos pratos (comida não tem emoji no ConsumableItem do catálogo).
export const FOOD_EMOJI: Record<string, string> = {
  'Pão': '🍞',
  'Assado da Fazenda': '🍖',
  'Salada de Ervas': '🥗',
  'Torta de Cogumelo': '🥧',
  'Ensopado Rústico': '🍲',
  'Banquete do Aventureiro': '🍱',
};

// Insumos-exceção que também não têm emoji no catálogo (consumível migrado).
const CONSUMABLE_INPUT_EMOJI: Record<string, string> = {
  'Ração': '🐄',
};

/** Emoji de um insumo/prato da cozinha (ingrediente, processado, Ração ou comida). */
export function cookingItemEmoji(name: string): string {
  return (
    getIngredientByName(name)?.emoji ??
    getProcessedByName(name)?.emoji ??
    CONSUMABLE_INPUT_EMOJI[name] ??
    FOOD_EMOJI[name] ??
    '🍳'
  );
}
