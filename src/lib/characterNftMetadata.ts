import { getRaceById, getClassById } from '@/lib/gameData'

function base64EncodeUtf8(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64')
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${base64EncodeUtf8(svg)}`
}

function jsonToDataUrl(obj: unknown): string {
  const json = JSON.stringify(obj)
  return `data:application/json;base64,${base64EncodeUtf8(json)}`
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function buildCharacterNftTokenUri(params: {
  name: string
  raceId: string
  classId: string
  avatarUrl?: string | null
  stats: { str: number; agi: number; int: number; def: number }
  mintNonce?: string
  level?: number
}) {
  const { metadata } = buildCharacterNftMetadata({
    name: params.name,
    raceId: params.raceId,
    classId: params.classId,
    avatarUrl: params.avatarUrl,
    stats: params.stats,
    level: params.level,
    mintNonce: params.mintNonce,
  })

  return {
    tokenURI: jsonToDataUrl(metadata),
    metadata,
  }
}

export function buildCharacterNftMetadata(params: {
  name: string
  raceId: string
  classId: string
  avatarUrl?: string | null
  stats: { str: number; agi: number; int: number; def: number }
  level?: number
  mintNonce?: string | null
}) {
  const race = getRaceById(params.raceId)
  const cls = getClassById(params.classId)

  const displayRace = race?.name || params.raceId
  const displayClass = cls?.name || params.classId

  const title = `${params.name} — ${displayClass}`
  const level = Number.isFinite(params.level) && (params.level as number) > 0 ? (params.level as number) : 1

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#0b1220"/>
    </linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="800" height="800" fill="url(#bg)"/>
  <rect x="36" y="36" width="728" height="728" rx="28" fill="none" stroke="url(#frame)" stroke-width="6"/>

  <text x="64" y="120" fill="#ffffff" font-size="40" font-family="ui-sans-serif, system-ui" font-weight="700">${escapeXml(params.name)}</text>
  <text x="64" y="168" fill="#cbd5e1" font-size="22" font-family="ui-sans-serif, system-ui">${escapeXml(displayRace)} • ${escapeXml(displayClass)} • Level ${level}</text>

  <g transform="translate(64, 220)">
    <rect x="0" y="0" width="672" height="260" rx="18" fill="#0f172a" stroke="#1f2937" stroke-width="2"/>
    <text x="24" y="56" fill="#e2e8f0" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">Stats</text>

    <text x="24" y="110" fill="#94a3b8" font-size="20" font-family="ui-sans-serif, system-ui">STR</text>
    <text x="140" y="110" fill="#ffffff" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">${params.stats.str}</text>

    <text x="24" y="154" fill="#94a3b8" font-size="20" font-family="ui-sans-serif, system-ui">AGI</text>
    <text x="140" y="154" fill="#ffffff" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">${params.stats.agi}</text>

    <text x="24" y="198" fill="#94a3b8" font-size="20" font-family="ui-sans-serif, system-ui">INT</text>
    <text x="140" y="198" fill="#ffffff" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">${params.stats.int}</text>

    <text x="360" y="110" fill="#94a3b8" font-size="20" font-family="ui-sans-serif, system-ui">DEF</text>
    <text x="476" y="110" fill="#ffffff" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">${params.stats.def}</text>

    <text x="360" y="154" fill="#94a3b8" font-size="20" font-family="ui-sans-serif, system-ui">Avatar</text>
    <text x="476" y="154" fill="#ffffff" font-size="16" font-family="ui-sans-serif, system-ui">${escapeXml(params.avatarUrl ? 'custom' : 'none')}</text>
  </g>

  <g transform="translate(64, 520)">
    <rect x="0" y="0" width="672" height="220" rx="18" fill="#0b1020" stroke="#1f2937" stroke-width="2"/>
    <text x="24" y="56" fill="#e2e8f0" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">Dolrath RPG</text>
    <text x="24" y="92" fill="#94a3b8" font-size="18" font-family="ui-sans-serif, system-ui">Character NFT minted on Polygon Amoy</text>
  </g>
</svg>`

  const metadata = {
    name: title,
    description: 'Dolrath RPG character (NFT).',
    image: svgToDataUrl(svg),
    attributes: [
      { trait_type: 'CharacterName', value: params.name },
      { trait_type: 'Race', value: displayRace },
      { trait_type: 'Class', value: displayClass },
      { trait_type: 'Level', value: level },
      { trait_type: 'STR', value: params.stats.str },
      { trait_type: 'AGI', value: params.stats.agi },
      { trait_type: 'INT', value: params.stats.int },
      { trait_type: 'DEF', value: params.stats.def },
    ],
    properties: {
      avatarUrl: params.avatarUrl || null,
      stats: params.stats,
      raceId: params.raceId,
      classId: params.classId,
      mintNonce: params.mintNonce || null,
    },
  }

  return { metadata }
}
