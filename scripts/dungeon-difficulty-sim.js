#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de DIFICULDADE de masmorra (PvE) — MODELO ENXUTO
//
// Reescrito sobre o código REAL (server/combatModel.js): usa os MESMOS levers e
// resolveHit do DungeonRun.tsx.
//
// 🎯 REDESIGN (2026-06-22): o boss é ANCORADO no poder enxuto do jogador no
// levelReq com o GEAR-ALVO da masmorra. Em vez de números-base arbitrários
// (que estouravam no enxuto), o boss = levers do jogador em
//   computeLevers(classe, levelReq, gearTier_alvo, attrs)
// multiplicados por BPOW/BARM/BHP. Isso:
//   • encarna "a dungeon escala com os stats do personagem";
//   • auto-escala entre masmorras (o boss é sempre relativo a quem deveria estar lá);
//   • torna o GATE DE GEAR explícito: com o gear-alvo vence ~70%, um tier abaixo apanha.
//
// Escada de gear-alvo (Mario, 2026-06-22) — +1 tier de aprimoramento por masmorra:
//   Floresta → incomum PRI | Caverna → raro DUO | Pântano → épico TRI | Ruínas → lendário TET
//   (PEN reservado p/ uma 5ª masmorra futura.)
//
// Uso:
//   node scripts/dungeon-difficulty-sim.js
//   CLASS=mage RACE=elfo node scripts/dungeon-difficulty-sim.js
//   BPOW=1.0 BARM=1.0 BHP=2.2 node scripts/dungeon-difficulty-sim.js   # tunar o boss
// ============================================================

const CM = require('../server/combatModel')

const FIGHTS = Number(process.env.FIGHTS) || 3000

// ---- Multiplicadores do boss sobre o "espelho" do jogador no gate ----
// boss = levers do jogador (classe, levelReq, gearTier_alvo) × estes fatores.
// 1.0/1.0/1.0 seria um espelho perfeito (luta 50/50). Acima de 1 o boss é mais forte.
const BOSS_POW_MULT = process.env.BPOW !== undefined ? Number(process.env.BPOW) : 0.9
const BOSS_ARM_MULT = process.env.BARM !== undefined ? Number(process.env.BARM) : 0.8
// HP do boss = HP do jogador no gate × bossHpMult. Taper leve por masmorra: o piso de
// NÍVEL no S domina o late-game (gear pesa menos), então a banda de gear estreita —
// baixar o HP nas masmorras tardias compensa pra manter o ALVO num win ~63%. Override global via BHP.

// Enhancement (espelha enhancementSystem.ts)
const PRI = 16, DUO = 17, TRI = 18, TET = 19, PEN = 20

// ---- Dungeons + GEAR-ALVO pro boss (rarity × enhancement) ----
// clearLevel = NÍVEL-TOPO do band (onde o boss é vencido c/ o gear-alvo). O boss ancora
// nesse nível FIXO → under-leveled trava, over-leveled vira farm. Floresta 1→10, Caverna
// 10→25, Pântano 25→40, Ruínas 40→50.
const DUNGEONS = [
  { id: 'floresta', rooms: 3, levelReq: 1,  clearLevel: 10, difficulty: 1.0,  bossHpMult: 1.48, target: { rarity: 'UNCOMMON',  enh: PRI }, targetLabel: 'incomum PRI/+15' },
  { id: 'caverna',  rooms: 4, levelReq: 10, clearLevel: 25, difficulty: 1.15, bossHpMult: 1.42, target: { rarity: 'RARE',      enh: DUO }, targetLabel: 'raro DUO' },
  { id: 'pantano',  rooms: 4, levelReq: 25, clearLevel: 40, difficulty: 1.3,  bossHpMult: 1.40, target: { rarity: 'EPIC',      enh: TRI }, targetLabel: 'épico TRI' },
  { id: 'ruinas',   rooms: 5, levelReq: 40, clearLevel: 50, difficulty: 1.45, bossHpMult: 1.37, target: { rarity: 'LEGENDARY', enh: TET }, targetLabel: 'lendário TET' },
]

// ---- Escada de gear (rungs) p/ contar a história do gate ----
// Cada masmorra testa: sem gear · um tier abaixo · ALVO · um tier acima.
const RUNGS = [
  { label: 'comum +15',     rarity: 'COMMON',    enh: 15 },
  { label: 'incomum PRI',   rarity: 'UNCOMMON',  enh: PRI },
  { label: 'raro DUO',      rarity: 'RARE',      enh: DUO },
  { label: 'épico TRI',     rarity: 'EPIC',      enh: TRI },
  { label: 'lendário TET',  rarity: 'LEGENDARY', enh: TET },
  { label: 'lendário PEN',  rarity: 'LEGENDARY', enh: PEN },
]
const targetRungIndex = (dg) => RUNGS.findIndex(r => r.rarity === dg.target.rarity && r.enh === dg.target.enh)

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

// ---- Gear → gearTier (raridade×aprimoramento) + HP de peças ----
const SET_HP = [8, 18, 8, 0, 8, 0]
const ENH_MULT = (enh) => (enh <= 0 ? 1 : enh <= 15 ? 1 + enh * 0.08 : 2.5)
function gearFor(rarity, enh) {
  if (!rarity) return { gearTier: 0, gearHp: 0 }
  const pieces = Array.from({ length: CM.NOMINAL_SLOTS }, () => ({ rarity, enhancementLevel: enh }))
  const gearTier = CM.deriveGearTier(pieces)
  const gearHp = Math.floor(SET_HP.reduce((s, h) => s + h, 0) * ENH_MULT(enh))
  return { gearTier, gearHp }
}

// ============================================================
// BOSS = MONSTRO NEUTRO escalado pelo poder enxuto do GATE (não espelha a classe do
// jogador — isso amplificaria a identidade e quebraria o equilíbrio entre classes).
// Perfil neutro ≈ média dos 4 PROFILEs do nv50 BiS; escala por S = powerScale(levelReq,
// gearTier_alvo). Assim toda classe enfrenta o MESMO boss e o equilíbrio vem do modelo
// (validado no PvP). Mitigação K = K50·S (mesma constante do gate).
// ============================================================
// O boss é NEUTRO e IDÊNTICO p/ todas as classes — senão a identidade de classe vaza
// (mago enfrentaria um boss com poder de mago = bursta o próprio mago). Ancora HP/poder
// na MÉDIA dos levers das 4 classes no gate (classe-independente), que já carrega os
// componentes FLAT (HP base 80 + tilt) — escala certo em todo nível, ao contrário de
// MON×S puro. Armadura neutra (média dos PROFILEs × S). K = K50·(nível_boss/50+0.5),
// IGUAL ao monsterLevers() do DungeonRun. Equilíbrio entre classes = mérito do modelo.
const MON_ARMOR = 96 // média dos PROFILEs (neutra)
const ALL_KLASS = ['warrior', 'rogue', 'mage', 'monk']
function neutralAnchor(dg, race) {
  const { gearTier, gearHp } = gearFor(dg.target.rarity, dg.target.enh)
  let powerSum = 0, hpSum = 0
  for (const k of ALL_KLASS) {
    const c = buildChar(race, k, dg.clearLevel)
    const lv = CM.computeLevers(k, dg.clearLevel, gearTier, { str: c.str, agi: c.agi, int: c.int, def: c.def })
    powerSum += lv.power
    hpSum += c.gameMaxHp + gearHp
  }
  return { power: powerSum / ALL_KLASS.length, hp: hpSum / ALL_KLASS.length, gearTier }
}
function makeBoss(dg, race, _klass, hpMultOverride) {
  const a = neutralAnchor(dg, race)
  const S = CM.powerScale(dg.clearLevel, a.gearTier)
  const hpMult = hpMultOverride !== undefined ? hpMultOverride
    : process.env.BHP !== undefined ? Number(process.env.BHP) : dg.bossHpMult
  const bossLevel = dg.clearLevel + 2 // K segue o nível-topo do band
  return {
    power: a.power * BOSS_POW_MULT,
    armor: MON_ARMOR * S * BOSS_ARM_MULT,
    K: CM.K50 * (bossLevel / CM.MAX_LEVEL_REF + 0.5),
    evade: 0.06,
    hp: Math.floor(a.hp * hpMult),
    anchorTier: a.gearTier, anchorS: S, bossLevel,
  }
}

// ============================================================
// COMBATE — DISPUTA DE DADOS (novo modelo, 2026-06-22).
// Atacante e defensor rolam o MESMO dado do ataque (básico d8 / arma d12 / especial d20),
// normalizados (0,1). margem = na − (nd + edgeDef):
//   • margem < 0 → defesa vence: ESQUIVA = 0 dano; DEFENDER = golpe aparado (dano mínimo).
//   • margem ≥ 0 → ACERTA: dano = poder × powerMult × mult(margem) × (1−DR).
//       DR: esquiva falha = SEM mitigação (alto risco); defender = armadura×2.5 (seguro).
//       margem grande (≥ CRIT_MARGIN) = CRÍTICO.
// Poder e mitigação (levers) seguem dimensionando o dano → preserva o balanceamento.
// Transformação modelada: duty-cycle (ativa TR_ON turnos, cd TR_OFF), ×1.25 nos levers e
// libera o ESPECIAL (d20). Boss tunado p/ que MESMO transformado precise do gear-alvo.
// ============================================================
const DIE = { basic: 8, weapon: 12, special: 20 }
const HIT_MIN = 0.6, HIT_SLOPE = 1.5, CRIT_MULT = 1.9, CRIT_MARGIN = 0.5
const DODGE_EDGE = 1.0   // peso da evasão (lever) na margem da esquiva
const BLOCK_EDGE = 0.10  // chance-base de "defesa perfeita" ao bloquear
const TR_ON = 4, TR_OFF = 6 // duty-cycle da transformação (~40% uptime)

const ACC_W = process.env.ACC_W !== undefined ? Number(process.env.ACC_W) : 1.6 // peso da VANTAGEM DE ESCALA (gear+nível) no acerto (0=gate mole, 4=binário)
const rollN = (sides) => (1 + Math.floor(Math.random() * sides) - 0.5) / sides
// acc = (escala do atacante − escala do defensor)·ACC_W → gear melhor ACERTA mais (afia o
// gate); num espelho as escalas se cancelam → luta de igual continua ~50/50.
function contestedHit(power, sides, defender, choice, atkScale = 0, defScale = 0) {
  const edge = (choice === 'dodge' ? defender.evade * DODGE_EDGE : BLOCK_EDGE) - (atkScale - defScale) * ACC_W
  const margin = rollN(sides) - (rollN(sides) + edge)
  if (margin < 0) {
    if (choice === 'dodge') return 0
    const dr = CM.damageReduction(defender.armor * CM.BLOCK_ARMOR_MULT, defender.K)
    return Math.max(1, Math.round(power * 0.15 * (1 - dr)))
  }
  let mult = HIT_MIN + margin * HIT_SLOPE
  if (margin >= CRIT_MARGIN) mult = Math.max(mult, CRIT_MULT)
  const dr = choice === 'block' ? CM.damageReduction(defender.armor * CM.BLOCK_ARMOR_MULT, defender.K) : 0
  return Math.max(1, Math.round(power * mult * (1 - dr)))
}
// Defesa racional do jogador: MC rápido — escolhe dodge/block de menor dano esperado.
function chooseDefense(attackerPower, sides, defender, atkScale, defScale) {
  let dDmg = 0, bDmg = 0
  for (let i = 0; i < 400; i++) {
    dDmg += contestedHit(attackerPower, sides, defender, 'dodge', atkScale, defScale)
    bDmg += contestedHit(attackerPower, sides, defender, 'block', atkScale, defScale)
  }
  return bDmg <= dDmg ? 'block' : 'dodge'
}
function fight(base, pHP, boss, pDef) {
  const tr = { power: base.power * CM.TRANSFORM_SCALE, armor: base.armor * CM.TRANSFORM_SCALE, hp: base.hp, evade: base.evade, K: base.K * CM.TRANSFORM_SCALE, scale: base.scale * CM.TRANSFORM_SCALE }
  let php = pHP, mhp = boss.hp
  let playerTurn = Math.random() < 0.5
  let phase = 0 // ciclo de transformação em turnos do jogador: [0,TR_ON) transformado; resto cooldown
  const isTransformed = () => phase < TR_ON
  for (let t = 0; t < 600 && php > 0 && mhp > 0; t++) {
    if (playerTurn) {
      const pl = isTransformed() ? tr : base
      const kind = isTransformed() ? 'special' : 'weapon' // especial só transformado
      const mDef = Math.random() < 0.5 ? 'dodge' : 'block' // monstro reage 50/50
      mhp -= contestedHit(pl.power * CM.ATTACKS[kind].powerMult, DIE[kind], boss, mDef, pl.scale, boss.anchorS)
      phase = (phase + 1) % (TR_ON + TR_OFF)
    } else {
      const x = Math.random()
      const kind = x < 0.35 ? 'basic' : x < 0.7 ? 'weapon' : 'special'
      const pl = isTransformed() ? tr : base
      php -= contestedHit(boss.power * CM.ATTACKS[kind].powerMult, DIE[kind], { armor: pl.armor, K: pl.K, evade: pl.evade }, pDef, boss.anchorS, pl.scale)
    }
    playerTurn = !playerTurn
  }
  return mhp <= 0 && php > 0 ? 'win' : php <= 0 && mhp > 0 ? 'loss' : 'timeout'
}

const CLASS = process.env.CLASS || 'warrior'
const RACE = process.env.RACE || 'draconiano'
const CLASSES_ALL = ['warrior', 'rogue', 'mage', 'monk']
const TARGET_WIN = Number(process.env.TARGET_WIN) || 0.65 // win% alvo no gear-ALVO
const SOLVE = process.env.SOLVE !== '0' // por padrão resolve o hpMult; SOLVE=0 usa o fixo

// win% de uma classe/rung contra um boss dado.
function winRate(dg, race, klass, rung, boss, n = FIGHTS) {
  const char = buildChar(race, klass, dg.clearLevel)
  const { gearTier, gearHp } = gearFor(rung.rarity, rung.enh)
  const levers = CM.computeLevers(klass, char.level, gearTier, { str: char.str, agi: char.agi, int: char.int, def: char.def })
  const pHP = char.gameMaxHp + gearHp
  const pDef = chooseDefense(boss.power, DIE.weapon, levers, boss.anchorS, levers.scale) // 1× por config
  let win = 0
  for (let i = 0; i < n; i++) if (fight(levers, pHP, boss, pDef) === 'win') win++
  return { wr: win / n, gearTier, levers, pHP }
}
// Binary-search do hpMult p/ a classe de referência vencer ~TARGET_WIN no gear-ALVO.
function solveHpMult(dg, race, klass) {
  const targetRung = RUNGS[targetRungIndex(dg)]
  let lo = 1.0, hi = 14.0
  for (let it = 0; it < 16; it++) {
    const mid = (lo + hi) / 2
    const boss = makeBoss(dg, race, klass, mid)
    const { wr } = winRate(dg, race, klass, targetRung, boss, 700)
    // mais HP no boss = menos win do jogador → se win alto, subir hi... (monotônico decrescente em hpMult)
    if (wr > TARGET_WIN) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

const verdictOf = (wr) => wr >= 85 ? '✅ fácil' : wr >= 60 ? '🟢 vence' : wr >= 40 ? '⚠️ no fio' : '❌ apanha'

console.log(`\n${'='.repeat(94)}`)
console.log(`  DOLRATH — DIFICULDADE DA DUNGEON — boss NORMALIZADO POR CLASSE (single-player)  |  ${FIGHTS} lutas`)
console.log(`  boss: HP/poder ancorados na média das classes no gate; armadura neutra; K por nível.`)
console.log(`  hpMult resolvido POR CLASSE p/ vencer ~${(TARGET_WIN*100)|0}% no gear-ALVO | mults [pow ${BOSS_POW_MULT} arm ${BOSS_ARM_MULT}]`)
console.log('='.repeat(94))

// Tabela final p/ o port: hpMult[dungeon][classe]
const table = {}
for (const dg of DUNGEONS) {
  const ti = targetRungIndex(dg)
  table[dg.id] = {}
  console.log(`\n── ${dg.id.toUpperCase()} (lvlReq ${dg.levelReq}, ${dg.rooms} salas) — alvo: ${dg.targetLabel} ──`)
  for (const klass of CLASSES_ALL) {
    const hpMult = SOLVE ? solveHpMult(dg, RACE, klass) : (process.env.BHP !== undefined ? Number(process.env.BHP) : dg.bossHpMult)
    table[dg.id][klass] = hpMult
    const boss = makeBoss(dg, RACE, klass, hpMult)
    // gate: tier-abaixo · ALVO · tier-acima (compacto, por classe)
    const cells = [ti - 1, ti, ti + 1].filter(i => i >= 0 && i < RUNGS.length).map(i => {
      const { wr } = winRate(dg, RACE, klass, RUNGS[i], boss)
      const tag = i === ti ? `[${RUNGS[i].label} ${(wr*100).toFixed(0)}%◀]` : `${RUNGS[i].label.split(' ')[1]||RUNGS[i].label} ${(wr*100).toFixed(0)}%`
      return tag
    })
    console.log(`   ${klass.padEnd(8)} hpMult ${hpMult.toFixed(2)} | ${cells.join('  ·  ')}`)
  }
}

console.log(`\n${'='.repeat(94)}`)
console.log('  TABELA hpMult[masmorra][classe] (p/ portar no scaleMonster):')
console.log(`  ${'masmorra'.padEnd(10)} ${CLASSES_ALL.map(k => k.padStart(8)).join('')}`)
for (const dg of DUNGEONS) {
  console.log(`  ${dg.id.padEnd(10)} ${CLASSES_ALL.map(k => table[dg.id][k].toFixed(2).padStart(8)).join('')}`)
}
console.log('='.repeat(94) + '\n')
