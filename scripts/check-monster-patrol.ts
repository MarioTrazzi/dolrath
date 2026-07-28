// Prova, em Node puro, que a ronda do monstro com folha usa a FOLHA INTEIRA.
//
// O pedido era: "o boss se movimenta para todos os lados, então temos que
// colocar uma movimentação nele para aproveitar da melhor forma esse sprite".
// A ronda antiga era um vaivém em linha reta — a criatura só andaria para os
// dois lados e a arte de frente e de costas NUNCA apareceria. Este script é o
// teste de regressão disso, e roda sem canvas, sem DOM e sem banco.
//
// Mede três coisas:
//   1. CONTENÇÃO  — distância máxima do centro da ronda vs. o raio do bolsão.
//   2. USO DA ARTE — histograma de poses. 100% de perfil é exatamente o bug.
//   3. ESTABILIDADE — trocas de pose por volta. Numa elipse tem que dar 4;
//      mais que isso é flicker na diagonal e o POSE_HYST precisa subir.
//
// Uso:
//   npx tsx scripts/check-monster-patrol.ts
//   npx tsx scripts/check-monster-patrol.ts --dungeon floresta --seed run-0001

import { DUNGEONS, type DungeonId } from '../src/lib/dungeonAdventures'
import { generateSceneMap } from '../src/lib/dungeonScene/generateMap'
import {
  monsterPose,
  monsterPos,
  monsterVel,
  planMonsters,
  type MonsterPose,
  type SceneMonster,
} from '../src/lib/dungeonScene/monsters'
import { planNodeContents } from '../src/lib/dungeonScene/nodeContents'

const argv = process.argv.slice(2)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const DUNGEON = (valOf('--dungeon') || 'floresta') as DungeonId
const SEED = valOf('--seed') || 'run-0001'
/** Amostras por volta. 720 = meio grau, fino o bastante para contar trocas. */
const SAMPLES = 720

if (!DUNGEONS[DUNGEON]) {
  console.error(`❌ masmorra desconhecida: ${DUNGEON} (use ${Object.keys(DUNGEONS).join(' | ')})`)
  process.exit(1)
}

const map = generateSceneMap(DUNGEON, SEED)
const contents = planNodeContents(map, SEED)
const monsters = planMonsters(map, contents, map.seed)

/** Raio do bolsão do nó — o mesmo disco que planMonsters usa para se conter. */
function pocketRadius(nodeIndex: number): number {
  const spot = map.spots.find(s => s.nodeIndex === nodeIndex)
  if (!spot) return NaN
  const pocket = map.areas.find(
    a => a.kind === 'disc' && Math.hypot(a.c.x - spot.pos.x, a.c.y - spot.pos.y) < 0.5,
  )
  return pocket && pocket.kind === 'disc' ? pocket.r : 5
}

function report(mo: SceneMonster, i: number) {
  const period = (Math.PI * 2) / mo.speed
  const counts: Record<MonsterPose, number> = { side: 0, front: 0, back: 0 }
  let maxDist = 0
  let changes = 0
  let prev: MonsterPose | undefined

  // Duas voltas: a 1ª só aquece a histerese (que é sticky, então a pose inicial
  // com `prev` vazio não é a de regime), a 2ª é a que conta. Sem isso a emenda
  // entre o fim e o começo da volta some com uma troca de vez em quando.
  for (let s = 0; s < SAMPLES * 2; s++) {
    const t = (s / SAMPLES) * period
    const p = monsterPos(mo, t)
    maxDist = Math.max(maxDist, Math.hypot(p.x - mo.home.x, p.y - mo.home.y))
    const pose = monsterPose(monsterVel(mo, t), prev)
    const measuring = s >= SAMPLES
    if (measuring) {
      counts[pose]++
      if (prev && pose !== prev) changes++
    }
    prev = pose
  }

  const r = pocketRadius(mo.nodeIndex)
  const pct = (n: number) => `${((n / SAMPLES) * 100).toFixed(0)}%`.padStart(4)
  const kind = mo.isBoss ? '☠ CHEFE' : '· mob  '
  const art = mo.speciesSlug ? `folha=${mo.speciesSlug}` : 'vulto'
  const ronda = mo.orbit
    ? `elipse rx=${mo.orbit.rx.toFixed(2)} ry=${mo.orbit.ry.toFixed(2)}`
    : `linha span=${mo.span.toFixed(2)}`

  console.log(`\n[${i}] ${kind} nó ${mo.nodeIndex} — ${art}`)
  console.log(`     ronda ${ronda}, volta em ${period.toFixed(1)}s`)
  console.log(
    `     contenção: raio andado ${maxDist.toFixed(2)} / bolsão ${r.toFixed(2)} ` +
      (maxDist < r ? '✅' : '❌ SAI DO BOLSÃO'),
  )
  // Pose só significa alguma coisa para quem tem folha: o vulto procedural é
  // desenhado com uma silhueta lateral só, espelhada por monsterFacing.
  if (mo.speciesSlug) {
    console.log(
      `     poses: perfil ${pct(counts.side)}  frente ${pct(counts.front)}  costas ${pct(counts.back)}`,
    )
    console.log(`     trocas de pose por volta: ${changes}`)
  }

  const problems: string[] = []
  if (maxDist >= r) problems.push('a ronda sai do bolsão — baixe o rx em planMonsters')
  if (mo.speciesSlug) {
    if (counts.front === 0 || counts.back === 0)
      problems.push('folha subaproveitada: falta frente e/ou costas na volta')
    if (counts.side === SAMPLES) problems.push('100% de perfil — é o bug que a elipse conserta')
    if (changes !== 4)
      problems.push(`esperava 4 trocas por volta, deu ${changes} — flicker na diagonal (suba o POSE_HYST)`)
  }
  return problems
}

console.log(`🧭 ${DUNGEONS[DUNGEON].name} — seed "${SEED}", ${monsters.length} criatura(s)`)
const allProblems: string[] = []
monsters.forEach((mo, i) => {
  for (const p of report(mo, i)) allProblems.push(`[${i}] ${p}`)
})

if (allProblems.length) {
  console.log(`\n❌ ${allProblems.length} problema(s):`)
  for (const p of allProblems) console.log(`   ${p}`)
  process.exit(1)
}
console.log(`\n✅ ronda contida e folha usada inteira.`)
