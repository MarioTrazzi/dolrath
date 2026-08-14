#!/usr/bin/env node
// ============================================================
// DOLRATH — BALANCE DO PvP POR FAIXA DE JOGO (iniciante / intermediário / late)
//
// Por que mais um sim: o `pvp-lever-sim.js` mede CLASSE×FORMA num nível só e modela a
// defesa por REAÇÃO (dodge/block gastando stamina) — que o PvP ao vivo não usa mais: o
// socket resolve tudo em `defenseAction: 'passive'`. E, mais importante, nenhum sim
// cobrava a STAMINA DOS GOLPES. Desde que a stamina da luta virou o saldo REAL do banco
// (ver /api/battle/fighter-state), o COMPRIMENTO da luta virou questão econômica: é ele
// que decide quanto o jogador paga e quanto o pool paga de volta aos dois lados.
//
// 🔒 Sem espelho: este arquivo REQUER `server/combatModel.js`, o mesmo módulo que o
// socket usa em produção. Só `PVP_CLASS_ADJ` é copiado (vive dentro do socket-server,
// que não dá para importar sem subir um servidor) — mudou lá, mude aqui.
//
// Uso:
//   npm run sim:pvp-bands                       # as 3 faixas, ajuste atual
//   npm run sim:pvp-bands -- --fights=8000
//   npm run sim:pvp-bands -- --bands=iniciante,late
//   npm run sim:pvp-bands -- --neutral          # jogo cru, sem ajuste de classe
//   npm run sim:pvp-bands -- --tune --identity --band=late   # acha o ótimo de UMA faixa
//
// Cenários (o jogador real não é um só — uns já têm forma e gear com HP, outros não):
//   TRANSFORM=0 GEAR_HP_PER_LVL=0 npm run sim:pvp-bands      # "nu"
// O ajuste em produção é tunado na MÉDIA dos dois; conferir os dois antes de mexer.
//
// ⚠️ Interface por JSON/flag de propósito: passar nove `CADJ_*` por variável de ambiente
// é frágil (no zsh, `env $VAR` não faz word-splitting e as nove viram UMA — o resto vira
// NaN e a classe luta com HP NaN, ganhando ou perdendo 100% em silêncio). Há uma guarda
// dura contra NaN logo abaixo.
// ============================================================

const CM = require('../server/combatModel')

const args = process.argv.slice(2)
const getArg = (n, d) => {
  const a = args.find((x) => x === `--${n}` || x.startsWith(`--${n}=`))
  if (!a) return d
  return a.includes('=') ? a.split('=').slice(1).join('=') : true
}
const FIGHTS = Number(getArg('fights', 4000))
const SEED = Number(getArg('seed', 12345))
const TRANSFORM_ON = process.env.TRANSFORM !== '0'

// RNG seedável (mulberry32) — mesmo padrão dos outros sims do repo.
let _s = SEED >>> 0
function rng() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ⚠️ ESPELHO de server/socket-server.js (PVP_CLASS_ADJ_CURVE). Ajuste fino só-PvP, e uma
// CURVA por nível: o desequilíbrio escala com o nível e inverte de sinal, então constante
// não resolve (ver o comentário longo no socket). Mudou lá, mude aqui.
const PVP_ADJ_LEVELS = [1, 22, 50]
const PVP_CLASS_ADJ_CURVE = {
  warrior: { power: [1.00, 1.00, 1.00], armor: [1.00, 1.00, 1.00], hp: [1.01, 1.14, 1.25] },
  rogue:   { power: [1.07, 0.97, 0.91], armor: [1.00, 1.00, 1.00], hp: [1.00, 1.00, 1.00] },
  mage:    { power: [1.18, 1.06, 1.07], armor: [1.00, 1.00, 1.00], hp: [1.00, 1.00, 1.00] },
  monk:    { power: [0.92, 0.94, 0.95], armor: [1.00, 1.00, 1.00], hp: [0.92, 0.94, 0.95] },
}
function pvpAdjAt(cls, knob, level) {
  const curve = PVP_CLASS_ADJ_CURVE[cls]
  if (!curve) return 1
  const pts = curve[knob]
  const L = Math.max(1, Number(level) || 1)
  if (L <= PVP_ADJ_LEVELS[0]) return pts[0]
  for (let i = 1; i < PVP_ADJ_LEVELS.length; i++) {
    if (L <= PVP_ADJ_LEVELS[i]) {
      const t = (L - PVP_ADJ_LEVELS[i - 1]) / (PVP_ADJ_LEVELS[i] - PVP_ADJ_LEVELS[i - 1])
      return pts[i - 1] + (pts[i] - pts[i - 1]) * t
    }
  }
  return pts[pts.length - 1]
}
/**
 * Override PLANO (independente de nível). É o que `--neutral`, `--adj` e o tuner movem:
 * o tuner procura o ótimo de UMA faixa por vez, e é justamente comparando esses ótimos
 * que se descobre que a curva é necessária. `null` = usa a curva.
 */
const CLASSES_ALL = ['warrior', 'rogue', 'mage', 'monk']
let FLAT_OVERRIDE = null

/** Visão "achatada" no nível pedido — é o que o tuner move e o que a guarda valida. */
function adjAtLevel(level) {
  if (FLAT_OVERRIDE) return FLAT_OVERRIDE
  const out = {}
  for (const c of Object.keys(PVP_CLASS_ADJ_CURVE)) {
    out[c] = { power: pvpAdjAt(c, 'power', level), armor: pvpAdjAt(c, 'armor', level), hp: pvpAdjAt(c, 'hp', level) }
  }
  return out
}
// PVP_CLASS_ADJ passa a ser um SNAPSHOT por nível, recomputado em makeFighter.
let PVP_CLASS_ADJ = adjAtLevel(50)
function pvpAdjust(lev, cls) {
  const a = PVP_CLASS_ADJ[cls]
  if (!a) return lev
  return { ...lev, power: lev.power * a.power, armor: lev.armor * a.armor, hp: lev.hp * a.hp }
}

// 🔬 Sondas estruturais: `ATTR_TILT` é exportado por referência, então dá para varrer o
// peso de AGI→esquiva (e o teto) sem editar o módulo. É o termo que ESCALA COM O NÍVEL —
// e por isso o que um multiplicador fixo por classe não consegue consertar.
if (process.env.EVADE_TILT !== undefined) CM.ATTR_TILT.evade = Number(process.env.EVADE_TILT)
if (process.env.EVADE_CAP !== undefined) CM.ATTR_TILT.evadeCap = Number(process.env.EVADE_CAP)
if (process.env.ARMOR_TILT !== undefined) CM.ATTR_TILT.armor = Number(process.env.ARMOR_TILT)
// Comprime a ESQUIVA BASE das classes na direção da média (1 = como está hoje, 0 = todas
// iguais). É o termo dominante: no nv3 a base (0.05 do Guerreiro vs 0.30 do Ladino) já
// vale muito mais que o tilt de AGI.
if (process.env.EVADE_COMPRESS !== undefined) {
  const k = Number(process.env.EVADE_COMPRESS)
  const vals = Object.values(CM.PROFILE).map((p) => p.evade)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  for (const c of Object.keys(CM.PROFILE)) {
    CM.PROFILE[c].evade = Number((mean + (CM.PROFILE[c].evade - mean) * k).toFixed(4))
  }
}

const CLASSES = ['warrior', 'rogue', 'mage', 'monk']
const CLASS_PT = { warrior: 'Guerreiro', rogue: 'Ladino', mage: 'Mago', monk: 'Monge' }

// Distribuição de pontos por arquétipo + bônus de raça/classe (espelha o attrsOf do
// pvp-lever-sim, que por sua vez espelha a criação: 18 pts no nv1 + 1 por nível).
const CLASS_BUILD = {
  warrior: { str: 0.7, def: 0.3 }, rogue: { agi: 0.85, def: 0.15 },
  mage: { int: 0.85, def: 0.15 }, monk: { agi: 0.55, def: 0.45 },
}
const CLASS_BONUS = { warrior: { strength: 40, constitution: 30 }, rogue: { dexterity: 40, intelligence: 20 }, mage: { intelligence: 50 }, monk: { dexterity: 40, constitution: 40 } }
const RACE_BONUS = { humano: { strength: 20, dexterity: 20, intelligence: 20, constitution: 20 } }

function attrsOf(cls, level, race = 'humano') {
  const pts = 18 + Math.max(0, level - 1)
  const w = CLASS_BUILD[cls]
  const d = { str: 0, agi: 0, int: 0, def: 0 }
  const keys = Object.keys(w)
  let used = 0
  keys.forEach((k, i) => { const v = i === keys.length - 1 ? pts - used : Math.round(pts * w[k]); d[k] = v; used += v })
  const rb = RACE_BONUS[race] || {}, cb = CLASS_BONUS[cls] || {}
  const bon = (k) => Math.floor((rb[k] || 0) / 10) + Math.floor((cb[k] || 0) / 10)
  // Piso 8 em str/agi/int (ver dolrath-stat-floor-class-power).
  return {
    str: Math.max(8, d.str + bon('strength')),
    agi: Math.max(8, d.agi + bon('dexterity')),
    int: Math.max(8, d.int + bon('intelligence')),
    def: d.def + bon('constitution'),
  }
}

// src/lib/combatFormulas.ts — computeDerivedStats
const derived = (a, level) => ({
  maxHp: 100 + level * 6 + Math.floor(a.str * 0.5) + a.def * 4,
  maxMp: 60 + a.int * 4 + a.agi,
  maxStamina: 120 + a.agi * 2 + a.def * 2,
})

// ⚔️ Kit ao vivo (server/combatModel ATTACKS + PVE_DIE + árvore de habilidades).
// `classAttack` só existe com o nó comprado — o iniciante NÃO tem.
const KIT = {
  basic:   { sta: CM.ATTACKS.basic.stamina,   mp: CM.ATTACKS.basic.mp,   die: CM.PVE_DIE.basic,   mult: CM.ATTACKS.basic.powerMult },
  weapon:  { sta: CM.ATTACKS.weapon.stamina,  mp: CM.ATTACKS.weapon.mp,  die: CM.PVE_DIE.weapon,  mult: CM.ATTACKS.weapon.powerMult },
  special: { sta: CM.ATTACKS.special.stamina, mp: CM.ATTACKS.special.mp, die: CM.PVE_DIE.special, mult: CM.ATTACKS.special.powerMult },
}
const TURN_STA_REGEN = 2 // regenTurnStamina
const TURN_MP_REGEN = 3
const TRANSFORM_MP = 10       // reducedMpCost (não-dragão)
const TRANSFORM_STA = 3       // floor(staminaCost * 0.3) com custo base 10
const TRANSFORM_TURNS = 4

/** Faixas de jogo. gearTier 0..1 (deriveGearTier), classAttack = nó da árvore comprado. */
const BANDS = {
  iniciante:     { level: 3,  gear: 0.05, classAttack: false, transform: false, gearHpPerLvl: 0 },
  intermediario: { level: 22, gear: 0.50, classAttack: true,  transform: true,  gearHpPerLvl: 6 },
  late:          { level: 50, gear: 0.95, classAttack: true,  transform: true,  gearHpPerLvl: 14 },
}
// Overrides para REPRODUZIR o cenário do harness de lutas reais (sem transformação, sem
// HP de gear). Serve para checar a fidelidade do sim contra o servidor de verdade antes
// de confiar nele no cenário rico (que é o de produção).
if (process.env.GEAR_HP_PER_LVL !== undefined) {
  for (const b of Object.values(BANDS)) b.gearHpPerLvl = Number(process.env.GEAR_HP_PER_LVL)
}
if (process.env.GEAR_TIER !== undefined) {
  for (const b of Object.values(BANDS)) b.gear = Number(process.env.GEAR_TIER)
}

function makeFighter(cls, band) {
  // A curva é resolvida no NÍVEL desta faixa antes de montar os levers.
  PVP_CLASS_ADJ = adjAtLevel(band.level)
  const a = attrsOf(cls, band.level)
  const d = derived(a, band.level)
  const levers = pvpAdjust(CM.computeLevers(cls, band.level, band.gear, a), cls)
  // Pool da luta = ficha + HP do gear (fightHpPool), × o fator de classe do PvP.
  // ⚠️ `levers.hp` NÃO entra: o socket calcula e nunca lê (a barra sai do fightHpPool).
  // É por isso que o `hp` do PVP_CLASS_ADJ era um botão morto até agora.
  const gearHp = Math.round(band.gearHpPerLvl * band.level)
  const hpMult = PVP_CLASS_ADJ[cls]?.hp ?? 1
  return {
    cls, levers, baseLevers: levers,
    maxHp: Math.round((d.maxHp + gearHp) * hpMult), maxMp: d.maxMp, maxStamina: d.maxStamina,
    hasClassAttack: band.classAttack,
    canTransform: band.transform && TRANSFORM_ON,
  }
}

function fresh(f, entryStamina) {
  return {
    ...f, hp: f.maxHp, mp: f.maxMp,
    // 🔑 A stamina da luta é o SALDO do banco (fighter-state), não o maxStamina.
    stamina: entryStamina, fightSpent: 0,
    transformed: false, usedTransform: false, transformTurns: 0,
    levers: f.baseLevers,
  }
}

/** Melhor golpe que o lutador PODE pagar agora (jogada racional). */
function pickAttack(c) {
  if (c.transformed && c.stamina >= KIT.special.sta && c.mp >= KIT.special.mp) return 'special'
  if (c.hasClassAttack && c.stamina >= KIT.weapon.sta && c.mp >= KIT.weapon.mp) return 'weapon'
  if (c.stamina >= KIT.basic.sta) return 'basic'
  return null // não paga nem o Golpe: passa o turno (o regen do turno seguinte destrava)
}

function startTurn(c) {
  c.stamina = Math.min(c.maxStamina, c.stamina + TURN_STA_REGEN)
  c.mp = Math.min(c.maxMp, c.mp + TURN_MP_REGEN)
  if (c.transformed) {
    c.transformTurns--
    if (c.transformTurns <= 0) { c.transformed = false; c.levers = c.baseLevers }
  }
}

const MAX_ACTIONS = 200 // trava de segurança; lutas reais acabam MUITO antes

function runFight(fa, fb, entryA, entryB) {
  const a = fresh(fa, entryA), b = fresh(fb, entryB)
  let actor = rng() < 0.5 ? a : b
  let other = actor === a ? b : a
  let actions = 0, stalls = 0

  while (a.hp > 0 && b.hp > 0 && actions < MAX_ACTIONS) {
    startTurn(actor)

    // Transformação: 1× por luta, assim que der (não gasta o turno).
    if (actor.canTransform && !actor.usedTransform && actor.mp >= TRANSFORM_MP + KIT.special.mp && actor.stamina >= TRANSFORM_STA) {
      actor.usedTransform = true
      actor.transformed = true
      actor.transformTurns = TRANSFORM_TURNS
      actor.mp -= TRANSFORM_MP
      actor.stamina -= TRANSFORM_STA
      actor.fightSpent += TRANSFORM_STA
      actor.levers = CM.transformLevers(actor.baseLevers)
    }

    const kind = pickAttack(actor)
    if (!kind) {
      stalls++
      ;[actor, other] = [other, actor]
      continue
    }
    const k = KIT[kind]
    actor.stamina -= k.sta
    actor.fightSpent += k.sta
    actor.mp -= k.mp
    actions++

    // 🎯 Motor REAL: resolveHit em modo passivo (o socket resolve tudo assim).
    // ⚠️ NÃO multiplicar por CRIT_MULT aqui: `luckOf` JÁ o aplica na rolagem máxima
    // (combatModel.js:168), e o socket também não reaplica — só o `critBonusMult` da
    // árvore, que é 1 por padrão. Multiplicar de novo inflava o dano de quem rola dados
    // PEQUENOS, porque crítico é `roll >= sides`: d6 crita 1/6, d20 só 1/20.
    const res = CM.resolveHit(
      { power: actor.levers.power * k.mult },
      { armor: other.levers.armor, K: other.levers.K, evade: other.levers.evade, block: other.levers.block },
      { rng, sides: k.die }
    )
    let dmg = res.damage
    // ⚔️ Morte súbita (socket-server): >40 ações ×1.5, >60 ×2 — mata empate-bunker.
    if (actions > 60) dmg = Math.floor(dmg * 2)
    else if (actions > 40) dmg = Math.floor(dmg * 1.5)

    other.hp -= dmg
    ;[actor, other] = [other, actor]
  }

  const capped = actions >= MAX_ACTIONS
  const winner = a.hp > 0 && b.hp <= 0 ? 'a' : b.hp > 0 && a.hp <= 0 ? 'b' : (a.hp >= b.hp ? 'a' : 'b')
  return { winner, actions, stalls, capped, spentA: a.fightSpent, spentB: b.fightSpent }
}

// ============================================================
// Espelhos de src/lib/pvpRewards.ts (o sim é JS puro e não importa TS).
const PVP_FIGHTS_PER_DAY = 10
const DAILY_STAMINA_BUDGET = 2 * 96 // +2 a cada 15 min = 192⚡/dia (STAMINA_REGEN)
const PVP_FIGHT_STAMINA = Math.floor(DAILY_STAMINA_BUDGET / PVP_FIGHTS_PER_DAY) // 19⚡
const PVP_GOLD_PER_STA = 31
const PVP_WIN_SHARE = 0.70

const bandsWanted = String(getArg('bands', 'iniciante,intermediario,late')).split(',')

// Overrides do tuner (CADJ_<classe>_pw / _ar / _hp), no padrão do pvp-lever-sim.
// `--neutral` zera TODOS os ajustes (mede o jogo cru) e `--adj='<json>'` injeta um
// conjunto inteiro de uma vez — os dois existem porque passar nove variáveis de ambiente
// pelo shell é um convite a erro silencioso (no zsh, `env $VAR` não faz word-splitting:
// as nove viram UMA só, o resto vira NaN e a classe luta com HP NaN sem avisar).
{
  const envHit = CLASSES_ALL.some((c) => ['pw', 'ar', 'hp'].some((k) => process.env[`CADJ_${c}_${k}`] !== undefined))
  const wantNeutral = Boolean(getArg('neutral', false))
  const ADJ_JSON = getArg('adj', null)
  if (envHit || wantNeutral || (ADJ_JSON && ADJ_JSON !== true)) {
    const base = wantNeutral
      ? Object.fromEntries(CLASSES_ALL.map((c) => [c, { power: 1, armor: 1, hp: 1 }]))
      : adjAtLevel(50)
    for (const c of CLASSES_ALL) {
      const pw = process.env['CADJ_' + c + '_pw']; if (pw !== undefined) base[c].power = Number(pw)
      const ar = process.env['CADJ_' + c + '_ar']; if (ar !== undefined) base[c].armor = Number(ar)
      const hp = process.env['CADJ_' + c + '_hp']; if (hp !== undefined) base[c].hp = Number(hp)
    }
    if (ADJ_JSON && ADJ_JSON !== true) {
      const inc = JSON.parse(String(ADJ_JSON))
      for (const c in inc) base[c] = { ...base[c], ...inc[c] }
    }
    // 🛡️ Guarda dura: um NaN em qualquer knob envenena os levers e a classe luta com HP
    // NaN, perdendo/ganhando 100% EM SILÊNCIO. Foi exatamente o que aconteceu quando o
    // zsh não fez word-splitting de `env $VAR` e as nove variáveis viraram uma só.
    for (const c of CLASSES_ALL) {
      for (const k of ['power', 'armor', 'hp']) {
        if (!Number.isFinite(base[c][k])) {
          console.error(`❌ ajuste de classe inválido: ${c}.${k} = ${base[c][k]} — abortando.`)
          process.exit(1)
        }
      }
    }
    FLAT_OVERRIDE = base
  }
}

/**
 * 🔧 AUTO-TUNE (--tune): procura PVP_CLASS_ADJ que achate o winrate nas TRÊS faixas ao
 * mesmo tempo. Os knobs vivos do PvP são power/armor/hp; `armor` tem alavanca fraca
 * (o DR é armor/(armor+K), com retorno decrescente), então o passo vai em power e hp,
 * que multiplicam direto o "power × EHP" que decide a luta.
 */
if (getArg('tune', false)) {
  const TUNE_FIGHTS = Number(getArg('tunefights', 700))
  const ITERS = Number(getArg('iters', 60))
  const GAIN = 0.35
  FLAT_OVERRIDE = FLAT_OVERRIDE || adjAtLevel(50)
  // `--band=<nome>` tuna UMA faixa. É assim que se descobre se o problema dá para
  // resolver com constante: se o ótimo de cada faixa for muito diferente, não dá.
  const oneBand = getArg('band', null)
  const tuneBands = oneBand && oneBand !== true ? [String(oneBand)] : ['iniciante', 'intermediario', 'late']

  // 🎭 CENÁRIOS. O jogador real não é um só: uns já desbloquearam a transformação e
  // usam gear com HP, outros não. Tunar só no "kit cheio" deixava ~14pp de spread no
  // cenário nu (foi o que as lutas reais mostraram). O tuner passa a otimizar a MÉDIA
  // dos dois extremos, para o ajuste ser robusto em vez de ótimo num ponto só.
  const SCENARIOS = [
    { name: 'kit cheio', transform: true, gearHpMult: 1 },
    { name: 'nu', transform: false, gearHpMult: 0 },
  ]

  const rateOf = () => {
    const acc = {}
    for (const c of CLASSES) acc[c] = { w: 0, n: 0 }
    for (const sc of SCENARIOS) {
      for (const bn of tuneBands) {
        const raw = BANDS[bn]
        const band = { ...raw, transform: raw.transform && sc.transform, gearHpPerLvl: raw.gearHpPerLvl * sc.gearHpMult }
        const F = {}
        for (const c of CLASSES) F[c] = makeFighter(c, band)
        for (const ca of CLASSES) for (const cb of CLASSES) {
          if (ca === cb) continue
          for (let i = 0; i < TUNE_FIGHTS; i++) {
            const r = runFight(F[ca], F[cb], F[ca].maxStamina, F[cb].maxStamina)
            if (r.winner === 'a') acc[ca].w++; else acc[cb].w++
            acc[ca].n++; acc[cb].n++
          }
        }
      }
    }
    const out = {}
    for (const c of CLASSES) out[c] = acc[c].w / acc[c].n
    return out
  }

  // 🎭 Máscara de IDENTIDADE (--identity): cada classe é consertada pela própria
  // fantasia, não pelo knob que der menos trabalho. Sem isso o tuner "conserta" o Mago
  // dando +17% de HP — numericamente ótimo, mas mata o arquétipo de canhão de vidro.
  //   Guerreiro = tanque  → corrige por HP (encaixa o armor 0.90 que já existe)
  //   Mago      = vidro   → corrige por PODER, HP travado
  //   Ladino    = vidro   → corrige por PODER, HP travado
  //   Monge     = híbrido → os dois
  const IDENTITY = Boolean(getArg('identity', false))
  const KNOB_MASK = IDENTITY
    ? { warrior: { power: false, hp: true }, rogue: { power: true, hp: false },
        mage: { power: true, hp: false }, monk: { power: true, hp: true } }
    : { warrior: { power: true, hp: true }, rogue: { power: true, hp: true },
        mage: { power: true, hp: true }, monk: { power: true, hp: true } }

  console.log(`🔧 auto-tune do PVP_CLASS_ADJ (3 faixas juntas)${IDENTITY ? ' · máscara de IDENTIDADE' : ''}\n`)
  let best = null
  for (let it = 0; it < ITERS; it++) {
    _s = SEED >>> 0 // mesma sequência a cada iteração: compara maçã com maçã
    const r = rateOf()
    const spread = (Math.max(...CLASSES.map((c) => r[c])) - Math.min(...CLASSES.map((c) => r[c]))) * 100
    if (!best || spread < best.spread) {
      best = { spread, adj: JSON.parse(JSON.stringify(FLAT_OVERRIDE)), rates: { ...r } }
    }
    if (it % 10 === 0 || it === ITERS - 1) {
      console.log(`  it${String(it).padStart(3)} spread ${spread.toFixed(1)}pp  ` +
        CLASSES.map((c) => `${CLASS_PT[c].slice(0, 4)} ${(r[c] * 100).toFixed(1)}`).join(' · '))
    }
    if (spread < 3) break
    for (const c of CLASSES) {
      // score ∝ power × EHP; distribuindo o passo em √ nos dois, o score anda por `k`.
      const k = Math.pow(0.5 / Math.max(0.02, r[c]), GAIN)
      const m = KNOB_MASK[c]
      // Com máscara de identidade, o passo inteiro vai para o knob permitido — por isso
      // `k` em vez de `√k` quando só um dos dois se move.
      const both = m.power && m.hp
      if (m.power) FLAT_OVERRIDE[c].power = Math.min(1.6, Math.max(0.6, FLAT_OVERRIDE[c].power * (both ? Math.sqrt(k) : k)))
      if (m.hp) FLAT_OVERRIDE[c].hp = Math.min(1.6, Math.max(0.6, FLAT_OVERRIDE[c].hp * (both ? Math.sqrt(k) : k)))
    }
  }
  console.log(`\n✅ melhor spread ${best.spread.toFixed(1)}pp`)
  console.log('\nconst PVP_CLASS_ADJ = {')
  for (const c of CLASSES) {
    const a = best.adj[c]
    console.log(`  ${(c + ':').padEnd(9)} { power: ${a.power.toFixed(2)}, armor: ${a.armor.toFixed(2)}, hp: ${a.hp.toFixed(2)} },` +
      `   // ${(best.rates[c] * 100).toFixed(1)}%`)
  }
  console.log('}')
  process.exit(0)
}

console.log('='.repeat(78))
console.log('⚔️  BALANCE PvP POR FAIXA — motor ao vivo (server/combatModel.js)')
console.log(`   ${FIGHTS} lutas por matchup · seed ${SEED} · transformação ${TRANSFORM_ON ? 'ON' : 'OFF'}`)
console.log('='.repeat(78))

const summary = []

for (const bandName of bandsWanted) {
  const band = BANDS[bandName]
  if (!band) { console.log(`\n⚠️ faixa desconhecida: ${bandName}`); continue }

  const fighters = {}
  for (const c of CLASSES) fighters[c] = makeFighter(c, band)

  console.log(`\n${'─'.repeat(78)}`)
  console.log(`▶ ${bandName.toUpperCase()}  ·  nível ${band.level} · gearTier ${band.gear} · ` +
    `Ataque de Classe ${band.classAttack ? 'sim' : 'NÃO'} · transformação ${band.transform ? 'sim' : 'NÃO'}`)
  const sample = fighters.warrior
  console.log(`  pools do Guerreiro: HP ${sample.maxHp} · MP ${sample.maxMp} · stamina máx ${sample.maxStamina}`)

  // Entrada com o tanque cheio (o portão exige ≥5; o teto é o maxStamina da ficha).
  const entryOf = (f) => f.maxStamina

  const wins = {}, played = {}
  for (const c of CLASSES) { wins[c] = 0; played[c] = 0 }
  const grid = {}
  let totActions = 0, totFights = 0, totSpent = 0, totStalls = 0
  let totCapped = 0
  let maxSpent = 0, spentSamples = []

  for (const ca of CLASSES) {
    grid[ca] = {}
    for (const cb of CLASSES) {
      if (ca === cb) { grid[ca][cb] = null; continue }
      let w = 0
      for (let i = 0; i < FIGHTS; i++) {
        const r = runFight(fighters[ca], fighters[cb], entryOf(fighters[ca]), entryOf(fighters[cb]))
        if (r.winner === 'a') w++
        totActions += r.actions; totFights++; totStalls += r.stalls
        if (r.capped) totCapped++
        totSpent += r.spentA + r.spentB
        maxSpent = Math.max(maxSpent, r.spentA, r.spentB)
        if (spentSamples.length < 200000) spentSamples.push(r.spentA)
      }
      grid[ca][cb] = w / FIGHTS
      wins[ca] += w; played[ca] += FIGHTS
      wins[cb] += FIGHTS - w; played[cb] += FIGHTS
    }
  }

  // Matriz
  console.log('\n  winrate da LINHA contra a COLUNA')
  console.log('           ' + CLASSES.map((c) => CLASS_PT[c].padStart(10)).join(''))
  for (const ca of CLASSES) {
    const row = CLASSES.map((cb) => (grid[ca][cb] == null ? '—' : `${(grid[ca][cb] * 100).toFixed(1)}%`).padStart(10)).join('')
    console.log(`  ${CLASS_PT[ca].padEnd(9)}${row}`)
  }

  console.log('\n  winrate agregado (espelhos excluídos)')
  const rates = []
  for (const c of CLASSES) {
    const r = wins[c] / played[c]
    rates.push({ c, r })
    const bar = '█'.repeat(Math.round(r * 40))
    console.log(`   ${CLASS_PT[c].padEnd(10)} ${(r * 100).toFixed(1)}%  ${bar}`)
  }
  const lo = Math.min(...rates.map((x) => x.r)), hi = Math.max(...rates.map((x) => x.r))
  const spread = (hi - lo) * 100

  // Economia da luta
  const avgActions = totActions / totFights
  const avgSpentSide = totSpent / (totFights * 2)
  spentSamples.sort((x, y) => x - y)
  const p95 = spentSamples[Math.floor(spentSamples.length * 0.95)] || 0
  // 🎟️ TAXA FIXA: a carteira paga PVP_FIGHT_STAMINA por luta, não a stamina gasta nela.
  // O gasto por lado abaixo é a barra DA LUTA (recurso tático) — ele não sai mais do
  // orçamento diário, e por isso o número de lutas/dia não depende mais do nível.
  const fightsPerDay = DAILY_STAMINA_BUDGET / PVP_FIGHT_STAMINA
  const goldPerFight = Math.round((PVP_FIGHT_STAMINA * 2) * PVP_GOLD_PER_STA * PVP_WIN_SHARE)

  console.log('\n  ⚡ economia da luta')
  console.log(`   ações/luta ....................... ${avgActions.toFixed(1)}${totStalls ? `  (⚠️ ${totStalls} turnos passados por falta de stamina)` : ''}`)
  console.log(`   barra da luta gasta por lado ..... ${avgSpentSide.toFixed(1)}  (p95 ${p95} · máx ${maxSpent} · tanque ${sample.maxStamina})`)
  console.log(`   ↳ a barra segurou a luta? ........ ${totStalls === 0 ? '✅ ninguém ficou sem stamina' : `⚠️ ${totStalls} turnos perdidos por exaustão`}`)
  console.log(`   taxa da carteira por luta ........ ${PVP_FIGHT_STAMINA}⚡  (fixa, em qualquer nível)`)
  console.log(`   lutas por dia .................... ${fightsPerDay.toFixed(1)}  (orçamento ${DAILY_STAMINA_BUDGET}⚡/dia)`)
  console.log(`   ouro do vencedor (pool×0.70) ..... ${goldPerFight}`)

  const verdict = spread <= 10 ? '✅ equilibrado' : spread <= 16 ? '🟡 aceitável' : '❌ desequilibrado'
  console.log(`\n  spread entre classes: ${spread.toFixed(1)} pp  → ${verdict}`)

  summary.push({ bandName, spread, rates, avgActions, avgSpentSide, fightsPerDay, maxStamina: sample.maxStamina, goldPerFight, stalls: totStalls })
}

console.log(`\n${'='.repeat(78)}`)
console.log('📋 RESUMO')
console.log('='.repeat(78))
console.log('faixa            spread   ações   ⚡/lado   lutas/dia      ouro/vitória')
for (const s of summary) {
  console.log(
    `${s.bandName.padEnd(16)} ${(s.spread.toFixed(1) + 'pp').padStart(6)}   ${s.avgActions.toFixed(1).padStart(5)}   ` +
    `${s.avgSpentSide.toFixed(1).padStart(6)}   ${s.fightsPerDay.toFixed(1).padStart(12)}   ${String(s.goldPerFight).padStart(12)}`
  )
}
console.log('\npior classe por faixa:')
for (const s of summary) {
  const worst = s.rates.reduce((m, x) => (x.r < m.r ? x : m))
  const best = s.rates.reduce((m, x) => (x.r > m.r ? x : m))
  console.log(`  ${s.bandName.padEnd(16)} pior ${CLASS_PT[worst.c]} ${(worst.r * 100).toFixed(1)}%  ·  melhor ${CLASS_PT[best.c]} ${(best.r * 100).toFixed(1)}%`)
}
console.log('')
