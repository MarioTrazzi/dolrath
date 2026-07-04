// ⚔️ Desgaste de equipamento por uso (masmorra).
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
