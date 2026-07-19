'use client'

import { createContext, useCallback, useContext, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, Locale } from './config'
import { makeT, TFunction } from './t'

interface I18nContextValue {
  locale: Locale
  t: TFunction
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  const router = useRouter()

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
      // Server components relêem o cookie; client components remontam com o novo locale.
      router.refresh()
    },
    [locale, router]
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, t: makeT(locale), setLocale }),
    [locale, setLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export function useT(): TFunction {
  return useI18n().t
}
