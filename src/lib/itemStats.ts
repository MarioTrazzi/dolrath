// Formatação de stats de itens para exibição (loja, card do item, etc.).
// Mantém os mesmos rótulos em todas as telas.

// Gear dá ATRIBUTOS REAIS (str/agi/int/def/hp/mp) — os antigos stats abstratos
// (bonusDamage/bonusDefense/bonusSpeed) foram convertidos para atributos.
const EQUIP_STAT_LABELS: [string, string][] = [
  ['str', 'STR'],
  ['agi', 'AGI'],
  ['int', 'INT'],
  ['def', 'DEF'],
  ['hp', 'HP'],
  ['mp', 'MP'],
  ['res', 'RES'],
  ['con', 'CON'],
];

/**
 * Formata um valor de stat para exibição: até 1 casa decimal, sem o `.0`
 * supérfluo. Os stats aprimorados são fracionários (2.1, 9.5…) para que cada
 * nível de aprimoramento mexa visivelmente; os base continuam inteiros.
 */
export function formatStatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Retorna os stats de um item como strings prontas para exibir (ex.: "STR: +3").
 * Para consumíveis, mostra os efeitos de restauração.
 */
export function formatItemStats(stats: Record<string, any> | null | undefined, type?: string): string[] {
  if (!stats) return [];

  if (type === 'CONSUMABLE') {
    const out: string[] = [];
    if (stats.staminaRestore) out.push(`Restaura ${stats.staminaRestore} Stamina`);
    if (stats.healthRestore) out.push(`Restaura ${stats.healthRestore} HP`);
    if (stats.manaRestore) out.push(`Restaura ${stats.manaRestore} MP`);
    return out;
  }

  const out: string[] = [];
  for (const [key, label] of EQUIP_STAT_LABELS) {
    const value = stats[key];
    if (typeof value === 'number' && value !== 0) {
      out.push(`${label}: +${formatStatValue(value)}`);
    }
  }
  return out;
}

/**
 * Retorna os stats de um item como pares { label, value } numéricos, na ordem
 * canônica. Usado para montar a comparação "atual → projetado" no diálogo de
 * aprimoramento (ver EnhancementDialog). Não inclui stats zerados.
 */
export function itemStatEntries(
  stats: Record<string, any> | null | undefined,
  type?: string
): { key: string; label: string; value: number }[] {
  if (!stats) return [];

  if (type === 'CONSUMABLE') {
    const out: { key: string; label: string; value: number }[] = [];
    if (stats.staminaRestore) out.push({ key: 'staminaRestore', label: 'Stamina', value: stats.staminaRestore });
    if (stats.healthRestore) out.push({ key: 'healthRestore', label: 'HP', value: stats.healthRestore });
    if (stats.manaRestore) out.push({ key: 'manaRestore', label: 'MP', value: stats.manaRestore });
    return out;
  }

  const out: { key: string; label: string; value: number }[] = [];
  for (const [key, label] of EQUIP_STAT_LABELS) {
    const value = stats[key];
    if (typeof value === 'number' && value !== 0) {
      out.push({ key, label, value });
    }
  }
  return out;
}

/**
 * Compara os stats de um item candidato (ex.: peça no inventário) contra os de
 * outra peça (ex.: a equipada no mesmo slot), já com aprimoramento aplicado nos
 * dois lados pelo chamador. Usado no card do inventário para mostrar "esse item
 * é melhor ou pior que o que já está equipado" antes de trocar.
 */
export function diffItemStats(
  candidateStats: Record<string, any> | null | undefined,
  compareStats: Record<string, any> | null | undefined,
  type?: string
): { key: string; label: string; delta: number }[] {
  const candidate = new Map(itemStatEntries(candidateStats, type).map((e) => [e.key, e.value]));
  const compare = new Map(itemStatEntries(compareStats, type).map((e) => [e.key, e.value]));
  const out: { key: string; label: string; delta: number }[] = [];
  for (const [key, label] of EQUIP_STAT_LABELS) {
    if (!candidate.has(key) && !compare.has(key)) continue;
    const delta = (candidate.get(key) || 0) - (compare.get(key) || 0);
    if (delta !== 0) out.push({ key, label, delta });
  }
  return out;
}
