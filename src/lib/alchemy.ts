// ⚗️ Sistema de Alquimia — receitas de poção do Dolrath
//
// A alquimia é SÓ POÇÕES: cada receita combina ingredientes (INGREDIENT_CATALOG)
// e EXTRATOS processados (PROCESSED_CATALOG — destilaria de processing.ts) numa
// poção já existente em CONSUMABLE_CATALOG, consumindo os insumos + taxa em gold.
// Pão/Ração/Bandagem saíram daqui: são beneficiamento/culinária, não transmutação
// (Ração/Bandagem = Bancada de Processamento; Pão = Culinária, sessão futura).
//
// Pipeline dos insumos:
//  - Ervas cruas (coleta/fazenda) → destilaria do Processamento → Extrato/Essência
//  - Chefes de masmorra → ingredientes RARO/ÉPICO (+ chance da poção pronta)
// Logo, toda poção passa pela cadeia coleta → processar → transmutar; as
// raras/épicas somam o ingrediente exclusivo de boss.

import {
  CONSUMABLE_CATALOG,
  INGREDIENT_CATALOG,
  getConsumableByName,
  getIngredientsByRarity,
  type Rarity,
  type AlchemyIngredient,
} from './itemCatalog';

export interface RecipeIngredient {
  name: string;
  quantity: number;
}

export interface PotionRecipe {
  id: string;
  /** Nome da poção produzida (deve existir em CONSUMABLE_CATALOG). */
  outputName: string;
  rarity: Rarity;
  ingredients: RecipeIngredient[];
  /** Taxa de craft em gold (mão de obra). */
  goldCost: number;
}

// Taxa = ~30% do preço de loja/venda da poção.
function feeFor(outputName: string): number {
  const c = getConsumableByName(outputName);
  return c ? Math.max(5, Math.round(c.goldPrice * 0.3)) : 25;
}

function recipe(
  id: string,
  outputName: string,
  rarity: Rarity,
  ingredients: RecipeIngredient[],
): PotionRecipe {
  return { id, outputName, rarity, ingredients, goldCost: feeFor(outputName) };
}

// TODA receita tem EXATAMENTE 3 elementos (somando as quantidades) — é o que
// vai nos 3 vértices do Triângulo de Transmutação da Bancada de Alquimia.
export const POTION_RECIPES: PotionRecipe[] = [
  // ---------- COMUNS (extrato processado + solvente) ----------
  recipe('vida_pequena', 'Poção de Vida Pequena', 'COMMON', [
    { name: 'Extrato Herbal', quantity: 1 },
    { name: 'Água Pura', quantity: 2 },
  ]),
  recipe('mana', 'Poção de Mana', 'COMMON', [
    { name: 'Essência de Mana', quantity: 1 },
    { name: 'Água Pura', quantity: 2 },
  ]),
  recipe('stamina', 'Poção de Stamina', 'COMMON', [
    { name: 'Extrato de Raiz', quantity: 1 },
    { name: 'Água Pura', quantity: 2 },
  ]),
  recipe('antidoto', 'Antídoto', 'COMMON', [
    { name: 'Extrato Herbal', quantity: 1 },
    { name: 'Glândula de Veneno', quantity: 1 },
    { name: 'Água Pura', quantity: 1 },
  ]),

  // ---------- INCOMUNS (extrato + ingrediente incomum) ----------
  recipe('vida', 'Poção de Vida', 'UNCOMMON', [
    { name: 'Extrato Herbal', quantity: 2 },
    { name: 'Seiva Ancestral', quantity: 1 },
  ]),
  recipe('elixir_menor', 'Elixir Menor', 'UNCOMMON', [
    { name: 'Extrato Herbal', quantity: 1 },
    { name: 'Essência de Mana', quantity: 1 },
    { name: 'Seiva Ancestral', quantity: 1 },
  ]),
  recipe('forca', 'Poção de Força', 'UNCOMMON', [
    { name: 'Cogumelo Lunar', quantity: 2 },
    { name: 'Pó de Osso', quantity: 1 },
  ]),
  recipe('defesa', 'Poção de Defesa', 'UNCOMMON', [
    { name: 'Extrato de Raiz', quantity: 1 },
    { name: 'Pó de Osso', quantity: 1 },
    { name: 'Água Pura', quantity: 1 },
  ]),
  recipe('agilidade', 'Poção de Agilidade', 'UNCOMMON', [
    { name: 'Cogumelo Lunar', quantity: 1 },
    { name: 'Cristal de Mana', quantity: 1 },
    { name: 'Essência de Mana', quantity: 1 },
  ]),

  // ---------- RARAS (precisam de ingrediente raro — só de chefe) ----------
  // Exceção deliberada: a Poção de Reviver usa só insumos de chão da Floresta,
  // para o farm automático (auto-revive ao cair) ser sustentável desde o early-game.
  recipe('reviver', 'Poção de Reviver', 'RARE', [
    { name: 'Extrato Herbal', quantity: 1 },
    { name: 'Seiva Ancestral', quantity: 1 },
    { name: 'Cogumelo Lunar', quantity: 1 },
  ]),
  recipe('vida_grande', 'Poção de Vida Grande', 'RARE', [
    { name: 'Extrato Herbal', quantity: 1 },
    { name: 'Seiva Ancestral', quantity: 1 },
    { name: 'Lótus Negra', quantity: 1 },
  ]),
  recipe('elixir_supremo', 'Elixir Supremo', 'RARE', [
    { name: 'Seiva Ancestral', quantity: 1 },
    { name: 'Cristal de Mana', quantity: 1 },
    { name: 'Lótus Negra', quantity: 1 },
  ]),
  recipe('berserker', 'Tônico do Berserker', 'RARE', [
    { name: 'Sangue de Monstro', quantity: 1 },
    { name: 'Pó de Osso', quantity: 1 },
    { name: 'Cogumelo Lunar', quantity: 1 },
  ]),

  // ---------- ÉPICAS (precisam de ingrediente épico — só de chefe) ----------
  recipe('cura_suprema', 'Poção de Cura Suprema', 'EPIC', [
    { name: 'Lótus Negra', quantity: 2 },
    { name: 'Essência Cristalina', quantity: 1 },
  ]),
  recipe('po_fenix', 'Pó de Fênix', 'EPIC', [
    { name: 'Pena de Fênix', quantity: 1 },
    { name: 'Essência Cristalina', quantity: 1 },
    { name: 'Sangue de Monstro', quantity: 1 },
  ]),
];

const RECIPE_BY_ID = new Map(POTION_RECIPES.map((r) => [r.id, r]));

export function getRecipeById(id: string): PotionRecipe | undefined {
  return RECIPE_BY_ID.get(id);
}

/** Expande uma receita na lista ordenada dos seus 3 elementos (com repetição). */
export function expandRecipe(recipe: PotionRecipe): string[] {
  return recipe.ingredients
    .flatMap((i) => Array.from({ length: i.quantity }, () => i.name))
    .sort();
}

// Índice por combinação ordenada dos 3 elementos → receita.
const RECIPE_BY_COMBO = new Map(POTION_RECIPES.map((r) => [expandRecipe(r).join('|'), r]));

/**
 * Acha a receita que casa com os 3 ingredientes colocados no triângulo
 * (independe da ordem). Retorna undefined se não houver combinação válida.
 */
export function findRecipeByIngredients(names: string[]): PotionRecipe | undefined {
  if (names.length !== 3) return undefined;
  return RECIPE_BY_COMBO.get([...names].sort().join('|'));
}

/** Receitas que usam um dado ingrediente — para o tooltip "usado em" na bancada. */
export function recipesUsingIngredient(name: string): PotionRecipe[] {
  return POTION_RECIPES.filter((r) => r.ingredients.some((i) => i.name === name));
}

const RECIPE_RARITY_ORDER: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

/** Receitas agrupadas por raridade (ordem comum → épico). */
export function recipesByRarity(): { rarity: Rarity; recipes: PotionRecipe[] }[] {
  return RECIPE_RARITY_ORDER
    .map((rarity) => ({ rarity, recipes: POTION_RECIPES.filter((r) => r.rarity === rarity) }))
    .filter((g) => g.recipes.length > 0);
}

/**
 * Sorteia um ingrediente para o loot, dado um conjunto de raridades elegíveis.
 * Retorna undefined se nenhum ingrediente couber.
 */
export function pickIngredient(
  rarities: Rarity[],
  rng: () => number = Math.random,
): AlchemyIngredient | undefined {
  // Ingredientes de fazenda (Trigo etc.) NÃO caem em masmorra — só cultivo.
  const pool = rarities.flatMap((r) => getIngredientsByRarity(r)).filter((i) => i.source !== 'farm');
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rng() * pool.length)];
}

// Reexport para conveniência de quem importa o módulo de alquimia.
export { INGREDIENT_CATALOG, CONSUMABLE_CATALOG };
