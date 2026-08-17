// 🔧 ESPÓLIO DE MANUTENÇÃO — a masmorra paga o próprio conserto
//
// O desgaste (durability.ts) foi calibrado supondo que o jogador forja cópias
// para reparar. No começo do jogo esse loop NÃO EXISTIA:
//
//  1. reparo por cópia exige cópia LISA (enhancementLevel 0), e todo gear que a
//     Floresta droppa vem +4..+7 (DUNGEON_DROP_ENH) — nenhum drop servia;
//  2. o pool de material da Floresta tem Couro/Madeira Flexível/Seiva de Ent;
//     Ferro Pesado, Metal Leve, Cristal Bruto e Fragmentos de Joias só caem da
//     Caverna em diante — guerreiro, ladino e monge não conseguiam forjar a
//     cópia da PRÓPRIA arma;
//  3. peça RARA+ só repara com Estilhaço de Memória, 1 por chefe.
//
// Resultado no playtest: nv6 com o set inteiro quebrado, sem ouro para reparar e
// farmando pior por estar quebrado — a espiral que faz largar o jogo.
//
// A saída não é dropar mais material do BIOMA (isso só engorda o inventário com
// insumo de alquimia): é o espólio olhar o que o herói está USANDO. Este módulo
// é puro — o sorteio real mora em dungeonAdventures.ts e a calibração em
// scripts/repair-economy-sim.ts.

import {
  getCatalogItemByName,
  getForgeMaterialByName,
  getProcessedByName,
  dropSlotGroupOf,
} from './itemCatalog';
import { FORGE_RECIPES } from './forge';
import { PROCESSING_RECIPES } from './processing';

/** Peça equipada do ponto de vista da manutenção (o que o loot precisa saber). */
export interface GearWearSnapshot {
  name: string;
  type: string;
  durability: number;
  maxDurability: number;
}

/** Um item de manutenção sorteado: material de receita ou peça de reposição. */
export interface MaintenanceDrop {
  name: string;
  /** 'material' = insumo da receita da peça; 'spare' = cópia lisa da peça. */
  kind: 'material' | 'spare';
  /** Nome da peça equipada que motivou o drop (para o log do cliente). */
  forItem: string;
}

// Peça abaixo disto é candidata a receber uma PEÇA DE REPOSIÇÃO inteira. Acima,
// o material de receita já dá conta — reposição inteira é o socorro, não a norma.
export const SPARE_PART_WEAR_THRESHOLD = 0.6;

// Durabilidade com que a peça de reposição cai. Ela existe para VIRAR
// durabilidade (vale exatamente uma unidade de reparo, REPAIR_PER_DUPLICATE),
// não para virar upgrade: sem isso, dropar cópia dirigida de peça RARA seria
// inflação de loot raro por outro nome. Quem está com a arma quebrada ainda pode
// equipá-la em emergência.
export const SPARE_PART_DURABILITY = 25;

// Material do ARQUÉTIPO, para peça que não tem receita de forja (as raras e
// épicas autoradas de chão, o gear de loja fora do livro de receitas). Espelha a
// lógica das receitas comuns: cada tipo de arma tem sua matéria-prima.
const ARCHETYPE_MATERIAL: Record<string, string> = {
  SWORD: 'Ferro Pesado',
  AXE: 'Ferro Pesado',
  LOGGING_AXE: 'Ferro Pesado',
  PICKAXE: 'Ferro Pesado',
  DAGGER: 'Metal Leve',
  PARRY_DAGGER: 'Metal Leve',
  HUNTING_KNIFE: 'Metal Leve',
  HERB_SICKLE: 'Metal Leve',
  BOW: 'Madeira Flexível',
  FISHING_ROD: 'Madeira Flexível',
  STAFF: 'Seiva de Ent',
  ORB: 'Cristal Bruto',
  TALISMAN: 'Cristal Bruto',
  GAUNTLET: 'Fragmentos de Joias',
};

// Fallback por GRUPO de slot quando nem o tipo é conhecido.
const GROUP_MATERIAL: Record<string, string> = {
  weapon: 'Ferro Pesado',
  offhand: 'Couro',
  armor: 'Couro',
  accessory: 'Pó de Joia',
};

// Processado → insumo CRU equivalente (Barra de Ferro → Ferro). O material de
// manutenção sempre cai cru: o Processamento continua no caminho de quem tem a
// profissão, mas não trava quem ainda não a subiu.
const RAW_OF_PROCESSED: Map<string, string> = new Map(
  PROCESSING_RECIPES.flatMap((r) => {
    const raw = r.inputs.find((i) => i.name !== 'Água Pura') ?? r.inputs[0];
    return raw ? [[r.outputName, raw.name] as [string, string]] : [];
  }),
);

// Receita de forja que PRODUZ cada peça (a cópia que o ferreiro funde no reparo).
const RECIPE_BY_OUTPUT = new Map(
  FORGE_RECIPES.filter((r) => r.kind === 'gear').map((r) => [r.outputName, r]),
);

/** Fração desgastada de uma peça (0 = nova, 1 = quebrada). */
export function wearOf(eq: GearWearSnapshot): number {
  const max = Math.max(1, Math.floor(eq.maxDurability) || 100);
  const dur = Math.max(0, Math.min(max, Math.floor(eq.durability)));
  return 1 - dur / max;
}

/**
 * Pressão de desgaste do set (0..1): a média do quanto as peças estão gastas.
 * É ela que faz o espólio de manutenção RESPONDER ao estado do jogador — set
 * novo quase não recebe insumo de conserto; set caindo aos pedaços recebe muito.
 */
export function wearPressure(gear: GearWearSnapshot[]): number {
  if (!gear.length) return 0;
  const total = gear.reduce((sum, eq) => sum + wearOf(eq), 0);
  return Math.max(0, Math.min(1, total / gear.length));
}

/**
 * Fator aplicado às chances de manutenção. Piso de 0.4 de propósito: mesmo com o
 * set novo o slot precisa pingar alguma coisa, senão o jogador só descobre que a
 * manutenção existe quando já está quebrado — tarde demais.
 */
export function maintenanceWearFactor(gear: GearWearSnapshot[]): number {
  if (!gear.length) return 0;
  return 0.4 + 0.6 * wearPressure(gear);
}

/** Sorteio ponderado: peça mais gasta tem mais chance de puxar o próprio insumo. */
function pickByWear(gear: GearWearSnapshot[], rng: () => number): GearWearSnapshot | null {
  if (!gear.length) return null;
  // +0.15 de piso por peça: a peça nova ainda pode ser sorteada (estoque
  // preventivo), só que bem menos que a que está prestes a quebrar.
  const weights = gear.map((eq) => 0.15 + wearOf(eq));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let pick = rng() * total;
  for (let i = 0; i < gear.length; i++) {
    pick -= weights[i];
    if (pick < 0) return gear[i];
  }
  return gear[gear.length - 1];
}

/**
 * Material que a peça consome para ser forjada — o insumo da CÓPIA que repara.
 * Ordem de resolução: receita de forja (cru na hora, processado convertido para
 * o cru) → material do arquétipo do tipo → material do grupo de slot.
 * O ligante (Estilhaço de Pedra Negra) fica de fora: já tem slot próprio e
 * abundante no loot (killShard 0.62).
 */
export function maintenanceMaterialFor(
  eq: GearWearSnapshot,
  rng: () => number = Math.random,
): string | null {
  const recipe = RECIPE_BY_OUTPUT.get(eq.name);
  if (recipe) {
    const candidates = recipe.materials
      .map((m) => RAW_OF_PROCESSED.get(m.name) ?? m.name)
      .filter((name) => !name.startsWith('Estilhaço de Pedra Negra'));
    if (candidates.length) {
      return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
    }
  }

  const type = eq.type || getCatalogItemByName(eq.name)?.type || '';
  const byType = ARCHETYPE_MATERIAL[type];
  if (byType) return byType;
  return GROUP_MATERIAL[dropSlotGroupOf(type)] ?? 'Couro';
}

/**
 * Um material de manutenção para o set: escolhe a peça (ponderada pelo desgaste)
 * e devolve o insumo dela. `null` quando não há set ou o nome não resolve em
 * nenhum catálogo (o chamador simplesmente não dropa nada).
 */
export function rollMaintenanceMaterial(
  gear: GearWearSnapshot[],
  rng: () => number = Math.random,
): MaintenanceDrop | null {
  const eq = pickByWear(gear, rng);
  if (!eq) return null;
  const name = maintenanceMaterialFor(eq, rng);
  if (!name) return null;
  // Só entrega nome que existe em catálogo — senão o crédito criaria um Item
  // fantasma com stats vazios (ensureCatalogItemTx cai no fallback genérico).
  if (!getForgeMaterialByName(name) && !getProcessedByName(name)) return null;
  return { name, kind: 'material', forItem: eq.name };
}

/**
 * Peça de reposição INTEIRA: a cópia lisa da peça mais desgastada do set (só
 * abaixo de SPARE_PART_WEAR_THRESHOLD de durabilidade). É o pedido literal do
 * playtest — "peças inteiras e sem up, para servirem de reparo" — e por design
 * cai bem menos que o material.
 */
export function rollSparePart(gear: GearWearSnapshot[]): MaintenanceDrop | null {
  let worst: GearWearSnapshot | null = null;
  for (const eq of gear) {
    if (wearOf(eq) < 1 - SPARE_PART_WEAR_THRESHOLD) continue;
    if (!worst || wearOf(eq) > wearOf(worst)) worst = eq;
  }
  if (!worst) return null;
  // Peça sem entrada de catálogo não vira drop: o crédito precisa do tipo real
  // para não criar um Item genérico que o ferreiro não reconheceria como cópia.
  if (!getCatalogItemByName(worst.name)) return null;
  return { name: worst.name, kind: 'spare', forItem: worst.name };
}
