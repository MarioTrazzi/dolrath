#!/usr/bin/env node
// ============================================================
// DOLRATH — Simulador de balanceamento PvP
// ⚠️ HISTÓRICO (auditoria 2026-07-05): modela o ruleset ANTIGO por stats.
// O PvP AO VIVO usa o modelo de LEVERS (combatModel via socket-server) —
// o sim fiel à produção é scripts/pvp-lever-sim.js. Mantido como referência
// da progressão distribute-points/arquétipos.
//
// Uso:
//   node scripts/pvp-balance-sim.js            # regras atuais (baseline)
//   node scripts/pvp-balance-sim.js --patched  # regras propostas
//   node scripts/pvp-balance-sim.js --fights 5000 --levels 1,10,30,50
// ============================================================

const args = process.argv.slice(2)
const PATCHED = args.includes('--patched')
const FIGHTS = Number((args.find(a => a.startsWith('--fights')) || '').split('=')[1]) || 2000
const LEVELS = ((args.find(a => a.startsWith('--levels')) || '').split('=')[1] || '1,10,20,30,50')
  .split(',').map(Number)

const rnd = (n) => 1 + Math.floor(Math.random() * n)

// 🔧 Knobs do patch (ajustados iterativamente via simulação)
const K = {
  lightAgi: 1.7,      // leve: 2×d6 + AGI×1.4 + STR×0.3
  heavyStr: 1.8,      // pesado: 2×d10 + STR×1.8 (STR só gera dano; AGI dá crit+esquiva)
  specInt: 1.5,       // especial: 2×d20 + INT×1.7 (ignora DEF, só RES resiste)
  resFromDef: 0.8,    // RES = DEF×0.8 (constituição resiste magia)
  defendRed: 0.45,     // defender: toma 40% do dano pós-mitigação
  agiNetDiv: 5,       // esquiva: bônus líquido = (AGIdef−AGIatt)/5 ...
  agiNetCap: 3,       // ... capado em ±2; empate favorece o ATACANTE
  mpPerInt: 4,        // MP = 60 + INT×4 (mago sustenta a luta)
  hpLevel: 6,         // HP = 100 + nível×6 + STR + DEF×4
  staminaRegen: 2,    // +2 stamina no início de cada turno próprio
  critBase: 5,        // todo mundo tem 5% de crítico (drama p/ todos)
  critCap: 40, critPer: 1.2, critMult: 1.5,
  defEff: 1.0,        // DEF mitiga dano físico ×1.0
  heavyPierce: 0.3,   // golpe pesado ignora 30% da DEF (quebra-armadura)
  minDmgPct: 0.15,    // dano mínimo = 15% do dano bruto (ninguém é imortal)
  suddenDeathTurn: 40, // após o turno 40, dano ×1.5 (mata lutas-bunker)
  dodgeBias: 1.3,     // política: esquiva se EV ≤ EV de defender ×1.3 (apostar atrai)
}

// ============================================================
// PROGRESSÃO (espelha distribute-points/route.ts + criação)
// Pontos: 10 na criação + 1 por nível acima do 1
// finalStat = distribuído + floor(bonusRaça/10) + floor(bonusClasse/10)
// ============================================================

const RACES = {
  humano: { strength: 20, dexterity: 20, intelligence: 20, constitution: 20 },
  draconiano: { strength: 30, constitution: 50 },
  metamorfo: { dexterity: 50, constitution: 30 }, // wisdom→constitution (servidor ignora wisdom)
  elfo: { intelligence: 40, dexterity: 30, constitution: 20 }, // idem
}
const CLASSES = {
  warrior: { strength: 40, constitution: 30 },
  rogue: { dexterity: 40, intelligence: 20 },
  mage: { intelligence: 50 },
  monk: { dexterity: 30, constitution: 20 },
}

function buildCharacter(name, race, klass, level, distribute) {
  const points = 10 + Math.max(0, level - 1)
  const d = distribute(points) // { str, agi, int, def }

  const rb = RACES[race] || {}
  const cb = CLASSES[klass] || {}
  const bonus = (k) => Math.floor((rb[k] || 0) / 10) + Math.floor((cb[k] || 0) / 10)

  const str = d.str + bonus('strength')
  const agi = d.agi + bonus('dexterity')
  const int = d.int + bonus('intelligence')
  const def = d.def + bonus('constitution')

  let maxHp, maxMp, maxStamina, resistance
  if (PATCHED) {
    // 🔧 PATCH: HP com base de nível (todo arquétipo escala) + STR leve + DEF forte;
    // RES (resistência mágica) deriva de DEF — constituição protege de tudo
    maxHp = 100 + level * K.hpLevel + Math.floor(str * 0.5) + def * 4
    maxMp = 60 + int * K.mpPerInt + agi * 1
    maxStamina = 120 + agi * 2 + def * 2 // DEF também sustenta o fôlego (tanks aguentam)
    resistance = Math.floor(def * K.resFromDef)
  } else {
    // Regras atuais (distribute-points/route.ts)
    maxHp = 80 + str * 2 + def * 4
    maxMp = 60 + int * 3 + agi * 1
    maxStamina = 120 + agi * 3
    // BUG atual: baseStats.res é apagado na distribuição → combate usa fallback 10
    resistance = 10
  }

  return {
    name, level, str, agi, int, def,
    attack: str,        // combat page: attack = baseStats.str
    defense: def,       // combat page: defense = baseStats.def
    resistance,
    maxHp, hp: maxHp,
    maxMp, mp: maxMp,
    maxStamina, stamina: maxStamina,
  }
}

// ============================================================
// COMBATE (espelha socket-server.js)
// ============================================================

const STAMINA_COST = { light_attack: 1, heavy_attack: 2, special_attack: 4, dodge: 1, defend: 3 }
const DICE = { light_attack: 6, heavy_attack: 10, special_attack: 20 }
const MP_COST = { light_attack: 0, heavy_attack: 0, special_attack: 15 }

function calculateDamage(attacker, diceRoll, actionType, isCritical) {
  let base
  if (PATCHED) {
    // 🔧 PATCH: dado conta ×2 (variância visível mesmo no late game) e cada
    // golpe escala com UM atributo: leve→AGI, pesado→STR, especial→INT
    if (actionType === 'special_attack') {
      base = diceRoll * 2 + Math.floor(attacker.int * K.specInt)
    } else if (actionType === 'light_attack') {
      base = diceRoll * 2 + Math.floor(attacker.agi * K.lightAgi) + Math.floor(attacker.str * 0.3)
    } else {
      base = diceRoll * 2 + Math.floor(attacker.str * K.heavyStr)
    }
    if (isCritical) base = Math.floor(base * K.critMult)
  } else {
    if (actionType === 'special_attack') {
      base = diceRoll + attacker.attack + attacker.int // = dado + STR + INT
    } else {
      base = diceRoll + attacker.attack + Math.floor(attacker.str / 2)
    }
    if (isCritical) base = Math.floor(base * 1.5)
  }
  return Math.max(1, base)
}

function criticalChance(attacker) {
  if (PATCHED) return Math.min(K.critCap, K.critBase + attacker.agi * K.critPer)
  return Math.min(50, attacker.agi * 2)
}

// 🔧 PATCH: esquiva é um CONTESTE com o dado que o defensor já rola na UI
// (mesmo dado do ataque), com bônus líquido de AGI capado em ±K.agiNetCap.
// Empate favorece o ATACANTE (esquivar é apostado, defender é garantido).
function netAgiBonus(attacker, defender, diceSides) {
  const cap = Math.min(K.agiNetCap, Math.floor(diceSides / 5)) // d6→±1, d10→±2, d20→±3
  return Math.max(-cap, Math.min(cap, Math.floor((defender.agi - attacker.agi) / K.agiNetDiv)))
}
function dodgeContestPatched(attackRoll, defenseRoll, attacker, defender, diceSides) {
  return defenseRoll + netAgiBonus(attacker, defender, diceSides) > attackRoll
}

function dodgeRollPhysicalBaseline(defender) {
  const extra = Math.floor(defender.agi / 10)
  let total = rnd(6)
  for (let i = 0; i < extra; i++) total += rnd(6)
  return total
}


function calculateDefense(defender, damage, actionType) {
  if (PATCHED) {
    // 🔧 PATCH: magia atravessa armadura — especial é mitigado só por RES;
    // físico é mitigado por DEF (triângulo: mago fura tank, tank segura físico)
    let mitigation
    if (actionType === 'special_attack') {
      mitigation = defender.resistance
    } else {
      const defMult = actionType === 'heavy_attack' ? K.defEff * (1 - K.heavyPierce) : K.defEff
      mitigation = Math.floor(defender.defense * defMult)
    }
    return Math.max(Math.ceil(damage * K.minDmgPct), damage - mitigation)
  }
  let defense = defender.defense
  if (actionType === 'special_attack') {
    defense += Math.floor(defender.resistance / 2)
  }
  return Math.max(1, damage - defense)
}

// P(defRoll + net > attRoll) com dados iguais de n lados
function probDodge(n, net) {
  let wins = 0
  for (let d = 1; d <= n; d++) wins += Math.min(n, Math.max(0, d + net - 1))
  return wins / (n * n)
}

// ============================================================
// POLÍTICAS DE JOGO (IA dos lutadores)
// ============================================================

function chooseAttack(me) {
  if (PATCHED) {
    // Escolhe o golpe de maior dano esperado que consegue pagar
    const options = []
    if (me.mp >= MP_COST.special_attack && me.stamina >= STAMINA_COST.special_attack) {
      options.push(['special_attack', 21 + me.int * K.specInt])
    }
    if (me.stamina >= STAMINA_COST.heavy_attack) {
      options.push(['heavy_attack', 11 + me.str * K.heavyStr])
    }
    if (me.stamina >= STAMINA_COST.light_attack) {
      options.push(['light_attack', 7 + me.agi * K.lightAgi + me.str * 0.3])
    }
    if (!options.length) return null
    options.sort((x, y) => y[1] - x[1])
    return options[0][0]
  }
  // Baseline: mago especial sempre que possível; senão heavy > light
  if (me.int > me.str && me.mp >= MP_COST.special_attack && me.stamina >= STAMINA_COST.special_attack) {
    return 'special_attack'
  }
  if (me.stamina >= STAMINA_COST.heavy_attack) return 'heavy_attack'
  if (me.stamina >= STAMINA_COST.light_attack) return 'light_attack'
  return null // sem stamina para atacar
}

function chooseDefense(me, attacker, action, baseDamage) {
  if (PATCHED) {
    // Escolha racional: menor dano esperado entre esquivar e defender
    const canDodge = me.stamina >= STAMINA_COST.dodge
    const canDefend = me.stamina >= STAMINA_COST.defend
    if (!canDodge && !canDefend) return 'none' // exausto: toma o golpe mitigado
    const mitigated = calculateDefense(me, baseDamage, action)
    const p = probDodge(DICE[action], netAgiBonus(attacker, me, DICE[action]))
    const evDodge = (1 - p) * mitigated
    const evDefend = mitigated * K.defendRed
    // Esquivar (negar tudo) atrai mesmo com EV um pouco pior — e injeta variância
    if (canDodge && (!canDefend || evDodge <= evDefend * K.dodgeBias)) return 'dodge'
    return 'defend'
  }
  // Baseline: AGI alta prefere esquiva; senão defende se puder
  if (me.agi >= 15 && me.stamina >= STAMINA_COST.dodge) return 'dodge'
  if (me.stamina >= STAMINA_COST.defend) return 'defend'
  if (me.stamina >= STAMINA_COST.dodge) return 'dodge'
  return 'none' // SOFT-LOCK nas regras atuais (sem opção na UI)
}

// ============================================================
// LUTA
// ============================================================

function fight(c1, c2, stats) {
  const a = { ...c1 }
  const b = { ...c2 }
  // Iniciativa d20 (empate: moeda)
  let att, defn
  const i1 = rnd(20), i2 = rnd(20)
  if (i1 > i2 || (i1 === i2 && Math.random() < 0.5)) { att = a; defn = b } else { att = b; defn = a }

  let turns = 0
  const MAX_TURNS = 200

  while (a.hp > 0 && b.hp > 0 && turns < MAX_TURNS) {
    turns++
    // 🔧 PATCH: regen de stamina no início do turno do atacante
    if (PATCHED) att.stamina = Math.min(att.maxStamina, att.stamina + K.staminaRegen)

    const action = chooseAttack(att)
    if (!action) {
      // atacante sem stamina: passa o turno (luta trava de fato)
      stats.starvedTurns++
      ;[att, defn] = [defn, att]
      continue
    }
    att.stamina -= STAMINA_COST[action]
    att.mp -= MP_COST[action]

    const attackRoll = rnd(DICE[action])
    const isCrit = Math.random() * 100 < criticalChance(att)
    if (isCrit) stats.crits++
    const baseDamage = calculateDamage(att, attackRoll, action, isCrit)

    const reaction = chooseDefense(defn, att, action, baseDamage)
    let damage = 0
    if (reaction === 'none') {
      stats.softlocks++
      damage = calculateDefense(defn, baseDamage, action) // toma cheio (exausto)
    } else {
      defn.stamina -= STAMINA_COST[reaction]
      if (reaction === 'dodge') {
        stats.dodgeAttempts++
        let dodged
        if (PATCHED) {
          // Conteste com o MESMO dado do ataque (o que a UI já rola), AGI líquida ±3
          const defenseRoll = rnd(DICE[action])
          dodged = dodgeContestPatched(attackRoll, defenseRoll, att, defn, DICE[action])
        } else if (action === 'special_attack') {
          const defRoll = rnd(20) + Math.floor(defn.agi / 10)
          dodged = defRoll >= attackRoll
        } else {
          dodged = dodgeRollPhysicalBaseline(defn) >= attackRoll
        }
        if (dodged) { stats.dodges++; damage = 0 } else { damage = calculateDefense(defn, baseDamage, action) }
      } else {
        const red = PATCHED ? K.defendRed : 0.5
        damage = Math.floor(calculateDefense(defn, baseDamage, action) * red)
      }
    }
    if (process.env.DEBUG_FIGHT) {
      console.log(`    t${turns} ${att.name}(${att.hp}hp,${att.stamina}sta,${att.mp}mp) ${action}[${attackRoll}]${isCrit ? ' CRIT' : ''} → ${defn.name} ${reaction} → dano ${damage} (${defn.name} ${defn.hp - damage}hp)`)
    }

    if (PATCHED && turns > K.suddenDeathTurn) {
      damage = Math.floor(damage * (turns > K.suddenDeathTurn * 1.5 ? 2 : 1.5))
    }
    if (damage > 0) {
      defn.hp -= damage
      stats.totalDamage += damage
      stats.hits++
    }
    ;[att, defn] = [defn, att]
  }

  stats.turns += turns
  if (turns >= MAX_TURNS) { stats.timeouts++; return null }
  return a.hp > 0 ? c1.name : c2.name
}

// ============================================================
// BATERIA
// ============================================================

const ARCHETYPES = {
  WARRIOR: { race: 'humano', klass: 'warrior', dist: (p) => ({ str: p, agi: 0, int: 0, def: 0 }) },
  MAGE: { race: 'elfo', klass: 'mage', dist: (p) => ({ str: 0, agi: 0, int: p, def: 0 }) },
  ASSASSIN: { race: 'metamorfo', klass: 'rogue', dist: (p) => ({ str: Math.floor(p * 0.3), agi: Math.ceil(p * 0.7), int: 0, def: 0 }) },
  TANK: { race: 'draconiano', klass: 'warrior', dist: (p) => ({ str: Math.floor(p * 0.3), agi: 0, int: 0, def: Math.ceil(p * 0.7) }) },
  BRUISER: { race: 'humano', klass: 'monk', dist: (p) => ({ str: Math.ceil(p * 0.4), agi: Math.floor(p * 0.2), int: 0, def: Math.floor(p * 0.4) }) },
}

function pct(x, n) { return ((100 * x) / n).toFixed(1).padStart(5) }

console.log(`\n${'='.repeat(78)}`)
console.log(`  DOLRATH PvP BALANCE — ${PATCHED ? '🔧 REGRAS PROPOSTAS (--patched)' : '📊 REGRAS ATUAIS (baseline)'}  |  ${FIGHTS} lutas/par`)
console.log('='.repeat(78))

const names = Object.keys(ARCHETYPES)
for (const level of LEVELS) {
  const chars = {}
  for (const n of names) {
    const A = ARCHETYPES[n]
    chars[n] = buildCharacter(n, A.race, A.klass, level, A.dist)
  }

  console.log(`\n─── NÍVEL ${level} ${'─'.repeat(64 - String(level).length)}`)
  for (const n of names) {
    const c = chars[n]
    console.log(
      `  ${n.padEnd(8)} STR:${String(c.str).padStart(3)} AGI:${String(c.agi).padStart(3)} INT:${String(c.int).padStart(3)} DEF:${String(c.def).padStart(3)}` +
      ` | HP:${String(c.maxHp).padStart(4)} MP:${String(c.maxMp).padStart(3)} STA:${String(c.maxStamina).padStart(3)} RES:${c.resistance}`
    )
  }

  console.log(`\n  ${'win% (linha vs coluna)'.padEnd(10)}${names.map(n => n.slice(0, 7).padStart(9)).join('')}   turnos  dodge%  softlock/luta`)
  for (const rowName of names) {
    const cells = []
    let rowTurns = 0, rowDodgeA = 0, rowDodgeS = 0, rowSoft = 0, rowFights = 0
    for (const colName of names) {
      if (rowName === colName) { cells.push('   —  '.padStart(9)); continue }
      const stats = { turns: 0, dodges: 0, dodgeAttempts: 0, crits: 0, hits: 0, totalDamage: 0, softlocks: 0, starvedTurns: 0, timeouts: 0 }
      let wins = 0
      for (let i = 0; i < FIGHTS; i++) {
        const w = fight(chars[rowName], chars[colName], stats)
        if (w === rowName) wins++
      }
      cells.push(pct(wins, FIGHTS).padStart(8) + '%')
      rowTurns += stats.turns / FIGHTS
      rowDodgeA += stats.dodgeAttempts; rowDodgeS += stats.dodges
      rowSoft += stats.softlocks / FIGHTS
      rowFights++
    }
    const avgTurns = (rowTurns / rowFights).toFixed(1).padStart(6)
    const dodgePct = rowDodgeA ? ((100 * rowDodgeS) / rowDodgeA).toFixed(0).padStart(5) : '    —'
    const soft = (rowSoft / rowFights).toFixed(1).padStart(8)
    console.log(`  ${rowName.padEnd(10)}${cells.join('')}  ${avgTurns}  ${dodgePct}%  ${soft}`)
  }
}

console.log(`\n${'='.repeat(78)}\n`)
