// ⛏️ Sistema de COLETA — campos de recursos idle do Dolrath
//
// A Coleta é o "PvE sem combate": o personagem entra num CAMPO (estilo
// masmorra, mas sem monstros e SEM DADOS) e fica rendendo recursos por tempo
// real, gastando stamina — enquanto outros personagens da conta fazem runs.
//
// Mecânica (lazy por timestamp, sem cron — mesmo padrão do staminaSystem):
//  - 1 tique a cada 15 min (alinhado ao regen), custando 3 de stamina.
//  - Cada tique rende 1+ itens da tabela ponderada do campo (quantidade cresce
//    com o nível de Coleta — professionSystem.gatherYieldPerTick) + 5 gatherXp.
//  - Sem d20: o sorteio ponderado decide QUAL item, nunca SE rende.
//  - Barra cheia (100) ≈ 33 tiques ≈ 8h20 de coleta — a sessão "de deixar de noite".
//  - Quando a stamina não paga o próximo tique, a sessão fica `exhausted` e
//    segura o acumulado até o jogador coletar.
//
// Princípio de economia: a coleta cobre APENAS o comum/incomum de chão —
// ingredientes raro/épico (Lótus Negra, Pena de Fênix…) seguem exclusivos de
// chefe de masmorra. Itens de fazenda (Trigo, Fibra de Linho) NÃO aparecem
// aqui: a coleta dá as SEMENTES (só nos Campos de Ervas) e a fazenda cultiva.

import { SEED_CATALOG, type ItemTypeStr } from './itemCatalog';
import { gatherSeedChance, gatherYieldPerTick } from './professionSystem';
import { STONE_NAMES } from './enhancementSystem';

export type GatherFieldId = 'minerios' | 'ervas' | 'bosque' | 'costa' | 'caca';

export interface GatherDrop {
  /** Nome de item existente (INGREDIENT_CATALOG / FORGE_MATERIAL_CATALOG). */
  name: string;
  /** Peso relativo no sorteio (entre os elegíveis pelo nível). */
  weight: number;
  /** Nível de Coleta que destrava o recurso (ausente = desde o nv1). */
  minLevel?: number;
}

export interface GatherFieldDef {
  id: GatherFieldId;
  name: string;
  emoji: string;
  /** Frase curta do card de seleção. */
  tagline: string;
  description: string;
  drops: GatherDrop[];
  /** Campo que também dropa sementes de cultivo (chance por tique). */
  seedField?: boolean;
  /** Exige a ferramenta do campo (FIELD_TOOL) equipada para iniciar a coleta. */
  requiresTool?: boolean;
  /**
   * Nível de Coleta DO HERÓI que destrava o campo (ausente = aberto desde o
   * início). A escada segue a necessidade do early game: ervas (poções) →
   * minérios nv3 (estilhaços p/ aprimoramento) → bosque nv5 (ferramentas) →
   * costa nv7 / caça nv9 (refeições). Cada degrau ≈ 1 noite de coleta.
   */
  minGatherLevel?: number;
}

// Cadência e custos do tique (o servidor é a autoridade; o cliente só exibe).
export const GATHER_TICK_SECONDS = 15 * 60; // alinhado ao tique da stamina
export const GATHER_TICK_STAMINA = 3;       // > regen (+2/tique) ⇒ sessão termina
export const GATHER_XP_PER_TICK = 5;
// Trava de segurança por sincronização (24h de tiques); a stamina já limita antes.
export const GATHER_MAX_TICKS_PER_SYNC = 96;

export const GATHER_FIELDS: Record<GatherFieldId, GatherFieldDef> = {
  minerios: {
    id: 'minerios',
    name: 'Vale dos Minérios',
    emoji: '⛏️',
    tagline: 'Metais e estilhaços para a forja do ferreiro.',
    description:
      'Encostas ricas em veios de ferro e cristais. É daqui que sai a matéria-prima das armas, armaduras e do refino de pedras.',
    minGatherLevel: 3,
    drops: [
      // A necessidade de quem abre a mina (nv3, gear da Floresta em mãos) é
      // aprimoramento, não craft: estilhaços dominam o pool (~55% no early).
      { name: 'Ferro Pesado', weight: 14 },
      { name: 'Metal Leve', weight: 10 },
      { name: 'Ferro', weight: 10 },
      // P2 pedras (2026-07-05): 30/70 arma/armadura — demanda do set é 1:5
      { name: 'Estilhaço de Pedra Negra (Arma)', weight: 14 },
      { name: 'Estilhaço de Pedra Negra (Armadura)', weight: 28 },
      { name: 'Cristal Bruto', weight: 14, minLevel: 10 },
      { name: 'Fragmentos de Joias', weight: 10, minLevel: 20 },
      // Pó de Joia: reparo de acessório (anel/colar/cinto) no ferreiro — nível
      // baixo de propósito, já que jóia quebra com o mesmo uso que o resto do gear.
      { name: 'Pó de Joia', weight: 12, minLevel: 6 },
      // 💎 Pedra Concentrada: coletor experiente (nv30+) acha raramente — fonte
      // alternativa ao boss/tier alto/refino 10:1 pro aprimoramento TRI/TET. 30/70 arma/armadura.
      { name: STONE_NAMES.WEAPON_CONCENTRATED, weight: 2, minLevel: 30 },
      { name: STONE_NAMES.ARMOR_CONCENTRATED, weight: 4, minLevel: 30 },
    ],
  },
  ervas: {
    id: 'ervas',
    name: 'Campos de Ervas',
    emoji: '🌿',
    tagline: 'Ingredientes de alquimia — e as únicas SEMENTES do jogo.',
    description:
      'Campinas férteis onde crescem as ervas das poções. Só aqui se acham sementes de cultivo para a fazenda.',
    seedField: true,
    drops: [
      // Água Pura pesa mais que as ervas: cada poção consome 3 Águas por
      // 2 Ervas (2 no craft da poção + 1 na destilaria do extrato).
      { name: 'Erva Medicinal', weight: 22 },
      { name: 'Água Pura', weight: 30 },
      { name: 'Flor de Mana', weight: 18 },
      { name: 'Raiz Vigorosa', weight: 18 },
      // nv6 (era 10): destrava a Poção de Reviver cedo — é o combustível do
      // auto-revive do farm, desenhada p/ ser sustentável desde o early game.
      { name: 'Cogumelo Lunar', weight: 12, minLevel: 6 },
      { name: 'Cristal de Mana', weight: 8, minLevel: 20 },
    ],
  },
  bosque: {
    id: 'bosque',
    name: 'Bosque Antigo',
    emoji: '🌳',
    tagline: 'Madeira, couro e seivas para arcos e cajados.',
    description:
      'Mata fechada de árvores ancestrais. Rende madeira flexível, couro de armadilhas e, para coletores experientes, as seivas raras.',
    minGatherLevel: 5,
    drops: [
      { name: 'Madeira Flexível', weight: 34 },
      { name: 'Couro', weight: 30 },
      // nv8 (era 15): Cajado de Aprendiz (Seiva×2) e Verniz de Ent entram na
      // janela em que o bosque acabou de abrir, não um gate tardio.
      { name: 'Seiva de Ent', weight: 22, minLevel: 8 },
      { name: 'Seiva Ancestral', weight: 14, minLevel: 25 },
    ],
  },
  // Os dois campos abaixo EXIGEM a ferramenta equipada (requiresTool): não se
  // pesca sem Vara nem se caça sem Faca — ver o gate em /api/gather/start.
  // Nos campos antigos a ferramenta é só bônus (quem coleta hoje não trava).
  costa: {
    id: 'costa',
    name: 'Costa dos Ventos',
    emoji: '🎣',
    tagline: 'Peixe e frutos do mar — a despensa das Refeições.',
    description:
      'Falésias varridas pelo vento e poças de maré. Rende peixe fresco e frutos do mar para a cozinha; pescadores pacientes acham pérolas.',
    requiresTool: true,
    minGatherLevel: 7,
    drops: [
      { name: 'Peixe Prateado', weight: 34 },
      { name: 'Frutos do Mar', weight: 26 },
      { name: 'Água Pura', weight: 20 },
      { name: 'Pérola Bruta', weight: 6, minLevel: 20 },
    ],
  },
  caca: {
    id: 'caca',
    name: 'Trilha de Caça',
    emoji: '🏹',
    tagline: 'Carne de caça e couro — sem sacrificar o gado.',
    description:
      'Trilhas de presas na orla da mata. Rende carne fresca para a cozinha e couro de caça — a alternativa a abater os animais da fazenda.',
    requiresTool: true,
    minGatherLevel: 9,
    drops: [
      { name: 'Carne de Caça', weight: 34 },
      { name: 'Couro', weight: 30 },
      { name: 'Carne Nobre', weight: 14, minLevel: 15 },
      { name: 'Seiva de Ent', weight: 8 },
    ],
  },
};

// Ferramenta de coleta de cada campo (TOOL_CATALOG em itemCatalog.ts): o bônus
// de gatherYield da ferramenta EQUIPADA (slot WEAPON) só vale no campo dela.
export const FIELD_TOOL: Record<GatherFieldId, ItemTypeStr> = {
  minerios: 'PICKAXE',
  ervas: 'HERB_SICKLE',
  bosque: 'LOGGING_AXE',
  costa: 'FISHING_ROD',
  caca: 'HUNTING_KNIFE',
};

export function getGatherField(id: string): GatherFieldDef | undefined {
  return (GATHER_FIELDS as Record<string, GatherFieldDef>)[id];
}

// Pesos das sementes no drop dos Campos de Ervas (nomes do SEED_CATALOG).
const SEED_WEIGHTS: { name: string; weight: number }[] = [
  { name: 'Semente de Trigo', weight: 40 },
  { name: 'Semente de Erva Medicinal', weight: 35 },
  { name: 'Semente de Linho', weight: 25 },
];
// Garante em build/teste que todo peso aponta pra semente real do catálogo.
if (process.env.NODE_ENV !== 'production') {
  const known = new Set(SEED_CATALOG.map((s) => s.name));
  for (const s of SEED_WEIGHTS) {
    if (!known.has(s.name)) throw new Error(`SEED_WEIGHTS aponta semente inexistente: ${s.name}`);
  }
}

// ============================================================
// Matemática do tique (funções puras — cliente exibe, servidor decide)
// ============================================================

export interface GatherTickInput {
  /** Âncora do último tique já computado (GatheringSession.lastTickAt). */
  lastTickAt: Date;
  /** Stamina ATUAL do personagem (após o regen lazy). */
  stamina: number;
  now?: Date;
}

export interface GatherTickResult {
  /** Tiques completos a computar agora (limitados pela stamina). */
  ticks: number;
  staminaSpent: number;
  /** Nova âncora (lastTickAt + ticks×15min — preserva o offset parcial). */
  anchor: Date;
  /** true quando a stamina restante não paga o próximo tique. */
  exhausted: boolean;
}

export function computeGatherTicks(input: GatherTickInput): GatherTickResult {
  const now = input.now ?? new Date();
  const elapsedSec = Math.max(0, (now.getTime() - input.lastTickAt.getTime()) / 1000);
  const possible = Math.floor(elapsedSec / GATHER_TICK_SECONDS);
  const affordable = Math.floor(Math.max(0, input.stamina) / GATHER_TICK_STAMINA);
  const ticks = Math.max(0, Math.min(possible, affordable, GATHER_MAX_TICKS_PER_SYNC));
  const staminaSpent = ticks * GATHER_TICK_STAMINA;
  const anchor = new Date(input.lastTickAt.getTime() + ticks * GATHER_TICK_SECONDS * 1000);
  return {
    ticks,
    staminaSpent,
    anchor,
    exhausted: input.stamina - staminaSpent < GATHER_TICK_STAMINA,
  };
}

export interface GatherYieldDrop {
  name: string;
  qty: number;
}

export interface GatherYield {
  /** Itens acumulados (inclui sementes), agregados por nome. */
  drops: GatherYieldDrop[];
  xp: number;
}

function pickWeighted<T extends { weight: number }>(pool: T[], rng: () => number): T {
  const total = pool.reduce((n, d) => n + d.weight, 0);
  let roll = rng() * total;
  for (const d of pool) {
    roll -= d.weight;
    if (roll <= 0) return d;
  }
  return pool[pool.length - 1];
}

/**
 * Rende `ticks` tiques de um campo para um nível de Coleta. Determinístico na
 * QUANTIDADE (nível decide, fração vira chance) e ponderado no TIPO de item.
 * `toolYieldMult` = multiplicador da ferramenta/traje equipados (1 = sem bônus;
 * 1.25 = +25% de rendimento por tique — gatheringServer resolve o valor).
 */
export function rollGatherYield(
  fieldId: GatherFieldId,
  gatherLevel: number,
  ticks: number,
  rng: () => number = Math.random,
  toolYieldMult = 1,
): GatherYield {
  const field = GATHER_FIELDS[fieldId];
  const agg = new Map<string, number>();
  if (!field || ticks <= 0) return { drops: [], xp: 0 };

  const eligible = field.drops.filter((d) => (d.minLevel ?? 1) <= gatherLevel);
  const perTick = gatherYieldPerTick(gatherLevel) * Math.max(1, toolYieldMult);
  const seedChance = field.seedField ? gatherSeedChance(gatherLevel) : 0;

  for (let t = 0; t < ticks; t++) {
    // Quantidade do tique: parte inteira garantida + fração como chance.
    let qty = Math.floor(perTick);
    if (rng() < perTick - qty) qty++;
    for (let i = 0; i < qty; i++) {
      const drop = pickWeighted(eligible, rng);
      agg.set(drop.name, (agg.get(drop.name) ?? 0) + 1);
    }
    if (seedChance > 0 && rng() < seedChance) {
      const seed = pickWeighted(SEED_WEIGHTS, rng);
      agg.set(seed.name, (agg.get(seed.name) ?? 0) + 1);
    }
  }

  return {
    drops: Array.from(agg.entries()).map(([name, qty]) => ({ name, qty })),
    xp: ticks * GATHER_XP_PER_TICK,
  };
}

/** Formato do GatheringSession.pendingYield (JSONB). */
export interface PendingYield {
  drops: GatherYieldDrop[];
  xp: number;
  ticks: number;
}

/** Soma um rendimento novo ao pendente (agregando por nome). */
export function mergePendingYield(prev: PendingYield | null | undefined, add: GatherYield, ticks: number): PendingYield {
  const agg = new Map<string, number>();
  for (const d of prev?.drops ?? []) agg.set(d.name, (agg.get(d.name) ?? 0) + d.qty);
  for (const d of add.drops) agg.set(d.name, (agg.get(d.name) ?? 0) + d.qty);
  return {
    drops: Array.from(agg.entries()).map(([name, qty]) => ({ name, qty })),
    xp: (prev?.xp ?? 0) + add.xp,
    ticks: (prev?.ticks ?? 0) + ticks,
  };
}
