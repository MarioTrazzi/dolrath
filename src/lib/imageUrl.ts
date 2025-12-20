function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  try {
    const u = new URL(candidate)
    const host = u.hostname.toLowerCase()
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'

    if (u.protocol === 'http:' && !isLocalhost) u.protocol = 'https:'
    return u.toString()
  } catch {
    return candidate
  }
}

function isLikelyUrl(value: string): boolean {
  if (!value) return false
  if (/^https?:\/\//i.test(value)) return true
  if (/^data:/i.test(value)) return true
  if (/^ipfs:/i.test(value)) return true
  if (value.includes('res.cloudinary.com')) return true
  return false
}

/**
 * Resolves an image reference into a wallet-friendly URL.
 *
 * Accepts:
 * - Full URLs (https/http)
 * - data: URIs
 * - ipfs: URIs
 * - Cloudinary public IDs (requires CLOUDINARY_CLOUD_NAME)
 */
export function resolveImageUrl(input?: string | null): string | null {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return null

  if (isLikelyUrl(raw)) {
    return normalizeUrl(raw)
  }

  const cloudName =
    (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '').trim() ||
    (process.env.CLOUDINARY_CLOUD_NAME || '').trim()

  if (!cloudName) return null

  // Treat raw as Cloudinary public ID.
  const publicId = raw.replace(/^\/+/, '')

  // Note: we intentionally do not add transformations here. Keep it simple and predictable.
  return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`
}
