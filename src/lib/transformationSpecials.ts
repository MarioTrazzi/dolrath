/**
 * 🐉 HABILIDADES ESPECIAIS DE TRANSFORMAÇÃO — definições COMPARTILHADAS (PvE + PvP).
 *
 * Fonte única dos "golpes" das 6 formas. O PvE (DungeonRun) importa daqui; o servidor
 * PvP (server/socket-server.js, JS puro) tem uma cópia equivalente em SPECIAL_DEFS —
 * MANTER OS DOIS EM SINCRONIA (mults/pierce/dot/efeitos/custo/cd).
 *
 * Dano do especial = DIRETO (sem disputa de esquiva, como no PvP):
 *   dano = poder_transformado × dmgMult × sorte(d12) × (1 − DR(armadura×(1−pierce), K))
 * Crítico do especial = rolar 12 → bônus REDUZIDO (SPECIAL_CRIT_MULT 1.3 vs 1.6 do normal):
 * o jogador vê o crítico, mas não vira nuke/one-shot no mesmo nível.
 *
 * ⚔️ Custo no PvE: a stamina NÃO é gasta no combate (é o orçamento diário de runs),
 * então no PvE os especiais são gateados pelo COOLDOWN (+ MP para os de mana).
 */
import type { TransformationType } from './transformationSystem'
import { DICE_SIDES, LUCK_LO, LUCK_HI, damageReduction, type Levers } from './combatModel'

export const SPECIAL_CRIT_MULT = 1.3

/** Sorte do especial: crítico (rolar o máximo) com bônus reduzido. */
export function specialLuck(roll: number): number {
  const t = DICE_SIDES > 1 ? (roll - 1) / (DICE_SIDES - 1) : 1
  const m = LUCK_LO + (LUCK_HI - LUCK_LO) * t
  return roll >= DICE_SIDES ? m * SPECIAL_CRIT_MULT : m
}

export interface SpecialEffect {
  /** multiplicador de dano RECEBIDO pelo próprio (escamas) — <1 mitiga */
  selfDmgTaken?: { mult: number; turns: number }
  /** multiplicador de dano CAUSADO pelo próprio (foco/uivo) — >1 amplifica */
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
  dmgMult?: number
  pierce?: number
  hits?: number
  dot?: { frac: number; turns: number; label: string }
  immobilizeRoll?: number
  heal?: number
  effect?: SpecialEffect
  cost: { mp?: number; stamina?: number }
  cd: number
  desc: string
}

export const TRANSFORMATION_SPECIALS: Record<TransformationType, SpecialDef[]> = {
  dragon: [
    { id: 'dragon_breath', form: 'dragon', name: '🔥 Sopro de Fogo', kind: 'dmg', dmgMult: 1.95, pierce: 0.6, cost: { stamina: 14 }, cd: 2, desc: 'Dano de fogo que fura 60% da armadura' },
    { id: 'dragon_scales', form: 'dragon', name: '🛡️ Escamas Dracônicas', kind: 'util', effect: { selfDmgTaken: { mult: 0.68, turns: 3 } }, cost: { mp: 14 }, cd: 4, desc: '-32% dano recebido por 3 turnos' },
    { id: 'dragon_roar', form: 'dragon', name: '🦅 Rugido Dracônico', kind: 'util', effect: { enemyDmgDealt: { mult: 0.74, turns: 2 } }, cost: { stamina: 10 }, cd: 3, desc: '-26% dano do inimigo por 2 turnos' },
  ],
  wolf: [
    { id: 'pack_hunt', form: 'wolf', name: '🏃 Caçada em Matilha', kind: 'dmg', dmgMult: 0.66, hits: 3, cost: { stamina: 18 }, cd: 3, desc: '3 golpes rápidos' },
    { id: 'bite_bleeding', form: 'wolf', name: '🩸 Mordida Sangrenta', kind: 'dmg', dmgMult: 1.05, pierce: 1, dot: { frac: 0.05, turns: 3, label: 'sangramento' }, cost: { stamina: 12 }, cd: 3, desc: 'Ignora armadura + sangramento (5%/turno, 3t)' },
    { id: 'howl', form: 'wolf', name: '🌙 Uivo Selvagem', kind: 'util', effect: { selfDmgDealt: { mult: 1.15, turns: 3 }, selfEvade: { value: 0.08, turns: 3 } }, cost: { stamina: 14 }, cd: 4, desc: '+15% dano e +8% evasão por 3 turnos' },
  ],
  bear: [
    { id: 'unstoppable_charge', form: 'bear', name: '💥 Investida Imparável', kind: 'dmg', dmgMult: 1.45, pierce: 1, cost: { stamina: 26 }, cd: 4, desc: 'Ignora TODA a armadura' },
    { id: 'bear_hug', form: 'bear', name: '🤗 Abraço do Urso', kind: 'dmg', dmgMult: 0.95, dot: { frac: 0.06, turns: 2, label: 'esmagamento' }, immobilizeRoll: 11, cost: { stamina: 22 }, cd: 4, desc: 'Dano + esmagamento; imobiliza só com rolagem alta (≥11)' },
    { id: 'intimidating_roar', form: 'bear', name: '😤 Rugido Intimidador', kind: 'util', effect: { enemyDmgDealt: { mult: 0.70, turns: 3 } }, cost: { stamina: 14 }, cd: 4, desc: '-30% dano do inimigo por 3 turnos' },
  ],
  eagle: [
    { id: 'dive_attack', form: 'eagle', name: '💨 Ataque em Mergulho', kind: 'dmg', dmgMult: 1.4, pierce: 0.3, cost: { stamina: 18 }, cd: 3, desc: 'Mergulho preciso (fura 30% da armadura)' },
    { id: 'keen_sight', form: 'eagle', name: '👁️ Visão Aguçada', kind: 'util', effect: { ignoreEvadeNext: true }, cost: { stamina: 10 }, cd: 3, desc: 'Próximo ataque ignora a esquiva' },
    { id: 'aerial_superiority', form: 'eagle', name: '☁️ Superioridade Aérea', kind: 'util', effect: { selfEvade: { value: 0.35, turns: 1 } }, cost: { mp: 14 }, cd: 4, desc: '+35% evasão por 1 turno' },
  ],
  seventh_sense: [
    { id: 'cosmo_burst', form: 'seventh_sense', name: '🌌 Explosão de Cosmo', kind: 'dmg', dmgMult: 2.0, cost: { mp: 10, stamina: 8 }, cd: 2, desc: 'Explosão de cosmo concentrada' },
    { id: 'cosmo_focus', form: 'seventh_sense', name: '🧘 Foco do Cosmo', kind: 'util', effect: { selfDmgDealt: { mult: 1.35, turns: 3 } }, cost: { mp: 12 }, cd: 4, desc: '+35% dano por 3 turnos' },
    { id: 'precognitive_counter', form: 'seventh_sense', name: '👁️ Contra-ataque Precognitivo', kind: 'util', effect: { selfEvade: { value: 0.6, turns: 1 }, counterNext: true }, cost: { stamina: 12 }, cd: 3, desc: 'Esquiva garantida + contra-ataque no próximo golpe' },
  ],
  celestial: [
    { id: 'holy_nova', form: 'celestial', name: '💥 Nova Sagrada', kind: 'dmg', dmgMult: 1.85, pierce: 0.5, cost: { mp: 16 }, cd: 2, desc: 'Explosão de luz que fura 50% da armadura' },
    { id: 'restoring_blessing', form: 'celestial', name: '🕊️ Bênção Restauradora', kind: 'util', heal: 0.25, cost: { mp: 18 }, cd: 3, desc: 'Cura 25% do HP máximo' },
    { id: 'arcane_torrent', form: 'celestial', name: '🔷 Torrente Arcana', kind: 'util', effect: { amplifyNext: 1.6 }, cost: { stamina: 10 }, cd: 3, desc: 'Próximo especial de dano ×1.6' },
  ],
}

export function getFormSpecials(form: TransformationType | null | undefined): SpecialDef[] {
  return form ? (TRANSFORMATION_SPECIALS[form] || []) : []
}

export interface SpecialHit { damage: number; crit: boolean; maxRoll: number }

/**
 * Resolve o dano de um especial (direto). `power` = poder transformado já com o
 * multiplicador da habilidade NÃO aplicado (aplicamos dmgMult aqui). `amplify` =
 * Torrente Arcana (1.6 ou 1). `outMult`/`inMult` = buffs/debuffs de dano ativos.
 */
export function resolveSpecialHit(
  def: SpecialDef,
  power: number,
  target: Pick<Levers, 'armor' | 'K'>,
  opts: { amplify?: number; outMult?: number; inMult?: number; rng?: () => number } = {},
): SpecialHit {
  const rng = opts.rng ?? Math.random
  const hits = def.hits || 1
  let total = 0, crit = false, maxRoll = 0
  for (let h = 0; h < hits; h++) {
    const roll = 1 + Math.floor(rng() * DICE_SIDES)
    if (roll > maxRoll) maxRoll = roll
    if (roll >= DICE_SIDES) crit = true
    const eff = power * (def.dmgMult || 1) * (opts.amplify ?? 1)
    const armor = Math.max(0, target.armor * (1 - (def.pierce || 0)))
    let dmg = eff * specialLuck(roll) * (1 - damageReduction(armor, target.K))
    dmg = dmg * (opts.outMult ?? 1) * (opts.inMult ?? 1)
    total += Math.max(1, Math.round(dmg))
  }
  return { damage: total, crit, maxRoll }
}
