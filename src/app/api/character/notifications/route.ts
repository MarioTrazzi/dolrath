import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { getAccountCharacterAlerts } from '@/lib/characterNotifications'

export const dynamic = 'force-dynamic'

// 🔔 Avisos pendentes de TODOS os personagens da conta numa chamada só — o card
// de cada herói (dashboard e seletor da navbar) pinta o selo com isto.
export async function GET(req: Request) {
  const resolved = await requireApiActor(req)
  if ('error' in resolved) return resolved.error

  try {
    const byCharacterId = await getAccountCharacterAlerts(resolved.actor.userId)
    return NextResponse.json({ byCharacterId })
  } catch (error) {
    console.error('Error loading character notifications:', error)
    return NextResponse.json({ error: 'Failed to load character notifications' }, { status: 500 })
  }
}
