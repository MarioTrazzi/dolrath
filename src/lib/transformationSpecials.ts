/**
 * 🐉 HABILIDADES ESPECIAIS DE TRANSFORMAÇÃO — definições COMPARTILHADAS (PvE + PvP).
 *
 * Fonte única dos "golpes" das 6 formas. O PvE (DungeonRun) importa daqui; o servidor
 * PvP (server/socket-server.js, JS puro) tem uma cópia equivalente em SPECIAL_DEFS —
 * MANTER OS DOIS EM SINCRONIA (mults/pierce/dot/efeitos/custo/cd/die).
 *
 * 🎲 Cada forma tem 3 habilidades:
 *   • 1 de DANO assinatura (rola o SEU dado — d20, o mais forte — visível na masmorra) — 12 MP;
 *   • 💫 Golpe Atordoante COMPARTILHADO (dano menor + chance de IMOBILIZAR) — 10 MP;
 *   • 1 de BUFF (aplica direto, SEM rolagem, mas CONSOME o turno) — 8 MP.
 * Dano do especial = DIRETO (sem disputa de esquiva, como no PvP):
 *   dano = poder_transformado × dmgMult × sorte(die) × (1 − DR(armadura×(1−pierce), K))
 * Crítico do especial = rolar o máximo do dado → bônus REDUZIDO (SPECIAL_CRIT_MULT 1.3
 * vs 1.6 do normal): o jogador vê o crítico, mas não vira nuke/one-shot no mesmo nível.
 *
 * ⚔️ Custos: MP + STAMINA no PvP (stamina = orçamento diário compartilhado com a masmorra).
 * No PvE a stamina dos golpes NÃO é debitada (só passos do trail); o cooldown é o gate secundário.
 */
import type { TransformationType } from './transformationSystem'
import { DICE_SIDES, LUCK_LO, LUCK_HI, damageReduction, type Levers } from './combatModel'

export const SPECIAL_CRIT_MULT = 1.3

/** Sorte do especial sobre um dado de `sides` lados: crítico (rolar o máximo) com bônus reduzido. */
export function specialLuck(roll: number, sides: number = DICE_SIDES): number {
  const t = sides > 1 ? (roll - 1) / (sides - 1) : 1
  const m = LUCK_LO + (LUCK_HI - LUCK_LO) * t
  return roll >= sides ? m * SPECIAL_CRIT_MULT : m
}

export interface SpecialEffect {
  /** multiplicador de dano RECEBIDO pelo próprio (escamas) — <1 mitiga */
  selfDmgTaken?: { mult: number; turns: number }
  /** multiplicador de dano CAUSADO pelo próprio (fúria/foco) — >1 amplifica */
  selfDmgDealt?: { mult: number; turns: number }
  /** multiplicador de dano CAUSADO pelo inimigo (rugidos) — <1 enfraquece */
  enemyDmgDealt?: { mult: number; turns: number }
  /** bônus de evasão temporário do próprio */
  selfEvade?: { value: number; turns: number }
  ignoreEvadeNext?: boolean
  amplifyNext?: number
  counterNext?: boolean
}

export interface SpecialDef {
  id: string
  form: TransformationType
  name: string
  kind: 'dmg' | 'util'
  /** dado próprio da habilidade de DANO (d20 = o mais forte). Buff não rola. */
  die?: number
  dmgMult?: number
  pierce?: number
  hits?: number
  dot?: { frac: number; turns: number; label: string }
  immobilizeRoll?: number
  /** golpe físico mirado: a esquiva PASSIVA do alvo anula (PvP; monstro PvE não esquiva) */
  dodgeable?: boolean
  heal?: number
  effect?: SpecialEffect
  cost: { mp?: number; stamina?: number }
  cd: number
  desc: string
}

// 😤 Fúria Selvagem — buff OFENSIVO do LOBO (Urso e Águia ganharam buffs próprios p/ identidade).
const WILD_FURY: SpecialDef = {
  id: 'wild_fury', form: 'wolf', name: '😤 Fúria Selvagem', kind: 'util',
  effect: { selfDmgDealt: { mult: 1.2, turns: 3 } }, cost: { mp: 8, stamina: 1 }, cd: 4,
  desc: '+20% de dano causado por 3 turnos',
}

// 💫 Golpe Atordoante — ataque de CONTROLE PURO compartilhado pelas 6 formas (como a Fúria
// é o buff compartilhável): dano simbólico (0.8, sem pierce), valor no stun — rolagem ≥15
// (30%) IMOBILIZA o alvo por 1 turno. É o ÚNICO especial esquivável (dodgeable): golpe
// físico mirado, a esquiva passiva do alvo anula no PvP. ⚖️ pvp-lever-sim 2026-07-11:
// com dano de especial (1.45 undodge) virava burst extra e afundava a Águia ~6pts.
// No PvE monstro não esquiva; CHEFE resiste ao atordoamento (gate de progressão intocado).
const stunningBlow = (form: TransformationType): SpecialDef => ({
  id: 'stunning_blow', form, name: '💫 Golpe Atordoante', kind: 'dmg',
  die: 20, dmgMult: 0.8, immobilizeRoll: 15, dodgeable: true, cost: { mp: 10, stamina: 2 }, cd: 3,
  desc: 'Dano leve; rolagem ≥15 ATORDOA o alvo por 1 turno (chefes resistem) (d20)',
})

export const TRANSFORMATION_SPECIALS: Record<TransformationType, SpecialDef[]> = {
  dragon: [
    { id: 'dragon_breath', form: 'dragon', name: '🔥 Sopro de Fogo', kind: 'dmg', die: 20, dmgMult: 1.9, pierce: 0.6, cost: { mp: 12, stamina: 2 }, cd: 2, desc: 'Dano de fogo que fura 60% da armadura (d20)' },
    stunningBlow('dragon'),
    { id: 'dragon_scales', form: 'dragon', name: '🛡️ Escama de Dragão', kind: 'util', effect: { selfDmgTaken: { mult: 0.76, turns: 3 } }, cost: { mp: 8, stamina: 1 }, cd: 4, desc: '-24% dano recebido por 3 turnos' },
  ],
  wolf: [
    { id: 'bite_bleeding', form: 'wolf', name: '🩸 Mordida Sangrenta', kind: 'dmg', die: 20, dmgMult: 1.6, pierce: 1, dot: { frac: 0.03, turns: 3, label: 'sangramento' }, cost: { mp: 12, stamina: 2 }, cd: 2, desc: 'Ignora a armadura + sangramento (3%/turno, 3t) (d20)' },
    stunningBlow('wolf'),
    WILD_FURY,
  ],
  bear: [
    { id: 'unstoppable_charge', form: 'bear', name: '💥 Investida Imparável', kind: 'dmg', die: 20, dmgMult: 1.72, pierce: 1, cost: { mp: 12, stamina: 2 }, cd: 2, desc: 'Ignora TODA a armadura (d20)' },
    stunningBlow('bear'),
    { id: 'bear_guard', form: 'bear', name: '🛡️ Pele de Ferro', kind: 'util', effect: { selfDmgTaken: { mult: 0.80, turns: 3 } }, cost: { mp: 8, stamina: 1 }, cd: 4, desc: '-20% dano recebido por 3 turnos' },
  ],
  eagle: [
    { id: 'ascending_spiral', form: 'eagle', name: '🌀 Espiral Ascendente', kind: 'dmg', die: 20, dmgMult: 2.15, pierce: 0.6, cost: { mp: 12, stamina: 2 }, cd: 2, desc: 'Mergulho em espiral (fura 60% da armadura) (d20)' },
    stunningBlow('eagle'),
    { id: 'eagle_swift', form: 'eagle', name: '🌬️ Voo Veloz', kind: 'util', effect: { selfEvade: { value: 0.45, turns: 3 } }, cost: { mp: 8, stamina: 1 }, cd: 4, desc: '+45% de evasão por 3 turnos' },
  ],
  seventh_sense: [
    { id: 'cosmo_burst', form: 'seventh_sense', name: '🌌 Explosão de Cosmo', kind: 'dmg', die: 20, dmgMult: 2.1, cost: { mp: 12, stamina: 2 }, cd: 2, desc: 'Explosão de cosmo concentrada (d20)' },
    stunningBlow('seventh_sense'),
    { id: 'meditation', form: 'seventh_sense', name: '🧘 Meditação', kind: 'util', heal: 0.14, cost: { mp: 8, stamina: 1 }, cd: 4, desc: 'Cura 14% do HP máximo' },
  ],
  celestial: [
    { id: 'super_nova', form: 'celestial', name: '💥 Super Nova', kind: 'dmg', die: 20, dmgMult: 2.0, pierce: 0.5, cost: { mp: 12, stamina: 2 }, cd: 2, desc: 'Explosão de luz que fura 50% da armadura (d20)' },
    stunningBlow('celestial'),
    { id: 'hyperfocus', form: 'celestial', name: '✨ Hyperfoco', kind: 'util', effect: { selfDmgDealt: { mult: 1.3, turns: 3 } }, cost: { mp: 8, stamina: 1 }, cd: 4, desc: '+30% de dano causado por 3 turnos' },
  ],
}

export function getFormSpecials(form: TransformationType | null | undefined): SpecialDef[] {
  return form ? (TRANSFORMATION_SPECIALS[form] || []) : []
}

export interface SpecialHit { damage: number; crit: boolean; maxRoll: number }

/**
 * Resolve o dano de um especial (direto). `power` = poder transformado (aplicamos dmgMult
 * aqui). `amplify`/`outMult`/`inMult` = buffs/debuffs de dano ativos. `forcedRoll` = a
 * rolagem JÁ animada pela UI (senão sorteia no dado próprio da habilidade, `def.die`).
 */
export function resolveSpecialHit(
  def: SpecialDef,
  power: number,
  target: Pick<Levers, 'armor' | 'K'>,
  opts: { amplify?: number; outMult?: number; inMult?: number; rng?: () => number; forcedRoll?: number } = {},
): SpecialHit {
  const rng = opts.rng ?? Math.random
  const sides = def.die ?? DICE_SIDES
  const hits = def.hits || 1
  let total = 0, crit = false, maxRoll = 0
  for (let h = 0; h < hits; h++) {
    const roll = opts.forcedRoll != null ? opts.forcedRoll : 1 + Math.floor(rng() * sides)
    if (roll > maxRoll) maxRoll = roll
    if (roll >= sides) crit = true
    const eff = power * (def.dmgMult || 1) * (opts.amplify ?? 1)
    const armor = Math.max(0, target.armor * (1 - (def.pierce || 0)))
    let dmg = eff * specialLuck(roll, sides) * (1 - damageReduction(armor, target.K))
    dmg = dmg * (opts.outMult ?? 1) * (opts.inMult ?? 1)
    total += Math.max(1, Math.round(dmg))
  }
  return { damage: total, crit, maxRoll }
}
