#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de LATE GAME com GEAR REAL (nível 50, lendário IV)
//
// Diferente de scripts/pvp-race-class-sim.js (que usa números de gear
// ABSTRATOS e hand-tunados), este monta o LOADOUT BiS REAL a partir do
// catálogo (src/lib/itemCatalog.ts) e aplica o multiplicador de
// aprimoramento REAL (src/lib/enhancementSystem.ts) — por padrão IV (TET,
// ×4.0). Assim o teste de "alguma raça/classe fica mais forte no end-game"
// usa os MESMOS valores que o jogador vê em produção.
//
// O combate espelha EXATAMENTE o server/socket-server.js (mesmo ruleset do
// pvp-race-class-sim, com transformações das 4 raças).
//
// Dois KNOBS de balanceamento (o objeto deste estudo):
//   PPL=<n>   pontos de atributo por nível          (produção atual: 1)
//   TET=<x>   multiplicador do aprimoramento IV      (produção atual: 4.0)
//   também: PRI/DUO/TRI/PEN p/ a curva inteira; PERLVL08=<x> p/ +1..+15.
//
// Uso:
//   node scripts/late-game-gear-sim.js                  # produção atual
//   node scripts/late-game-gear-sim.js --fights=4000
//   PPL=3 TET=2.5 node scripts/late-game-gear-sim.js    # proposta
//   node scripts/late-game-gear-sim.js --diag           # ficha + % de gear
// ============================================================

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}`))
  if (!a) return def
  const v = a.split('=')[1]
  return v === undefined ? true : v
}
const FIGHTS = Number(getArg('fights', 3000))
const LEVEL = Number(getArg('level', 50))
const DIAG = Boolean(getArg('diag', false))
const NOGEAR = Boolean(getArg('nogear', false)) // baseline sem gear (confere base balanceada)

const rnd = (n) => 1 + Math.floor(Math.random() * n)

// ---------- KNOBS DE BALANCEAMENTO ----------
const PPL = process.env.PPL !== undefined ? Number(process.env.PPL) : 1 // pontos/nível (prod: 1)
const BASEPTS = Number(process.env.BASEPTS) || 18                       // pontos na criação (prod: 18)

// Multiplicadores de aprimoramento — espelham enhancementSystem.TIER_MULTIPLIERS.
// Default = PRODUÇÃO (tiers reforçados 2026-07-09). Override via env p/ testar curvas.
const TIER = {
  PRI: process.env.PRI !== undefined ? Number(process.env.PRI) : 2.0,
  DUO: process.env.DUO !== undefined ? Number(process.env.DUO) : 2.2,
  TRI: process.env.TRI !== undefined ? Number(process.env.TRI) : 2.45,
  TET: process.env.TET !== undefined ? Number(process.env.TET) : 2.8,
  PEN: process.env.PEN !== undefined ? Number(process.env.PEN) : 3.3,
}
const ENH_TIER = (process.env.ENH || 'TET').toUpperCase() // qual tier equipar (default IV)
const ENH_MULT = TIER[ENH_TIER] || 2.8
// chaves que escalam com aprimoramento (== enhancementSystem.SCALING_STAT_KEYS)
const SCALING = new Set(['agi', 'str', 'int', 'res', 'def', 'hp', 'mp'])
function enh(stats) {
  const out = {}
  for (const [k, v] of Object.entries(stats || {})) {
    out[k] = typeof v === 'number' && SCALING.has(k) ? Math.round(v * ENH_MULT) : v
  }
  return out
}

// ============================================================
// DADOS DO JOGO (espelham src/lib/gameData.ts, escala 0-100 → /10)
// ============================================================
const RACES = {
  humano:     { strength: 20, dexterity: 20, intelligence: 20, constitution: 20 },
  draconiano: { strength: 30, constitution: 50 },
  metamorfo:  { dexterity: 50, constitution: 30 },
  elfo:       { intelligence: 40, dexterity: 30, constitution: 20 },
}
const CLASSES = {
  warrior: { strength: 40, constitution: 30 },
  rogue:   { dexterity: 40, intelligence: 20 },
  mage:    { intelligence: 50 },
  monk:    { dexterity: 40, constitution: 40 },
}
const CLASS_BUILD = {
  warrior: (p) => split(p, { str: 0.7, def: 0.3 }),
  rogue:   (p) => split(p, { agi: 0.85, def: 0.15 }),
  mage:    (p) => split(p, { int: 0.85, def: 0.15 }),
  monk:    (p) => split(p, { agi: 0.55, def: 0.45 }),
}
function split(points, weights) {
  const out = { str: 0, agi: 0, int: 0, def: 0 }
  const keys = Object.keys(weights)
  let used = 0
  keys.forEach((k, i) => {
    const v = i === keys.length - 1 ? points - used : Math.round(points * weights[k])
    out[k] = v
    used += v
  })
  return out
}

// Teto suave de AGI (== pvp-race-class-sim)
const AGICAP = Number(process.env.AGICAP) || 32
const AGISLOPE = process.env.AGISLOPE !== undefined ? Number(process.env.AGISLOPE) : 0.75
function effAgi(agi) { return agi <= AGICAP ? agi : AGICAP + (agi - AGICAP) * AGISLOPE }
// Teto suave de STR (simétrico ao da AGI): o ataque pesado é STR×1.8 SEM teto e
// sem custo de MP — no end-game o guerreiro escala ofensiva infinita. STRCAP/SLOPE
// freiam isso. STRCAP=999 → desligado (comportamento de produção).
const STRCAP = Number(process.env.STRCAP) || 999
const STRSLOPE = process.env.STRSLOPE !== undefined ? Number(process.env.STRSLOPE) : 0.75
function effStr(str) { return str <= STRCAP ? str : STRCAP + (str - STRCAP) * STRSLOPE }

// ============================================================
// 🎽 CATÁLOGO BiS REAL (subset usado no end-game) — stats CRUS do item.
// Adventure-boss e épicos genéricos NÃO têm restrição de raça; só os 4
// lendários "de raça" são exclusivos. Fonte: src/lib/itemCatalog.ts.
// ============================================================
const I = {
  // --- armas lendárias de RAÇA (exclusivas) ---
  presasCataclismo: { str: 51, agi: 3 },              // AXE  draconiano (warrior)
  garrasLunar:      { str: 5, agi: 64 },              // DAGGER metamorfo (rogue)
  setimoSentido:    { str: 10, agi: 14, int: 44 },    // SWORD humano (warrior híbrido)
  // --- armas lendárias SEM restrição (adventure/dungeon) ---
  esmagadorGorthak: { str: 59, def: 6 },              // AXE  (warrior BiS geral)
  muralhaViva:      { def: 50, hp: 32 },              // SHIELD (secundária warrior)
  punhosDragao:     { str: 6, agi: 60 },              // GAUNTLET (monge)
  coracaoMana:      { int: 58, mp: 65 },              // ORB (secundária mago)
  cajadoSylariel:   { int: 48, mp: 70 },              // STAFF (mago BiS geral)
  arcoSylariel:     { agi: 27, int: 50 },             // BOW
  presasVoltheris:  { agi: 30, int: 46 },             // DAGGER
  // --- armas épicas (preenchem onde não há lendário p/ a raça) ---
  presasGemeas:     { agi: 42 },                       // DAGGER (rogue não-metamorfo)
  // --- armaduras lendárias ---
  egideGorthak:     { def: 50, hp: 90 },               // HEAVY (warrior)
  mantoCelestial:   { agi: 18, int: 12, def: 10, mp: 60 }, // LIGHT elfo (mago)
  mantoVoltheris:   { agi: 22, int: 10, def: 11, mp: 55 }, // LIGHT (rogue/monge/mago não-elfo)
  // --- armaduras épicas (corpo p/ metamorfo médio) ---
  feraPrimal:       { agi: 22, def: 9, hp: 35 },        // MEDIUM metamorfo
  // --- apoio (sem lendário no catálogo; melhores UNCOMMON) ---
  elmoSentinela:    { def: 15, hp: 18 },               // HEAVY_HELMET
  coifMalha:        { agi: 7, def: 4, mp: 6 },          // LIGHT_HELMET
  manoplasSentinela:{ str: 9, def: 5 },                // HEAVY_GLOVES
  luvasMalha:       { agi: 9, def: 3 },                 // LIGHT_GLOVES
  grevasAco:        { def: 12, hp: 16 },                // HEAVY_BOOTS
  botasMalha:       { agi: 12, def: 3 },                // LIGHT_BOOTS
  // --- cintos ---
  faixaDestino:     { str: 5, agi: 5, int: 5, def: 8, hp: 35 }, // EPIC (melhor cinto geral)
  faixaConjurador:  { int: 6, mp: 22 },
  // --- anéis ---
  seloImperial:     { str: 5, int: 5, agi: 5, def: 5 }, // EPIC (warrior)
  nevoaToxica:      { agi: 27 },                         // EPIC (agi)
  cristalPulsante:  { int: 14, mp: 30 },                // RARE (mago)
  lagrimaSylariel:  { int: 8, agi: 6, mp: 50 },         // LEG (mago)
  // --- colares ---
  coracaoKraxthar:  { str: 8, hp: 70, def: 6 },         // LEG (warrior)
  amuletoCoruja:    { agi: 12 },                         // RARE (agi)
  relicarioLich:    { int: 7, hp: 40, mp: 40 },         // EPIC (mago)
}

// DUALNORM=1 → dual-wield = orçamento de UMA arma dividido (cada mão = metade).
// Conserta a inflação de stat das classes AGI (2 armas dando 2× o stat) que quebra
// o balanceamento quando o stat pesa forte no dano. Empunhar 2 não dobra o poder.
const DUALNORM = process.env.DUALNORM ? true : false
function half(it) { const o = {}; for (const [k, v] of Object.entries(it)) o[k] = typeof v === 'number' ? Math.round(v / 2) : v; return o }

// BiS por (classe → raça). Cada slot é um item do mapa I.
// Princípio: melhor peça equipável pela CLASSE (peso/arma) e RAÇA (exclusivos).
function loadout(race, klass) {
  const L = []
  const add = (it) => { if (it) L.push(it) }
  const dual = (it) => { add(DUALNORM ? half(it) : it); add(DUALNORM ? half(it) : it) }
  if (klass === 'warrior') {
    add(race === 'draconiano' ? I.presasCataclismo : I.esmagadorGorthak) // arma
    add(I.muralhaViva)        // escudo
    add(I.egideGorthak)       // corpo (heavy)
    add(I.elmoSentinela)      // elmo
    add(I.manoplasSentinela)  // luvas
    add(I.grevasAco)          // botas
    add(I.faixaDestino)       // cinto
    add(I.seloImperial)       // anel
    add(I.coracaoKraxthar)    // colar
  } else if (klass === 'rogue') {
    const dagger = race === 'metamorfo' ? I.garrasLunar : I.presasGemeas
    dual(dagger)  // dual-wield (orçamento dividido se DUALNORM)
    add(race === 'metamorfo' ? I.feraPrimal : I.mantoVoltheris) // corpo
    add(I.coifMalha); add(I.luvasMalha); add(I.botasMalha)
    add(I.faixaDestino)
    add(I.nevoaToxica)        // anel agi
    add(I.amuletoCoruja)      // colar agi
  } else if (klass === 'mage') {
    add(I.cajadoSylariel)     // cajado
    add(I.coracaoMana)        // orbe
    add(race === 'elfo' ? I.mantoCelestial : I.mantoVoltheris) // corpo (light)
    add(I.coifMalha); add(I.luvasMalha); add(I.botasMalha)
    add(I.faixaDestino)
    add(I.cristalPulsante)    // anel int
    add(I.relicarioLich)      // colar int
  } else { // monk
    dual(I.punhosDragao) // dual manoplas (orçamento dividido se DUALNORM)
    add(race === 'metamorfo' ? I.feraPrimal : I.mantoVoltheris)
    add(I.coifMalha); add(I.luvasMalha); add(I.botasMalha)
    add(I.faixaDestino)
    add(I.nevoaToxica)
    add(I.amuletoCoruja)
  }
  return L
}

function gearTotals(race, klass) {
  const tot = { str: 0, agi: 0, int: 0, def: 0, hp: 0, mp: 0 }
  if (NOGEAR) return tot
  for (const item of loadout(race, klass)) {
    const s = enh(item)
    for (const k of Object.keys(tot)) tot[k] += Number(s[k]) || 0
  }
  return tot
}

// ============================================================
// CONSTRUÇÃO DO LUTADOR (base + gear)
// ============================================================
function buildCharacter(race, klass, level) {
  const points = BASEPTS + Math.max(0, level - 1) * PPL
  const d = CLASS_BUILD[klass](points)
  const rb = RACES[race] || {}, cb = CLASSES[klass] || {}
  const bonus = (k) => Math.floor((rb[k] || 0) / 10) + Math.floor((cb[k] || 0) / 10)

  let str = d.str + bonus('strength')
  let agi = d.agi + bonus('dexterity')
  let int = d.int + bonus('intelligence')
  let def = d.def + bonus('constitution')
  const baseStr = str, baseAgi = agi, baseInt = int, baseDef = def

  const g = gearTotals(race, klass)
  // GEARDEFMULT: escala a DEF vinda do GEAR (representa reduzir os números de DEF
  // das peças de armadura/escudo no catálogo). DEF é o stat mais forte do modelo
  // e só o guerreiro o empilha — este é o lever que reaproxima as classes.
  const GEARDEFMULT = process.env.GEARDEFMULT !== undefined ? Number(process.env.GEARDEFMULT) : 1
  g.def = Math.round(g.def * GEARDEFMULT)
  // 🅰️ STATNORM: normaliza o STAT PRINCIPAL vindo do gear para um alvo comum entre
  // classes (representa balancear o catálogo p/ que cada BiS dê ~o mesmo total do
  // seu stat). Resolve o "STR gear < AGI gear" com WSCALE forte. 0 = desligado.
  const STATNORM = process.env.STATNORM !== undefined ? Number(process.env.STATNORM) : 0
  if (STATNORM > 0) {
    const mainKey = { warrior: 'str', rogue: 'agi', mage: 'int', monk: 'agi' }[klass]
    if (mainKey) g[mainKey] = STATNORM
  }
  str += g.str; agi += g.agi; int += g.int; def += g.def

  // BASEDEFHP/GEARDEFHP: coeficiente com que a DEF (base/gear) vira HP. Reduzir
  // corta o "double-dip" da DEF (mitiga E vira HP) que infla o tanque no end-game.
  // HPLVL: HP fixo por nível (sobe o piso de HP de todos → aproxima as classes).
  const BASEDEFHP = process.env.BASEDEFHP !== undefined ? Number(process.env.BASEDEFHP) : 4
  const GEARDEFHP = process.env.GEARDEFHP !== undefined ? Number(process.env.GEARDEFHP) : 4
  const HPLVL = process.env.HPLVL !== undefined ? Number(process.env.HPLVL) : 6
  const maxHp = 100 + level * HPLVL + Math.floor(str * 0.5) + baseDef * BASEDEFHP + g.def * GEARDEFHP + g.hp
  const maxMp = 60 + int * 4 + agi + g.mp
  const maxStamina = 120 + agi * 2 + def * 2
  const resistance = Math.floor(def * 0.8)

  return {
    race, klass, level, str, agi, int, def,
    baseStr, baseAgi, baseInt, baseDef, gear: g,
    strength: str, agility: agi, intelligence: int, defense: def, resistance,
    maxHp, hp: maxHp, maxMp, mp: maxMp, maxStamina, stamina: maxStamina,
  }
}

// ============================================================
// TRANSFORMAÇÕES (== pvp-race-class-sim; produção)
// ============================================================
const TF_CONFIG = {
  dragon:        { strength: 1.15, agility: 1.22, intelligence: 1.25, defense: 1.03, hp: 1.19, mpPool: 1.26, duration: 4, cooldown: 3, mp: 15 },
  seventh_sense: { strength: 1.17, agility: 1.23, intelligence: 1.27, defense: 1.02, hp: 1.21, mpPool: 1.28, duration: 4, cooldown: 3, mp: 12 },
  celestial:     { strength: 1.16, agility: 1.24, intelligence: 1.34, defense: 1.02, hp: 1.22, mpPool: 1.40, duration: 4, cooldown: 3, mp: 12 },
  wolf:          { strength: 1.15, agility: 1.32, intelligence: 1.22, defense: 1.03, hp: 1.17, mpPool: 1.22, duration: 4, cooldown: 3, mp: 10 },
  bear:          { strength: 1.20, agility: 1.14, intelligence: 1.20, defense: 1.07, hp: 1.28, mpPool: 1.22, duration: 4, cooldown: 3, mp: 10 },
  eagle:         { strength: 1.12, agility: 1.28, intelligence: 1.33, defense: 1.00, hp: 1.16, mpPool: 1.32, duration: 4, cooldown: 3, mp: 10 },
}
const TRANSFORM = process.env.NOTF ? false : true // produção tem transformação; NOTF=1 desliga
function pickForm(k) { return k === 'warrior' ? 'bear' : k === 'mage' ? 'eagle' : 'wolf' }
function getTF(race, klass) {
  if (!TRANSFORM) return null
  if (race === 'draconiano') return TF_CONFIG.dragon
  if (race === 'humano') return TF_CONFIG.seventh_sense
  if (race === 'elfo') return TF_CONFIG.celestial
  if (race === 'metamorfo') return TF_CONFIG[pickForm(klass)]
  return null
}
function applyTransform(me) {
  if (!me._base) me._base = { str: me.strength, agi: me.agility, int: me.intelligence, def: me.defense, maxHp: me.maxHp, maxMp: me.maxMp }
  const b = me._base, m = me.tf
  me.strength = Math.floor(b.str * m.strength)
  me.agility = Math.floor(b.agi * m.agility)
  me.intelligence = Math.floor(b.int * m.intelligence)
  me.defense = Math.floor(b.def * m.defense)
  me.resistance = Math.floor(me.defense * 0.8)
  const newMaxHp = Math.floor(b.maxHp * m.hp)
  me.hp = Math.min(me.hp + (newMaxHp - b.maxHp), newMaxHp); me.maxHp = newMaxHp
  if (m.mpPool) { const nm = Math.floor(b.maxMp * m.mpPool); me.mp = Math.min(me.mp + (nm - b.maxMp), nm); me.maxMp = nm }
  me.transformed = true
}
function revertTransform(me) {
  const b = me._base
  me.strength = b.str; me.agility = b.agi; me.intelligence = b.int; me.defense = b.def
  me.resistance = Math.floor(b.def * 0.8)
  me.hp = Math.min(me.hp, b.maxHp); me.maxHp = b.maxHp
  me.mp = Math.min(me.mp, b.maxMp); me.maxMp = b.maxMp
  me.transformed = false
}

// ============================================================
// COMBATE (== pvp-race-class-sim / socket-server.js)
// ============================================================
const MULT = { heavy: 1.8, light: 1.7, spec: 1.5, magic: process.env.MAGICMULT !== undefined ? Number(process.env.MAGICMULT) : 1.6 }
const DICEMULT = 2
// 🔮 MAGEFIX: ataque mágico PRIMÁRIO do mago (a "bola de fogo" que evolui) —
// escala com INT, sustentável (MP baixo), mitigado como magia (RES). Sobe o PISO
// do mago sem nerfar ninguém nem usar teto (filosofia de MMO que escala pra sempre).
const MAGEFIX = process.env.MAGEFIX ? true : false
const MAGIC_MP = process.env.MAGICMP !== undefined ? Number(process.env.MAGICMP) : 4
// 🅱️ DODGE_STAM: custo de stamina da esquiva. Alto = não dá pra spammar (recurso
// tático). DODGEAGI: escala o bônus de AGI na esquiva (0 = esquiva 100% desacoplada
// da AGI; 1 = atual). Juntos tiram a esquiva do domínio do empilhamento de AGI.
const DODGE_STAM = process.env.DODGE_STAM !== undefined ? Number(process.env.DODGE_STAM) : 1
const DODGEAGI = process.env.DODGEAGI !== undefined ? Number(process.env.DODGEAGI) : 1
const STAMINA_COST = { light_attack: 1, heavy_attack: 2, special_attack: 4, magic_attack: 2, weapon_attack: 2, dodge: DODGE_STAM, defend: 3 }
const DICE = { light_attack: 6, heavy_attack: 10, special_attack: 20, magic_attack: 10, weapon_attack: 10 }
const MP_COST = { light_attack: 0, heavy_attack: 0, special_attack: 15, magic_attack: MAGIC_MP, weapon_attack: 0 }

function calculateDamage(att, roll, action, isCrit) {
  let base
  if (action === 'weapon_attack') base = wpnDamage(att, roll)
  else if (action === 'special_attack') base = roll * DICEMULT + Math.floor(att.intelligence * MULT.spec)
  else if (action === 'magic_attack') base = roll * DICEMULT + Math.floor(att.intelligence * MULT.magic)
  else if (action === 'light_attack') base = roll * DICEMULT + Math.floor(effAgi(att.agility) * MULT.light) + Math.floor(att.strength * 0.3)
  else base = roll * DICEMULT + Math.floor(effStr(att.strength) * MULT.heavy)
  if (isCrit) base = Math.floor(base * 1.5)
  return Math.max(1, base)
}
function criticalChance(att) { return Math.min(40, 5 + att.agility * 1.2) }
function dodgeNetBonus(defAgi, attAgi, sides) {
  const cap = Math.min(3, Math.floor(sides / 5))
  const raw = Math.floor((((defAgi || 0) - (attAgi || 0)) / 5) * DODGEAGI)
  return Math.max(-cap, Math.min(cap, raw))
}
function effectiveResistance(def) { return Math.max(Number(def.resistance) || 0, Math.floor((Number(def.defense) || 0) * 0.8)) }
// MITPROP=1 → mitigação PROPORCIONAL com retornos decrescentes: DR = armor/(armor+K).
// Empilhar DEF nunca zera o dano (assíntota), o que mata a dominância do tanque no
// end-game e ainda torna "defender" relevante (some uma fração extra previsível).
// MITPROP=0 → modelo subtrativo legado (produção atual).
const MITPROP = process.env.MITPROP ? true : false
const MITK = process.env.MITK !== undefined ? Number(process.env.MITK) : 120
// armorMult: ao BLOQUEAR (DEF), a armadura efetiva é amplificada (BLOCKMULT) —
// redução GARANTIDA e forte para quem tem DEF (ferramenta do tanque). Passivo=1.
function calculateDefense(def, damage, action, attMagic, armorMult = 1) {
  const isMagic = action === 'special_attack' || action === 'magic_attack' || (action === 'weapon_attack' && attMagic)
  if (MITPROP) {
    let armor
    if (isMagic) armor = effectiveResistance(def)
    else if (action === 'heavy_attack') armor = (Number(def.defense) || 0) * 0.6 // pesado fura armadura
    else armor = Number(def.defense) || 0
    armor *= armorMult
    const dr = armor / (armor + MITK)
    return Math.max(1, Math.round(damage * (1 - dr)))
  }
  let mitigation
  if (isMagic) mitigation = effectiveResistance(def)
  else if (action === 'heavy_attack') mitigation = Math.floor((def.defense || 0) * 0.7)
  else mitigation = def.defense || 0
  return Math.max(Math.ceil(damage * 0.15), damage - mitigation)
}
function probDodge(n, net) {
  let wins = 0
  for (let d = 1; d <= n; d++) wins += Math.min(n, Math.max(0, d + net - 1))
  return wins / (n * n)
}
// ============================================================
// 🗡️ WPNMODE: ataque PRIMÁRIO vindo da ARMA (poder-base do item + stat modesto).
// "Livre de amarras de stat" — o dano-base vem do gear (catálogo), e o stat só
// modula (WSCALE pequeno). Balanceia no catálogo, não na fórmula, e escala pra
// sempre. Cada classe usa seu stat principal e tipo de dano (físico/mágico).
// WPNMODE=0 → modelo legado (heavy=STR×1.8).
// ============================================================
const WPNMODE = process.env.WPNMODE ? true : false
const WSCALE = process.env.WSCALE !== undefined ? Number(process.env.WSCALE) : 0.5
// Poder-base da arma por classe (já no tier lendário IV). É O LEVER de balanceamento:
// glass cannon → mais poder; tanque → menos. Ajustável via env WPN_<classe>.
const WPN = {
  warrior: Number(process.env.WPN_WAR) || 70,  // tanque: dano menor
  rogue:   Number(process.env.WPN_ROG) || 105, // glass cannon: dano alto
  mage:    Number(process.env.WPN_MAG) || 110, // glass cannon mágico: dano alto
  monk:    Number(process.env.WPN_MNK) || 85,  // bruiser: intermediário
}
const WPN_STAT = { warrior: 'strength', rogue: 'agility', mage: 'intelligence', monk: 'agility' }
const WPN_MAGIC = { mage: true }
function wpnDamage(att, roll) {
  const stat = att[WPN_STAT[att.klass]] || 0
  return Math.max(1, roll * DICEMULT + (WPN[att.klass] || 70) + Math.floor(stat * WSCALE))
}

function chooseAttack(me) {
  const opts = []
  if (me.mp >= MP_COST.special_attack && me.stamina >= STAMINA_COST.special_attack) opts.push(['special_attack', 21 + me.intelligence * MULT.spec])
  if (MAGEFIX && me.mp >= MP_COST.magic_attack && me.stamina >= STAMINA_COST.magic_attack) opts.push(['magic_attack', 11 + me.intelligence * MULT.magic])
  if (WPNMODE) {
    // No modelo de arma, a ARMA é o ataque primário — sem o "leve AGI" legado
    // (que, sem teto, eclipsava tudo e fazia as classes AGI ignorarem o sistema).
    if (me.stamina >= STAMINA_COST.weapon_attack) opts.push(['weapon_attack', 11 + (WPN[me.klass] || 70) + (me[WPN_STAT[me.klass]] || 0) * WSCALE])
  } else {
    if (me.stamina >= STAMINA_COST.heavy_attack) opts.push(['heavy_attack', 11 + effStr(me.strength) * MULT.heavy])
    if (me.stamina >= STAMINA_COST.light_attack) opts.push(['light_attack', 7 + effAgi(me.agility) * MULT.light + me.strength * 0.3])
  }
  if (!opts.length) return null
  opts.sort((a, b) => b[1] - a[1])
  return opts[0][0]
}
// DODGEONLY=1 → uma reação de defesa só (esquiva). Mitigação passiva da DEF
// sempre aplica; bloqueio/aparar vira camada NARRATIVA da IA (flavor, não mecânica).
const DODGEONLY = process.env.DODGEONLY ? true : false
// BLOCKMULT: força do Bloqueio (DEF) — amplifica a armadura efetiva no golpe
// bloqueado. Esquiva (AGI) zera às vezes; Bloqueio (DEF) reduz garantido.
const BLOCKMULT = process.env.BLOCKMULT !== undefined ? Number(process.env.BLOCKMULT) : 2.5
function chooseDefense(me, att, action, baseDamage) {
  const canDodge = me.stamina >= STAMINA_COST.dodge, canDefend = me.stamina >= STAMINA_COST.defend
  if (!canDodge && !canDefend) return 'exhausted'
  if (DODGEONLY) return canDodge ? 'dodge' : 'exhausted'
  const attMagic = att.klass === 'mage'
  const mitigated = calculateDefense(me, baseDamage, action, attMagic) // dano se levar (passivo)
  const blocked = calculateDefense(me, baseDamage, action, attMagic, BLOCKMULT) // dano se bloquear (DEF)
  const p = probDodge(DICE[action], dodgeNetBonus(me.agility, att.agility, DICE[action]))
  const evDodge = (1 - p) * mitigated // esquiva: chance p de zerar, senão leva mitigado
  const evBlock = blocked            // bloqueio: garantido
  if (canDodge && (!canDefend || evDodge <= evBlock)) return 'dodge'
  return 'defend'
}
function fight(c1, c2) {
  const a = { ...c1 }, b = { ...c2 }
  let att, defn
  const i1 = rnd(20), i2 = rnd(20)
  if (i1 > i2 || (i1 === i2 && Math.random() < 0.5)) { att = a; defn = b } else { att = b; defn = a }
  let actionCount = 0, turns = 0
  const MAX = 200
  while (a.hp > 0 && b.hp > 0 && turns < MAX) {
    turns++
    att.stamina = Math.min(att.maxStamina, att.stamina + 2)
    if (att.tfCd > 0) att.tfCd--
    if (att.tf && !att.transformed && att.tfCd <= 0 && att.mp >= att.tf.mp && att.stamina >= 3) {
      applyTransform(att); att.mp -= att.tf.mp; att.stamina -= 3; att.tfTurns = att.tf.duration
      ;[att, defn] = [defn, att]; continue
    }
    const action = chooseAttack(att)
    if (!action) {
      if (att.transformed && --att.tfTurns <= 0) { revertTransform(att); att.tfCd = att.tf.cooldown }
      ;[att, defn] = [defn, att]; continue
    }
    att.stamina -= STAMINA_COST[action]; att.mp -= MP_COST[action]
    const roll = rnd(DICE[action])
    const isCrit = Math.random() * 100 < criticalChance(att)
    const baseDamage = calculateDamage(att, roll, action, isCrit)
    const reaction = chooseDefense(defn, att, action, baseDamage)
    let damage = 0
    const attMagic = att.klass === 'mage'
    if (reaction === 'dodge') {
      defn.stamina -= STAMINA_COST.dodge
      const defRoll = rnd(DICE[action]) + dodgeNetBonus(defn.agility, att.agility, DICE[action])
      damage = defRoll > roll ? 0 : calculateDefense(defn, baseDamage, action, attMagic)
    } else if (reaction === 'defend') {
      defn.stamina -= STAMINA_COST.defend
      damage = calculateDefense(defn, baseDamage, action, attMagic, BLOCKMULT) // bloqueio (DEF), garantido
    } else damage = calculateDefense(defn, baseDamage, action, attMagic)
    actionCount++
    if (damage > 0) {
      if (actionCount > 60) damage = Math.floor(damage * 2)
      else if (actionCount > 40) damage = Math.floor(damage * 1.5)
      defn.hp -= damage
    }
    if (att.transformed && --att.tfTurns <= 0) { revertTransform(att); att.tfCd = att.tf.cooldown }
    ;[att, defn] = [defn, att]
  }
  if (turns >= MAX) return null
  return a.hp > 0 ? c1.id : c2.id
}

// ============================================================
// BATERIA — matriz 4×4 no nível alvo
// ============================================================
const RACE_NAMES = Object.keys(RACES)
const CLASS_NAMES = Object.keys(CLASSES)
const CLASS_LABEL = { warrior: 'Guer', rogue: 'Lad', mage: 'Mago', monk: 'Monge' }
const RACE_LABEL = { humano: 'Humano', draconiano: 'Dracon', metamorfo: 'Metam', elfo: 'Elfo' }

console.log(`\n${'='.repeat(82)}`)
console.log(`  DOLRATH — LATE GAME (nv ${LEVEL})  |  gear ${NOGEAR ? 'OFF (baseline)' : `lendário ${ENH_TIER} ×${ENH_MULT}`}  |  ${FIGHTS} lutas/par`)
console.log(`  KNOBS:  pontos/nível=${PPL}  (criação=${BASEPTS})   |   transformação=${TRANSFORM ? 'ON' : 'OFF'}`)
console.log('='.repeat(82))

const fighters = []
for (const r of RACE_NAMES)
  for (const k of CLASS_NAMES)
    fighters.push({ id: `${r}/${k}`, race: r, klass: k, ...buildCharacter(r, k, LEVEL), tf: getTF(r, k), tfTurns: 0, tfCd: 0, transformed: false })

const wins = {}, games = {}
fighters.forEach((f) => { wins[f.id] = 0; games[f.id] = 0 })
const cell = {}
for (let i = 0; i < fighters.length; i++) {
  for (let j = i + 1; j < fighters.length; j++) {
    const A = fighters[i], B = fighters[j]
    let aw = 0, draws = 0
    for (let f = 0; f < FIGHTS; f++) {
      const w = fight(A, B)
      if (w === A.id) aw++; else if (w === null) draws++
    }
    const decided = FIGHTS - draws
    wins[A.id] += aw; games[A.id] += decided
    wins[B.id] += decided - aw; games[B.id] += decided
    cell[`${A.id}|${B.id}`] = decided ? (100 * aw) / decided : 50
    cell[`${B.id}|${A.id}`] = decided ? (100 * (decided - aw)) / decided : 50
  }
}

console.log(`\n  ── WIN% GERAL POR LUTADOR (média vs os outros 15) ──`)
const ranked = fighters.map((f) => ({ id: f.id, wr: 100 * wins[f.id] / Math.max(1, games[f.id]) })).sort((a, b) => b.wr - a.wr)
ranked.forEach((r, i) => {
  const bar = '▇'.repeat(Math.round(r.wr / 3))
  const flag = r.wr >= 58 || r.wr <= 42 ? '  ⚠️' : ''
  console.log(`   ${String(i + 1).padStart(2)}. ${r.id.padEnd(20)} ${r.wr.toFixed(1).padStart(5)}%  ${bar}${flag}`)
})

const agg = (key, names, label) => {
  console.log(`\n  ── AGREGADO POR ${label} ──`)
  names.map((n) => {
    const fs = fighters.filter((f) => f[key] === n)
    const w = fs.reduce((s, f) => s + wins[f.id], 0), g = fs.reduce((s, f) => s + games[f.id], 0)
    return { n, wr: 100 * w / Math.max(1, g) }
  }).sort((a, b) => b.wr - a.wr).forEach((x) => {
    const lab = key === 'race' ? RACE_LABEL[x.n] : CLASS_LABEL[x.n]
    const flag = x.wr >= 56 || x.wr <= 44 ? '  ⚠️' : ''
    console.log(`   ${lab.padEnd(10)} ${x.wr.toFixed(1).padStart(5)}%${flag}`)
  })
}
agg('race', RACE_NAMES, 'RAÇA (média das 4 classes)')
agg('klass', CLASS_NAMES, 'CLASSE (média das 4 raças)')

// spread = max-min win% (medida de desequilíbrio)
const spread = ranked[0].wr - ranked[ranked.length - 1].wr
console.log(`\n  ➤ SPREAD (melhor − pior lutador): ${spread.toFixed(1)} pts   ${spread <= 16 ? '✅ aceitável' : '⚠️ desequilibrado'}`)

if (DIAG) {
  console.log(`\n  ── FICHA + CONTRIBUIÇÃO DO GEAR (nv ${LEVEL}) ──`)
  fighters.forEach((f) => {
    const main = f.klass === 'warrior' ? ['str', f.baseStr, f.gear.str] : f.klass === 'mage' ? ['int', f.baseInt, f.gear.int] : ['agi', f.baseAgi, f.gear.agi]
    const [mk, mb, mg] = main
    const ratio = mb + mg > 0 ? (100 * mg / (mb + mg)).toFixed(0) : '0'
    console.log(`   ${f.id.padEnd(20)} STR:${String(f.str).padStart(3)} AGI:${String(f.agi).padStart(3)} INT:${String(f.int).padStart(3)} DEF:${String(f.def).padStart(3)} HP:${String(f.maxHp).padStart(4)} | ${mk} base ${String(mb).padStart(3)} + gear ${String(mg).padStart(3)} = gear ${ratio}%`)
  })
}
console.log(`\n${'='.repeat(82)}\n`)
