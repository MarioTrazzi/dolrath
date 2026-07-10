// ⚒️ Sistema de Forja — receitas de equipamento e refino de pedra do Dolrath
//
// A Mesa de Forja do ferreiro tem duas funções (espelha a Bancada de Alquimia):
//  - FORJAR EQUIPAMENTO: combina materiais (FORGE_MATERIAL_CATALOG) numa peça
//    COMUM/INCOMUM já existente no ITEM_CATALOG. Consome materiais + taxa de gold
//    (mão de obra do ferreiro). Sempre dá certo (sem RNG).
//  - REFINAR PEDRA: converte 10 estilhaços → 1 Pedra Negra, e 10 Pedras Negras →
//    1 Concentrada. É o caminho determinístico para a Concentrada do late-game.
//
// Princípio de raridade (igual à alquimia):
//  - COMUM usa matéria-prima CRUA (couro, ferro pesado, madeira…) — o novato
//    chega da coleta/masmorra e já forja.
//  - INCOMUM exige insumo PROCESSADO (Barra de Aço, Couro Curtido, Tecido de
//    Linho… — Bancada de Processamento, src/lib/processing.ts): é a demanda
//    real da profissão de Processamento. O Estilhaço de Pedra Negra
//    (Arma/Armadura) segue como ligante de toda receita e feedstock do refino.
//
// Drop dos materiais: ver dungeonAdventures.ts (chão e luta de masmorra).

import {
  getCatalogItemByName,
  getForgeMaterialByName,
  getProcessedByName,
  type Rarity,
  type CatalogItem,
} from './itemCatalog';
import { STONE_NAMES } from './enhancementSystem';

export interface ForgeMaterialReq {
  name: string;
  quantity: number;
}

export type ForgeOutputKind = 'gear' | 'stone';

export interface ForgeRecipe {
  id: string;
  /** Tipo de saída: peça de equipamento (catálogo) ou pedra de aprimoramento. */
  kind: ForgeOutputKind;
  /** Nome do item produzido (gear → ITEM_CATALOG; stone → STONE_NAMES). */
  outputName: string;
  rarity: Rarity;
  /** Categoria de agrupamento na UI da mesa. */
  group: 'weapon' | 'armor' | 'stone';
  materials: ForgeMaterialReq[];
  /** Taxa de forja em gold (mão de obra). */
  goldCost: number;
}

// Taxa de gear = ~30% do preço da peça (como a alquimia). Refino tem taxa fixa baixa.
function gearFee(outputName: string): number {
  const item = getCatalogItemByName(outputName);
  return item ? Math.max(10, Math.round(item.goldPrice * 0.3)) : 30;
}

function gear(
  id: string,
  outputName: string,
  group: 'weapon' | 'armor',
  materials: ForgeMaterialReq[],
): ForgeRecipe {
  const item = getCatalogItemByName(outputName);
  const rarity: Rarity = item?.rarity ?? 'COMMON';
  return { id, kind: 'gear', outputName, rarity, group, materials, goldCost: gearFee(outputName) };
}

function stone(
  id: string,
  outputName: string,
  rarity: Rarity,
  materials: ForgeMaterialReq[],
  goldCost: number,
): ForgeRecipe {
  return { id, kind: 'stone', outputName, rarity, group: 'stone', materials, goldCost };
}

const SHARD_W = 'Estilhaço de Pedra Negra (Arma)';
const SHARD_A = 'Estilhaço de Pedra Negra (Armadura)';

export const FORGE_RECIPES: ForgeRecipe[] = [
  // ============================================================
  // ARMADURA — só couro = comum; couro + ferro = incomum
  // ============================================================
  // ---------- COMUM (só couro) ----------
  gear('arm_capuz_couro', 'Capuz de Couro', 'armor', [
    { name: 'Couro', quantity: 2 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_luvas_couro', 'Luvas de Couro', 'armor', [
    { name: 'Couro', quantity: 2 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_botas_viajante', 'Botas de Viajante', 'armor', [
    { name: 'Couro', quantity: 3 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_gibao_couro', 'Gibão de Couro', 'armor', [
    { name: 'Couro', quantity: 4 }, { name: SHARD_A, quantity: 1 },
  ]),
  // ---------- COMUM (peças de ferro básicas) ----------
  gear('arm_elmo_ferro', 'Elmo de Ferro', 'armor', [
    { name: 'Couro', quantity: 1 }, { name: 'Ferro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_peitoral_ferro', 'Peitoral de Ferro', 'armor', [
    { name: 'Couro', quantity: 2 }, { name: 'Ferro', quantity: 2 }, { name: SHARD_A, quantity: 1 },
  ]),
  // ---------- INCOMUM (processados: Couro Curtido + Barra de Ferro) ----------
  gear('arm_coif_malha', 'Coif de Malha', 'armor', [
    { name: 'Couro Curtido', quantity: 1 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_elmo_sentinela', 'Elmo do Sentinela', 'armor', [
    { name: 'Couro Curtido', quantity: 1 }, { name: 'Barra de Ferro', quantity: 2 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_luvas_malha', 'Luvas de Malha', 'armor', [
    { name: 'Couro Curtido', quantity: 1 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_botas_malha', 'Botas de Malha', 'armor', [
    { name: 'Couro Curtido', quantity: 1 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_grevas_aco', 'Grevas de Aço', 'armor', [
    { name: 'Couro Curtido', quantity: 1 }, { name: 'Barra de Ferro', quantity: 2 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_couro_batido', 'Armadura de Couro Batido', 'armor', [
    { name: 'Couro Curtido', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_couraca_aco', 'Couraça de Aço', 'armor', [
    { name: 'Couro Curtido', quantity: 1 }, { name: 'Barra de Aço', quantity: 1 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  // ---------- LINHO (fibra da fazenda) — a rota têxtil das vestes arcanas ----------
  // Mesmo lever de raridade do couro: fibra crua = comum; Tecido processado = incomum.
  gear('arm_tunica_linho', 'Túnica de Linho Arcano', 'armor', [
    { name: 'Fibra de Linho', quantity: 4 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('arm_vestes_conjurador', 'Vestes do Conjurador', 'armor', [
    { name: 'Tecido de Linho', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),

  // ============================================================
  // ARMAS — material especial do tipo = comum; + ferro = incomum
  // ============================================================
  // ---------- COMUM ----------
  gear('wpn_espada_recruta', 'Espada de Recruta', 'weapon', [
    { name: 'Ferro Pesado', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_machado_guarda', 'Machado do Guarda', 'weapon', [
    { name: 'Ferro Pesado', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_adaga_ligeira', 'Adaga Ligeira', 'weapon', [
    { name: 'Metal Leve', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_arco_curto', 'Arco Curto', 'weapon', [
    { name: 'Madeira Flexível', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_cajado_aprendiz', 'Cajado de Aprendiz', 'weapon', [
    { name: 'Seiva de Ent', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_orbe_cristal', 'Orbe de Cristal', 'weapon', [
    { name: 'Cristal Bruto', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_manoplas_discipulo', 'Manoplas do Discípulo', 'weapon', [
    { name: 'Fragmentos de Joias', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  // ---------- INCOMUM (processado do tipo + Barra de Ferro) ----------
  gear('wpn_espada_veterano', 'Espada do Veterano', 'weapon', [
    { name: 'Barra de Aço', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_machado_guerra', 'Machado de Guerra', 'weapon', [
    { name: 'Barra de Aço', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_punhal_cacador', 'Punhal do Caçador', 'weapon', [
    { name: 'Lâmina Polida', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_arco_batedor', 'Arco do Batedor', 'weapon', [
    { name: 'Tábua Aparelhada', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_cajado_runico', 'Cajado Rúnico', 'weapon', [
    { name: 'Verniz de Ent', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_orbe_runico', 'Orbe Rúnico', 'weapon', [
    { name: 'Cristal Lapidado', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('wpn_punhos_aco', 'Punhos de Aço', 'weapon', [
    { name: 'Joia Lapidada', quantity: 2 }, { name: 'Barra de Ferro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),

  // ============================================================
  // FERRAMENTAS E TRAJES DE COLETA (TOOL_CATALOG) — CRAFT-ONLY
  // ============================================================
  // Único jeito de obter (não caem nem são vendidos). O reparo também passa por
  // aqui: craftar OUTRA cópia e usá-la na bancada (+25 durabilidade/cópia) — o
  // ciclo "falhou o aprimoramento → forja outra pra reparar". Materiais só dos
  // campos LIVRES (bosque/minérios) + Couro/Fibra: sem ovo-e-galinha com os
  // campos que exigem a própria ferramenta (costa/caça).
  // ---------- FERRAMENTAS (slot de arma) ----------
  gear('tool_picareta_minerador', 'Picareta do Minerador', 'weapon', [
    { name: 'Ferro Pesado', quantity: 2 }, { name: 'Madeira Flexível', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('tool_foice_herborista', 'Foice da Herborista', 'weapon', [
    { name: 'Metal Leve', quantity: 1 }, { name: 'Madeira Flexível', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('tool_machado_lenhador', 'Machado do Lenhador', 'weapon', [
    { name: 'Ferro Pesado', quantity: 1 }, { name: 'Madeira Flexível', quantity: 2 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('tool_vara_pesca', 'Vara de Pesca', 'weapon', [
    { name: 'Madeira Flexível', quantity: 4 }, { name: 'Couro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  gear('tool_faca_caca', 'Faca de Caça', 'weapon', [
    { name: 'Metal Leve', quantity: 2 }, { name: 'Couro', quantity: 1 }, { name: SHARD_W, quantity: 1 },
  ]),
  // ---------- TRAJES (slot de armadura) ----------
  gear('garb_minerador', 'Traje do Minerador', 'armor', [
    { name: 'Couro', quantity: 3 }, { name: 'Ferro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('garb_herborista', 'Traje da Herborista', 'armor', [
    { name: 'Fibra de Linho', quantity: 3 }, { name: 'Couro', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('garb_lenhador', 'Traje do Lenhador', 'armor', [
    { name: 'Couro', quantity: 3 }, { name: 'Madeira Flexível', quantity: 1 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('garb_pescador', 'Traje do Pescador', 'armor', [
    { name: 'Fibra de Linho', quantity: 2 }, { name: 'Couro', quantity: 2 }, { name: SHARD_A, quantity: 1 },
  ]),
  gear('garb_cacador', 'Traje do Caçador', 'armor', [
    { name: 'Couro', quantity: 4 }, { name: SHARD_A, quantity: 1 },
  ]),

  // ============================================================
  // REFINO DE PEDRA — 10:1 em cada degrau (estilhaço → pedra → concentrada)
  // ============================================================
  stone('refine_pedra_arma', STONE_NAMES.WEAPON_BASIC, 'UNCOMMON', [
    { name: SHARD_W, quantity: 10 },
  ], 20),
  stone('refine_pedra_armadura', STONE_NAMES.ARMOR_BASIC, 'UNCOMMON', [
    { name: SHARD_A, quantity: 10 },
  ], 20),
  stone('refine_concentrada_arma', STONE_NAMES.WEAPON_CONCENTRATED, 'EPIC', [
    { name: STONE_NAMES.WEAPON_BASIC, quantity: 10 },
  ], 200),
  stone('refine_concentrada_armadura', STONE_NAMES.ARMOR_CONCENTRATED, 'EPIC', [
    { name: STONE_NAMES.ARMOR_BASIC, quantity: 10 },
  ], 200),
];

const RECIPE_BY_ID = new Map(FORGE_RECIPES.map((r) => [r.id, r]));

export function getForgeRecipeById(id: string): ForgeRecipe | undefined {
  return RECIPE_BY_ID.get(id);
}

// Chave canônica da combinação de materiais (nome:qtd, ordenada) — para o modo
// "montar na mesa": o jogador arrasta materiais até a combinação casar com uma receita.
function materialsKey(mats: ForgeMaterialReq[]): string {
  return mats
    .filter((m) => m.quantity > 0)
    .map((m) => `${m.name}:${m.quantity}`)
    .sort()
    .join('|');
}

const RECIPE_BY_MATERIALS = new Map(FORGE_RECIPES.map((r) => [materialsKey(r.materials), r]));

/** Acha a receita cuja lista de materiais bate EXATAMENTE com a colocada na mesa. */
export function findForgeRecipeByMaterials(mats: ForgeMaterialReq[]): ForgeRecipe | undefined {
  const key = materialsKey(mats);
  return key ? RECIPE_BY_MATERIALS.get(key) : undefined;
}

/** Receitas que usam um dado material — para o tooltip "usado em" na mesa de forja. */
export function forgeRecipesUsingMaterial(name: string): ForgeRecipe[] {
  return FORGE_RECIPES.filter((r) => r.materials.some((m) => m.name === name));
}

const FORGE_GROUP_ORDER: { group: ForgeRecipe['group']; rarities: Rarity[] }[] = [
  { group: 'armor', rarities: ['COMMON', 'UNCOMMON'] },
  { group: 'weapon', rarities: ['COMMON', 'UNCOMMON'] },
  { group: 'stone', rarities: ['UNCOMMON', 'EPIC'] },
];

/** Receitas agrupadas por função (armadura → arma → refino), ordenadas por raridade. */
export function forgeRecipesByGroup(): { group: ForgeRecipe['group']; recipes: ForgeRecipe[] }[] {
  return FORGE_GROUP_ORDER.map(({ group, rarities }) => ({
    group,
    recipes: FORGE_RECIPES.filter((r) => r.group === group).sort(
      (a, b) => rarities.indexOf(a.rarity) - rarities.indexOf(b.rarity),
    ),
  }));
}

/** Resolve a peça de catálogo de uma receita de gear (para criar o Item de saída). */
export function getForgeOutputCatalogItem(recipe: ForgeRecipe): CatalogItem | undefined {
  return recipe.kind === 'gear' ? getCatalogItemByName(recipe.outputName) : undefined;
}

/** Emoji de um material/estilhaço/processado para exibir na mesa (cai pro genérico se desconhecido). */
export function forgeMaterialEmoji(name: string): string {
  return getForgeMaterialByName(name)?.emoji ?? getProcessedByName(name)?.emoji ?? '⚒️';
}
