/**
 * Auth da frota de bots (produção sem wallet).
 * Header `x-bot-secret` + characterId de um User.isBot === true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const BOT_SECRET_HEADER = 'x-bot-secret'

export type ApiActor = {
  userId: string
  isBot: boolean
}

function botSecretOk(request: Request): boolean {
  const secret = process.env.BOT_FLEET_SECRET
  if (!secret) return false
  return request.headers.get(BOT_SECRET_HEADER) === secret
}

/** characterId do body JSON, query, ou header x-bot-character-id */
export async function extractCharacterId(request: Request): Promise<string | null> {
  const headerId = request.headers.get('x-bot-character-id')
  if (headerId?.trim()) return headerId.trim()

  try {
    const url = new URL(request.url)
    const q = url.searchParams.get('characterId')
    if (q?.trim()) return q.trim()
  } catch {
    /* ignore */
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      const clone = request.clone()
      const body = (await clone.json().catch(() => null)) as { characterId?: unknown } | null
      if (body && typeof body.characterId === 'string' && body.characterId.trim()) {
        return body.characterId.trim()
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * Resolve ator da request: sessão NextAuth OU bot fleet secret.
 * Bot só autentica se o characterId pertencer a user.isBot.
 * `characterIdHint` cobre rotas com id no path (`/api/character/[characterId]/...`).
 */
export async function resolveApiActor(
  request: Request,
  characterIdHint?: string | null
): Promise<ApiActor | null> {
  if (botSecretOk(request)) {
    const characterId = characterIdHint?.trim() || (await extractCharacterId(request))
    if (!characterId) return null
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { userId: true, user: { select: { isBot: true } } },
    })
    if (!character?.user?.isBot) return null
    return { userId: character.userId, isBot: true }
  }

  const session = await auth()
  if (!session?.user?.id) return null
  return { userId: session.user.id, isBot: false }
}

export async function requireApiActor(
  request: Request,
  characterIdHint?: string | null
): Promise<{ actor: ApiActor } | { error: NextResponse }> {
  const actor = await resolveApiActor(request, characterIdHint)
  if (!actor) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { actor }
}

/** Garante que o characterId pertence ao ator autenticado. */
export async function requireOwnedCharacter(
  request: Request,
  characterId: string
): Promise<
  | { actor: ApiActor; character: NonNullable<Awaited<ReturnType<typeof loadBotOrUserCharacter>>> }
  | { error: NextResponse }
> {
  const resolved = await requireApiActor(request)
  if ('error' in resolved) return resolved

  const character = await loadBotOrUserCharacter(resolved.actor.userId, characterId)
  if (!character) {
    return { error: NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 }) }
  }
  return { actor: resolved.actor, character }
}

async function loadBotOrUserCharacter(userId: string, characterId: string) {
  return prisma.character.findFirst({
    where: { id: characterId, userId },
  })
}

/** Helper tipado para rotas que já têm NextRequest. */
export function isBotFleetRequest(request: NextRequest | Request): boolean {
  return botSecretOk(request)
}
