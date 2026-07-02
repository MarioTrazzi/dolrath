import { recipesUsingIngredient } from './alchemy';
import { forgeRecipesUsingMaterial } from './forge';

/** Nomes dos itens (poções, equipamentos, pedras) que alguma receita produz a
 *  partir deste ingrediente de alquimia ou material de forja. Usado nos cards
 *  de item (CraftItemThumb, ItemTooltip) para mostrar "Pode produzir" ao passar
 *  o mouse. Itens que não são insumo de nenhuma receita retornam lista vazia. */
export function whatItemCanProduce(itemName: string): string[] {
  const fromAlchemy = recipesUsingIngredient(itemName).map((r) => r.outputName);
  const fromForge = forgeRecipesUsingMaterial(itemName).map((r) => r.outputName);
  return Array.from(new Set([...fromAlchemy, ...fromForge]));
}
