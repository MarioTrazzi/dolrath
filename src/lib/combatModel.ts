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

/** Normaliza um nome de classe (PT/EN, livre) para a CombatClass do modelo. null = desconhecida (monstro). */
export function normalizeCombatClass(raw: string | null | undefined): CombatClass | null {
  const c = String(raw || '').toLowerCase().trim()
  if (!c) return null
  if (c === 'warrior' || c.includes('guerr') || c.includes('warri')) return 'warrior'
  if (c === 'rogue' || c.includes('ladin') || c.includes('assass') || c.includes('arqueir') || c.includes('rogue')) return 'rogue'
  if (c === 'mage' || c.includes('mag') || c.includes('feiti')) return 'mage'
  if (c === 'monk' || c.includes('monge') || c.includes('monk')) return 'monk'
  return null
}

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

// === TILT DE ATRIBUTOS (pontos da CRIAÇÃO + de NÍVEL) → ajuste nos levers ===
// Os pontos distribuídos em STR/AGI/INT/DEF ajustam os levers SOBRE o PROFILE.
// PRINCÍPIO DE EQUILÍBRIO: toda classe gasta o MESMO orçamento de pontos (18 na
// criação + 1/nível) e cada ponto vale ~o mesmo em combate (coeficientes calibrados
// no lean-combat-sim p/ que builds "puras" fiquem dentro do spread que o dado cobre).
// Logo a build é uma ESCOLHA de tilt, não uma vantagem de soma → o equilíbrio entre
// classes se preserva. STR/INT → poder (físico/mágico unificado); DEF → armadura+HP;
// AGI → evasão. Magnitude modesta: a curva de poder continua governada por nível+gear.
export interface AttrPoints {
  str: number
  agi: number
  int: number
  def: number
}
// Coeficientes calibrados no lean-combat-sim --build: builds PURAS (67 pts num stat
// só, nv50) ficam em ~45-57% num espelho (spread ~12, dentro do que o dado cobre).
// Builds reais (mistas) equilibram ainda mais. DEF dá DOIS levers (armor+hp), por
// isso seu valor/ponto é baixo; STR/INT dão só poder.
export const ATTR_TILT = {
  power: 0.55,    // por ponto de STR ou INT (poder unificado)
  powerAgi: 0.30, // por ponto de AGI (parte ofensiva do ágil — o resto vira evasão)
  armor: 0.5,     // por ponto de DEF (mitigação)
  hp: 1.3,        // por ponto de DEF (sobrevivência)
  evade: 0.0020,  // por ponto de AGI (chance de esquiva)
  evadeCap: 0.6,  // teto absoluto de evasão já com o tilt
}

/** Aplica o tilt dos atributos distribuídos sobre os levers (no-op se attrs ausente). */
export function applyAttrTilt(levers: Levers, attrs?: Partial<AttrPoints> | null): Levers {
  if (!attrs) return levers
  const str = Math.max(0, Number(attrs.str) || 0)
  const agi = Math.max(0, Number(attrs.agi) || 0)
  const int = Math.max(0, Number(attrs.int) || 0)
  const def = Math.max(0, Number(attrs.def) || 0)
  const t = ATTR_TILT
  return {
    ...levers,
    power: levers.power + (str + int) * t.power + agi * t.powerAgi,
    armor: levers.armor + def * t.armor,
    hp: levers.hp + def * t.hp,
    evade: Math.min(t.evadeCap, levers.evade + agi * t.evade),
  }
}

/**
 * Deriva os 4 levers efetivos de combate da classe/nível/gear.
 * `attrs` (opcional) = pontos distribuídos da criação+nível → tilt simétrico (ver applyAttrTilt).
 */
export function computeLevers(cls: CombatClass, level: number, gearTier: number, attrs?: Partial<AttrPoints> | null): Levers {
  const p = PROFILE[cls] ?? PROFILE.warrior
  const S = powerScale(level, gearTier)
  const base: Levers = {
    power: p.power * S,
    armor: p.armor * S,
    hp: p.hp * S,
    evade: p.evade, // % é invariante de escala
    K: K50 * S,
    scale: S,
  }
  return applyAttrTilt(base, attrs)
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

// ============================================================
// DISPUTA DE DADOS (PvE — masmorra). Atacante e defensor rolam o MESMO dado do ataque
// (PVE_DIE: básico d8 / arma d12 / especial d20). margem = na − (nd + edge), na,nd
// normalizados (0,1) e edge = avoid_da_defesa − vantagem_de_escala·ACC_W:
//   • margem < 0 → defesa vence: esquiva = arranhão (raspão); bloqueio = golpe aparado.
//   • margem ≥ 0 → acerta: dano = poder × mult(margem) × (1−DR); margem ≥ CRIT_MARGIN = crítico.
// A vantagem de ESCALA (gear+nível) entra no ACERTO → gear melhor acerta mais (afia o gate);
// num espelho as escalas se cancelam → luta de igual ~50/50. NÃO mexe no resolveHit do PvP.
// ============================================================
export const PVE_DIE: Record<AttackType, number> = { basic: 8, weapon: 12, special: 20 }
export const PVE_HIT_MIN = 0.6
export const PVE_HIT_SLOPE = 1.5
export const PVE_CRIT_MULT = 1.9
export const PVE_CRIT_MARGIN = 0.5
export const PVE_DODGE_EDGE = 1.0
export const PVE_BLOCK_EDGE = 0.10
export const PVE_ACC_W = 1.6
// Esquiva que VENCE a disputa não zera mais: deixa um arranhão (corte de raspão).
// Fração do poder do golpe aplicada como dano residual (sem mitigação de armadura).
export const PVE_GRAZE_MULT = 0.12

export interface ContestedOpts {
  power: number
  sides: number
  defense: 'dodge' | 'block'
  defender: { armor: number; K: number; evade: number }
  atkScale?: number
  defScale?: number
  /** rolagens forçadas (a UI anima e injeta os dados); senão sorteia */
  atkRoll?: number
  defRoll?: number
  rng?: () => number
}
export interface ContestedResult {
  damage: number
  avoided: boolean
  blocked: boolean
  /** esquiva venceu o dado, mas o golpe ainda pegou de raspão (arranhão) */
  grazed: boolean
  crit: boolean
  margin: number
  roll: number
  defRoll: number
  /** bônus exibível do ATACANTE (vantagem de escala convertida em pontos do dado) */
  atkBonus: number
  /** bônus exibível do DEFENSOR (esquiva/defesa + vantagem de escala) em pontos do dado */
  defBonus: number
}

/** Resolve UM golpe da masmorra pela DISPUTA DE DADOS (ver bloco acima). */
export function contestedOutcome(opts: ContestedOpts): ContestedResult {
  const rng = opts.rng ?? Math.random
  const sides = opts.sides || PVE_DIE.weapon
  const ra = opts.atkRoll ?? 1 + Math.floor(rng() * sides)
  const rd = opts.defRoll ?? 1 + Math.floor(rng() * sides)
  const na = (ra - 0.5) / sides
  const nd = (rd - 0.5) / sides
  const choice = opts.defense === 'dodge' ? 'dodge' : 'block'
  const avoid = choice === 'dodge' ? (opts.defender.evade || 0) * PVE_DODGE_EDGE : PVE_BLOCK_EDGE
  const edge = avoid - ((opts.atkScale || 0) - (opts.defScale || 0)) * PVE_ACC_W
  const margin = na - (nd + edge)
  // Bônus exibíveis (estilo RiPG): converte o `edge` em pontos no mesmo dado. edge>0
  // favorece o defensor (vira bônus dele); edge<0 = vantagem do atacante (bônus dele).
  // Assim a comparação roll+bônus dos dois lados reflete o sinal da margem.
  const E = edge * sides
  const atkBonus = E < 0 ? Math.round(-E) : 0
  const defBonus = E > 0 ? Math.round(E) : 0
  if (margin < 0) {
    if (choice === 'dodge') {
      // Esquiva VENCE, mas não zera: arranhão (corte de raspão), sem mitigação de armadura.
      return { damage: Math.max(1, Math.round(opts.power * PVE_GRAZE_MULT)), avoided: false, blocked: false, grazed: true, crit: false, margin, roll: ra, defRoll: rd, atkBonus, defBonus }
    }
    const dr = damageReduction(opts.defender.armor * BLOCK_ARMOR_MULT, opts.defender.K)
    return { damage: Math.max(1, Math.round(opts.power * 0.15 * (1 - dr))), avoided: false, blocked: true, grazed: false, crit: false, margin, roll: ra, defRoll: rd, atkBonus, defBonus }
  }
  let mult = PVE_HIT_MIN + margin * PVE_HIT_SLOPE
  const crit = margin >= PVE_CRIT_MARGIN
  if (crit) mult = Math.max(mult, PVE_CRIT_MULT)
  const dr = choice === 'block' ? damageReduction(opts.defender.armor * BLOCK_ARMOR_MULT, opts.defender.K) : 0
  return { damage: Math.max(1, Math.round(opts.power * mult * (1 - dr))), avoided: false, blocked: choice === 'block', grazed: false, crit, margin, roll: ra, defRoll: rd, atkBonus, defBonus }
}
