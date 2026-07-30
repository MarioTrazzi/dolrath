// ============================================================
// PLANTA DA RUN — o que existe em CADA nó, decidido na CRIAÇÃO da masmorra.
//
// Regra de ouro (pedido do Mario): a aleatoriedade muda o ARRANJO, nunca o
// ORÇAMENTO. Todo mundo que entra na mesma masmorra enfrenta o MESMO número de
// batalhas e recebe o MESMO número de achados; o que muda de run para run é
// ONDE eles estão e QUAL bicho aparece.
//
// Antes disto o servidor decidia monstro-vs-achado no /step, nó a nó, com
// `Math.random()` — então o cliente só descobria ao CHEGAR, e por isso o mapa
// desenhava "?" em cima de cada ponto. Adiantar aquilo no cliente seria mentir.
// Agora a planta inteira sai de uma função PURA semeada pelo `runId`: servidor e
// cliente chegam ao mesmo resultado sem coluna nova no banco e sem round-trip,
// e o mapa já nasce com os bichos certos andando nos nós certos.
//
// O d20 NÃO decide mais encontro. Ele volta a ser só o que o design diz que ele
// é: a qualidade do espólio.
// ============================================================

import {
  DUNGEONS,
  earlyPoolOf,
  type DungeonDef,
  type DungeonId,
  type DungeonMonsterDef,
} from '@/lib/dungeonAdventures'
import { seedRng } from '@/lib/walkSceneAssets'

export type NodeCategory = 'combat' | 'find'
export type NodeFlavor = 'monster' | 'boss' | 'chest' | 'rubble' | 'herb' | 'fountain'

export interface PlannedNode {
  /** Índice na trilha — o MESMO do servidor (buildTrail) e da cena (generateMap). */
  nodeIdx: number
  kind: 'minor' | 'main' | 'boss'
  tier: number
  category: NodeCategory
  flavor: NodeFlavor
  /**
   * Bando do nó, em NOMES PT do catálogo (a chave canônica). Vazio em achado.
   * O servidor escala esses nomes em stats; o cliente só precisa deles para
   * saber que sprite pôr no mapa e quantos.
   */
  monsters: string[]
}

/**
 * Fatia dos nós MENORES que vira achado.
 *
 * 0.54 não é gosto: é a taxa que o modelo anterior produzia na média. Ele
 * decidia por faixa do d20 (low 1–5 → 90% monstro, mid 6–13 → 50%, high 14–20 →
 * 10%), o que dá 0.25·0.9 + 0.40·0.5 + 0.35·0.1 = 0.46 de combate, ou seja 0.54
 * de achado. Fixar o orçamento não podia, de carona, mudar quantas lutas cabem
 * numa run — isso mexeria em XP, espólio e stamina de toda a masmorra.
 */
const FIND_FRACTION = 0.54

/** No máximo uma fonte por run: cura cheia vale muito. */
const MAX_FOUNTAIN = 1

/**
 * Chance de um achado de nó menor (a partir da 2ª sala) virar fonte.
 * Também herdada do modelo antigo: lá era P(d20 alto) · P(não deu monstro) ·
 * 0.2 = 0.35 · 0.9 · 0.2 ≈ 0.063 dos nós menores.
 */
const FOUNTAIN_CHANCE = 0.12

/** Peso do tipo de achado por bioma — só sabor + viés de tabela de loot. */
const FIND_WEIGHTS: Record<DungeonId, Partial<Record<NodeFlavor, number>>> = {
  floresta: { herb: 4, chest: 3, rubble: 2 },
  caverna: { rubble: 5, chest: 3, herb: 1 },
  pantano: { herb: 4, rubble: 3, chest: 2 },
  ruinas: { rubble: 4, chest: 4, herb: 1 },
}

/**
 * Tamanho do bando num nó menor. Mesmos pesos do `rollPackSize` que isto
 * substitui: quanto MAIS bichos, mais fraco cada um (o ajuste de stats continua
 * em scaleMonsterGroup).
 */
const PACK_WEIGHTS: Array<{ size: number; weight: number }> = [
  { size: 1, weight: 0.4 },
  { size: 2, weight: 0.35 },
  { size: 3, weight: 0.25 },
]

/** Fisher-Yates com RNG semeado — embaralha sem consumir aleatoriedade real. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickWeighted(
  weights: Partial<Record<NodeFlavor, number>>,
  rng: () => number,
): NodeFlavor {
  const entries = Object.entries(weights) as Array<[NodeFlavor, number]>
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return 'chest'
  let r = rng() * total
  for (const [k, w] of entries) {
    r -= w
    if (r <= 0) return k
  }
  return entries[entries.length - 1][0]
}

function pickPackSize(rng: () => number): number {
  const total = PACK_WEIGHTS.reduce((s, w) => s + w.weight, 0)
  let r = rng() * total
  for (const w of PACK_WEIGHTS) {
    if (r < w.weight) return w.size
    r -= w.weight
  }
  return 1
}

/**
 * Espécie de um membro do bando.
 *
 * `earlyBias` dobra o peso dos dois arquétipos mais fracos nos nós menores da 1ª
 * sala — é o que impede o "Ent na porta" para um nível 1 sem travar a variedade.
 * Cada membro sorteia por si: bando MISTO (um lobo com duas aranhas) é o
 * comportamento que o servidor já tinha, não um efeito colateral.
 */
function pickSpecies(
  dungeon: DungeonDef,
  rng: () => number,
  opts?: { earlyBias?: boolean; pool?: DungeonMonsterDef[] },
): DungeonMonsterDef {
  const pool = opts?.pool?.length
    ? opts.pool
    : opts?.earlyBias
      ? [...dungeon.monsters, ...earlyPoolOf(dungeon)]
      : dungeon.monsters
  return pool[Math.floor(rng() * pool.length)]
}

/**
 * Sequência da trilha: start + (menores + principal) por sala + chefe.
 * Espelha `buildTrail` do servidor e a ordem dos spots de `generateSceneMap` —
 * é esse alinhamento que deixa os três lados falarem do mesmo `nodeIdx`.
 */
export function planTrail(dungeon: DungeonDef): Array<{ kind: 'start' | 'minor' | 'main' | 'boss'; tier: number }> {
  const seq: Array<{ kind: 'start' | 'minor' | 'main' | 'boss'; tier: number }> = [
    { kind: 'start', tier: 0 },
  ]
  for (let t = 1; t <= dungeon.rooms; t++) {
    for (let m = 0; m < dungeon.minorNodes; m++) seq.push({ kind: 'minor', tier: t })
    seq.push({ kind: 'main', tier: t })
  }
  seq.push({ kind: 'boss', tier: dungeon.rooms })
  return seq
}

/**
 * A planta da run inteira, indexada por nodeIdx. PURA: mesma masmorra + mesmo
 * `runId` ⇒ mesmo resultado no servidor e no cliente, sem nada persistido.
 */
export function planDungeonRun(dungeon: DungeonDef, runId: string): Map<number, PlannedNode> {
  const rng = seedRng(`${dungeon.id}:${runId}:plan`)
  const trail = planTrail(dungeon)
  const out = new Map<number, PlannedNode>()

  // ORÇAMENTO: quantos dos nós menores são achado. SORTEIO: quais.
  //
  // O nó 1 fica FORA do sorteio — ele é a luta de calibração travada (pacote de
  // 3 dos arquétipos mais fracos), que é o que garante XP cedo e tira o tanque
  // solo da porta para um nível 1.
  const minors = trail
    .map((n, i) => ({ ...n, i }))
    .filter(n => n.kind === 'minor' && n.i !== 1)
    .map(n => n.i)
  const findCount = Math.round(minors.length * FIND_FRACTION)
  const findSet = new Set(shuffle(minors, rng).slice(0, findCount))

  let fountains = 0
  for (let i = 0; i < trail.length; i++) {
    const node = trail[i]
    if (node.kind === 'start') continue

    if (node.kind === 'boss') {
      out.set(i, {
        nodeIdx: i,
        kind: 'boss',
        tier: node.tier,
        category: 'combat',
        flavor: 'boss',
        monsters: [dungeon.boss.name],
      })
      continue
    }

    if (node.kind === 'main') {
      // Sala principal = guardião SOLO. É o teste limpo do degrau de gear.
      out.set(i, {
        nodeIdx: i,
        kind: 'main',
        tier: node.tier,
        category: 'combat',
        flavor: 'monster',
        monsters: [pickSpecies(dungeon, rng).name],
      })
      continue
    }

    // ---- nó menor ----
    if (!findSet.has(i)) {
      const forcedCalibration = i === 1
      const size = forcedCalibration ? 3 : pickPackSize(rng)
      const pool = forcedCalibration ? earlyPoolOf(dungeon) : undefined
      const earlyBias = !forcedCalibration && node.tier === 1
      out.set(i, {
        nodeIdx: i,
        kind: 'minor',
        tier: node.tier,
        category: 'combat',
        flavor: 'monster',
        monsters: Array.from({ length: size }, () => pickSpecies(dungeon, rng, { pool, earlyBias }).name),
      })
      continue
    }

    // ⛲ Fonte só a partir da 2ª sala: nos nós menores da 1ª o HP/MP ainda está
    // cheio, então ela não faria sentido ali.
    const canFountain = node.tier > 1 && fountains < MAX_FOUNTAIN
    const flavor: NodeFlavor =
      canFountain && rng() < FOUNTAIN_CHANCE ? 'fountain' : pickWeighted(FIND_WEIGHTS[dungeon.id], rng)
    if (flavor === 'fountain') fountains++
    out.set(i, { nodeIdx: i, kind: 'minor', tier: node.tier, category: 'find', flavor, monsters: [] })
  }

  return out
}

/** Resumo para log/bancada. */
export function planSummary(plan: Map<number, PlannedNode>) {
  let combat = 0
  let find = 0
  let boss = 0
  let monsters = 0
  for (const n of Array.from(plan.values())) {
    if (n.flavor === 'boss') boss++
    else if (n.category === 'combat') combat++
    else find++
    monsters += n.monsters.length
  }
  return { combat, find, boss, monsters }
}
