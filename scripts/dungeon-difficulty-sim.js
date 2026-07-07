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
// `entry` = gear com que o jogador CHEGA (o alvo da masmorra ANTERIOR); null = pelado.
// A rampa das salas interpola entry→target — antes começava do piso pelado e as salas
// de Caverna/Pântano/Ruínas saíam ancoradas num "nível 40 pelado" (fácil demais).
const DUNGEONS = [
  { id: 'floresta', rooms: 3, levelReq: 1,  clearLevel: 10, difficulty: 1.0,  bossHpMult: 1.48, target: { rarity: 'UNCOMMON',  enh: PRI }, targetLabel: 'incomum PRI/+15', entry: null },
  { id: 'caverna',  rooms: 4, levelReq: 10, clearLevel: 25, difficulty: 1.15, bossHpMult: 1.42, target: { rarity: 'RARE',      enh: DUO }, targetLabel: 'raro DUO',        entry: { rarity: 'UNCOMMON', enh: PRI } },
  { id: 'pantano',  rooms: 4, levelReq: 25, clearLevel: 40, difficulty: 1.3,  bossHpMult: 1.40, target: { rarity: 'EPIC',      enh: TRI }, targetLabel: 'épico TRI',       entry: { rarity: 'RARE',     enh: DUO } },
  { id: 'ruinas',   rooms: 5, levelReq: 40, clearLevel: 50, difficulty: 1.45, bossHpMult: 1.37, target: { rarity: 'LEGENDARY', enh: TET }, targetLabel: 'lendário TET',    entry: { rarity: 'EPIC',     enh: TRI } },
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
    evade: BOSS_EVADE,
    hp: Math.floor(a.hp * hpMult),
    anchorTier: a.gearTier, anchorS: S, bossLevel,
  }
}

// ============================================================
// COMBATE — DADO-COMO-PLUS (2026-06-30). O dado nunca disputa, só multiplica o dano de
// quem rola. Esquiva é 100% %-de-stat, exceto que o número MÁXIMO do dado garante o
// evento especial (crítico pro atacante, esquiva total pro defensor), independente de
// stat — ver combatModel.resolveHit (jogador ataca) / resolveMonsterHit (boss ataca: ele
// NÃO rola, dano sai dos stats com variação pequena sem dado).
// ============================================================
const DIE = CM.PVE_DIE // {basic:6, weapon:8, special:20} — fonte única em combatModel
const TR_ON = 4, TR_OFF = 6 // duty-cycle da transformação (~40% uptime)
const BOSS_EVADE = 0.08 // boss neutro (sintético) — espelha a faixa dos bosses reais (~0.07-0.09)

function fight(base, pHP, boss) {
  const tr = { power: base.power * CM.TRANSFORM_SCALE, armor: base.armor * CM.TRANSFORM_SCALE, hp: base.hp, evade: base.evade, K: base.K * CM.TRANSFORM_SCALE, scale: base.scale * CM.TRANSFORM_SCALE }
  let php = pHP, mhp = boss.hp
  let playerTurn = Math.random() < 0.5
  let phase = 0 // ciclo de transformação em turnos do jogador: [0,TR_ON) transformado; resto cooldown
  const isTransformed = () => phase < TR_ON
  for (let t = 0; t < 600 && php > 0 && mhp > 0; t++) {
    if (playerTurn) {
      const pl = isTransformed() ? tr : base
      const kind = isTransformed() ? 'special' : 'weapon' // especial só transformado
      mhp -= CM.resolveHit({ power: pl.power * CM.ATTACKS[kind].powerMult }, boss, { defense: 'dodge', sides: DIE[kind] }).damage
      phase = (phase + 1) % (TR_ON + TR_OFF)
    } else {
      const x = Math.random()
      const kind = x < 0.35 ? 'basic' : x < 0.7 ? 'weapon' : 'special'
      const pl = isTransformed() ? tr : base
      php -= CM.resolveMonsterHit({ power: boss.power * CM.ATTACKS[kind].powerMult, sides: DIE[kind], defender: { armor: pl.armor, K: pl.K, evade: pl.evade } }).damage
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
  let win = 0
  for (let i = 0; i < n; i++) if (fight(levers, pHP, boss) === 'win') win++
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

// ============================================================
// 🚪 FASE DE SALAS (2026-07-06) — resolve a RAMPA das salas por win%, igual ao boss.
//
// Antes as constantes de sala (ROOM_HP_LO/HI, MINOR_*_FAC) eram estimadas à mão e as
// salas de Caverna/Pântano/Ruínas saíam triviais (um nv30 DUO vencia a 1ª sala das
// Ruínas ~87%). Agora cada sala tem um jogador-GATE explícito e o hpMult é resolvido
// por binary-search para o gate vencer ~ROOM_TARGET_WIN:
//   • GATE da sala no progresso p: nível lerp(levelReq−3, clearLevel−2, p) com gear
//     sintético lerp(entry, target, p) — na 1ª sala das Ruínas = "nv37 épico TRI".
//   • Resolvo o hpMult na 1ª e na ÚLTIMA sala principal e extrapolo a reta p∈[0,1]
//     → ROOM_HP_LO/HI por masmorra (mesma forma lerp do scaleMonster).
//   • NÓ MENOR: um único knob de alívio r ∈ [0,1] (hp = lerp(1, 0.45, r); str =
//     lerp(1, 0.7, r)) resolvido p/ o jogador UMA-BANDA-ATRÁS vencer ~MINOR_BEHIND_WIN
//     no 1º nó — dá pra arranhar XP, não pra farmar. Floresta fica nos valores atuais
//     (proteção do nv1 pelado + pacotes).
// Saída: tabela ROOM_RAMP[masmorra] p/ portar no dungeonAdventures.ts.
// ============================================================
const ROOM_TARGET_WIN = Number(process.env.ROOM_TARGET_WIN) || 0.60
const MINOR_BEHIND_WIN = Number(process.env.MINOR_BEHIND_WIN) || 0.45
// Poder das salas ACIMA do fator do boss (0.9): golpe mais perigoso e hpMult menor p/ o
// mesmo win% → luta de sala mais curta (o boss continua a maratona; a sala é o susto).
// Floresta fica no 0.9 de produção (onboarding intocado).
const ROOM_POW = process.env.RPOW !== undefined ? Number(process.env.RPOW) : 1.15
const roomPowOf = (dg) => (dg.id === 'floresta' ? BOSS_POW_MULT : ROOM_POW)
const ROOM_EVADE = 0.08
const lerp = (a, b, p) => a + (b - a) * Math.max(0, Math.min(1, p))

// Progresso do nó no band (espelha nodeProgress do dungeonAdventures.ts).
function nodeProgress(tier, isMain, rooms) {
  const base = tier / (rooms + 1)
  return isMain ? base : Math.max(0.04, base - 0.5 / (rooms + 1))
}

// Gear de rampa da masmorra em p: interpola entry→target (floresta: pelado→target,
// com o MESMO piso GEAR_TIER_FLOOR=0.25 do scaleMonster).
const GEAR_TIER_FLOOR = 0.25
function rampGear(dg, p) {
  const t = gearFor(dg.target.rarity, dg.target.enh)
  const e = dg.entry ? gearFor(dg.entry.rarity, dg.entry.enh) : { gearTier: GEAR_TIER_FLOOR, gearHp: 0 }
  return { gearTier: lerp(e.gearTier, t.gearTier, p), gearHp: Math.floor(lerp(e.gearHp, t.gearHp, p)) }
}

// Âncora neutra da sala (média das 4 classes) em nível/gear arbitrários — espelha anchorAt.
function roomAnchor(race, level, gearTier, gearHp) {
  let powerSum = 0, hpSum = 0
  for (const k of ALL_KLASS) {
    const c = buildChar(race, k, level)
    const lv = CM.computeLevers(k, level, gearTier, { str: c.str, agi: c.agi, int: c.int, def: c.def })
    powerSum += lv.power
    hpSum += c.gameMaxHp + gearHp
  }
  return { power: powerSum / ALL_KLASS.length, hp: hpSum / ALL_KLASS.length }
}

// Monstro de sala p/ um JOGADOR de nível playerLevel (o nível da sala acompanha o
// jogador com teto na rampa e piso no levelReq — espelha o clamp do scaleMonster).
function makeRoomMonster(dg, race, tier, isMain, playerLevel, hpMult, strFac) {
  const p = nodeProgress(tier, isMain, dg.rooms)
  const bandLevel = Math.round(lerp(dg.levelReq, dg.clearLevel, p))
  const level = Math.max(dg.levelReq, Math.min(bandLevel, Math.round(playerLevel)))
  const g = rampGear(dg, p)
  const a = roomAnchor(race, level, g.gearTier, g.gearHp)
  const S = CM.powerScale(level, g.gearTier)
  return {
    power: a.power * roomPowOf(dg) * strFac,
    armor: MON_ARMOR * S * BOSS_ARM_MULT * strFac,
    K: CM.K50 * (level / CM.MAX_LEVEL_REF + 0.5),
    evade: ROOM_EVADE,
    hp: Math.floor(a.hp * hpMult),
  }
}

// win% MÉDIO entre as 4 classes de um jogador (nível + gear sintético) contra um monstro.
function roomWinRate(race, playerLevel, gearTier, gearHp, mon, n) {
  let win = 0, total = 0
  for (const klass of CLASSES_ALL) {
    const c = buildChar(race, klass, playerLevel)
    const levers = CM.computeLevers(klass, playerLevel, gearTier, { str: c.str, agi: c.agi, int: c.int, def: c.def })
    const pHP = c.gameMaxHp + gearHp
    for (let i = 0; i < n; i++, total++) if (fight(levers, pHP, mon) === 'win') win++
  }
  return win / total
}

// Jogador-GATE da sala no progresso p (nível + gear de rampa).
function gatePlayerAt(dg, p) {
  const level = Math.max(1, Math.round(lerp(dg.levelReq - 3, dg.clearLevel - 2, p)))
  const g = rampGear(dg, p)
  return { level, ...g }
}

// Resolve o hpMult de UMA sala principal p/ o gate vencer ~ROOM_TARGET_WIN.
function solveRoomHpMult(dg, race, tier) {
  const gate = gatePlayerAt(dg, nodeProgress(tier, true, dg.rooms))
  let lo = 0.8, hi = 12
  for (let it = 0; it < 14; it++) {
    const mid = (lo + hi) / 2
    const mon = makeRoomMonster(dg, race, tier, true, gate.level, mid, 1)
    const wr = roomWinRate(race, gate.level, gate.gearTier, gate.gearHp, mon, 300)
    if (wr > ROOM_TARGET_WIN) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

// Alívio do nó menor: r=0 (igual à sala) → r=1 (hp 0.45 / str 0.70). Resolve r p/ o
// jogador uma-banda-atrás vencer ~MINOR_BEHIND_WIN no 1º nó menor.
const minorFacsOf = (r) => ({ hp: lerp(1, 0.45, r), str: lerp(1, 0.7, r) })
function solveMinorRelief(dg, race, behind, hpLo, hpHi) {
  const p = nodeProgress(1, false, dg.rooms)
  const hpBase = lerp(hpLo, hpHi, p)
  let lo = 0, hi = 1
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2
    const f = minorFacsOf(mid)
    const mon = makeRoomMonster(dg, race, 1, false, behind.level, hpBase * f.hp, f.str)
    const wr = roomWinRate(race, behind.level, behind.gearTier, behind.gearHp, mon, 300)
    // mais alívio (r maior) = mais win do banda-atrás → monotônico crescente em r
    if (wr < MINOR_BEHIND_WIN) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

// Perfis de teste por masmorra: entrada certa / uma-banda-atrás / turista nv4.
const gf = (rarity, enh) => gearFor(rarity, enh)
const TOURIST = { label: 'turista nv4', level: 4, ...gf('UNCOMMON', 7) }
const BEHIND = {
  floresta: null, // não há banda anterior
  caverna: { label: 'atrás nv5 com+10', level: 5, ...gf('COMMON', 10) },
  pantano: { label: 'atrás nv15 PRI', level: 15, ...gf('UNCOMMON', PRI) },
  ruinas: { label: 'atrás nv30 DUO', level: 30, ...gf('RARE', DUO) },
}

console.log(`${'='.repeat(94)}`)
console.log(`  🚪 FASE DE SALAS — gate vence ~${(ROOM_TARGET_WIN * 100) | 0}% | nó menor: banda-atrás ~${(MINOR_BEHIND_WIN * 100) | 0}% | pow ${ROOM_POW} (floresta ${BOSS_POW_MULT})`)
console.log('='.repeat(94))

const rampTable = {}
for (const dg of DUNGEONS) {
  let hpLo, hpHi, minorHp, minorStr
  if (dg.id === 'floresta') {
    // Floresta INTOCADA (onboarding validado): valores atuais do scaleMonster.
    hpLo = 1.4; hpHi = 3.0; minorHp = 0.7; minorStr = 0.78
  } else {
    const p1 = nodeProgress(1, true, dg.rooms), pL = nodeProgress(dg.rooms, true, dg.rooms)
    const h1 = solveRoomHpMult(dg, RACE, 1)
    const hL = solveRoomHpMult(dg, RACE, dg.rooms)
    const slope = (hL - h1) / (pL - p1)
    hpLo = Math.max(1.0, h1 - slope * p1)
    hpHi = hpLo + slope
    const r = solveMinorRelief(dg, RACE, BEHIND[dg.id], hpLo, hpHi)
    const f = minorFacsOf(r)
    minorHp = f.hp; minorStr = f.str
  }
  rampTable[dg.id] = { pow: roomPowOf(dg), hpLo, hpHi, minorHp, minorStr }

  // Grade de verificação: perfis × (1º nó menor, 1ª sala, última sala).
  const entryGear = dg.entry ? gf(dg.entry.rarity, dg.entry.enh) : { gearTier: 0, gearHp: 0 }
  const gate1 = gatePlayerAt(dg, nodeProgress(1, true, dg.rooms))
  const profiles = [
    { label: `entrada nv${dg.levelReq}${dg.entry ? ' ' + dg.entry.rarity.slice(0, 3) : ' pelado'}`, level: dg.levelReq, ...entryGear },
    { label: `gate1 nv${gate1.level}`, ...gate1 },
    BEHIND[dg.id],
    TOURIST,
  ].filter(Boolean)
  const nodes = [
    { tag: '1º nó', tier: 1, isMain: false },
    { tag: '1ª sala', tier: 1, isMain: true },
    { tag: `sala ${dg.rooms}`, tier: dg.rooms, isMain: true },
  ]
  console.log(`\n── ${dg.id.toUpperCase()} — rampa ${dg.entry ? dg.entry.rarity + '+' + dg.entry.enh : 'pelado'} → ${dg.targetLabel} | hpLo ${hpLo.toFixed(2)} hpHi ${hpHi.toFixed(2)} · minor hp ${minorHp.toFixed(2)}/str ${minorStr.toFixed(2)} ──`)
  for (const pr of profiles) {
    const cells = nodes.map(nd => {
      const hpBase = lerp(hpLo, hpHi, nodeProgress(nd.tier, nd.isMain, dg.rooms))
      const mon = makeRoomMonster(dg, RACE, nd.tier, nd.isMain, pr.level, hpBase * (nd.isMain ? 1 : minorHp), nd.isMain ? 1 : minorStr)
      const wr = roomWinRate(RACE, pr.level, pr.gearTier, pr.gearHp, mon, 700)
      return `${nd.tag} ${(wr * 100).toFixed(0)}%`
    })
    console.log(`   ${pr.label.padEnd(22)} ${cells.join('  ·  ')}`)
  }
}

console.log(`\n${'='.repeat(94)}`)
console.log('  TABELA ROOM_RAMP[masmorra] (p/ portar no dungeonAdventures.ts):')
console.log(`  ${'masmorra'.padEnd(10)} ${'pow'.padStart(6)} ${'hpLo'.padStart(7)} ${'hpHi'.padStart(7)} ${'minorHp'.padStart(8)} ${'minorStr'.padStart(9)}`)
for (const dg of DUNGEONS) {
  const r = rampTable[dg.id]
  console.log(`  ${dg.id.padEnd(10)} ${r.pow.toFixed(2).padStart(6)} ${r.hpLo.toFixed(2).padStart(7)} ${r.hpHi.toFixed(2).padStart(7)} ${r.minorHp.toFixed(2).padStart(8)} ${r.minorStr.toFixed(2).padStart(9)}`)
}
console.log('='.repeat(94) + '\n')
