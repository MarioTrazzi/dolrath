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

/** Desgaste de uma peça para `kills` abates (chefe dobra). */
export function wearFor(slot: string, kills: number, boss: boolean): number {
  const perKill = slot === 'WEAPON' ? WEAR_WEAPON_PER_KILL : WEAR_GEAR_PER_KILL
  return perKill * kills * (boss ? WEAR_BOSS_MULT : 1)
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
export function wearForPvpFight(slot: string): number {
  return wearFor(slot, PVP_FIGHT_WEAR_KILLS, false)
}
