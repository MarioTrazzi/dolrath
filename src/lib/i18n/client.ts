// 🌐 Locale FORA de componente React.
//
// Toast, window.confirm e handlers imperativos não podem chamar useT(): não há
// hook onde pendurar. Aqui o locale é lido direto do cookie que o I18nProvider
// grava, e o t() sai igual ao dos componentes.
//
// Em componente, use SEMPRE useT()/useI18n() — isto é só para o resto.

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, Locale } from './config'
import { makeT, TFunction } from './t'

export function getClientLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`))
  const value = match ? decodeURIComponent(match[1]) : null
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** t() para call sites imperativos. Reavalia o cookie a cada chamada. */
export function clientT(): TFunction {
  return makeT(getClientLocale())
}
