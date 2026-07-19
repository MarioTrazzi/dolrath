import { Locale } from './config'
import { CATALOG_EN, SPECIAL_EFFECT_EN } from './catalogNames'

// Display de entidades de catálogo/Itens do banco: o `name` PT é a chave
// interna congelada; em locale EN o mapa devolve o nome/descrição em inglês.
// Nome fora do mapa cai no PT (e o check-i18n-catalog acusa o buraco).

export function localizeItemName(ptName: string, locale: Locale): string {
  if (locale === 'pt') return ptName
  return CATALOG_EN[ptName]?.en ?? ptName
}

export function localizeItemDesc(
  ptName: string,
  ptDesc: string | null | undefined,
  locale: Locale
): string | null | undefined {
  if (locale === 'pt') return ptDesc
  return CATALOG_EN[ptName]?.descEn ?? ptDesc
}

export function localizeSpecialEffect(ptEffect: string, locale: Locale): string {
  if (locale === 'pt') return ptEffect
  return SPECIAL_EFFECT_EN[ptEffect] ?? ptEffect
}

/** Nome EN canônico p/ contextos permanentes (NFT metadata) — independe de locale. */
export function catalogNameEn(ptName: string): string {
  return CATALOG_EN[ptName]?.en ?? ptName
}
