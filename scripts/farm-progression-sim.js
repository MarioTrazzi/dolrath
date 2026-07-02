#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de PROGRESSÃO DE FARM (Floresta Sombria)
//
// 🎯 Meta (Mario, 2026-07-02): um jogador deve "se formar" na Floresta —
// nível 10 com o set de arma/armadura todo +15 (PRI como stretch) — em:
//   • ~3-4 semanas com 1 personagem
//   • ~1,5 semana com 5 personagens (farm rotativo, espólio compartilhado)
//   • ~1 semana com 10 personagens
//
// Modela o loop completo: stamina diária → runs (re-run automático) → abates →
// drops (chão via rollNodeLoot + POR ABATE proposto + Pedra garantida no boss) →
// refino 10:1 (estilhaço→Pedra Negra) → aprimoramento +8..+15 com failstacks
// (valores reais do enhancementSystem.ts) → dias até o set.
//
// As constantes de CHÃO espelham dungeonAdventures.ts; as constantes POR ABATE
// (KILL_*) são a proposta a ser tunada AQUI antes de ir pro código do jogo.
//
// Uso:
//   node scripts/farm-progression-sim.js
//   CHARS=5 TRIALS=300 node scripts/farm-progression-sim.js
//   KILL_SHARD=0.5 BOSS_STONES_MIN=1 BOSS_STONES_MAX=2 node scripts/farm-progression-sim.js
// ============================================================

const TRIALS = Number(process.env.TRIALS) || 200
const CHAR_COUNTS = process.env.CHARS ? [Number(process.env.CHARS)] : [1, 5, 10]
const MAX_DAYS = Number(process.env.MAX_DAYS) || 120

// ---- Stamina (staminaSystem.ts) ----
const STAMINA_CAP = 100
const STAMINA_REGEN_PER_DAY = 192            // 2 a cada 15 min
const DAILY_BUDGET = Number(process.env.BUDGET) || (STAMINA_CAP + STAMINA_REGEN_PER_DAY) * 0.75
// ↑ 0.75 = jogador dedicado mas não 24h: ~219 stamina/dia. BUDGET=292 p/ dreno perfeito.

// ---- Floresta (dungeonAdventures.ts) ----
const ROOMS = 3, MINORS_PER_ROOM = 2
const COST = { minor: 4, main: 8, boss: 6 }
const RUN_COST = ROOMS * (MINORS_PER_ROOM * COST.minor + COST.main) + COST.boss // 54

// d20 → tier de sorte (luckTier)
const tierOf = (roll) => (roll <= 5 ? 'low' : roll <= 13 ? 'mid' : 'high')
const MINOR_MONSTER_CHANCE = { low: 0.9, mid: 0.5, high: 0.1 }
const FOUNTAIN_CHANCE = 0.2 // nó menor, tier>1, sorte alta

// Pacote (nó menor): tamanho e share de recompensa
const PACK = [ { size: 1, w: 0.40 }, { size: 2, w: 0.35 }, { size: 3, w: 0.25 } ]
const PACK_SHARE = { 1: 1, 2: 0.6, 3: 0.45 }

// Loot de CHÃO (LUCK_CFG × NODE_LOOT_MULT) — igual ao código hoje
const LUCK = {
  low:  { pMaterial: 0.7, pStone: 0.03, pShard: 0.12, pGear: 0.05 },
  mid:  { pMaterial: 0.5, pStone: 0.08, pShard: 0.22, pGear: 0.15 },
  high: { pMaterial: 0.3, pStone: 0.15, pShard: 0.32, pGear: 0.30 },
}
const MULT = { minor: { all: 0.8, stone: 0.4 }, main: { all: 1.0, stone: 1.0 }, boss: { all: 1.0, stone: 2.5 } }
const CROSS_CLASS = 0.2
// Aprimoramento embutido no drop (floresta +4..+7; rollDropEnhancement)
function dropEnh(tier) {
  const r = Math.random()
  let lvl = 4
  if (r > 0.55) lvl = 5
  if (r > 0.80) lvl = 6
  if (r > 0.94) lvl = 7
  if (tier === 'high') lvl = Math.max(lvl, 5)
  return lvl
}

// ---- XP (experienceSystem.ts: base 100, exp 1.4, mult 50) ----
function xpForNext(level) { return Math.floor(100 * Math.pow(level, 1.4) + level * 50) }
const TIER_POWER_STEP = 0.6
const tf = (tier) => 1 + (tier - 1) * TIER_POWER_STEP
const xpMinor = (tier, share) => Math.floor((12 + Math.random() * 12) * tf(tier) * share)
const xpMain = (tier) => Math.floor((35 + Math.random() * 25) * tf(tier))
const xpBoss = () => Math.floor((150 + Math.random() * 100) * tf(ROOMS))

// ---- PROPOSTA: drop POR ABATE (a tunar aqui) ----
const KILL_SHARD = Number(process.env.KILL_SHARD ?? 0.35)   // nó menor, por abate
const KILL_SHARD_MAIN = Number(process.env.KILL_SHARD_MAIN ?? 0.5)
const BOSS_STONES_MIN = Number(process.env.BOSS_STONES_MIN ?? 1) // Pedra Negra GARANTIDA no boss
const BOSS_STONES_MAX = Number(process.env.BOSS_STONES_MAX ?? 2)

// ---- Derrota/re-run ----
// Derrota depende de NÍVEL e GEAR (um alt nv1 não mata o boss — e o boss é quem
// dá as Pedras): boss ≈ 75-80% de win no nv10 com gear +7 (memória do balance),
// quase impossível no nv1. Combate comum: run completa ~58% de clear no nível
// certo. Com auto-revive + re-run, cair só corta a run no meio.
const REVIVE_COVERAGE = Number(process.env.REVIVE ?? 0.7) // % das quedas cobertas por poção
function defeatChance(char, isBoss) {
  const avgEnh = char.pieces.reduce((s, p) => s + (p ?? 0), 0) / char.pieces.length
  if (isBoss) return Math.min(0.95, Math.max(0.2, 0.9 - 0.08 * (char.level - 1) - 0.03 * avgEnh))
  return Math.max(0.02, 0.12 - 0.01 * char.level)
}

// ---- Aprimoramento (enhancementSystem.ts) ----
const GEAR_CHANCE = { 8: 0.20, 9: 0.175, 10: 0.15, 11: 0.125, 12: 0.10, 13: 0.075, 14: 0.05, 15: 0.025, 16: 0.15 }
function enhanceChance(target, fs) {
  const base = GEAR_CHANCE[target]
  const per = base / 10
  let c = base, rem = fs
  if (c < 0.7) {
    const need = Math.ceil((0.7 - c) / per)
    const used = Math.min(rem, need)
    c += used * per
    rem -= used
  }
  if (rem > 0) c += rem * (per / 5)
  return Math.min(c, 0.9)
}

const PIECES = Number(process.env.PIECES ?? 6) // arma+escudo+4 armaduras (aprimoram com pedra)

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
function packSize() {
  let r = Math.random()
  for (const p of PACK) { if (r < p.w) return p.size; r -= p.w }
  return 1
}

// Uma RUN de um personagem. Devolve recursos ganhos + XP; muta o estado do char.
function simRun(char, pool) {
  let defeated = false
  const nodes = []
  for (let t = 1; t <= ROOMS; t++) {
    for (let m = 0; m < MINORS_PER_ROOM; m++) nodes.push({ kind: 'minor', tier: t })
    nodes.push({ kind: 'main', tier: t })
  }
  nodes.push({ kind: 'boss', tier: ROOMS })

  for (const node of nodes) {
    const roll = 1 + Math.floor(Math.random() * 20)
    const tier = tierOf(roll)
    const isBoss = node.kind === 'boss'
    const isMain = node.kind === 'main'
    const monster = isBoss || isMain || Math.random() < MINOR_MONSTER_CHANCE[tier]
    const lootTier = isBoss ? 'high' : tier
    const cfg = LUCK[lootTier]
    const mult = MULT[node.kind]

    if (monster) {
      const size = isBoss || isMain ? 1 : packSize()
      const share = PACK_SHARE[size]
      // abates (cada um pode derrubar o jogador; poção de reviver cobre a maioria)
      for (let k = 0; k < size; k++) {
        if (Math.random() < defeatChance(char, isBoss) && Math.random() > REVIVE_COVERAGE) { defeated = true; break }
        char.xp += isBoss ? xpBoss() : isMain ? xpMain(node.tier) : xpMinor(node.tier, share)
        // 💡 PROPOSTA: drop por abate
        if (!isBoss && Math.random() < (isMain ? KILL_SHARD_MAIN : KILL_SHARD)) pool.shards++
      }
      if (defeated) break
      if (isBoss) pool.stones += BOSS_STONES_MIN + Math.floor(Math.random() * (BOSS_STONES_MAX - BOSS_STONES_MIN + 1))
    }

    // Espólio do NÓ (chão hoje + pós-combate quando limpa o pacote)
    if (!monster && !isMain && node.tier > 1 && tier === 'high' && Math.random() < FOUNTAIN_CHANCE) continue
    if (Math.random() < cfg.pShard * mult.all) pool.shards++
    if (Math.random() < cfg.pStone * mult.stone) pool.stones++
    if (Math.random() < cfg.pGear * mult.all) {
      if (Math.random() < CROSS_CLASS) pool.gearOther.push(dropEnh(tier))
      else pool.gearOwn.push(dropEnh(tier))
    }
  }

  // sobe de nível
  while (char.level < 100 && char.xp >= xpForNext(char.level)) {
    char.xp -= xpForNext(char.level)
    char.level++
  }
}

// Aprimora as peças do char com o pool compartilhado (guloso: peça mais baixa primeiro).
function enhance(char, pool) {
  // refino 10:1 (forja)
  const refined = Math.floor(pool.shards / 10)
  pool.stones += refined
  pool.shards -= refined * 10
  while (pool.stones > 0) {
    const target = char.pieces.filter((p) => p != null && p < 15).sort((a, b) => a - b)[0]
    if (target == null) break
    const idx = char.pieces.indexOf(target)
    const next = target + 1
    pool.stones--
    if (next <= 7) { char.pieces[idx] = next; continue } // faixa segura
    if (Math.random() < enhanceChance(next, char.fs)) {
      char.pieces[idx] = next
      char.fs = 0
    } else {
      char.fs++
    }
  }
}

function simTrial(nChars) {
  const chars = Array.from({ length: nChars }, () => ({ level: 1, xp: 0, pieces: Array(PIECES).fill(null), fs: 0 }))
  const pool = { shards: 0, stones: 0, gearOwn: [], gearOther: [] }
  const main = chars[0]
  const out = { lvl10: null, allPieces: null, full15: null, all15: null }

  for (let day = 1; day <= MAX_DAYS; day++) {
    for (const char of chars) {
      let budget = DAILY_BUDGET
      while (budget >= RUN_COST) { simRun(char, pool); budget -= RUN_COST }
    }
    // Distribui gear: main primeiro, depois alts (cross-class serve os alts).
    for (const enh of pool.gearOwn.splice(0)) {
      const needy = [main, ...chars.slice(1)].find((c) => c.pieces.includes(null))
      if (needy) needy.pieces[needy.pieces.indexOf(null)] = Math.min(enh, 15)
    }
    for (const enh of pool.gearOther.splice(0)) {
      const needy = chars.slice(1).find((c) => c.pieces.includes(null))
      if (needy) needy.pieces[needy.pieces.indexOf(null)] = Math.min(enh, 15)
    }
    // Pedras: main primeiro; quando o main fecha +15, alimenta os alts.
    enhance(main, pool)
    for (const alt of chars.slice(1)) enhance(alt, pool)

    if (!out.lvl10 && main.level >= 10) out.lvl10 = day
    if (!out.allPieces && !main.pieces.includes(null)) out.allPieces = day
    if (!out.full15 && main.pieces.every((p) => p === 15)) out.full15 = day
    if (!out.all15 && chars.every((c) => c.pieces.every((p) => p === 15))) out.all15 = day
    if (out.full15 && out.lvl10 && (nChars === 1 || out.all15)) break
  }
  return out
}

function median(arr) {
  const v = arr.filter((x) => x != null).sort((a, b) => a - b)
  if (!v.length) return null
  return v[Math.floor(v.length / 2)]
}

console.log('🌲 DOLRATH — Progressão de farm na Floresta Sombria')
console.log(`   budget ${Math.round(DAILY_BUDGET)} stamina/dia (~${Math.floor(DAILY_BUDGET / RUN_COST)} runs/char) · ${TRIALS} trials`)
console.log(`   POR ABATE: estilhaço ${KILL_SHARD} (menor) / ${KILL_SHARD_MAIN} (sala) · boss ${BOSS_STONES_MIN}-${BOSS_STONES_MAX} Pedra(s) garantida(s)`)
console.log(`   metas: 1 char ≈ 21-28d · 5 chars ≈ ~10d · 10 chars ≈ ~7d (main full +15)\n`)

for (const n of CHAR_COUNTS) {
  const res = []
  for (let i = 0; i < TRIALS; i++) res.push(simTrial(n))
  const fmt = (k) => {
    const m = median(res.map((r) => r[k]))
    return m == null ? `>${MAX_DAYS}d` : `${m}d`
  }
  console.log(
    `${String(n).padStart(2)} char(s): nv10 ${fmt('lvl10').padStart(5)} · ${PIECES} peças dropadas ${fmt('allPieces').padStart(5)} · MAIN full +15 ${fmt('full15').padStart(6)}` +
    (n > 1 ? ` · TODOS full +15 ${fmt('all15').padStart(6)}` : '')
  )
}
