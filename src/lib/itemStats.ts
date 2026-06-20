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
      out.push(`${label}: +${value}`);
    }
  }
  return out;
}
