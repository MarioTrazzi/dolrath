import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getT } from '@/lib/i18n/server'

const bodySchema = z.object({
  email: z.string().email('Email inválido'),
})

// Optional profile completion for wallet users: add an email later
// (newsletter / account recovery). Requires an authenticated session.
export async function POST(req: Request) {
  const t = getT()
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Email inválido' },
      { status: 400 }
    )
  }

  const email = parsed.data.email.toLowerCase().trim()

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { email },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: t('This email is already used by another account') },
        { status: 409 }
      )
    }
    throw error
  }

  return NextResponse.json({ email })
}
