#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de DIFICULDADE de masmorra (PvE)
// Modelo de 1ª ordem: TTK com sorte MÉDIA, fiel às fórmulas de
// src/components/dungeon/DungeonRun.tsx + src/lib/dungeonAdventures.ts.
// Pergunta: um personagem no levelReq fecha o BOSS sem gear / com gear
// comum +0 / +15 / PRI? (gear PRECISA contar — alvo: exigir +15/PRI).
//
// Não modela dodge/defend/poções/salas-antes-do-boss — mede a RAZÃO de
// poder (DPS×EHP) jogador vs boss, que é o que decide "gear é necessário".
// ============================================================

// ---- Aprimoramento (enhancementSystem.ts) ----
const TIER_MULT = { 16: 2.5, 17: 2.9, 18: 3.4, 19: 4.0, 20: 4.8 } // PRI..PEN
const statMult = (lvl) => lvl <= 0 ? 1 : lvl <= 15 ? 1 + lvl * 0.08 : (TIER_MULT[lvl] || 1)

// ---- Escala de monstro (dungeonAdventures.ts) ----
const TIER_POWER_STEP = 0.6, MINOR_NODE_FACTOR = 0.55, BOSS_POWER_MULT = 1.8, BOSS_HP_MULT = 1.8, LEVEL_POWER_STEP = 0.04
function scaleBoss(boss, dungeon, charLevel) {
  const tier = dungeon.rooms
  const tierFactor = 1 + (tier - 1) * TIER_POWER_STEP
  const lvlFactor = 1 + Math.max(0, charLevel - dungeon.levelReq) * LEVEL_POWER_STEP
  const power = dungeon.difficulty * tierFactor * BOSS_POWER_MULT * lvlFactor
  const level = Math.round(dungeon.levelReq + (tier - 1) * 3 + 4)
  const attack = Math.floor(boss.baseAttack * power)
  return {
    level, hp: Math.floor(boss.baseHp * power * BOSS_HP_MULT),
    attack, defense: Math.floor(boss.baseDefense * power),
    magicPower: Math.floor(boss.baseAttack * power * 1.2),
  }
}

// ---- Dungeons (dungeonAdventures.ts) ----
const DUNGEONS = [
  { id: 'floresta', rooms: 3, levelReq: 1,  difficulty: 1.0,  boss: { baseHp: 110, baseAttack: 12, baseDefense: 7 } },
  { id: 'caverna',  rooms: 4, levelReq: 10, difficulty: 1.15, boss: { baseHp: 130, baseAttack: 14, baseDefense: 9 } },
  { id: 'pantano',  rooms: 4, levelReq: 25, difficulty: 1.3,  boss: { baseHp: 150, baseAttack: 16, baseDefense: 10 } },
  { id: 'ruinas',   rooms: 5, levelReq: 40, difficulty: 1.45, boss: { baseHp: 180, baseAttack: 18, baseDefense: 12 } },
]

// ---- Ataques do jogador (DungeonRun.tsx ATTACKS) ----
const ATTACKS = {
  precise: { sides: 6,  lo: 0.85, hi: 1.20, stat: 'ad', mp: 0 },
  brutal:  { sides: 12, lo: 0.85, hi: 1.95, stat: 'ad', mp: 0 },
  special: { sides: 20, lo: 1.10, hi: 2.50, stat: 'max', mp: 15 },
}
const avgLuck = (a) => (a.lo + a.hi) / 2
const critFactor = (a) => 1 + (1 / a.sides) * 0.75 // crit no dado máximo, ×1.75

// ---- Personagem (criação 18 pts, cap 10/stat; +1/nível; + raça/classe) ----
const RACES = { humano:{str:2,agi:2,int:2,def:2}, draconiano:{str:3,agi:0,int:0,def:5}, metamorfo:{str:0,agi:5,int:0,def:3}, elfo:{str:0,agi:3,int:4,def:2} }
const CLASSES = { warrior:{str:4,agi:0,int:0,def:3}, rogue:{str:0,agi:4,int:2,def:0}, mage:{str:0,agi:0,int:5,def:0}, monk:{str:0,agi:4,int:0,def:4} }
const BUILD = { warrior:{str:.7,def:.3}, rogue:{agi:.85,def:.15}, mage:{int:.85,def:.15}, monk:{agi:.55,def:.45} }
const CREATION_PTS = Number(process.env.BASEPTS) || 18
const CREATION_CAP = 10

function distribute(klass, points) {
  // pontos de criação (capados em 10/stat) + pontos de nível (sem cap)
  const w = BUILD[klass]; const out = { str:0, agi:0, int:0, def:0 }
  const creation = Math.min(points, CREATION_PTS)
  const levelPts = Math.max(0, points - CREATION_PTS)
  // criação: distribui por peso, capando em 10 e derramando o excedente p/ DEF
  let spill = 0
  for (const k of Object.keys(w)) {
    const want = Math.round(creation * w[k])
    out[k] = Math.min(CREATION_CAP, want); spill += want - out[k]
  }
  out.def = Math.min(CREATION_CAP, out.def + spill) // excedente vai p/ sobrevivência
  // nível: sem cap, mesmo peso
  for (const k of Object.keys(w)) out[k] += Math.round(levelPts * w[k])
  return out
}
function buildChar(race, klass, level) {
  const pts = CREATION_PTS + Math.max(0, level - 1)
  const d = distribute(klass, pts)
  const rb = RACES[race], cb = CLASSES[klass]
  const str = d.str + rb.str + cb.str, agi = d.agi + rb.agi + cb.agi
  const int = d.int + rb.int + cb.int, def = d.def + rb.def + cb.def
  return {
    str, agi, int, def, level,
    attack: Math.floor(str * 1.2), magicPower: Math.floor(int * 1.5),
    defense: Math.floor(def * 0.8), maxHp: 80 + str * 2 + def * 4, maxMp: 60 + int * 4 + agi,
  }
}

// ---- Gear comum (itemCatalog.ts). Guardião (tank) + arma p/ o dano. ----
// equipmentPower (DungeonRun): atk += bonusDamage + attack + max(str,agi,int);
//                              def += def + defense + (res+con)/2 ; hp += hp
// ⚠️ bonusDefense é IGNORADO pelo combate (bug de alinhamento).
const COMMON_SET = [
  { str: 2, def: 2, hp: 8, bonusDamage: 5 },        // Machado do Guarda (arma)
  { def: 6, hp: 18, bonusDefense: 6 },              // Peitoral de Ferro (corpo)
  { def: 4, hp: 8, bonusDefense: 4 },               // Elmo de Ferro
  { def: 3, str: 1, bonusDamage: 3 },               // Manoplas de Ferro
  { def: 3, hp: 8, bonusDefense: 3 },               // Botas de Placa
  { def: 2, bonusDefense: 4 },                       // Escudo de Madeira
]
const num = (v) => typeof v === 'number' ? v : 0
function equipmentPower(set, enh, countBonusDef = false) {
  let attack = 0, defense = 0, hp = 0
  const m = statMult(enh)
  for (const piece of set) {
    const s = {}; for (const k of Object.keys(piece)) s[k] = Math.round(piece[k] * m)
    attack += num(s.bonusDamage) + num(s.attack) + Math.max(num(s.str), num(s.agi), num(s.int))
    defense += num(s.def) + num(s.defense) + (countBonusDef ? num(s.bonusDefense) : 0)
    hp += num(s.hp)
  }
  return { attack, defense, hp }
}

// ---- Dano esperado por golpe, COM o defensor defendendo ----
// computeOutcome: dano = core×luck×crit − [ floor(defBase×0.4) + (defend? floor(defTotal×0.5)) ]
//   defTotal = rolagem(atk.sides) + floor(defBase/2) + 2  (bônus de defender)
// Esquiva é desprezível (o contest inclui o core do atacante, sempre enorme).
const avgRoll = (sides) => (sides + 1) / 2
function expectedHitDamage(core, defBase, atk, defendProb) {
  const base = core * avgLuck(atk) * critFactor(atk)
  const defTotal = avgRoll(atk.sides) + Math.floor(defBase / 2) + 2
  const reduction = Math.floor(defBase * 0.4) + defendProb * Math.floor(defTotal * 0.5)
  return Math.max(1, base - reduction)
}
function playerDPS(char, gear, boss) {
  const adCore = char.attack + gear.attack + char.level / 2
  const apCore = char.magicPower + gear.attack + char.level / 2
  // monstro defende ~50% (AI: 50% dodge que falha → sem o bônus, 50% defend)
  const brutalDmg = expectedHitDamage(adCore, boss.defense, ATTACKS.brutal, 0.5)
  const specCore = Math.max(adCore, apCore)
  const specDmg = expectedHitDamage(specCore, boss.defense, ATTACKS.special, 0.5)
  return 0.7 * brutalDmg + 0.3 * specDmg // ~30% special (limitado por MP)
}
function bossDPS(boss, char, gear) {
  const playerDef = char.defense + gear.defense
  const physCore = Math.floor(boss.attack + boss.level / 2)
  const specCore = Math.floor(boss.magicPower + boss.level / 2)
  // jogador joga racional: SEMPRE defende (defendProb=1)
  const phys = expectedHitDamage(physCore, playerDef, ATTACKS.brutal, 1)
  const spec = expectedHitDamage(specCore, playerDef, ATTACKS.special, 1)
  return 0.6 * phys + 0.4 * spec
}

const GEARS = [
  { label: 'sem gear', set: [], enh: 0 },
  { label: 'comum +0', set: COMMON_SET, enh: 0 },
  { label: 'comum +15', set: COMMON_SET, enh: 15 },
  { label: 'comum PRI', set: COMMON_SET, enh: 16 },
]
const BONUSDEF = Boolean(process.env.BONUSDEF) // se 1, conta bonusDefense (proposta de fix)

console.log(`\n${'='.repeat(76)}`)
console.log(`  DOLRATH — DIFICULDADE DA DUNGEON (boss) | criação ${CREATION_PTS} pts | bonusDefense ${BONUSDEF ? 'CONTA' : 'ignorado (atual)'}`)
console.log(`  TTK = turnos p/ matar. Jogador VENCE se TTK_boss(jogador) < TTK_jogador(boss).`)
console.log('='.repeat(76))

const CLASS = process.env.CLASS || 'warrior'
const RACE = process.env.RACE || 'draconiano'
for (const dg of DUNGEONS) {
  const char = buildChar(RACE, CLASS, dg.levelReq)
  const boss = scaleBoss(dg.boss, dg, dg.levelReq)
  console.log(`\n── ${dg.id.toUpperCase()} (lvlReq ${dg.levelReq}, ${dg.rooms} salas) — ${RACE}/${CLASS} ──`)
  console.log(`   boss: HP ${boss.hp}  atk ${boss.attack}  def ${boss.defense}  | jogador base: atk ${char.attack} def ${char.defense} HP ${char.maxHp}`)
  for (const g of GEARS) {
    const gear = equipmentPower(g.set, g.enh, BONUSDEF)
    const pHP = char.maxHp + gear.hp
    const pdps = playerDPS(char, gear, boss)
    const bdps = bossDPS(boss, char, gear)
    const ttkBoss = boss.hp / pdps         // turnos p/ o jogador matar o boss
    const ttkPlayer = pHP / bdps           // turnos p/ o boss matar o jogador
    const ratio = ttkPlayer / ttkBoss      // >1 = jogador vence (sobra margem)
    const verdict = ratio >= 1.6 ? '✅ fácil' : ratio >= 1.1 ? '🟢 vence' : ratio >= 0.9 ? '⚠️ no fio' : '❌ perde'
    console.log(`   ${g.label.padEnd(10)} atk+${String(gear.attack).padStart(3)} def+${String(gear.defense).padStart(3)} HP ${String(pHP).padStart(4)} | TTKboss ${ttkBoss.toFixed(1).padStart(5)}  TTKplayer ${ttkPlayer.toFixed(1).padStart(5)}  razão ${ratio.toFixed(2)}  ${verdict}`)
  }
}
console.log(`\n${'='.repeat(76)}\n`)
