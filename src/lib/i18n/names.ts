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

export function pickTagline(
  entry: { tagline: string; taglineEn?: string },
  locale: Locale
): string {
  return locale === 'en' && entry.taglineEn ? entry.taglineEn : entry.tagline
}

export function pickDescription(
  entry: { description: string; descriptionEn?: string },
  locale: Locale
): string {
  return locale === 'en' && entry.descriptionEn ? entry.descriptionEn : entry.description
}
