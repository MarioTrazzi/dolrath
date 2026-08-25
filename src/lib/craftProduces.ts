import { recipesUsingIngredient, POTION_RECIPES } from './alchemy';
import { forgeRecipesUsingMaterial, FORGE_RECIPES } from './forge';
import { processingRecipesUsingInput, PROCESSING_RECIPES } from './processing';
import { cookingRecipesUsingInput, COOKING_RECIPES } from './cooking';
import { getCraftMinLevel, isRefineRecipe, refineXpAndLevel } from './craftingProfession';
import type { TFunction } from './i18n/t';

/** Nomes dos itens (poções, equipamentos, pedras, insumos processados, pratos)
 *  que alguma receita produz a partir deste ingrediente de alquimia, material
 *  de forja ou insumo processado. Itens que não são insumo de nenhuma receita
 *  retornam lista vazia. */
export function whatItemCanProduce(itemName: string): string[] {
  const fromAlchemy = recipesUsingIngredient(itemName).map((r) => r.outputName);
  const fromForge = forgeRecipesUsingMaterial(itemName).map((r) => r.outputName);
  const fromProcessing = processingRecipesUsingInput(itemName).map((r) => r.outputName);
  const fromCooking = cookingRecipesUsingInput(itemName).map((r) => r.outputName);
  return Array.from(new Set([...fromAlchemy, ...fromForge, ...fromProcessing, ...fromCooking]));
}

// Rótulos em EN (a chave É o texto, como manda o i18n); o PT vem do dicionário.
const CATEGORY_ORDER: { match: (kind: string, group?: string) => boolean; label: string }[] = [
  { match: (kind, group) => kind === 'gear' && group === 'weapon', label: 'weapons' },
  { match: (kind, group) => kind === 'gear' && group === 'armor', label: 'armor' },
  { match: (kind) => kind === 'stone', label: 'enhancement stones' },
  { match: (kind) => kind === 'potion', label: 'potions' },
  { match: (kind) => kind === 'processed', label: 'processed goods' },
  { match: (kind) => kind === 'food', label: 'cooked dishes' },
];

/** Resumo curto do que este ingrediente/material ajuda a produzir, por
 *  categoria (ex.: "Para produzir armas e pedras de aprimoramento"), em vez
 *  de listar cada item individualmente — a lista completa deixava o card
 *  gigante quando o insumo entrava em muitas receitas. Usado nos cards de
 *  item (CraftItemThumb, ItemTooltip) ao passar o mouse. `null` quando o
 *  item não é insumo de nenhuma receita. Recebe o `t` de quem chama porque
 *  a frase é montada aqui (categorias + conector). */
export function whatItemCanProduceSummary(itemName: string, t: TFunction): string | null {
  const kinds = new Set<string>();
  if (recipesUsingIngredient(itemName).length > 0) kinds.add('potion');
  for (const r of forgeRecipesUsingMaterial(itemName)) {
    kinds.add(r.kind === 'stone' ? 'stone' : `gear:${r.group}`);
  }
  for (const r of processingRecipesUsingInput(itemName)) {
    kinds.add(r.group === 'refine' ? 'stone' : 'processed');
  }
  if (cookingRecipesUsingInput(itemName).length > 0) kinds.add('food');

  const labels = CATEGORY_ORDER.filter(({ match }) =>
    Array.from(kinds).some((k) => {
      const [kind, group] = k.split(':');
      return match(kind, group);
    })
  ).map((c) => t(c.label));

  if (labels.length === 0) return null;
  const joined = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} ${t('and')} ${labels[labels.length - 1]}`;
  return t('To produce {list}', { list: joined });
}

/** Bancada que executa a receita — decide rótulo e cor de quem exibe. */
export type CraftBench = 'alchemy' | 'forge' | 'process' | 'cook';

export interface CraftSource {
  bench: CraftBench;
  /** Insumos exigidos pela receita, com a quantidade por unidade produzida. */
  inputs: { name: string; quantity: number }[];
  /** Taxa de mão de obra em gold. */
  goldCost: number;
  /** Nível da profissão exigido para executar a receita. */
  minLevel: number;
}

/** Caminho INVERSO do `whatItemCanProduce`: as receitas que PRODUZEM este item,
 *  com os insumos que elas consomem. É o que o card do item mostra ("Feito com"),
 *  independentemente de o jogador ter ou não o material na mochila — a receita é
 *  informação de catálogo, não de inventário. Lista vazia quando o item não sai
 *  de nenhuma bancada (espólio puro, item de loja). */
export function whatItemIsMadeOf(itemName: string): CraftSource[] {
  const out: CraftSource[] = [];
  for (const r of POTION_RECIPES) {
    if (r.outputName === itemName) out.push({ bench: 'alchemy', inputs: r.ingredients, goldCost: r.goldCost, minLevel: getCraftMinLevel(r.rarity) });
  }
  for (const r of FORGE_RECIPES) {
    if (r.outputName === itemName) {
      const minLevel = isRefineRecipe(r) ? refineXpAndLevel(r.rarity).minLevel : getCraftMinLevel(r.rarity);
      out.push({ bench: 'forge', inputs: r.materials, goldCost: r.goldCost, minLevel });
    }
  }
  for (const r of PROCESSING_RECIPES) {
    if (r.outputName === itemName) out.push({ bench: 'process', inputs: r.inputs, goldCost: r.goldCost, minLevel: r.minLevel });
  }
  for (const r of COOKING_RECIPES) {
    if (r.outputName === itemName) out.push({ bench: 'cook', inputs: r.inputs, goldCost: r.goldCost, minLevel: r.minLevel });
  }
  return out;
}

/** Rótulo (chave EN) da bancada que produz o item. */
export const CRAFT_BENCH_LABEL: Record<CraftBench, string> = {
  alchemy: '⚗️ Alchemy',
  forge: '⚒️ Forge',
  process: '⚙️ Processing',
  cook: '🍳 Cooking',
};
