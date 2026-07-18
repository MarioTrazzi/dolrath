import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitAllow, rateLimited429 } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Pré-registro público da landing — sem sessão. Idempotente por email (upsert).
export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  if (!rateLimitAllow(`waitlist:${ip}`, { windowMs: 60_000, max: 5 })) {
    return rateLimited429()
  }

  try {
    const body = (await req.json().catch(() => null)) as { email?: string; wallet?: string; source?: string } | null
    const email = String(body?.email || '').trim().toLowerCase()
    const wallet = String(body?.wallet || '').trim() || null
    const source = String(body?.source || 'landing').trim().slice(0, 40)

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Informe um email válido.' }, { status: 400 })
    }
    if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      return NextResponse.json({ error: 'Endereço de carteira inválido.' }, { status: 400 })
    }

    await prisma.waitlistEntry.upsert({
      where: { email },
      create: { email, wallet, source },
      update: { wallet: wallet ?? undefined },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('waitlist error:', err)
    return NextResponse.json({ error: 'Não foi possível registrar agora. Tente de novo.' }, { status: 500 })
  }
}
