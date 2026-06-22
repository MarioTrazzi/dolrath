/**
 * ⚔️ MODELO DE COMBATE ENXUTO — fonte única da verdade (PvP + PvE)
 *
 * Validado por simulação massiva (scripts/progression-sim.js + lean-combat-sim.js):
 *   • gear igual → spread de classe ≤2.7% em TODOS os níveis (1–50);
 *   • gear −25% → o azarão ainda vence ~30-39% (a sorte do dado cobre o gap).
 *
 * 🎯 Princípios:
 *  1. IDENTIDADE DE CLASSE = FORMA fixa (PROFILE): 4 levers — poder, armadura, HP, evasão.
 *  2. PODER (S) cresce com NÍVEL + GEAR: levers = PROFILE × S, K = K50 × S.
 *     Como tudo escala por S, o combate em qualquer nível é uma versão escalada do nv50
 *     → o equilíbrio do nv50 vale em todos os níveis, por construção.
 *  3. Dano = poder × SORTE_DO_DADO (banda multiplicativa; crítico = rolagem máxima).
 *  4. Mitigação PROPORCIONAL unificada: DR = armadura/(armadura+K). Sem imunidade, escala
 *     pra sempre. Físico/mágico é flavor narrativo (mesma armadura).
 *  5. Defesa: Esquiva (chance = evasão da classe, custa stamina, ZERA o golpe) e
 *     Bloqueio (DEF, redução garantida — amplifica a armadura efetiva no golpe).
 *
 * O documento de design vive em docs/combate-ataque-por-arma.md.
 * ⚠️ Espelhado em server/combatModel.js (o socket é CommonJS e não importa TS) — manter em sincronia.
 */

export type CombatClass = 'warrior' | 'rogue' | 'mage' | 'monk'

export interface ClassProfile {
  /** dano-base por golpe (antes da sorte) no nv50 BiS */
  power: number
  /** valor de armadura para a mitigação proporcional no nv50 BiS */
  armor: number
  /** pontos de vida no nv50 BiS */
  hp: number
  /** chance de esquiva (0..1) — invariante de escala (não cresce com S) */
  evade: number
}

export interface Levers {
  power: number
  armor: number
  hp: number
  evade: number
  /** constante de mitigação já escalada por S (DR = armor/(armor+K)) */
  K: number
  /** o multiplicador de poder S = wL·(nível/50) + wG·tier_gear */
  scale: number
}

// === FORMA DAS CLASSES (perfis equilibrados do nv50 BiS lendário IV) ===
export const PROFILE: Record<CombatClass, ClassProfile> = {
  warrior: { power: 102, armor: 160, hp: 438, evade: 0.05 }, // tanque
  rogue: { power: 160, armor: 55, hp: 282, evade: 0.30 },    // glass cannon físico
  mage: { power: 175, armor: 50, hp: 312, evade: 0.18 },     // glass cannon mágico
  monk: { power: 132, armor: 120, hp: 316, evade: 0.22 },    // bruiser sustentado
}

// === CONSTANTES DO DADO E DA MITIGAÇÃO ===
export const DICE_SIDES = 12
export const LUCK_LO = 0.55   // multiplicador de dano na pior rolagem
export const LUCK_HI = 1.75   // multiplicador na melhor rolagem
export const CRIT_MULT = 1.6  // bônus extra ao rolar o máximo (crítico)
export const K50 = 220        // constante de mitigação no nv50 (escala com S)

// === ESCALA DE PODER (S) ===
export const WEIGHT_LEVEL = 0.5 // quanto do poder vem do NÍVEL
export const WEIGHT_GEAR = 0.5  // quanto vem do GEAR (loop de progressão)
export const GEAR_FLOOR = 0.25  // gear mínimo presumido (ninguém está 100% pelado)
export const MAX_LEVEL_REF = 50 // nível de referência onde S(level)=1 com BiS

// === DEFESA ===
export const DODGE_STAMINA_COST = 3
export const BLOCK_ARMOR_MULT = 2.5 // bloqueio amplifica a armadura efetiva no golpe

// 🐉 Transformação = buff temporário SIMÉTRICO: equivale a subir o poder de escala S
// por um fator único (poder/armadura/hp/K sobem juntos; evasão é invariante de escala).
// Por ser simétrico entre classes, o equilíbrio se preserva por construção.
export const TRANSFORM_SCALE = 1.25

// === ATAQUES ===
// O `power` equilibrado da classe = o ATAQUE DA ARMA. Básico é o fallback barato;
// ESPECIAL (burst) só com a TRANSFORMAÇÃO ativa — a transformação é o gate (custo/
// duração/cooldown próprios, ~simétricos entre raças), então não precisa de recurso
// uniforme novo. Como tudo é simétrico entre classes, o equilíbrio se preserva
// (validado: 3 ataques simétricos mantêm spread ≤2.4%).
//   • basic/weapon diferem por STAMINA (básico barato, arma um pouco mais);
//   • special requer estar transformado.
export type AttackType = 'basic' | 'weapon' | 'special'
export const ATTACKS: Record<AttackType, { powerMult: number; stamina: number; requiresTransform: boolean; label: string }> = {
  basic: { powerMult: 0.72, stamina: 1, requiresTransform: false, label: 'Ataque Básico' },
  weapon: { powerMult: 1.0, stamina: 2, requiresTransform: false, label: 'Ataque da Arma' },
  special: { powerMult: 1.5, stamina: 3, requiresTransform: true, label: 'Especial' },
}

/** Poder efetivo de um ataque (base da classe × multiplicador do tipo). */
export function attackPower(basePower: number, type: AttackType): number {
  return basePower * (ATTACKS[type]?.powerMult ?? 1)
}

/** Escolha gulosa de ataque (para bots/IA): especial se transformado, senão a arma. */
export function chooseAttack(opts: { transformed?: boolean; stamina?: number } = {}): AttackType {
  const stam = opts.stamina ?? 99
  if (opts.transformed && stam >= ATTACKS.special.stamina) return 'special'
  if (stam >= ATTACKS.weapon.stamina) return 'weapon'
  return 'basic'
}

/**
 * tier_do_gear ∈ [0,1]: 1 = BiS lendário IV. Use deriveGearTier() para obter do equipamento;
 * aqui aplicamos o piso mínimo. Mantido separado para o passo 2 (catálogo) preencher.
 */
export function clampGearTier(tier: number): number {
  if (Number.isNaN(tier)) return GEAR_FLOOR
  return Math.max(GEAR_FLOOR, Math.min(1, tier))
}

// === TIER DO GEAR (equipamento → [0,1], BiS lendário IV = 1) ===
// Qualidade de uma peça = peso_da_raridade × fator_de_aprimoramento (normalizado p/ IV=1).
// gearTier = soma das qualidades / NOMINAL_SLOTS (peças faltando puxam pra baixo).

export const RARITY_WEIGHT: Record<string, number> = {
  COMMON: 0.25, UNCOMMON: 0.4, RARE: 0.58, EPIC: 0.78, LEGENDARY: 1.0,
}
/** Slots típicos de um set completo (denominador) — full lendário IV ⇒ tier ~1. */
export const NOMINAL_SLOTS = 9

/**
 * Fator de aprimoramento p/ TIERING ∈ [~0.45, 1], normalizado p/ IV (TET, nível 19) = 1.
 * Espelha a forma da curva de enhancementSystem (+5%/nível até +15; I..V).
 */
export function enhanceTierFactor(enhancementLevel: number): number {
  const lvl = Math.max(0, Math.min(20, Math.floor(enhancementLevel || 0)))
  const TIER: Record<number, number> = { 16: 1.9, 17: 2.0, 18: 2.1, 19: 2.2, 20: 2.5 }
  const mult = lvl <= 15 ? 1 + lvl * 0.05 : (TIER[lvl] ?? 2.2)
  return mult / 2.2 // IV (19) ⇒ 1.0
}

export interface EquippedRef {
  rarity?: string | null
  enhancementLevel?: number | null
}

/** Deriva o tier do gear (0..1) a partir das peças equipadas. */
export function deriveGearTier(equipped: EquippedRef[] | null | undefined): number {
  if (!equipped || equipped.length === 0) return 0
  let sum = 0
  for (const eq of equipped) {
    const w = RARITY_WEIGHT[(eq.rarity || '').toUpperCase()] ?? 0.25
    sum += w * enhanceTierFactor(eq.enhancementLevel ?? 0)
  }
  return Math.min(1, sum / NOMINAL_SLOTS)
}

/** S = wL·(nível/50) + wG·tier_gear  (o multiplicador de poder). */
export function powerScale(level: number, gearTier: number): number {
  const lvl = Math.max(0, level) / MAX_LEVEL_REF
  return WEIGHT_LEVEL * lvl + WEIGHT_GEAR * clampGearTier(gearTier)
}

/** Deriva os 4 levers efetivos de combate da classe/nível/gear. */
export function computeLevers(cls: CombatClass, level: number, gearTier: number): Levers {
  const p = PROFILE[cls] ?? PROFILE.warrior
  const S = powerScale(level, gearTier)
  return {
    power: p.power * S,
    armor: p.armor * S,
    hp: p.hp * S,
    evade: p.evade, // % é invariante de escala
    K: K50 * S,
    scale: S,
  }
}

/**
 * Aplica o buff de transformação aos levers (escala simétrica). Retorna NOVOS levers;
 * o caller deve guardar os levers-base para reverter com revertTransformLevers().
 */
export function transformLevers(levers: Levers, scale: number = TRANSFORM_SCALE): Levers {
  return {
    power: levers.power * scale,
    armor: levers.armor * scale,
    hp: levers.hp * scale,
    evade: levers.evade, // % é invariante de escala
    K: levers.K * scale,
    scale: levers.scale * scale,
  }
}

/** Reverte o buff (divide pelo fator). Use com o MESMO scale aplicado. */
export function revertTransformLevers(levers: Levers, scale: number = TRANSFORM_SCALE): Levers {
  return {
    power: levers.power / scale,
    armor: levers.armor / scale,
    hp: levers.hp / scale,
    evade: levers.evade,
    K: levers.K / scale,
    scale: levers.scale / scale,
  }
}

/** Mapeia uma rolagem (1..DICE_SIDES) para o multiplicador de sorte. Máximo = crítico. */
export function luckOf(roll: number): number {
  const t = DICE_SIDES > 1 ? (roll - 1) / (DICE_SIDES - 1) : 1
  let mult = LUCK_LO + (LUCK_HI - LUCK_LO) * t
  if (roll >= DICE_SIDES) mult *= CRIT_MULT
  return mult
}

/** Rola o dado de combate. rng() em [0,1) injetável para testes/sim determinístico. */
export function rollDie(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * DICE_SIDES)
}

/** Redução de dano proporcional (0..1) de uma armadura contra a constante K. */
export function damageReduction(armor: number, K: number): number {
  const a = Math.max(0, armor)
  return a / (a + K)
}

export interface HitResult {
  /** dano final aplicado (≥1 se acertou; 0 se esquivou) */
  damage: number
  /** rolagem do dado (1..DICE_SIDES) */
  roll: number
  /** crítico (rolou o máximo) */
  crit: boolean
  /** esquivou (golpe zerado) */
  dodged: boolean
  /** bloqueou (mitigação reforçada) */
  blocked: boolean
}

export interface ResolveOpts {
  /** reação do defensor */
  defense?: 'none' | 'dodge' | 'block'
  /** rng injetável (para sim/testes) */
  rng?: () => number
  /** rolagem forçada (pula o dado) */
  forcedRoll?: number
  /** sucesso de esquiva já decidido externamente (pula o sorteio) */
  dodgeSucceeded?: boolean
}

/**
 * Resolve UM golpe: atacante (power) vs defensor (armor, K, evade).
 * - dano = power × sorte × (1 − DR);  bloqueio amplifica a armadura (DR maior).
 * - esquiva: chance = evade do defensor → zera o golpe.
 */
export function resolveHit(
  attacker: { power: number },
  defender: { armor: number; K: number; evade: number },
  opts: ResolveOpts = {},
): HitResult {
  const rng = opts.rng ?? Math.random
  const roll = opts.forcedRoll ?? rollDie(rng)
  const crit = roll >= DICE_SIDES

  // Esquiva: zera o golpe.
  if (opts.defense === 'dodge') {
    const dodged = opts.dodgeSucceeded ?? rng() < defender.evade
    if (dodged) return { damage: 0, roll, crit, dodged: true, blocked: false }
  }

  const block = opts.defense === 'block'
  const effArmor = block ? defender.armor * BLOCK_ARMOR_MULT : defender.armor
  const raw = attacker.power * luckOf(roll)
  const damage = Math.max(1, Math.round(raw * (1 - damageReduction(effArmor, defender.K))))
  return { damage, roll, crit, dodged: false, blocked: block }
}
