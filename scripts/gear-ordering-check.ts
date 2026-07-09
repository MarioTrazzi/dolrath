// ============================================================
// CHECK DE ORDENAÇÃO DO GEAR — roda: npx tsx scripts/gear-ordering-check.ts
// Importa as curvas REAIS (enhancementSystem + combatModel + itemCatalog),
// imprime as tabelas raridade×aprimoramento e ASSERTA:
//   (a) raridade N em TRI > raridade N+1 em +8, p/ todo par adjacente
//   (b) monotonicidade da qualidade por linha (enh) e coluna (raridade)
//   (c) camada de stats com budgets reais do catálogo:
//       Adaga Ligeira·TRI > Punhal do Caçador·+8 e Arco Curto·TRI > Arco do Batedor·+8
// Sai com código 1 se qualquer assert falhar (usável em CI).
// ============================================================
import { getStatMultiplier, applyEnhancementToStats } from '../src/lib/enhancementSystem'
import { RARITY_WEIGHT, enhanceTierFactor, deriveGearTier, NOMINAL_SLOTS } from '../src/lib/combatModel'
import { ITEM_CATALOG } from '../src/lib/itemCatalog'

const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']
const ENH_COLS: Array<[string, number]> = [
  ['+0', 0], ['+8', 8], ['+15', 15], ['I', 16], ['II', 17], ['III', 18], ['IV', 19], ['V', 20],
]
const TRI = 18, PLUS8 = 8

let failures = 0
function check(ok: boolean, label: string) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`)
  if (!ok) failures++
}

// Qualidade bruta de UMA peça (sem clamp) e gearTier de um SET uniforme (com clamp).
const quality = (rarity: string, enh: number) => RARITY_WEIGHT[rarity] * getStatMultiplier(enh)
const setTier = (rarity: string, enh: number) =>
  deriveGearTier(Array.from({ length: NOMINAL_SLOTS }, () => ({ rarity, enhancementLevel: enh })))

function printTable(title: string, fn: (r: string, e: number) => number) {
  console.log(`\n${title}`)
  console.log('  ' + 'raridade'.padEnd(11) + ENH_COLS.map(([l]) => l.padStart(7)).join(''))
  for (const r of RARITIES) {
    console.log('  ' + r.padEnd(11) + ENH_COLS.map(([, e]) => fn(r, e).toFixed(3).padStart(7)).join(''))
  }
}

printTable('QUALIDADE BRUTA (RARITY_WEIGHT × getStatMultiplier — vale p/ stats e tier)', quality)
printTable(`GEAR TIER de set uniforme (${NOMINAL_SLOTS} peças, deriveGearTier, clamp 1.0)`, setTier)

console.log('\n(a) raridade N em TRI supera raridade N+1 em +8:')
for (let i = 0; i < RARITIES.length - 1; i++) {
  const lo = RARITIES[i], hi = RARITIES[i + 1]
  const a = quality(lo, TRI), b = quality(hi, PLUS8)
  check(a > b, `${lo}·TRI ${a.toFixed(3)} > ${hi}·+8 ${b.toFixed(3)}`)
}

console.log('\n(a2) raridade cru ainda segura a ponta (TRI de N não passa +0 de N+1... exceto onde decidido):')
check(quality('UNCOMMON', TRI) < quality('LEGENDARY', 0),
  `UNCOMMON·TRI ${quality('UNCOMMON', TRI).toFixed(3)} < LEGENDARY·+0 ${quality('LEGENDARY', 0).toFixed(3)}`)

console.log('\n(b) monotonicidade da qualidade (linhas: enh crescente; colunas: raridade crescente):')
let mono = true
for (const r of RARITIES) {
  for (let j = 1; j < ENH_COLS.length; j++) {
    if (quality(r, ENH_COLS[j][1]) <= quality(r, ENH_COLS[j - 1][1])) { mono = false; console.log(`     quebra em ${r} ${ENH_COLS[j][0]}`) }
  }
}
for (const [, e] of ENH_COLS) {
  for (let i = 1; i < RARITIES.length; i++) {
    if (quality(RARITIES[i], e) <= quality(RARITIES[i - 1], e)) { mono = false; console.log(`     quebra em +${e} ${RARITIES[i]}`) }
  }
}
check(mono, 'qualidade estritamente crescente por enh e por raridade')

console.log('\n(c) camada de stats com budgets REAIS do catálogo (1 pt = 1 str/agi/int/def/res/con = 2 hp = 2 mp):')
const PT_WEIGHT: Record<string, number> = { str: 1, agi: 1, int: 1, def: 1, res: 1, con: 1, hp: 0.5, mp: 0.5 }
const pts = (stats: Record<string, any>) =>
  Object.entries(stats).reduce((s, [k, v]) => s + (typeof v === 'number' ? (PT_WEIGHT[k] ?? 0) * v : 0), 0)
const item = (name: string) => {
  const it = ITEM_CATALOG.find((i) => i.name === name)
  if (!it) throw new Error(`item não encontrado no catálogo: ${name}`)
  return it
}
const pairs: Array<[string, string]> = [
  ['Adaga Ligeira', 'Punhal do Caçador'],
  ['Arco Curto', 'Arco do Batedor'],
]
for (const [common, uncommon] of pairs) {
  const a = pts(applyEnhancementToStats(item(common).stats, TRI))
  const b = pts(applyEnhancementToStats(item(uncommon).stats, PLUS8))
  check(a > b, `${common}·TRI ${a.toFixed(1)} pts > ${uncommon}·+8 ${b.toFixed(1)} pts`)
}

console.log('\n(d) tooltip não mente entre si (enhanceTierFactor espelha getStatMultiplier a menos da normalização):')
let mirror = true
for (const [, e] of ENH_COLS) {
  const ratio = enhanceTierFactor(e) / getStatMultiplier(e)
  if (Math.abs(ratio - enhanceTierFactor(0)) > 1e-9) { mirror = false; console.log(`     divergência em enh ${e}: ratio ${ratio}`) }
}
check(mirror, 'curva de combate ∝ curva de stats (mesma forma)')

console.log(failures === 0 ? '\n✅ TODAS as ordenações OK' : `\n❌ ${failures} falha(s)`)
process.exit(failures === 0 ? 0 : 1)
