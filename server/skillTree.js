/**
 * 🌳 ÁRVORE DE HABILIDADES — espelho CommonJS de src/lib/skillTree.ts (só a parte de
 * GATING de combate; a UI/compra vivem só no Next.js). O socket é Node JS puro
 * (require) e não importa TS — mantenha os dois em sincronia (tiers/valores).
 *
 * Como os IDs de nó são determinísticos (`${prefix}-${path}-${tier}`), não precisamos
 * replicar o gerador inteiro de nós (nomes/ícones/descrições, só usados na ficha) —
 * só o mapeamento CLASSE→PAPEL→CAMINHO e os tiers/valores fixos de cada rank/passiva.
 * Ver o docstring de getSkillTree em src/lib/skillTree.ts p/ a tabela de tiers.
 */

const CLASS_PREFIX = { warrior: 'wr', rogue: 'rg', mage: 'mg', monk: 'mk' }
const CLASS_ROLES = {
  warrior: { primary: 'str', buff: 'def', signature: 'int', control: 'agi' },
  rogue: { primary: 'agi', buff: 'def', signature: 'int', control: 'str' },
  mage: { primary: 'int', buff: 'def', signature: 'agi', control: 'str' },
  monk: { primary: 'agi', buff: 'def', signature: 'int', control: 'str' },
}

const CLASS_ATTACK_R2_DIE = 10 // d8 → d10
const CLASS_ATTACK_R3_MP = 6 // 8 MP → 6 MP
const STUN_R2_ROLL = 14 // 30% → 35% (rolagem ≥14)

// Ranks do especial ASSINATURA por forma (mesmos valores de SIGNATURE_RANKS em skillTree.ts).
const SIGNATURE_RANKS = {
  dragon: { r2: { dmgMult: 2.0 }, r3: { pierce: 0.7 } },
  wolf: { r2: { dmgMult: 1.7 }, r3: { dmgMult: 1.8 } },
  bear: { r2: { dmgMult: 1.82 }, r3: { dmgMult: 1.92 } },
  eagle: { r2: { dmgMult: 2.25 }, r3: { pierce: 0.7 } },
  seventh_sense: { r2: { dmgMult: 2.2 }, r3: { dmgMult: 2.3 } },
  celestial: { r2: { dmgMult: 2.1 }, r3: { pierce: 0.6 } },
}

// Rank II do buff de forma por forma (mesmos valores de FORM_BUFF_R2 em skillTree.ts).
const FORM_BUFF_R2 = {
  dragon: { key: 'dmgTaken', value: 0.72 },
  wolf: { key: 'dmgDealt', value: 1.25 },
  bear: { key: 'dmgTaken', value: 0.76 },
  eagle: { key: 'evade', value: 0.5 },
  seventh_sense: { key: 'heal', value: 0.17 },
  celestial: { key: 'dmgDealt', value: 1.35 },
}

function normalizeClassId(raw) {
  const c = (raw || '').toLowerCase()
  return CLASS_ROLES[c] ? c : 'warrior'
}

const NEUTRAL_PASSIVES = { maxHpPct: 0, maxMpPct: 0, evadeBonus: 0, critBonusMult: 1, transformExtraTurns: 0, selfDmgTakenMult: 1 }

// Legado (skillTree null): todo ATAQUE/SKILL liberado (comportamento pré-árvore), SEM
// ranks II/III de graça — espelha LEGACY_UNLOCKS de src/lib/skillTree.ts.
const LEGACY_UNLOCKS = {
  legacy: true,
  classAttack: true,
  stunningBlow: true,
  formBuff: true,
  classAttackRank: 1,
  stunRank: 1,
  signatureRank: 1,
  formBuffRank: 1,
  classAttackDie: 8,
  classAttackMp: 8,
  passives: { ...NEUTRAL_PASSIVES },
}

/**
 * `purchased`: string[] | null (Character.skillTree.purchased; null/undefined = legado).
 * `classId`: Character.class ('warrior'/'rogue'/'mage'/'monk').
 */
function getSkillUnlocks(purchased, classId) {
  if (!purchased) return LEGACY_UNLOCKS
  const cls = normalizeClassId(classId)
  const prefix = CLASS_PREFIX[cls]
  const roles = CLASS_ROLES[cls]
  const bought = new Set(purchased)
  const has = (role, tier) => bought.has(`${prefix}-${roles[role]}-${tier}`)

  const classAttackRank = has('primary', 8) ? 3 : has('primary', 5) ? 2 : 1
  const stunRank = has('control', 6) ? 2 : 1
  const signatureRank = has('signature', 8) ? 3 : has('signature', 5) ? 2 : 1
  const formBuffRank = has('buff', 6) ? 2 : 1

  return {
    legacy: false,
    classAttack: has('primary', 2),
    stunningBlow: has('control', 3),
    formBuff: has('buff', 3),
    classAttackRank,
    stunRank,
    signatureRank,
    formBuffRank,
    classAttackDie: classAttackRank >= 2 ? CLASS_ATTACK_R2_DIE : 8,
    classAttackMp: classAttackRank >= 3 ? CLASS_ATTACK_R3_MP : 8,
    passives: {
      maxHpPct: has('buff', 8) ? 0.05 : 0,
      maxMpPct: has('signature', 3) ? 0.10 : 0,
      evadeBonus: (has('control', 8) ? 0.02 : 0) + (has('control', 11) ? 0.03 : 0),
      critBonusMult: has('primary', 11) ? 1.1 : 1,
      transformExtraTurns: has('signature', 11) ? 1 : 0,
      selfDmgTakenMult: has('buff', 11) ? 0.96 : 1,
    },
  }
}

/**
 * Clona um SPECIAL_DEF (server/socket-server.js) aplicando os ranks comprados PARA A
 * FORMA ATIVA desta luta — mesma lógica de applyRankPatch em src/lib/skillTree.ts
 * (Metamorfo: 3 formas possíveis, uma árvore só; o rank vale p/ qualquer forma).
 */
function applyRankPatch(def, unlocks, activeForm, stunningBlowId, signatureId, buffId) {
  if (def.id === stunningBlowId && unlocks.stunRank >= 2) {
    return { ...def, immobilizeRoll: STUN_R2_ROLL, name: `${def.name} II` }
  }
  if (def.id === signatureId && unlocks.signatureRank >= 2) {
    const ranks = SIGNATURE_RANKS[activeForm] || {}
    const out = { ...def }
    if (ranks.r2) Object.assign(out, ranks.r2)
    if (unlocks.signatureRank >= 3 && ranks.r3) { Object.assign(out, ranks.r3); out.name = `${def.name} III` }
    else out.name = `${def.name} II`
    return out
  }
  if (def.id === buffId && unlocks.formBuffRank >= 2) {
    const r2 = FORM_BUFF_R2[activeForm]
    const out = { ...def, name: `${def.name} II` }
    if (r2) {
      if (r2.key === 'heal') out.heal = r2.value
      else out.__buffPatch = { key: r2.key, value: r2.value } // aplicado pelo caller via setFxMult/setFxEvade
    }
    return out
  }
  return def
}

module.exports = { getSkillUnlocks, applyRankPatch, LEGACY_UNLOCKS, normalizeClassId, CLASS_ROLES, CLASS_PREFIX }
