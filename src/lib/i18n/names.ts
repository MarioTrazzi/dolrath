import { Locale } from './config'

// Nome de exibição de entidades de catálogo (monstros, masmorras, itens):
// o `name` PT é a chave interna congelada; `nameEn` é só display.
export function pickName(
  entry: { name: string; nameEn?: string },
  locale: Locale
): string {
  return locale === 'en' && entry.nameEn ? entry.nameEn : entry.name
}

export function pickTitle(
  entry: { title: string; titleEn?: string },
  locale: Locale
): string {
  return locale === 'en' && entry.titleEn ? entry.titleEn : entry.title
}
