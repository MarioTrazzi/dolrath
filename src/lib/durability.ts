// ⚔️ Desgaste de equipamento por uso (masmorra E arena).
//
// Cada ABATE consome durabilidade de todas as peças equipadas — a arma trabalha
// mais e desgasta mais rápido. Chefe castiga o dobro. Em 0 a peça fica QUEBRADA:
// continua equipada, mas não soma NENHUM bônus até ser reparada no ferreiro.
//
// Ordem de grandeza (run da Floresta ≈ 12 abates + chefe): arma perde ~28/run
// (quebra em ~3-4 runs), armadura ~14/run (~7 runs) — demanda constante de
// reparo/forja sem sufocar. Sem penalidade extra em derrota/recuo (o loop de
// progressão não pune tentar).

/** Durabilidade perdida pela ARMA por abate. */
export const WEAR_WEAPON_PER_KILL = 2

/** Durabilidade perdida por cada OUTRA peça (armadura, offhand, acessórios) por abate. */
export const WEAR_GEAR_PER_KILL = 1

/** Multiplicador de desgaste ao abater um CHEFE. */
export const WEAR_BOSS_MULT = 2

/** Peça quebrada não contribui com nada. Payloads antigos sem o campo contam como sãs. */
export function isBroken(eq: { durability?: number | null } | null | undefined): boolean {
  return typeof eq?.durability === 'number' && eq.durability <= 0
}

// 🌱 AMACIAMENTO DO COMEÇO (2026-08-17). O desgaste supõe um jogador que forja
// cópias e tem ouro de sobra; o herói de nível baixo não tem nenhum dos dois, e
// no playtest a conta fechava contra ele — set quebrado, sem ouro, farmando pior
// por estar quebrado. Até `untilLevel` a peça gasta `factor` do normal, subindo
// linear até 100% em `fullLevel`. Não é desconto permanente: é a rampa até o
// jogador ter forja, coleta e caixa para bancar a manutenção.
export const WEAR_SOFTENING = { untilLevel: 10, fullLevel: 20, factor: 0.7 }

/** Multiplicador de desgaste pelo nível (1 = sem amaciamento). */
export function wearLevelMult(level?: number | null): number {
  if (typeof level !== 'number' || !Number.isFinite(level)) return 1
  const { untilLevel, fullLevel, factor } = WEAR_SOFTENING
  if (level <= untilLevel) return factor
  if (level >= fullLevel) return 1
  const t = (level - untilLevel) / (fullLevel - untilLevel)
  return factor + (1 - factor) * t
}

/**
 * Desgaste de uma peça para `kills` abates (chefe dobra).
 * `level` liga o amaciamento do começo; omitido = desgaste cheio (callers
 * legados e simulações que querem a conta crua).
 */
export function wearFor(slot: string, kills: number, boss: boolean, level?: number | null): number {
  const perKill = slot === 'WEAPON' ? WEAR_WEAPON_PER_KILL : WEAR_GEAR_PER_KILL
  const raw = perKill * kills * (boss ? WEAR_BOSS_MULT : 1)
  return Math.round(raw * wearLevelMult(level))
}

// ⚔️ ARENA (2026-07-15): a luta de PvP também gasta o equipamento — antes a arena era
// a ÚNICA atividade sem custo operacional, e ao virar a fonte de ouro do jogo (ver
// pvpRewards.ts) isso a tornava dominante: o economy-unified-sim mostrava o set +15 em
// 15d p/ quem só lutava vs 18d p/ quem só masmorrava, com a masmorra pagando ~716
// gold/dia de reparo e a arena zero.
//
// PARIDADE POR STAMINA (a régua do design): a masmorra faz ~0.2 abates por ponto de
// stamina, e uma luta custa ~20⚡ → ~4 abates-equivalentes. Com isto o sim converge:
// 18d (só masmorra) / 16d (50-50) / 17d (só arena). Vale p/ os DOIS lutadores — quem
// perde também gastou o equipamento (e não há penalidade extra por perder, igual à
// masmorra, que não pune a derrota).
export const PVP_FIGHT_WEAR_KILLS = 4

/** Desgaste de uma peça por LUTA de arena (equivale a PVP_FIGHT_WEAR_KILLS abates). */
export function wearForPvpFight(slot: string, level?: number | null): number {
  return wearFor(slot, PVP_FIGHT_WEAR_KILLS, false, level)
}

// ⚠️ ALERTA DE DESGASTE (2026-08-19). A tela de combate mostra as peças equipadas, mas
// não o estado delas — dava pra lutar uma run inteira com a arma quebrada sem perceber.
// A durabilidade em número não interessa ao jogador no meio da luta; o que interessa é
// "isso ainda funciona?". Então são só DOIS estados visíveis: quase quebrando e quebrado.
/** Abaixo (ou igual) disto a peça entra em alerta de "quase quebrando". */
export const LOW_DURABILITY = 15

/** Peça ainda funcional, mas prestes a quebrar (mesmo limiar do aviso da masmorra). */
export function isLowDurability(eq: { durability?: number | null } | null | undefined): boolean {
  const d = eq?.durability
  return typeof d === 'number' && d > 0 && d <= LOW_DURABILITY
}
