#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de DIFICULDADE de masmorra (PvE) — MODELO ENXUTO
//
// Reescrito sobre o código REAL (server/combatModel.js): usa os MESMOS levers e
// resolveHit do DungeonRun.tsx. Espelha a derivação do componente:
//   • jogador: computeLevers(classe, nível, gearTier, attrs)  — gear conta via TIER,
//     atributos da criação via TILT; HP da run = pool do jogo (80 + str·2 + def·4 + gearHP).
//   • monstro (classe desconhecida): levers de fallback (power=ataque, armor=defesa,
//     hp=maxHp, K=K50·S), igual ao monsterLevers() do DungeonRun.
//
// Pergunta: o personagem no levelReq fecha o BOSS sem gear / comum +0 / +15 / PRI?
// gear PRECISA contar — alvo: sem gear o jogador apanha; com +15/PRI vence confortável.
//
// Uso:
//   node scripts/dungeon-difficulty-sim.js
//   CLASS=mage RACE=elfo node scripts/dungeon-difficulty-sim.js
//   FIGHTS=4000 node scripts/dungeon-difficulty-sim.js
// ============================================================

const CM = require('../server/combatModel')

const FIGHTS = Number(process.env.FIGHTS) || 3000
const rnd = (n) => 1 + Math.floor(Math.random() * n)

// ---- Escala de monstro (dungeonAdventures.ts) ----
// 🔧 BOSS_HP_MULT/POW recalibrados via env p/ a ESCALA ENXUTA (o boss antigo, HP×1.8
//    de números grandes, era pro modelo subtrativo). Busca: env BHP / BPOW.
const LEVEL_POWER_STEP = 0.04
const TIER_POWER_STEP = process.env.TPS !== undefined ? Number(process.env.TPS) : 0.6
const BOSS_HP_MULT = process.env.BHP !== undefined ? Number(process.env.BHP) : 1.8
const BOSS_POWER_MULT = process.env.BPOW !== undefined ? Number(process.env.BPOW) : 1.8
function scaleBoss(boss, dungeon, charLevel) {
  const tier = dungeon.rooms
  const tierFactor = 1 + (tier - 1) * TIER_POWER_STEP
  const lvlFactor = 1 + Math.max(0, charLevel - dungeon.levelReq) * LEVEL_POWER_STEP
  const power = dungeon.difficulty * tierFactor * BOSS_POWER_MULT * lvlFactor
  const level = Math.round(dungeon.levelReq + (tier - 1) * 3 + 4)
  const hp = Math.floor(boss.baseHp * power * BOSS_HP_MULT)
  return {
    level, hp, maxHp: hp,
    attack: Math.floor(boss.baseAttack * power),
    defense: Math.floor(boss.baseDefense * power),
    isBoss: true, hasSpecial: true,
  }
}
// Levers do monstro — IDÊNTICO a monsterLevers() do DungeonRun.tsx.
function monsterLevers(m) {
  const S = m.level / CM.MAX_LEVEL_REF + 0.5
  return { power: m.attack, armor: m.defense, hp: m.maxHp, evade: 0.06, K: CM.K50 * S, scale: S }
}

// ---- Dungeons (dungeonAdventures.ts) ----
const DUNGEONS = [
  { id: 'floresta', rooms: 3, levelReq: 1,  difficulty: 1.0,  boss: { baseHp: 110, baseAttack: 12, baseDefense: 7 } },
  { id: 'caverna',  rooms: 4, levelReq: 10, difficulty: 1.15, boss: { baseHp: 130, baseAttack: 14, baseDefense: 9 } },
  { id: 'pantano',  rooms: 4, levelReq: 25, difficulty: 1.3,  boss: { baseHp: 150, baseAttack: 16, baseDefense: 10 } },
  { id: 'ruinas',   rooms: 5, levelReq: 40, difficulty: 1.45, boss: { baseHp: 180, baseAttack: 18, baseDefense: 12 } },
]

// ---- Personagem (criação 18 pts, cap 10/stat; +1/nível; + raça/classe) ----
const RACES = { humano:{str:2,agi:2,int:2,def:2}, draconiano:{str:3,agi:0,int:0,def:5}, metamorfo:{str:0,agi:5,int:0,def:3}, elfo:{str:0,agi:3,int:4,def:2} }
const CLASSES = { warrior:{str:4,agi:0,int:0,def:3}, rogue:{str:0,agi:4,int:2,def:0}, mage:{str:0,agi:0,int:5,def:0}, monk:{str:0,agi:4,int:0,def:4} }
const BUILD = { warrior:{str:.7,def:.3}, rogue:{agi:.85,def:.15}, mage:{int:.85,def:.15}, monk:{agi:.55,def:.45} }
const CREATION_PTS = 18, CAP = 10
function distribute(klass, level) {
  const w = BUILD[klass]; const out = { str:0, agi:0, int:0, def:0 }
  const levelPts = Math.max(0, level - 1)
  let spill = 0
  for (const k of Object.keys(w)) { const want = Math.round(CREATION_PTS * w[k]); out[k] = Math.min(CAP, want); spill += want - out[k] }
  out.def = Math.min(CAP, out.def + spill)
  for (const k of Object.keys(w)) out[k] += Math.round(levelPts * w[k])
  return out
}
function buildChar(race, klass, level) {
  const d = distribute(klass, level)
  const rb = RACES[race], cb = CLASSES[klass]
  const str = d.str + rb.str + cb.str, agi = d.agi + rb.agi + cb.agi
  const int = d.int + rb.int + cb.int, def = d.def + rb.def + cb.def
  return { str, agi, int, def, level, klass, gameMaxHp: 80 + str * 2 + def * 4 }
}

// ---- Gear: vira gearTier (raridade×aprimoramento) + HP de peças. ----
// ⚠️ GEAR_FLOOR=0.25 no modelo: "todo mundo é ≥25% gearado". Gear COMUM (tier ~0.1)
// fica ABAIXO do piso → não muda nada (o piso domina). Só gear RARO+ (tier >0.25)
// conta. Por isso testamos uma faixa de RARIDADES, não enhancement de comum.
const SET_HP = [8, 18, 8, 0, 8, 0] // hp por peça (6 slots ofensivos+defensivos)
const ENH_MULT = (enh) => (enh <= 0 ? 1 : enh <= 15 ? 1 + enh * 0.08 : 2.5)
function gearFor(rarity, enh) {
  if (!rarity) return { gearTier: 0, gearHp: 0 }
  const pieces = SET_HP.map(() => ({ rarity, enhancementLevel: enh }))
  const gearTier = CM.deriveGearTier(pieces)
  const gearHp = Math.floor(SET_HP.reduce((s, h) => s + h, 0) * ENH_MULT(enh))
  return { gearTier, gearHp }
}
const GEARS = [
  { label: 'sem gear', rarity: null, enh: 0 },
  { label: 'comum +15', rarity: 'COMMON', enh: 15 },
  { label: 'raro +15', rarity: 'RARE', enh: 15 },
  { label: 'épico PRI', rarity: 'EPIC', enh: 16 },
  { label: 'lendário IV', rarity: 'LEGENDARY', enh: 19 },
]

// ============================================================
// COMBATE — fight Monte Carlo espelhando o fluxo do DungeonRun:
//  • jogador ataca com a ARMA (weapon, powerMult 1.0); monstro reage 50% esquiva / 50% bloqueio.
//  • monstro ataca (boss: basic/weapon/special); jogador reage racional: bloqueia
//    (ou esquiva se a evasão dele for alta).
//  • especial do jogador exige transformação → ignorado no baseline (conservador).
// ============================================================
function fight(pLevers, pHP, monster) {
  const mLev = monsterLevers(monster)
  let php = pHP, mhp = monster.maxHp
  let playerTurn = Math.random() < 0.5
  for (let t = 0; t < 400 && php > 0 && mhp > 0; t++) {
    if (playerTurn) {
      const def = Math.random() < 0.5 ? 'dodge' : 'block'
      const r = CM.resolveHit({ power: pLevers.power * CM.ATTACKS.weapon.powerMult }, mLev, { defense: def })
      mhp -= r.dodged ? 0 : r.damage
    } else {
      // boss escolhe o tipo de golpe
      const x = Math.random()
      const kind = x < 0.35 ? 'basic' : x < 0.7 ? 'weapon' : 'special'
      // jogador racional: esquiva se evasão alta (>0.2), senão bloqueia
      const def = pLevers.evade > 0.2 ? 'dodge' : 'block'
      const r = CM.resolveHit({ power: mLev.power * CM.ATTACKS[kind].powerMult }, { armor: pLevers.armor, K: pLevers.K, evade: pLevers.evade }, { defense: def })
      php -= r.dodged ? 0 : r.damage
    }
    playerTurn = !playerTurn
  }
  return mhp <= 0 && php > 0 ? 'win' : php <= 0 && mhp > 0 ? 'loss' : 'timeout'
}

const CLASS = process.env.CLASS || 'warrior'
const RACE = process.env.RACE || 'draconiano'

console.log(`\n${'='.repeat(80)}`)
console.log(`  DOLRATH — DIFICULDADE DA DUNGEON (boss) — MODELO ENXUTO  |  ${RACE}/${CLASS}  |  ${FIGHTS} lutas`)
console.log(`  gear conta via TIER (raridade×aprimoramento) + HP de peças. Alvo: sem gear apanha; +15/PRI vence.`)
console.log('='.repeat(80))

for (const dg of DUNGEONS) {
  const char = buildChar(RACE, CLASS, dg.levelReq)
  const boss = scaleBoss(dg.boss, dg, dg.levelReq)
  console.log(`\n── ${dg.id.toUpperCase()} (lvlReq ${dg.levelReq}, ${dg.rooms} salas) ──`)
  console.log(`   boss: HP ${boss.hp}  atk ${boss.attack}  def ${boss.defense} (nv ${boss.level})  | char: STR ${char.str} AGI ${char.agi} INT ${char.int} DEF ${char.def}`)
  for (const g of GEARS) {
    const { gearTier, gearHp } = gearFor(g.rarity, g.enh)
    const levers = CM.computeLevers(char.klass, char.level, gearTier, { str: char.str, agi: char.agi, int: char.int, def: char.def })
    const pHP = char.gameMaxHp + gearHp
    let win = 0, loss = 0, timeout = 0
    for (let i = 0; i < FIGHTS; i++) { const r = fight(levers, pHP, boss); if (r === 'win') win++; else if (r === 'loss') loss++; else timeout++ }
    const wr = (100 * win) / FIGHTS
    const verdict = wr >= 85 ? '✅ fácil' : wr >= 60 ? '🟢 vence' : wr >= 40 ? '⚠️ no fio' : '❌ apanha'
    console.log(`   ${g.label.padEnd(10)} tier ${gearTier.toFixed(2)} | power ${levers.power.toFixed(0).padStart(4)} armor ${levers.armor.toFixed(0).padStart(3)} HP ${String(pHP).padStart(4)} | win ${wr.toFixed(1).padStart(5)}%  ${verdict}`)
  }
}
console.log(`\n${'='.repeat(80)}\n`)
