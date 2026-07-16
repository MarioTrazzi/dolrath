'use client'

/**
 * 🧪 Página DEV da "Jornada Dolrath" (carrossel da landing) — sem auth/DB.
 * Testa os 8 slides isolados: escolha de raça/classe propagando até o
 * ranking, fog do mapa, boss fight/PvP roteirizados e swipe no mobile.
 */

import JourneyShowcase from '@/components/landing/journey/JourneyCarousel'

export default function LandingJourneyPreview() {
  return (
    <div className="min-h-screen bg-background text-white">
      <JourneyShowcase primaryHref="/auth/login" />
    </div>
  )
}
