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

import { SEED_CATALOG } from './itemCatalog';
import { gatherSeedChance, gatherYieldPerTick } from './professionSystem';
import { STONE_NAMES } from './enhancementSystem';

export type GatherFieldId = 'minerios' | 'ervas' | 'bosque';

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
    drops: [
      { name: 'Ferro Pesado', weight: 22 },
      { name: 'Metal Leve', weight: 18 },
      { name: 'Ferro', weight: 12 },
      // P2 pedras (2026-07-05): 30/70 arma/armadura — demanda do set é 1:5
      { name: 'Estilhaço de Pedra Negra (Arma)', weight: 8 },
      { name: 'Estilhaço de Pedra Negra (Armadura)', weight: 16 },
      { name: 'Cristal Bruto', weight: 14, minLevel: 10 },
      { name: 'Fragmentos de Joias', weight: 10, minLevel: 20 },
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
      { name: 'Erva Medicinal', weight: 22 },
      { name: 'Água Pura', weight: 22 },
      { name: 'Flor de Mana', weight: 18 },
      { name: 'Raiz Vigorosa', weight: 18 },
      { name: 'Cogumelo Lunar', weight: 12, minLevel: 10 },
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
    drops: [
      { name: 'Madeira Flexível', weight: 34 },
      { name: 'Couro', weight: 30 },
      { name: 'Seiva de Ent', weight: 22, minLevel: 15 },
      { name: 'Seiva Ancestral', weight: 14, minLevel: 25 },
    ],
  },
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
 */
export function rollGatherYield(
  fieldId: GatherFieldId,
  gatherLevel: number,
  ticks: number,
  rng: () => number = Math.random,
): GatherYield {
  const field = GATHER_FIELDS[fieldId];
  const agg = new Map<string, number>();
  if (!field || ticks <= 0) return { drops: [], xp: 0 };

  const eligible = field.drops.filter((d) => (d.minLevel ?? 1) <= gatherLevel);
  const perTick = gatherYieldPerTick(gatherLevel);
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
