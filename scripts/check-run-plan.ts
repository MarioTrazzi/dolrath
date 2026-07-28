// Confere a PLANTA da run — a que o servidor e o cliente compartilham.
//
// Duas coisas que este script existe para não deixar quebrar em silêncio:
//
// 1. ORÇAMENTO FIXO. Todo mundo que entra na mesma masmorra tem que enfrentar o
//    MESMO número de batalhas e receber o MESMO número de achados. O que muda
//    de run para run é ONDE eles estão e QUAL bicho aparece. Se o orçamento
//    variar por seed, dois jogadores abrem vantagem econômica por sorte de mapa.
//
// 2. O BALANCE DE ANTES. Fixar o orçamento não podia, de carona, mudar quantas
//    lutas cabem numa run. O modelo antigo decidia por faixa do d20 e produzia
//    46% de combate nos nós menores na média (0.25·0.9 + 0.40·0.5 + 0.35·0.1);
//    a planta tem que cair na mesma casa, senão XP, espólio e stamina da
//    masmorra inteira mudam sem ninguém ter pedido.
//
// Uso:
//   npx tsx scripts/check-run-plan.ts
//   npx tsx scripts/check-run-plan.ts --runs 500

import { DUNGEONS, type DungeonId } from '../src/lib/dungeonAdventures'
import { planDungeonRun, planTrail } from '../src/lib/dungeonRunPlan'

const argv = process.argv.slice(2)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const RUNS = Number(valOf('--runs') || 200)

/** Taxa de combate em nó menor que o modelo por faixa de d20 produzia. */
const LEGACY_MINOR_COMBAT_RATE = 0.25 * 0.9 + 0.4 * 0.5 + 0.35 * 0.1

const problems: string[] = []

for (const id of Object.keys(DUNGEONS) as DungeonId[]) {
  const dungeon = DUNGEONS[id]
  const trail = planTrail(dungeon)
  const minorIdx = trail.map((n, i) => ({ n, i })).filter(x => x.n.kind === 'minor').map(x => x.i)

  const combatCounts = new Set<number>()
  const findCounts = new Set<number>()
  let minorCombat = 0
  let minorTotal = 0
  let packTotal = 0
  let packNodes = 0
  const speciesSeen = new Set<string>()

  for (let r = 0; r < RUNS; r++) {
    const runId = `run-${id}-${r}`
    const plan = planDungeonRun(dungeon, runId)

    let combat = 0
    let find = 0
    let fountains = 0
    for (const node of Array.from(plan.values())) {
      if (node.category === 'combat') combat++
      else find++
      if (node.flavor === 'fountain') fountains++
      for (const m of node.monsters) speciesSeen.add(m)
      if (node.kind === 'minor' && node.category === 'combat') {
        packTotal += node.monsters.length
        packNodes++
      }
    }
    combatCounts.add(combat)
    findCounts.add(find)
    if (fountains > 1) problems.push(`${id}/${runId}: ${fountains} fontes (máximo é 1)`)

    // Nó 1 = luta de calibração travada, pacote de 3 dos arquétipos mais fracos.
    const first = plan.get(1)
    if (!first || first.category !== 'combat' || first.monsters.length !== 3) {
      problems.push(
        `${id}/${runId}: nó 1 devia ser combate com 3 bichos, veio ${first?.category}/${first?.monsters.length}`
      )
    }
    // Chefe no último nó, sempre.
    const boss = plan.get(trail.length - 1)
    if (boss?.flavor !== 'boss') problems.push(`${id}/${runId}: último nó não é o chefe`)
    // Sala principal é sempre guardião SOLO.
    for (const node of Array.from(plan.values())) {
      if (node.kind === 'main' && node.monsters.length !== 1) {
        problems.push(`${id}/${runId}: sala principal com ${node.monsters.length} bichos (devia ser 1)`)
      }
    }
    for (const i of minorIdx) {
      minorTotal++
      if (plan.get(i)?.category === 'combat') minorCombat++
    }
  }

  const rate = minorCombat / minorTotal
  const drift = Math.abs(rate - LEGACY_MINOR_COMBAT_RATE)
  const avgPack = packTotal / Math.max(1, packNodes)

  console.log(`\n🗺️  ${dungeon.name} (${id}) — ${RUNS} runs`)
  console.log(
    `   orçamento: ${Array.from(combatCounts).join('/')} combate(s), ` +
      `${Array.from(findCounts).join('/')} achado(s) ` +
      (combatCounts.size === 1 && findCounts.size === 1 ? '✅ fixo' : '❌ VARIA por seed')
  )
  console.log(
    `   combate em nó menor: ${(rate * 100).toFixed(1)}% ` +
      `(modelo antigo: ${(LEGACY_MINOR_COMBAT_RATE * 100).toFixed(1)}%) ` +
      (drift <= 0.05 ? '✅' : '❌ desviou do balance')
  )
  console.log(`   bando médio em nó menor: ${avgPack.toFixed(2)} bicho(s)`)
  console.log(`   espécies vistas: ${speciesSeen.size}/${dungeon.monsters.length + 1} do bestiário`)

  if (combatCounts.size !== 1 || findCounts.size !== 1) {
    problems.push(`${id}: orçamento varia por seed — o arranjo pode mudar, o orçamento não`)
  }
  if (drift > 0.05) {
    problems.push(
      `${id}: combate em nó menor ${(rate * 100).toFixed(1)}% vs ${(LEGACY_MINOR_COMBAT_RATE * 100).toFixed(1)}% do modelo antigo — ajuste o FIND_FRACTION`
    )
  }
  if (speciesSeen.size < dungeon.monsters.length) {
    problems.push(`${id}: só ${speciesSeen.size} espécies apareceram em ${RUNS} runs — sorteio enviesado`)
  }
}

if (problems.length) {
  console.log(`\n❌ ${problems.length} problema(s):`)
  for (const p of Array.from(new Set(problems)).slice(0, 12)) console.log(`   ${p}`)
  process.exit(1)
}
console.log(`\n✅ orçamento fixo, balance preservado e bestiário inteiro em uso.`)
