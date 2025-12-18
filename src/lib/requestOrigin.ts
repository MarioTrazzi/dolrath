import { headers } from 'next/headers'

export function getRequestOrigin(fallback = 'http://localhost:3000'): string {
  const h = headers()

  const origin = h.get('origin')
  if (origin) return origin

  const host = h.get('x-forwarded-host') || h.get('host')
  if (!host) return fallback

  const proto = h.get('x-forwarded-proto') || 'http'
  return `${proto}://${host}`
}
