// 🌐 i18n — inglês é o idioma canônico do código (EN-as-key, estilo gettext).
// O dicionário só existe para PT; chave ausente ⇒ mostra o EN.
export type Locale = 'en' | 'pt'

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'bdi_lang'

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'pt'
}
