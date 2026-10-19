import { NextRequest, NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { signSocketTicket, SOCKET_TICKET_TTL_SEC } from '@/lib/socketTicket'
import { getTFromRequest } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

// 🎟️ Emite o ingresso da arena para UM herói do chamador (ver lib/socketTicket.ts).
// Sessão humana ou frota de bots (x-bot-secret), como as demais rotas de jogo.
export async function POST(req: NextRequest) {
  const t = getTFromRequest(req)
  const body = await req.json().catch(() => null)
  const characterId = typeof body?.characterId === 'string' ? body.characterId.trim() : ''
  if (!characterId) {
    return NextResponse.json({ error: t('characterId is required') }, { status: 400 })
  }

  const resolved = await requireApiActor(req, characterId)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  const owned = await prisma.character.findFirst({ where: { id: characterId, userId }, select: { id: true } })
  if (!owned) {
    return NextResponse.json({ error: t('Character not found') }, { status: 404 })
  }

  // Sem segredo configurado o socket também não confere (dev local): ingresso nulo.
  const ticket = signSocketTicket({ characterId, userId })
  return NextResponse.json({ ticket, expiresIn: SOCKET_TICKET_TTL_SEC })
}
