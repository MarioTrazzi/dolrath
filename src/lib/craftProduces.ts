import { recipesUsingIngredient } from './alchemy';
import { forgeRecipesUsingMaterial } from './forge';

/** Nomes dos itens (poções, equipamentos, pedras) que alguma receita produz a
 *  partir deste ingrediente de alquimia ou material de forja. Itens que não
 *  são insumo de nenhuma receita retornam lista vazia. */
export function whatItemCanProduce(itemName: string): string[] {
  const fromAlchemy = recipesUsingIngredient(itemName).map((r) => r.outputName);
  const fromForge = forgeRecipesUsingMaterial(itemName).map((r) => r.outputName);
  return Array.from(new Set([...fromAlchemy, ...fromForge]));
}

const CATEGORY_ORDER: { match: (kind: string, group?: string) => boolean; label: string }[] = [
  { match: (kind, group) => kind === 'gear' && group === 'weapon', label: 'armas' },
  { match: (kind, group) => kind === 'gear' && group === 'armor', label: 'armaduras' },
  { match: (kind) => kind === 'stone', label: 'pedras de aprimoramento' },
  { match: (kind) => kind === 'potion', label: 'poções' },
];

/** Resumo curto do que este ingrediente/material ajuda a produzir, por
 *  categoria (ex.: "Para produzir armas e pedras de aprimoramento"), em vez
 *  de listar cada item individualmente — a lista completa deixava o card
 *  gigante quando o insumo entrava em muitas receitas. Usado nos cards de
 *  item (CraftItemThumb, ItemTooltip) ao passar o mouse. `null` quando o
 *  item não é insumo de nenhuma receita. */
export function whatItemCanProduceSummary(itemName: string): string | null {
  const kinds = new Set<string>();
  if (recipesUsingIngredient(itemName).length > 0) kinds.add('potion');
  for (const r of forgeRecipesUsingMaterial(itemName)) {
    kinds.add(r.kind === 'stone' ? 'stone' : `gear:${r.group}`);
  }

  const labels = CATEGORY_ORDER.filter(({ match }) =>
    Array.from(kinds).some((k) => {
      const [kind, group] = k.split(':');
      return match(kind, group);
    })
  ).map((c) => c.label);

  if (labels.length === 0) return null;
  const joined = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
  return `Para produzir ${joined}`;
}
