import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, Locale } from './config'
import { makeT, TFunction } from './t'

// Server components / route handlers no mesmo request scope.
export function getLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function getT(): TFunction {
  return makeT(getLocale())
}

// Rotas de API que recebem o NextRequest explícito.
export function getLocaleFromRequest(req: NextRequest): Locale {
  const value = req.cookies.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function getTFromRequest(req: NextRequest): TFunction {
  return makeT(getLocaleFromRequest(req))
}
