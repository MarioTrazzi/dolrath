// 🍳 Motor do BUFF DE COMIDA — bônus plano de atributo por TEMPO REAL.
//
// Comer um prato da Culinária grava Character.activeFood no banco
// (/api/inventory/use-item). Um prato por vez: comer outro SUBSTITUI o ativo
// (modelo "bem alimentado" de MMO). A expiração é lazy — nada de cron: quem lê
// (ficha, masmorra) valida o expiresAt na hora via parseActiveFood().
//
// DOIS shapes no catálogo (stats.foodBuff), ambos normalizados p/ attrs:
//  - simples:  { stat: 'str'|'agi'|'int'|'def'|'all', value, durationMin }
//  - REFEIÇÃO: { stats: { str, agi, int, def }, durationMin } — todos os
//    atributos, cada prato com ÊNFASE num deles (+4 foco / +2 resto).
// O Character.activeFood antigo ({ stat, value }) segue válido: parseActiveFood
// aceita os dois e devolve sempre o mapa normalizado.
//
// Onde o bônus entra: nos ATRIBUTOS DISTRIBUÍDOS do modelo enxuto de combate
// (foodBuffAttrBonus soma no `attrs` do computeLevers do combatModel.ts) —
// exatamente como pontos extras temporários de str/agi/int/def. Mais fraco que
// poção de combate (que buffa por turnos DENTRO da luta), porém dura o farm.
//
// Módulo 100% puro (sem prisma) — usado no servidor e no cliente.

export type FoodBuffStat = 'str' | 'agi' | 'int' | 'def' | 'all';

/** Bônus normalizado por atributo distribuído. */
export interface FoodBuffAttrs {
  str: number;
  agi: number;
  int: number;
  def: number;
}

/** Especificação NORMALIZADA do buff de um prato (qualquer dos dois shapes). */
export interface FoodBuffSpec {
  attrs: FoodBuffAttrs;
  durationMin: number;
}

/** Buff ativo persistido em Character.activeFood (shape novo). */
export interface ActiveFoodBuff {
  /** Nome do prato (exibição + histórico). */
  name: string;
  attrs: FoodBuffAttrs;
  /** Instante REAL em que o efeito acaba (ISO 8601). */
  expiresAt: string;
}

const SINGLE_STATS: FoodBuffStat[] = ['str', 'agi', 'int', 'def', 'all'];
const ATTR_KEYS = ['str', 'agi', 'int', 'def'] as const;

function zeroAttrs(): FoodBuffAttrs {
  return { str: 0, agi: 0, int: 0, def: 0 };
}

function hasBonus(attrs: FoodBuffAttrs): boolean {
  return ATTR_KEYS.some((k) => attrs[k] > 0);
}

/** Normaliza o shape simples ({stat,value}) OU o multi ({stats:{...}}) p/ attrs. */
function parseAttrs(fb: any): FoodBuffAttrs | null {
  // Shape multi-stat (REFEIÇÕES): { stats: { str, agi, int, def } }
  if (fb.stats && typeof fb.stats === 'object') {
    const attrs = zeroAttrs();
    for (const k of ATTR_KEYS) {
      const v = Number(fb.stats[k] ?? 0);
      if (!Number.isFinite(v) || v < 0) return null;
      attrs[k] = v;
    }
    return hasBonus(attrs) ? attrs : null;
  }
  // Shape simples: { stat, value }
  const stat = fb.stat as FoodBuffStat;
  const value = Number(fb.value);
  if (!SINGLE_STATS.includes(stat)) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  const attrs = zeroAttrs();
  if (stat === 'all') {
    attrs.str = attrs.agi = attrs.int = attrs.def = value;
  } else {
    attrs[stat] = value;
  }
  return attrs;
}

/** Lê o foodBuff dos stats de um item (JsonValue do Prisma/objeto do catálogo). */
export function parseFoodBuffSpec(stats: unknown): FoodBuffSpec | null {
  const fb = (stats as any)?.foodBuff;
  if (!fb || typeof fb !== 'object') return null;
  const attrs = parseAttrs(fb);
  if (!attrs) return null;
  const durationMin = Number(fb.durationMin);
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null;
  return { attrs, durationMin };
}

/** Cria o buff ativo ao COMER o prato (expiresAt = agora + duração real). */
export function activateFoodBuff(name: string, spec: FoodBuffSpec, now: Date = new Date()): ActiveFoodBuff {
  return {
    name,
    attrs: { ...spec.attrs },
    expiresAt: new Date(now.getTime() + spec.durationMin * 60_000).toISOString(),
  };
}

/**
 * Valida o Character.activeFood persistido: shape correto E ainda vigente.
 * Aceita o shape antigo ({ stat, value }) e o novo ({ attrs }) — retorna null
 * para JSON inválido, campos fora do contrato ou buff EXPIRADO (lazy).
 */
export function parseActiveFood(json: unknown, now: Date = new Date()): ActiveFoodBuff | null {
  const f = json as any;
  if (!f || typeof f !== 'object') return null;
  if (typeof f.name !== 'string') return null;
  // Shape novo persiste `attrs`; o antigo persiste `stat`/`value` — parseAttrs
  // normaliza ambos (o novo passa pelo ramo `stats` via aliasing abaixo).
  const attrs = parseAttrs(f.attrs && typeof f.attrs === 'object' ? { stats: f.attrs } : f);
  if (!attrs) return null;
  const expires = Date.parse(f.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return null;
  return { name: f.name, attrs, expiresAt: new Date(expires).toISOString() };
}

/** Bônus do buff nos atributos distribuídos (mapa normalizado; zeros sem buff). */
export function foodBuffAttrBonus(
  buff: ActiveFoodBuff | null | undefined,
): FoodBuffAttrs {
  return buff ? { ...buff.attrs } : zeroAttrs();
}

/** Minutos restantes do buff (teto; 0 se expirado). */
export function foodBuffRemainingMin(buff: ActiveFoodBuff, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((Date.parse(buff.expiresAt) - now.getTime()) / 60_000));
}

const ATTR_LABEL: Record<(typeof ATTR_KEYS)[number], string> = {
  str: 'STR',
  agi: 'AGI',
  int: 'INT',
  def: 'DEF',
};

/**
 * Rótulo curto do efeito: "+2 STR" · "+1 em todos os atributos" ·
 * "+4 STR, +2 AGI/INT/DEF" (refeição com ênfase agrupa por valor).
 */
export function foodBuffLabel(buff: { attrs: FoodBuffAttrs }): string {
  const entries = ATTR_KEYS.filter((k) => buff.attrs[k] > 0);
  if (entries.length === 0) return '';
  const first = buff.attrs[entries[0]];
  if (entries.length === 4 && entries.every((k) => buff.attrs[k] === first)) {
    return `+${first} em todos os atributos`;
  }
  // Agrupa atributos pelo mesmo valor, do maior pro menor: "+4 STR, +2 AGI/INT/DEF"
  const byValue = new Map<number, string[]>();
  for (const k of entries) {
    const list = byValue.get(buff.attrs[k]) ?? [];
    list.push(ATTR_LABEL[k]);
    byValue.set(buff.attrs[k], list);
  }
  return Array.from(byValue.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([value, keys]) => `+${value} ${keys.join('/')}`)
    .join(', ');
}

/** Descrição da spec do catálogo p/ a UI da cozinha: "+2 STR por 30 min reais". */
export function foodBuffSpecLabel(spec: FoodBuffSpec): string {
  return `${foodBuffLabel(spec)} por ${spec.durationMin} min reais`;
}
