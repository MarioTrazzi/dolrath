'use client'

import { useI18n } from '@/lib/i18n/I18nProvider'
import { Locale } from '@/lib/i18n/config'

const OPTIONS: { value: Locale; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'pt', label: 'PT' },
]

// Pill EN|PT no padrão chumbo+ouro — usada na Navbar do jogo e no nav da landing.
export default function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n()
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 ${className}`}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setLocale(o.value)}
          aria-pressed={locale === o.value}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors ${
            locale === o.value
              ? 'bg-amber-400/20 text-amber-200'
              : 'text-textsec hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
