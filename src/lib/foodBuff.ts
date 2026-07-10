// 🍳 Motor do BUFF DE COMIDA — bônus plano de atributo por TEMPO REAL.
//
// Comer um prato da Culinária (stats.foodBuff = { stat, value, durationMin })
// grava Character.activeFood = { name, stat, value, expiresAt } no banco
// (/api/inventory/use-item). Um prato por vez: comer outro SUBSTITUI o ativo
// (modelo "bem alimentado" de MMO). A expiração é lazy — nada de cron: quem lê
// (ficha, masmorra) valida o expiresAt na hora via parseActiveFood().
//
// Onde o bônus entra: nos ATRIBUTOS DISTRIBUÍDOS do modelo enxuto de combate
// (foodBuffAttrBonus soma no `attrs` do computeLevers do combatModel.ts) —
// exatamente como pontos extras temporários de str/agi/int/def. Mais fraco que
// poção de combate (que buffa por turnos DENTRO da luta), porém dura o farm.
//
// Módulo 100% puro (sem prisma) — usado no servidor e no cliente.

export type FoodBuffStat = 'str' | 'agi' | 'int' | 'def' | 'all';

/** Especificação do buff no catálogo do prato (stats.foodBuff). */
export interface FoodBuffSpec {
  stat: FoodBuffStat;
  value: number;
  durationMin: number;
}

/** Buff ativo persistido em Character.activeFood. */
export interface ActiveFoodBuff {
  /** Nome do prato (exibição + histórico). */
  name: string;
  stat: FoodBuffStat;
  value: number;
  /** Instante REAL em que o efeito acaba (ISO 8601). */
  expiresAt: string;
}

const FOOD_BUFF_STATS: FoodBuffStat[] = ['str', 'agi', 'int', 'def', 'all'];

/** Lê o foodBuff dos stats de um item (JsonValue do Prisma/objeto do catálogo). */
export function parseFoodBuffSpec(stats: unknown): FoodBuffSpec | null {
  const fb = (stats as any)?.foodBuff;
  if (!fb || typeof fb !== 'object') return null;
  const stat = fb.stat as FoodBuffStat;
  const value = Number(fb.value);
  const durationMin = Number(fb.durationMin);
  if (!FOOD_BUFF_STATS.includes(stat)) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null;
  return { stat, value, durationMin };
}

/** Cria o buff ativo ao COMER o prato (expiresAt = agora + duração real). */
export function activateFoodBuff(name: string, spec: FoodBuffSpec, now: Date = new Date()): ActiveFoodBuff {
  return {
    name,
    stat: spec.stat,
    value: spec.value,
    expiresAt: new Date(now.getTime() + spec.durationMin * 60_000).toISOString(),
  };
}

/**
 * Valida o Character.activeFood persistido: shape correto E ainda vigente.
 * Retorna null para JSON inválido, campos fora do contrato ou buff EXPIRADO —
 * a expiração é lazy, então todo leitor passa por aqui.
 */
export function parseActiveFood(json: unknown, now: Date = new Date()): ActiveFoodBuff | null {
  const f = json as any;
  if (!f || typeof f !== 'object') return null;
  if (typeof f.name !== 'string' || !FOOD_BUFF_STATS.includes(f.stat)) return null;
  const value = Number(f.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  const expires = Date.parse(f.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return null;
  return { name: f.name, stat: f.stat, value, expiresAt: new Date(expires).toISOString() };
}

/** Bônus do buff nos atributos distribuídos ('all' = value em cada um). */
export function foodBuffAttrBonus(
  buff: ActiveFoodBuff | null | undefined,
): { str: number; agi: number; int: number; def: number } {
  const bonus = { str: 0, agi: 0, int: 0, def: 0 };
  if (!buff) return bonus;
  if (buff.stat === 'all') {
    bonus.str = bonus.agi = bonus.int = bonus.def = buff.value;
  } else {
    bonus[buff.stat] = buff.value;
  }
  return bonus;
}

/** Minutos restantes do buff (teto; 0 se expirado). */
export function foodBuffRemainingMin(buff: ActiveFoodBuff, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((Date.parse(buff.expiresAt) - now.getTime()) / 60_000));
}

const STAT_LABEL: Record<FoodBuffStat, string> = {
  str: 'STR',
  agi: 'AGI',
  int: 'INT',
  def: 'DEF',
  all: 'todos os atributos',
};

/** Rótulo curto do efeito: "+2 STR" / "+1 em todos os atributos". */
export function foodBuffLabel(buff: { stat: FoodBuffStat; value: number }): string {
  return buff.stat === 'all'
    ? `+${buff.value} em ${STAT_LABEL.all}`
    : `+${buff.value} ${STAT_LABEL[buff.stat]}`;
}

/** Descrição da spec do catálogo p/ a UI da cozinha: "+2 STR por 30 min reais". */
export function foodBuffSpecLabel(spec: FoodBuffSpec): string {
  return `${foodBuffLabel(spec)} por ${spec.durationMin} min reais`;
}
