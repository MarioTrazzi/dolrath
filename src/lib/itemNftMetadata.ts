import { resolveImageUrl } from '@/lib/imageUrl'

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function safeNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return fallback
}

// Torna a imagem absoluta. Caminhos same-origin (ex.: "/items/x.webp") são
// relativos e NÃO carregam quando o JSON é embutido on-chain (data: URI não tem
// origem). Carteiras/marketplaces precisam de URL absoluta.
function absolutizeUrl(url: string | null, origin?: string | null): string | null {
  if (!url) return url
  if (!url.startsWith('/')) return url
  const base = String(origin || '').trim().replace(/\/+$/, '')
  if (!base) return url
  return `${base}${url}`
}

// Chaves de stats que já viram atributos canônicos (evita duplicar no flatten).
const STATS_KEYS_HANDLED_SEPARATELY = new Set(['enhancementLevel'])

function flattenStatsToAttributes(stats: unknown): Array<{ trait_type: string; value: string | number }> {
  if (!stats || typeof stats !== 'object') return []

  const out: Array<{ trait_type: string; value: string | number }> = []

  for (const [k, v] of Object.entries(stats as Record<string, unknown>)) {
    if (v == null) continue
    if (STATS_KEYS_HANDLED_SEPARATELY.has(k)) continue

    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push({ trait_type: k, value: v })
      continue
    }

    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (!trimmed) continue
      out.push({ trait_type: k, value: trimmed })
      continue
    }

    if (typeof v === 'boolean') {
      out.push({ trait_type: k, value: v ? 'true' : 'false' })
      continue
    }
  }

  return out
}

export function buildItemNftMetadata(params: {
  tokenId?: bigint
  origin?: string | null
  enhancementLevel?: number | null
  item: {
    id: string
    name: string
    description?: string | null
    type: string
    subtype?: string | null
    level?: number | null
    stats?: unknown
    image?: string | null
  }
  paidGoldWei?: string | null
}) {
  const baseName = safeString(params.item.name).trim() || 'Item'
  const level = safeNumber(params.item.level, 1)
  const type = safeString(params.item.type).trim()
  const subtype = safeString(params.item.subtype).trim()
  const descriptionRaw = safeString(params.item.description).trim()

  // Aprimoramento (+N): vem explícito ou de stats.enhancementLevel. É o "+7" da peça.
  const enhancement = Math.max(
    0,
    Math.floor(
      safeNumber(
        params.enhancementLevel ?? (params.item.stats as any)?.enhancementLevel,
        0
      )
    )
  )
  const enhSuffix = enhancement > 0 ? ` +${enhancement}` : ''
  const displayName = `${baseName}${enhSuffix}`

  const lines: string[] = []
  if (descriptionRaw) lines.push(descriptionRaw)
  lines.push(`Tipo: ${type || 'UNKNOWN'}`)
  lines.push(`Lv.${level}`)
  if (subtype) lines.push(`Subtipo: ${subtype}`)
  if (enhancement > 0) lines.push(`Aprimoramento: +${enhancement}`)

  const description = lines.join('\n')

  const tokenSuffix = params.tokenId != null ? ` • Token #${params.tokenId.toString()}` : ''
  const subtitleExtra = `${enhancement > 0 ? ` • +${enhancement}` : ''}${tokenSuffix}`

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#0b1220"/>
    </linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#22c55e"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="800" height="800" fill="url(#bg)"/>
  <rect x="36" y="36" width="728" height="728" rx="28" fill="none" stroke="url(#frame)" stroke-width="6"/>

  <text x="64" y="120" fill="#ffffff" font-size="42" font-family="ui-sans-serif, system-ui" font-weight="800">${escapeXml(displayName)}</text>
  <text x="64" y="168" fill="#cbd5e1" font-size="22" font-family="ui-sans-serif, system-ui">${escapeXml(type || 'Item')} • Level ${level}${escapeXml(subtitleExtra)}</text>

  <g transform="translate(64, 220)">
    <rect x="0" y="0" width="672" height="260" rx="18" fill="#0f172a" stroke="#1f2937" stroke-width="2"/>
    <text x="24" y="56" fill="#e2e8f0" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">Descrição</text>
    <text x="24" y="110" fill="#94a3b8" font-size="18" font-family="ui-sans-serif, system-ui">${escapeXml(descriptionRaw || '—')}</text>
  </g>

  <g transform="translate(64, 520)">
    <rect x="0" y="0" width="672" height="220" rx="18" fill="#0b1020" stroke="#1f2937" stroke-width="2"/>
    <text x="24" y="56" fill="#e2e8f0" font-size="22" font-family="ui-sans-serif, system-ui" font-weight="700">Dolrath RPG</text>
    <text x="24" y="92" fill="#94a3b8" font-size="18" font-family="ui-sans-serif, system-ui">Item NFT minted on Polygon Amoy</text>
  </g>
</svg>`

  // Imagem absoluta (origem prefixada quando o caminho é same-origin).
  const resolvedImage = absolutizeUrl(resolveImageUrl((params.item as any).image), params.origin)

  const attributes: Array<{ trait_type: string; value: string | number }> = [
    { trait_type: 'ItemId', value: params.item.id },
    { trait_type: 'Type', value: type || 'UNKNOWN' },
    { trait_type: 'Level', value: level },
  ]

  if (subtype) attributes.push({ trait_type: 'Subtype', value: subtype })

  if (enhancement > 0) {
    attributes.push({ trait_type: 'Enhancement', value: enhancement })
  }

  if (params.paidGoldWei && String(params.paidGoldWei).trim()) {
    attributes.push({ trait_type: 'PaidGoldWei', value: String(params.paidGoldWei).trim() })
  }

  attributes.push(...flattenStatsToAttributes((params.item as any).stats))

  const metadata = {
    name: displayName,
    description,
    image: resolvedImage || svgToDataUrl(svg),
    attributes,
    properties: {
      itemId: params.item.id,
      type: type || null,
      subtype: subtype || null,
      level,
      enhancementLevel: enhancement,
      paidGoldWei: params.paidGoldWei || null,
      image: (params.item as any).image ?? null,
      resolvedImageUrl: resolvedImage,
      stats: (params.item as any).stats ?? null,
    },
  }

  return { metadata }
}

export function buildItemNftTokenUri(params: {
  origin?: string | null
  enhancementLevel?: number | null
  item: {
    id: string
    name: string
    description?: string | null
    image?: string | null
    type: string
    subtype?: string | null
    level?: number | null
    stats?: unknown
  }
  paidGoldWei?: string | null
}) {
  const { metadata } = buildItemNftMetadata({
    item: params.item,
    paidGoldWei: params.paidGoldWei,
    origin: params.origin,
    enhancementLevel: params.enhancementLevel,
  })

  return {
    tokenURI: jsonToDataUrl(metadata),
    metadata,
  }
}
