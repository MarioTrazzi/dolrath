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
  warrior: { power: 105, armor: 160, hp: 438, evade: 0.05 }, // tanque (power +3 p/ ofensiva)
  rogue: { power: 145, armor: 55, hp: 282, evade: 0.30 },    // glass cannon físico (parte do poder migrou p/ escala de AGI)
  mage: { power: 175, armor: 57, hp: 332, evade: 0.18 },     // glass cannon mágico (armor/hp ↑ p/ sobreviver — mago fraco crônico)
  monk: { power: 129, armor: 117, hp: 311, evade: 0.22 },    // bruiser sustentado (levemente esfriado)
}

// === CONSTANTES DO DADO E DA MITIGAÇÃO ===
export const DICE_SIDES = 12
export const LUCK_LO = 0.55   // multiplicador de dano na pior rolagem
export const LUCK_HI = 1.75   // multiplicador na melhor rolagem
export const CRIT_MULT = 1.6  // bônus extra ao rolar o máximo (crítico)
export const K50 = 220        // constante de mitigação no nv50 (escala com S)

// === ESCALA DE PODER (S) ===
// Peso puxado pro GEAR (0.4/0.6) + piso baixo (0.10): o gear é a progressão que se SENTE.
// Antes (0.5/0.5 + piso 0.25) todo gear abaixo de incomum+16 caía no piso e valia = pelado.
// Com o piso baixo, cada raridade/+N acima do pelado já mexe no poder; o peso maior amplia
// o salto pelado→PRI (~1.2× → ~1.5-1.6×). O boss (BOSS_HP_MULT) é re-tunado no sim p/ manter
// o gate de nível+gear. Ver docs/combate + scripts/dungeon-difficulty-sim.js.
export const WEIGHT_LEVEL = 0.4 // quanto do poder vem do NÍVEL
export const WEIGHT_GEAR = 0.6  // quanto vem do GEAR (loop de progressão)
export const GEAR_FLOOR = 0.10  // gear mínimo presumido (ninguém está 100% pelado)
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
  basic: { powerMult: 0.72, stamina: 1, requiresTransform: false, label: 'Golpe' },
  weapon: { powerMult: 1.0, stamina: 2, requiresTransform: false, label: 'Ataque de Classe' },
  special: { powerMult: 1.5, stamina: 3, requiresTransform: true, label: 'Especial' },
}

// 🗡️ Nome do ATAQUE DE CLASSE (o `weapon`, d8) por classe — identidade visível no botão.
// Fallback genérico p/ monstro/classe desconhecida.
export const CLASS_ATTACK_NAME: Record<CombatClass, string> = {
  warrior: 'Investida Pesada',
  rogue: 'Ataque Furtivo',
  mage: 'Bola de Fogo',
  monk: 'Golpe Triplo',
}
export function classAttackName(raw: string | null | undefined): string {
  const c = normalizeCombatClass(raw)
  return (c && CLASS_ATTACK_NAME[c]) || 'Ataque de Classe'
}

// 🐍 Golpe SECUNDÁRIO de monstro — narrado por nome, rola com chance própria (independente
// do basic/weapon/special) a cada turno do monstro. 'poison'/'bleed' aplicam um status no
// jogador (poison é flat e PERMANENTE até Antídoto; bleed é % do HP máx por N turnos, como
// o DoT que as transformações já usam). 'stun' faz o jogador perder o turno seguinte.
// 'damage' só amplifica o golpe normal (sem status) — identidade de "bicho bruto".
export type MonsterEffectKind = 'poison' | 'bleed' | 'stun' | 'damage'
export interface MonsterSpecialEffect {
  name: string
  effect: MonsterEffectKind
  /** chance de proc por turno do monstro (0..1) */
  chance: number
  poisonDmg?: number      // poison: HP fixo perdido por turno do jogador
  bleedFrac?: number      // bleed: fração do HP MÁX do jogador por turno
  bleedTurns?: number
  stunTurns?: number      // stun: turnos do jogador perdidos
  dmgMult?: number        // damage: multiplicador extra sobre o dano do golpe
}
// Padrão por masmorra: 1 monstro de cada efeito (bleed/poison/damage/stun) + chefe com
// efeito + dmgMult. poisonDmg cresce com o tier (o HP do jogador também cresce);
// bleedFrac é % do HP máx, então escala sozinho — só um leve aumento nos tiers altos.
export const MONSTER_SPECIAL_EFFECTS: Record<string, MonsterSpecialEffect> = {
  // 🌲 Floresta Sombria
  'Lobo Faminto': { name: 'Mordida Selvagem', effect: 'bleed', chance: 0.3, bleedFrac: 0.04, bleedTurns: 3 },
  'Aranha Gigante': { name: 'Presas Envenenadas', effect: 'poison', chance: 0.3, poisonDmg: 4 },
  'Javali Furioso': { name: 'Presas Vorazes', effect: 'damage', chance: 0.3, dmgMult: 1.5 },
  'Ent Corrompido': { name: 'Raízes Rasteiras', effect: 'stun', chance: 0.3, stunTurns: 1 },
  'Anciã da Mata': { name: 'Abraço da Floresta', effect: 'poison', chance: 0.35, poisonDmg: 4, dmgMult: 1.25 },
  // 💎 Caverna de Cristal
  'Morcego Sombrio': { name: 'Mordida Sanguessuga', effect: 'bleed', chance: 0.3, bleedFrac: 0.04, bleedTurns: 3 },
  'Goblin Minerador': { name: 'Golpe de Picareta', effect: 'damage', chance: 0.3, dmgMult: 1.5 },
  'Slime de Cristal': { name: 'Gosma Corrosiva', effect: 'poison', chance: 0.3, poisonDmg: 5 },
  'Golem de Pedra': { name: 'Esmagamento Sísmico', effect: 'stun', chance: 0.3, stunTurns: 1 },
  'Wyrm Cristalino': { name: 'Estilhaços Cristalinos', effect: 'bleed', chance: 0.35, bleedFrac: 0.05, bleedTurns: 3, dmgMult: 1.25 },
  // 🐸 Pântano Maldito
  'Sapo Venenoso': { name: 'Cuspe Tóxico', effect: 'poison', chance: 0.3, poisonDmg: 6 },
  'Serpente do Lodo': { name: 'Bote Dilacerante', effect: 'bleed', chance: 0.3, bleedFrac: 0.05, bleedTurns: 3 },
  'Bruxa do Brejo': { name: 'Feitiço Paralisante', effect: 'stun', chance: 0.3, stunTurns: 1 },
  'Crocodilo Ancião': { name: 'Mandíbula Esmagadora', effect: 'damage', chance: 0.3, dmgMult: 1.5 },
  'Hidra do Pântano': { name: 'Hálito Pestilento', effect: 'poison', chance: 0.35, poisonDmg: 7, dmgMult: 1.25 },
  // 🏛️ Ruínas Arcanas
  'Esqueleto Guerreiro': { name: 'Lâmina Enferrujada', effect: 'bleed', chance: 0.3, bleedFrac: 0.05, bleedTurns: 3 },
  'Espectro Errante': { name: 'Toque Gélido', effect: 'stun', chance: 0.3, stunTurns: 1 },
  'Múmia Real': { name: 'Maldição da Podridão', effect: 'poison', chance: 0.3, poisonDmg: 7 },
  'Gárgula de Obsidiana': { name: 'Mergulho Devastador', effect: 'damage', chance: 0.3, dmgMult: 1.5 },
  // Stun em chefe é o proc mais punitivo — chance um pouco menor que a dos outros chefes.
  'Lich Imperador': { name: 'Olhar da Morte', effect: 'stun', chance: 0.3, stunTurns: 1, dmgMult: 1.25 },
}
export function monsterSpecialEffect(name: string): MonsterSpecialEffect | undefined {
  const direct = MONSTER_SPECIAL_EFFECTS[name]
  if (direct) return direct
  // O boss escalado vem renomeado ("👑 Anciã da Mata • Guardiã Corrompida") —
  // sem normalizar, o efeito especial dele nunca dispararia.
  const base = name.replace(/^👑\s*/, '').split('•')[0].trim()
  return MONSTER_SPECIAL_EFFECTS[base]
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

// Peso do atributo no PODER, por classe (identidade). Cada classe rende cheio (1.0)
// no seu atributo-chave e menos no "errado": Guerreiro=força (INT off → 0.8),
// Mago=mente (STR off → 0.8), Monge híbrido equilibrado (1.0/1.0). O Ladino não vive
// de força nem mente (0.8/0.8) e converte AGI em DANO de verdade (1.6 → ~0.48/pt vs
// 0.30) — dá sentido a investir em AGI, que antes quase só virava evasão.
export const ATTR_POWER_WEIGHT: Record<CombatClass, { str: number; int: number; agi: number }> = {
  warrior: { str: 1.0, int: 0.8, agi: 1.0 },
  mage:    { str: 0.8, int: 1.0, agi: 1.0 },
  monk:    { str: 1.0, int: 1.0, agi: 1.0 },
  rogue:   { str: 0.8, int: 0.8, agi: 1.6 },
}
const NEUTRAL_WEIGHT = { str: 1.0, int: 1.0, agi: 1.0 }

/**
 * Aplica o tilt dos atributos distribuídos sobre os levers (no-op se attrs ausente).
 * `cls` pondera o poder por classe (ATTR_POWER_WEIGHT); ausente → pesos neutros.
 */
export function applyAttrTilt(levers: Levers, attrs?: Partial<AttrPoints> | null, cls?: CombatClass): Levers {
  if (!attrs) return levers
  const str = Math.max(0, Number(attrs.str) || 0)
  const agi = Math.max(0, Number(attrs.agi) || 0)
  const int = Math.max(0, Number(attrs.int) || 0)
  const def = Math.max(0, Number(attrs.def) || 0)
  const t = ATTR_TILT
  const w = (cls && ATTR_POWER_WEIGHT[cls]) || NEUTRAL_WEIGHT
  return {
    ...levers,
    power: levers.power + (str * w.str + int * w.int) * t.power + agi * w.agi * t.powerAgi,
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
  return applyAttrTilt(base, attrs, cls)
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

/** Mapeia uma rolagem (1..sides) para o multiplicador de sorte. Máximo = crítico. */
export function luckOf(roll: number, sides: number = DICE_SIDES): number {
  const t = sides > 1 ? (roll - 1) / (sides - 1) : 1
  let mult = LUCK_LO + (LUCK_HI - LUCK_LO) * t
  if (roll >= sides) mult *= CRIT_MULT
  return mult
}

/** Rola o dado de combate. rng() em [0,1) injetável para testes/sim determinístico. */
export function rollDie(rng: () => number = Math.random, sides: number = DICE_SIDES): number {
  return 1 + Math.floor(rng() * sides)
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
  /** lados do dado do ataque (PvP: Golpe d6 / Ataque de Classe d8 / Especial d20). Default d12. */
  sides?: number
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
  const sides = opts.sides ?? DICE_SIDES
  const roll = opts.forcedRoll ?? rollDie(rng, sides)
  const crit = roll >= sides

  // Esquiva: zera o golpe.
  if (opts.defense === 'dodge') {
    const dodged = opts.dodgeSucceeded ?? rng() < defender.evade
    if (dodged) return { damage: 0, roll, crit, dodged: true, blocked: false }
  }

  const block = opts.defense === 'block'
  const effArmor = block ? defender.armor * BLOCK_ARMOR_MULT : defender.armor
  const raw = attacker.power * luckOf(roll, sides)
  const damage = Math.max(1, Math.round(raw * (1 - damageReduction(effArmor, defender.K))))
  return { damage, roll, crit, dodged: false, blocked: block }
}

// ============================================================
// DISPUTA DE DADOS (PvE — masmorra). Atacante e defensor rolam o MESMO dado do ataque
// (PVE_DIE: básico d8 / arma d12 / especial d20). margem = na − (nd + edge), na,nd
// normalizados (0,1) e edge = avoid_da_defesa − vantagem_de_escala·ACC_W:
//   • esquiva: ESPELHO do crítico. margem ≤ −CRIT_MARGIN → esquiva COMPLETA (dano 0);
//     qualquer outra margem = dano normal (vermelho), sem tier de "raspão".
//   • bloqueio: margem < 0 → golpe aparado (mitigado); margem ≥ 0 → dano × (1−DR).
//   • margem ≥ CRIT_MARGIN = crítico (amplifica). Crit e esquiva são as duas pontas simétricas.
// O dado é só um PLUS no dano (sorte), nunca decide sozinho hit/miss. Esquiva é
// 100% uma %-de-stat (sem disputa de margem) — EXCETO que rolar o número MÁXIMO do
// dado garante o evento especial (crítico pro atacante, esquiva total pro defensor),
// independente de stat: o espelho exato um do outro.
//   • jogador ataca o monstro → reusa resolveHit/luckOf (igual ao PvP): o jogador rola,
//     o monstro esquiva por % pura (monstro nunca rola nada).
//   • monstro ataca o jogador → resolveMonsterHit (abaixo): o monstro NÃO rola (dano sai
//     direto dos stats dele, com uma variação pequena sem dado); o JOGADOR, defendendo,
//     ainda rola — número máximo = esquiva total garantida, senão esquiva por %.
// ============================================================
export const PVE_DIE: Record<AttackType, number> = { basic: 6, weapon: 8, special: 20 }
// Variação do dano do monstro (±12%, SEM dado — Math.random() puro): mantém o golpe do
// monstro "vivo" mesmo sendo determinístico em essência (sem luck/crit, ele não rola).
export const MONSTER_DMG_VARIANCE = 0.12

export interface MonsterHitOpts {
  /** poder do monstro já × ATTACKS[kind].powerMult */
  power: number
  /** dado de DEFESA do jogador (PVE_DIE[kind] do golpe recebido) */
  sides: number
  defender: { armor: number; K: number; evade: number }
  rng?: () => number
  /** rolagem de defesa forçada (testes/sim) */
  forcedDefRoll?: number
}
export interface MonsterHitResult {
  damage: number
  /** esquiva total: número máximo do dado (garantido) OU sucesso na %-de-evasão */
  avoided: boolean
  /** o monstro nunca crita (não rola dado) — mantido só pra compatibilidade de shape */
  crit: false
  /** rolagem de DEFESA do jogador (o monstro não rola) */
  defRoll: number
  /** true quando a esquiva veio do número máximo do dado (independente de stat) */
  natMax: boolean
}

/** Resolve UM golpe do MONSTRO no jogador: monstro não rola (dano vem dos stats, com
 *  variação pequena sem dado); o jogador defende — número máximo = esquiva total
 *  garantida, senão %-de-evasão pura. */
export function resolveMonsterHit(opts: MonsterHitOpts): MonsterHitResult {
  const rng = opts.rng ?? Math.random
  const sides = opts.sides || DICE_SIDES
  const defRoll = opts.forcedDefRoll ?? rollDie(rng, sides)
  const natMax = defRoll >= sides
  const avoided = natMax || rng() < (opts.defender.evade || 0)
  if (avoided) return { damage: 0, avoided: true, crit: false, defRoll, natMax }
  const variance = 1 + (rng() * 2 - 1) * MONSTER_DMG_VARIANCE
  const raw = opts.power * variance
  const damage = Math.max(1, Math.round(raw * (1 - damageReduction(opts.defender.armor, opts.defender.K))))
  return { damage, avoided: false, crit: false, defRoll, natMax }
}
