import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { regenAndPersist } from '@/lib/staminaServer'

export async function POST(
  req: Request,
  context: { params: { characterId: string } }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const { characterId } = context.params

  try {
    const { staminaCost } = await req.json()

    if (!staminaCost || staminaCost <= 0) {
      return NextResponse.json(
        { error: 'Stamina cost must be positive' },
        { status: 400 }
      )
    }

    const character = await prisma.character.findFirst({
      where: {
        id: characterId,
        userId: userId
      },
      select: {
        id: true,
        name: true,
        stamina: true,
        maxStamina: true,
        staminaUpdatedAt: true,
      },
    })

    if (!character) {
      return NextResponse.json(
        { error: 'Personagem não encontrado' },
        { status: 404 }
      )
    }

    // Stamina viva sincronizada antes de cobrar: aplica o regen passivo OU, se
    // o personagem está coletando, debita os tiques da sessão (sem regen fantasma).
    const { stamina: liveStamina } = await regenAndPersist(character)

    if (liveStamina < staminaCost) {
      return NextResponse.json(
        {
          error: 'Stamina insuficiente',
          current: liveStamina,
          required: staminaCost,
          maxStamina: character.maxStamina
        },
        { status: 400 }
      )
    }

    const newStamina = liveStamina - staminaCost
    // Gastar zera o cronômetro de 15 min (âncora = agora).
    await prisma.character.update({
      where: { id: characterId },
      data: {
        stamina: newStamina,
        staminaUpdatedAt: new Date(),
      }
    })

    // NÃO devolver o Character inteiro — `nftTokenId` é BigInt e
    // NextResponse.json() estoura (vira 500 "Failed to update stamina").
    return NextResponse.json({
      success: true,
      stamina: newStamina,
      maxStamina: character.maxStamina,
      message: `Stamina consumida: -${staminaCost}`
    })

  } catch (error) {
    console.error('Error updating stamina:', error)
    return NextResponse.json(
      { error: 'Failed to update stamina' },
      { status: 500 }
    )
  }
}
