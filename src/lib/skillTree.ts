/**
 * 🌳 ÁRVORE DE HABILIDADES (estilo Child of Light) — fonte única PvE/ficha.
 *
 * 4 caminhos (STR/AGI/INT/DEF) × 11 tiers quase-lineares; o ponto do level-up
 * (Character.availablePoints) compra o próximo nó do caminho: +atributo, desbloqueio
 * de golpe (Ataque de Classe / Golpe Atordoante / buff de forma), rank II/III de
 * habilidade existente ou passiva. Capstones (tier 11) custam 2 — total 48 pontos,
 * árvore completa ~nível 49-50 (1 ponto/nível, characterLevelSystem.ts).
 *
 * A árvore NÃO é autorada por combinação: é GERADA por template de CLASSE (define
 * qual caminho carrega os ranks do Ataque de Classe) + overlay da FORMA de
 * transformação (assinatura/buff vêm de TRANSFORMATION_SPECIALS). 16 combinações
 * saem de 4 templates × 6 formas.
 *
 * Persistência: Character.skillTree Json = { version: 1, purchased: string[] }.
 * skillTree == null ⇒ personagem LEGADO: tudo liberado no combate (fallback seguro
 * até o script de respec único).
 *
 * ⚠️ O servidor PvP (server/socket-server.js, JS puro) precisa de cópia equivalente
 * do gating/patches — MANTER EM SINCRONIA (mesmo aviso de transformationSpecials.ts).
 */
import type { TransformationType } from './transformationSystem'
import { TRANSFORMATION_SPECIALS, type SpecialDef } from './transformationSpecials'
import { CLASS_ATTACK_NAME } from './combatModel'

export const SKILL_TREE_VERSION = 1

export type SkillPathId = 'str' | 'agi' | 'int' | 'def'
export type SkillNodeKind = 'stat' | 'skill' | 'upgrade' | 'passive'
export type SkillUnlockKey = 'class_attack' | 'stunning_blow' | 'form_buff'

/** Quanto cada nó de stat dá. LEVER DE BALANCE da fase 4 (+1 vs +2) — não mudar a topologia. */
export const STAT_NODE_AMOUNT = 1

/**
 * Papel do rank comprado. O PATCH em si NUNCA é guardado no nó — é resolvido a cada
 * combate por [role][rank][forma ATIVA daquela luta] (SIGNATURE_RANKS/FORM_BUFF_R2/
 * CLASS_ATTACK_R2/R3 abaixo). Isso é o que permite o METAMORFO (unlockedTransformation
 * null — escolhe lobo/urso/águia a cada luta, ver character/create NameConfirmStep.tsx:304)
 * ter UMA árvore só: o rank comprado vale para QUALQUER forma que ele ativar, com os
 * números daquela forma específica.
 */
export type SkillRankRole = 'class_attack' | 'stunning_blow' | 'signature' | 'form_buff'

/** Patch ABSOLUTO (não delta) aplicado sobre a habilidade base ao resolver o rank. */
export interface RankPatch {
  die?: number
  dmgMult?: number
  pierce?: number
  immobilizeRoll?: number
  mpCost?: number
  /** buffs de forma: novo valor do efeito primário */
  selfDmgTakenMult?: number
  selfDmgDealtMult?: number
  selfEvadeValue?: number
  heal?: number
}

export interface SkillPassive {
  maxHpPct?: number
  maxMpPct?: number
  evadeBonus?: number
  critBonusMult?: number
  transformExtraTurns?: number
  selfDmgTakenMult?: number
}

export interface SkillNodeEffect {
  stat?: { attr: SkillPathId; amount: number }
  unlock?: SkillUnlockKey
  rank?: { role: SkillRankRole; rank: 2 | 3 }
  passive?: SkillPassive
}

export interface SkillNode {
  id: string
  path: SkillPathId
  tier: number
  cost: number // capstone (tier 11) = 2
  kind: SkillNodeKind
  name: string
  icon: string
  desc: string
  requires: string[] // sempre [nó anterior do caminho]
  effect: SkillNodeEffect
}

export interface SkillTreeState {
  version: number
  purchased: string[]
  respecAt?: string
}

// ————————————————————————————————————————————————————————————————————————
// Papéis dos caminhos por classe
// ————————————————————————————————————————————————————————————————————————
// Cada classe distribui 4 PAPÉIS pelos 4 caminhos:
//  • primary   — unlock + ranks do Ataque de Classe (atributo primário da classe)
//  • buff      — unlock + rank do buff de forma (sempre DEF; nenhuma classe tem DEF primário)
//  • signature — ranks do especial assinatura da forma ("poder interior")
//  • control   — unlock + rank do Golpe Atordoante
type PathRole = 'primary' | 'buff' | 'signature' | 'control'

const CLASS_ROLES: Record<string, Record<PathRole, SkillPathId>> = {
  warrior: { primary: 'str', buff: 'def', signature: 'int', control: 'agi' },
  rogue: { primary: 'agi', buff: 'def', signature: 'int', control: 'str' },
  mage: { primary: 'int', buff: 'def', signature: 'agi', control: 'str' },
  monk: { primary: 'agi', buff: 'def', signature: 'int', control: 'str' },
}

const STAT_LABEL: Record<SkillPathId, string> = { str: 'Força', agi: 'Agilidade', int: 'Inteligência', def: 'Defesa' }
const STAT_ICON: Record<SkillPathId, string> = { str: '💪', agi: '🌬️', int: '🔮', def: '🛡️' }

/** Nome/tema do caminho por classe+papel (reaproveita as `abilities` decorativas do gameData). */
const PATH_LABELS: Record<string, Record<PathRole, string>> = {
  warrior: { primary: 'Fúria de Batalha', buff: 'Defesa Férrea', signature: '', control: 'Instinto Predador' },
  rogue: { primary: 'Ataque Furtivo', buff: 'Esquiva Aprimorada', signature: '', control: 'Golpe Sombrio' },
  mage: { primary: 'Maestria Arcana', buff: 'Escudo Mágico', signature: '', control: 'Golpe Arcano' },
  monk: { primary: 'Rajada de Socos', buff: 'Corpo de Ferro', signature: '', control: 'Punho de Ferro' },
}

/** Nome do caminho de assinatura vem da FORMA ("poder interior"). */
const FORM_PATH_LABEL: Record<TransformationType, string> = {
  dragon: 'Dragão Interior',
  wolf: 'Lobo Interior',
  bear: 'Urso Interior',
  eagle: 'Águia Interior',
  seventh_sense: 'Sétimo Sentido',
  celestial: 'Forma Celestial',
}

/** Capstone do caminho primário (crítico) — nome com identidade da classe. */
const PRIMARY_CAPSTONE_NAME: Record<string, string> = {
  warrior: 'Golpe Devastador',
  rogue: 'Precisão Mortal',
  mage: 'Fúria Arcana',
  monk: 'Punho Trovejante',
}

// Ranks do Ataque de Classe (mesma mecânica p/ todas as classes; só o nome muda).
const CLASS_ATTACK_R2: RankPatch = { die: 10 } // d8 → d10
const CLASS_ATTACK_R3: RankPatch = { mpCost: 6 } // 8 MP → 6 MP

// Rank II do Golpe Atordoante: 30% → 35% de stun (rolagem ≥14).
const STUN_R2: RankPatch = { immobilizeRoll: 14 }

// Ranks do especial ASSINATURA por forma (valores ABSOLUTOS, passos conservadores ~+5%;
// formas com pierce 1 ou sem pierce sobem dmgMult nos dois ranks).
const SIGNATURE_RANKS: Record<TransformationType, { r2: RankPatch; r3: RankPatch }> = {
  dragon: { r2: { dmgMult: 2.0 }, r3: { pierce: 0.7 } },
  wolf: { r2: { dmgMult: 1.7 }, r3: { dmgMult: 1.8 } },
  bear: { r2: { dmgMult: 1.82 }, r3: { dmgMult: 1.92 } },
  eagle: { r2: { dmgMult: 2.25 }, r3: { pierce: 0.7 } },
  seventh_sense: { r2: { dmgMult: 2.2 }, r3: { dmgMult: 2.3 } },
  celestial: { r2: { dmgMult: 2.1 }, r3: { pierce: 0.6 } },
}

// Rank II do buff de forma por forma (efeito primário um degrau mais forte).
const FORM_BUFF_R2: Record<TransformationType, RankPatch> = {
  dragon: { selfDmgTakenMult: 0.72 },   // -24% → -28% dano recebido
  wolf: { selfDmgDealtMult: 1.25 },     // +20% → +25% dano causado
  bear: { selfDmgTakenMult: 0.76 },     // -20% → -24%
  eagle: { selfEvadeValue: 0.5 },       // +45% → +50% evasão
  seventh_sense: { heal: 0.17 },        // cura 14% → 17%
  celestial: { selfDmgDealtMult: 1.35 },// +30% → +35%
}

const CLASS_PREFIX: Record<string, string> = { warrior: 'wr', rogue: 'rg', mage: 'mg', monk: 'mk' }

function normalizeClassId(raw: string | null | undefined): keyof typeof CLASS_ROLES {
  const c = (raw || '').toLowerCase()
  return (CLASS_ROLES[c] ? c : 'warrior') as keyof typeof CLASS_ROLES
}

/**
 * null = Metamorfo (raça multi-forma; `unlockedTransformation` fica null de propósito —
 * ver character/create/components/NameConfirmStep.tsx:304): a árvore usa rótulos
 * GENÉRICOS para os nós de assinatura/buff (o rank vale para qualquer forma que ele
 * ativar na luta). Só afeta DISPLAY — a resolução do patch em combate usa a forma
 * ATIVA daquela luta (applyRankPatch), nunca esta.
 */
function normalizeForm(raw: string | null | undefined): TransformationType | null {
  if (!raw) return null
  const f = raw as TransformationType
  return TRANSFORMATION_SPECIALS[f] ? f : null
}

const GENERIC_SIGNATURE_NAME = '🐾 Golpe da Forma'
const GENERIC_BUFF_NAME = '🛡️ Vigor da Forma'
const GENERIC_BUFF_DESC = 'o buff da sua forma ativa'
const GENERIC_FORM_PATH_LABEL = 'Instintos Selvagens'

/** Especial ASSINATURA da forma = a de dano que não é o Golpe Atordoante. */
export function signatureSpecial(form: TransformationType): SpecialDef {
  const defs = TRANSFORMATION_SPECIALS[form]
  return defs.find(d => d.kind === 'dmg' && d.id !== 'stunning_blow') || defs[0]
}

/** Buff/utilitário da forma (kind 'util'). */
export function formBuffSpecial(form: TransformationType): SpecialDef {
  const defs = TRANSFORMATION_SPECIALS[form]
  return defs.find(d => d.kind === 'util') || defs[defs.length - 1]
}

export interface SkillPathInfo {
  id: SkillPathId
  role: PathRole
  label: string
  icon: string
  /** cor de acento da lane na UI */
  accent: string
}

const PATH_ACCENT: Record<SkillPathId, string> = {
  str: '#c0392b', // vermelho
  agi: '#27ae60', // verde
  int: '#2f6db3', // azul
  def: '#c9a25f', // dourado (GOLD do design chumbo+ouro)
}

export function getSkillPaths(classId: string, form: TransformationType | string | null | undefined): SkillPathInfo[] {
  const cls = normalizeClassId(classId)
  const f = normalizeForm(form as string)
  const roles = CLASS_ROLES[cls]
  const order: SkillPathId[] = ['str', 'agi', 'int', 'def']
  return order.map(path => {
    const role = (Object.keys(roles) as PathRole[]).find(r => roles[r] === path) as PathRole
    const label = role === 'signature' ? (f ? FORM_PATH_LABEL[f] : GENERIC_FORM_PATH_LABEL) : PATH_LABELS[cls][role]
    return { id: path, role, label, icon: STAT_ICON[path], accent: PATH_ACCENT[path] }
  })
}

// ————————————————————————————————————————————————————————————————————————
// Geração da árvore
// ————————————————————————————————————————————————————————————————————————

function statNode(prefix: string, path: SkillPathId, tier: number): SkillNode {
  return {
    id: `${prefix}-${path}-${tier}`,
    path,
    tier,
    cost: 1,
    kind: 'stat',
    name: `+${STAT_NODE_AMOUNT} ${STAT_LABEL[path]}`,
    icon: STAT_ICON[path],
    desc: `Aumenta ${STAT_LABEL[path]} em ${STAT_NODE_AMOUNT} ponto (permanente).`,
    requires: tier === 1 ? [] : [`${prefix}-${path}-${tier - 1}`],
    effect: { stat: { attr: path, amount: STAT_NODE_AMOUNT } },
  }
}

function node(
  prefix: string,
  path: SkillPathId,
  tier: number,
  partial: Omit<SkillNode, 'id' | 'path' | 'tier' | 'requires' | 'cost'> & { cost?: number },
): SkillNode {
  return {
    id: `${prefix}-${path}-${tier}`,
    path,
    tier,
    cost: partial.cost ?? 1,
    kind: partial.kind,
    name: partial.name,
    icon: partial.icon,
    desc: partial.desc,
    requires: tier === 1 ? [] : [`${prefix}-${path}-${tier - 1}`],
    effect: partial.effect,
  }
}

/**
 * Gera a árvore da combinação classe+forma (44 nós, 48 pontos).
 * Esqueleto por papel (tiers com nó especial; o resto é stat):
 *  primary:   t2 unlock CA · t5 CA II · t8 CA III · t11 capstone crit ×1.1 (custo 2)
 *  buff:      t3 unlock buff · t6 buff II · t8 +5% maxHP · t11 capstone -4% dano recebido
 *  control:   t3 unlock stun · t6 stun II · t8 +2% evasão · t11 capstone +3% evasão
 *  signature: t3 +10% maxMP · t5 assinatura II · t8 assinatura III · t11 capstone +1 turno de forma
 */
export function getSkillTree(classId: string, form: TransformationType | string | null | undefined): SkillNode[] {
  const cls = normalizeClassId(classId)
  const f = normalizeForm(form as string)
  const prefix = CLASS_PREFIX[cls]
  const roles = CLASS_ROLES[cls]
  const attackName = CLASS_ATTACK_NAME[cls as keyof typeof CLASS_ATTACK_NAME] || 'Ataque de Classe'
  // Metamorfo (f null): rótulos genéricos — o rank vale p/ qualquer forma ativada na luta.
  const sigName = f ? signatureSpecial(f).name : GENERIC_SIGNATURE_NAME
  const buffName = f ? formBuffSpecial(f).name : GENERIC_BUFF_NAME
  const buffDesc = f ? formBuffSpecial(f).desc : GENERIC_BUFF_DESC
  const formPathLabel = f ? FORM_PATH_LABEL[f] : GENERIC_FORM_PATH_LABEL

  const nodes: SkillNode[] = []
  const TIERS = 11

  for (const path of ['str', 'agi', 'int', 'def'] as SkillPathId[]) {
    const role = (Object.keys(roles) as PathRole[]).find(r => roles[r] === path) as PathRole
    for (let tier = 1; tier <= TIERS; tier++) {
      let special: SkillNode | null = null

      if (role === 'primary') {
        if (tier === 2) special = node(prefix, path, tier, {
          kind: 'skill', name: `⚔️ ${attackName}`, icon: '⚔️',
          desc: `Desbloqueia o Ataque de Classe (d8, 8 MP): ${attackName}.`,
          effect: { unlock: 'class_attack' },
        })
        else if (tier === 5) special = node(prefix, path, tier, {
          kind: 'upgrade', name: `${attackName} II`, icon: '⚔️',
          desc: `${attackName} rola d10 em vez de d8.`,
          effect: { rank: { role: 'class_attack', rank: 2 } },
        })
        else if (tier === 8) special = node(prefix, path, tier, {
          kind: 'upgrade', name: `${attackName} III`, icon: '⚔️',
          desc: `${attackName} custa 6 MP em vez de 8.`,
          effect: { rank: { role: 'class_attack', rank: 3 } },
        })
        else if (tier === 11) special = node(prefix, path, tier, {
          kind: 'passive', cost: 2, name: `🏆 ${PRIMARY_CAPSTONE_NAME[cls]}`, icon: '🏆',
          desc: 'Capstone: bônus de dano crítico ×1.1 nos seus golpes.',
          effect: { passive: { critBonusMult: 1.1 } },
        })
      } else if (role === 'buff') {
        if (tier === 3) special = node(prefix, path, tier, {
          kind: 'skill', name: buffName, icon: '🛡️',
          desc: `Desbloqueia o buff da forma: ${buffDesc}`,
          effect: { unlock: 'form_buff' },
        })
        else if (tier === 6) special = node(prefix, path, tier, {
          kind: 'upgrade', name: `${buffName} II`, icon: '🛡️',
          desc: 'O buff da forma fica um degrau mais forte.',
          effect: { rank: { role: 'form_buff', rank: 2 } },
        })
        else if (tier === 8) special = node(prefix, path, tier, {
          kind: 'passive', name: '🧱 Vitalidade', icon: '🧱',
          desc: '+5% de HP máximo (permanente).',
          effect: { passive: { maxHpPct: 0.05 } },
        })
        else if (tier === 11) special = node(prefix, path, tier, {
          kind: 'passive', cost: 2, name: '🏆 Baluarte', icon: '🏆',
          desc: 'Capstone: -4% de todo dano recebido (permanente).',
          effect: { passive: { selfDmgTakenMult: 0.96 } },
        })
      } else if (role === 'control') {
        if (tier === 3) special = node(prefix, path, tier, {
          kind: 'skill', name: '💫 Golpe Atordoante', icon: '💫',
          desc: 'Desbloqueia o Golpe Atordoante (d20, 10 MP): rolagem ≥15 atordoa por 1 turno.',
          effect: { unlock: 'stunning_blow' },
        })
        else if (tier === 6) special = node(prefix, path, tier, {
          kind: 'upgrade', name: '💫 Golpe Atordoante II', icon: '💫',
          desc: 'Atordoa com rolagem ≥14 (30% → 35%).',
          effect: { rank: { role: 'stunning_blow', rank: 2 } },
        })
        else if (tier === 8) special = node(prefix, path, tier, {
          kind: 'passive', name: '🌬️ Passo Lateral', icon: '🌬️',
          desc: '+2% de evasão (permanente).',
          effect: { passive: { evadeBonus: 0.02 } },
        })
        else if (tier === 11) special = node(prefix, path, tier, {
          kind: 'passive', cost: 2, name: '🏆 Reflexos de Batalha', icon: '🏆',
          desc: 'Capstone: +3% de evasão (permanente).',
          effect: { passive: { evadeBonus: 0.03 } },
        })
      } else {
        // signature
        if (tier === 3) special = node(prefix, path, tier, {
          kind: 'passive', name: '🔮 Reservas Arcanas', icon: '🔮',
          desc: '+10% de MP máximo (permanente).',
          effect: { passive: { maxMpPct: 0.10 } },
        })
        else if (tier === 5) special = node(prefix, path, tier, {
          kind: 'upgrade', name: `${sigName} II`, icon: '✨',
          desc: 'O especial assinatura da forma fica mais forte.',
          effect: { rank: { role: 'signature', rank: 2 } },
        })
        else if (tier === 8) special = node(prefix, path, tier, {
          kind: 'upgrade', name: `${sigName} III`, icon: '✨',
          desc: 'O especial assinatura da forma atinge o rank máximo.',
          effect: { rank: { role: 'signature', rank: 3 } },
        })
        else if (tier === 11) special = node(prefix, path, tier, {
          kind: 'passive', cost: 2, name: `🏆 ${formPathLabel}`, icon: '🏆',
          desc: 'Capstone: a transformação dura +1 turno.',
          effect: { passive: { transformExtraTurns: 1 } },
        })
      }

      nodes.push(special ?? statNode(prefix, path, tier))
    }
  }
  return nodes
}

/** Custo total da árvore (48 com a topologia padrão). */
export function skillTreeTotalCost(tree: SkillNode[]): number {
  return tree.reduce((sum, n) => sum + n.cost, 0)
}

// ————————————————————————————————————————————————————————————————————————
// Estado persistido + compra
// ————————————————————————————————————————————————————————————————————————

/** Parse tolerante do Json do banco. null/malformado ⇒ null (personagem legado). */
export function getSkillTreeState(raw: unknown): SkillTreeState | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.version !== 'number' || !Array.isArray(obj.purchased)) return null
  return {
    version: obj.version,
    purchased: (obj.purchased as unknown[]).filter((x): x is string => typeof x === 'string'),
    respecAt: typeof obj.respecAt === 'string' ? obj.respecAt : undefined,
  }
}

export function canPurchase(
  tree: SkillNode[],
  purchased: string[],
  nodeId: string,
  availablePoints: number,
): { ok: boolean; reason?: string } {
  const nodeDef = tree.find(n => n.id === nodeId)
  if (!nodeDef) return { ok: false, reason: 'Nó inexistente nesta árvore.' }
  if (purchased.includes(nodeId)) return { ok: false, reason: 'Nó já aprendido.' }
  if (!nodeDef.requires.every(r => purchased.includes(r))) {
    return { ok: false, reason: 'Aprenda o nó anterior do caminho primeiro.' }
  }
  if (availablePoints < nodeDef.cost) {
    return { ok: false, reason: `Pontos insuficientes (custa ${nodeDef.cost}).` }
  }
  return { ok: true }
}

// ————————————————————————————————————————————————————————————————————————
// Unlocks derivados p/ o combate
// ————————————————————————————————————————————————————————————————————————

export interface SkillPassives {
  maxHpPct: number
  maxMpPct: number
  evadeBonus: number
  critBonusMult: number
  transformExtraTurns: number
  selfDmgTakenMult: number
}

export interface SkillUnlocks {
  /** true = personagem legado (skillTree null): tudo liberado, sem patches/passivas */
  legacy: boolean
  classAttack: boolean
  stunningBlow: boolean
  formBuff: boolean
  /** maior rank comprado por papel (1 = não comprou upgrade nenhum) */
  classAttackRank: 1 | 2 | 3
  stunRank: 1 | 2
  signatureRank: 1 | 2 | 3
  formBuffRank: 1 | 2
  /** dado/custo efetivos do Ataque de Classe (já com ranks) */
  classAttackDie: number
  classAttackMp: number
  passives: SkillPassives
}

const NEUTRAL_PASSIVES: SkillPassives = {
  maxHpPct: 0, maxMpPct: 0, evadeBonus: 0, critBonusMult: 1, transformExtraTurns: 0, selfDmgTakenMult: 1,
}

// Legado: todo ATAQUE/SKILL liberado (comportamento pré-árvore preservado), mas SEM
// ranks II/III de graça — esses são conteúdo NOVO que ninguém tinha comprado antes.
export const LEGACY_UNLOCKS: SkillUnlocks = {
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

export function getSkillUnlocks(state: SkillTreeState | null, tree: SkillNode[]): SkillUnlocks {
  if (!state) return LEGACY_UNLOCKS

  const unlocks: SkillUnlocks = {
    legacy: false,
    classAttack: false,
    stunningBlow: false,
    formBuff: false,
    classAttackRank: 1,
    stunRank: 1,
    signatureRank: 1,
    formBuffRank: 1,
    classAttackDie: 8,
    classAttackMp: 8,
    passives: { ...NEUTRAL_PASSIVES },
  }
  const bought = new Set(state.purchased)

  for (const n of tree) {
    if (!bought.has(n.id)) continue
    const fx = n.effect
    if (fx.unlock === 'class_attack') unlocks.classAttack = true
    else if (fx.unlock === 'stunning_blow') unlocks.stunningBlow = true
    else if (fx.unlock === 'form_buff') unlocks.formBuff = true
    if (fx.rank) {
      const { role, rank } = fx.rank
      if (role === 'class_attack') unlocks.classAttackRank = Math.max(unlocks.classAttackRank, rank) as 1 | 2 | 3
      else if (role === 'stunning_blow') unlocks.stunRank = Math.max(unlocks.stunRank, rank) as 1 | 2
      else if (role === 'signature') unlocks.signatureRank = Math.max(unlocks.signatureRank, rank) as 1 | 2 | 3
      else if (role === 'form_buff') unlocks.formBuffRank = Math.max(unlocks.formBuffRank, rank) as 1 | 2
    }
    if (fx.passive) {
      const p = fx.passive
      if (p.maxHpPct) unlocks.passives.maxHpPct += p.maxHpPct
      if (p.maxMpPct) unlocks.passives.maxMpPct += p.maxMpPct
      if (p.evadeBonus) unlocks.passives.evadeBonus += p.evadeBonus
      if (p.critBonusMult) unlocks.passives.critBonusMult *= p.critBonusMult
      if (p.transformExtraTurns) unlocks.passives.transformExtraTurns += p.transformExtraTurns
      if (p.selfDmgTakenMult) unlocks.passives.selfDmgTakenMult *= p.selfDmgTakenMult
    }
  }

  if (unlocks.classAttackRank >= 2) unlocks.classAttackDie = CLASS_ATTACK_R2.die!
  if (unlocks.classAttackRank >= 3) unlocks.classAttackMp = CLASS_ATTACK_R3.mpCost!
  return unlocks
}

const RANK_SUFFIX: Record<number, string> = { 2: ' II', 3: ' III' }

function clonePatchableDef(def: SpecialDef): SpecialDef {
  return {
    ...def,
    cost: { ...def.cost },
    effect: def.effect
      ? {
          ...def.effect,
          selfDmgTaken: def.effect.selfDmgTaken ? { ...def.effect.selfDmgTaken } : undefined,
          selfDmgDealt: def.effect.selfDmgDealt ? { ...def.effect.selfDmgDealt } : undefined,
          enemyDmgDealt: def.effect.enemyDmgDealt ? { ...def.effect.enemyDmgDealt } : undefined,
          selfEvade: def.effect.selfEvade ? { ...def.effect.selfEvade } : undefined,
        }
      : undefined,
  }
}

function applyPatchValues(out: SpecialDef, p: RankPatch) {
  if (p.die != null) out.die = p.die
  if (p.dmgMult != null) out.dmgMult = p.dmgMult
  if (p.pierce != null) out.pierce = p.pierce
  if (p.immobilizeRoll != null) out.immobilizeRoll = p.immobilizeRoll
  if (p.mpCost != null) out.cost.mp = p.mpCost
  if (p.heal != null) out.heal = p.heal
  if (p.selfDmgTakenMult != null && out.effect?.selfDmgTaken) out.effect.selfDmgTaken.mult = p.selfDmgTakenMult
  if (p.selfDmgDealtMult != null && out.effect?.selfDmgDealt) out.effect.selfDmgDealt.mult = p.selfDmgDealtMult
  if (p.selfEvadeValue != null && out.effect?.selfEvade) out.effect.selfEvade.value = p.selfEvadeValue
}

/**
 * Clona a SpecialDef aplicando os ranks comprados PARA A FORMA ATIVA desta luta (nunca
 * muta a base — o def global de transformationSpecials é compartilhado). Os valores do
 * patch vêm das tabelas estáticas (SIGNATURE_RANKS/FORM_BUFF_R2/STUN_R2) indexadas pela
 * forma ATIVA, não pela forma usada na geração da árvore — é isso que faz o Metamorfo
 * (3 formas possíveis, uma árvore só) funcionar: o rank comprado vale pra qualquer forma.
 */
export function applyRankPatch(def: SpecialDef, unlocks: SkillUnlocks, activeForm: TransformationType): SpecialDef {
  let rankLevel = 1
  let patches: RankPatch[] = []

  if (def.id === 'stunning_blow' && unlocks.stunRank >= 2) {
    rankLevel = 2
    patches = [STUN_R2]
  } else if (def.id === signatureSpecial(activeForm).id && unlocks.signatureRank >= 2) {
    const ranks = SIGNATURE_RANKS[activeForm]
    if (unlocks.signatureRank >= 3) { rankLevel = 3; patches = [ranks.r2, ranks.r3] }
    else { rankLevel = 2; patches = [ranks.r2] }
  } else if (def.id === formBuffSpecial(activeForm).id && unlocks.formBuffRank >= 2) {
    rankLevel = 2
    patches = [FORM_BUFF_R2[activeForm]]
  }

  if (patches.length === 0) return def
  const out = clonePatchableDef(def)
  for (const p of patches) applyPatchValues(out, p)
  out.name = `${def.name}${RANK_SUFFIX[rankLevel] || ''}`
  return out
}

/** Soma de atributos concedidos pelos nós de stat comprados (p/ recálculo no servidor). */
export function purchasedStatTotals(state: SkillTreeState | null, tree: SkillNode[]): Record<SkillPathId, number> {
  const totals: Record<SkillPathId, number> = { str: 0, agi: 0, int: 0, def: 0 }
  if (!state) return totals
  const bought = new Set(state.purchased)
  for (const n of tree) {
    if (bought.has(n.id) && n.effect.stat) totals[n.effect.stat.attr] += n.effect.stat.amount
  }
  return totals
}
