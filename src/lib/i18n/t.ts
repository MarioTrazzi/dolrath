import { Locale } from './config'
import { PT_DICT } from './dict/pt'

export type TParams = Record<string, string | number>
export type TFunction = (key: string, params?: TParams) => string

function interpolate(text: string, params?: TParams): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match
  )
}

// EN é identidade (a chave É o texto); PT consulta o dicionário e cai no EN se faltar.
export function makeT(locale: Locale): TFunction {
  if (locale === 'en') return (key, params) => interpolate(key, params)
  return (key, params) => interpolate(PT_DICT[key] ?? key, params)
}
