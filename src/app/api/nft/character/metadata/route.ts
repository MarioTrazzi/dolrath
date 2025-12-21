import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildCharacterNftMetadata } from '@/lib/characterNftMetadata'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

function extractStatsFromCharacterAttributes(attributes: any): { str: number; agi: number; int: number; def: number } {
  const a = attributes || {}

  const str = toNumber(a?.strength ?? a?.str ?? a?.stats?.str) ?? 0
  const agi = toNumber(a?.agility ?? a?.agi ?? a?.stats?.agi) ?? 0
  const int = toNumber(a?.intelligence ?? a?.int ?? a?.stats?.int) ?? 0
  const def = toNumber(a?.defense ?? a?.def ?? a?.stats?.def) ?? 0

  return {
    str: Math.max(0, Math.floor(str)),
    agi: Math.max(0, Math.floor(agi)),
    int: Math.max(0, Math.floor(int)),
    def: Math.max(0, Math.floor(def)),
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const nonce = (url.searchParams.get('nonce') || '').trim()

  if (!nonce) {
    return NextResponse.json({ error: 'Missing nonce' }, { status: 400 })
  }

  const character = await prisma.character.findFirst({
    where: {
      nftTokenUri: {
        contains: `nonce=${nonce}`,
      },
    },
    select: {
      name: true,
      race: true,
      class: true,
      level: true,
      avatar: true,
      attributes: true,
      baseStats: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  const stats = (() => {
    const fromAttributes = extractStatsFromCharacterAttributes(character.attributes)
    const hasAny = Object.values(fromAttributes).some((v) => v > 0)
    if (hasAny) return fromAttributes
    return extractStatsFromCharacterAttributes((character as any).baseStats)
  })()

  const { metadata } = buildCharacterNftMetadata({
    name: character.name,
    raceId: String(character.race),
    classId: String(character.class),
    avatarUrl: character.avatar,
    stats,
    level: character.level,
    mintNonce: nonce,
  })

  // This tokenURI points to a dynamic endpoint; avoid caching so level/stats updates
  // are reflected as the DB changes.
  return NextResponse.json(metadata, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
