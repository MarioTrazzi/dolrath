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
  console.log('Extracted characterId:', characterId)

  try {
    const { staminaCost } = await req.json()
    
    console.log('API received:', { staminaCost, characterId, userId })

    if (!staminaCost || staminaCost <= 0) {
      console.log('Invalid stamina cost:', staminaCost)
      return NextResponse.json(
        { error: 'Stamina cost must be positive' },
        { status: 400 }
      )
    }

    // Verificar se o personagem existe e pertence ao usuário
    const character = await prisma.character.findFirst({
      where: {
        id: characterId,
        userId: userId
      }
    })

    console.log('Character found:', character ? {
      id: character.id,
      name: character.name,
      stamina: character.stamina,
      maxStamina: character.maxStamina
    } : 'null')

    if (!character) {
      return NextResponse.json(
        { error: 'Personagem não encontrado' },
        { status: 404 }
      )
    }

    // Stamina viva sincronizada antes de cobrar: aplica o regen passivo OU, se
    // o personagem está coletando, debita os tiques da sessão (sem regen fantasma).
    const { stamina: liveStamina } = await regenAndPersist(character)

    // Verificar se tem stamina suficiente
    console.log(`Checking stamina: ${liveStamina} >= ${staminaCost}?`)
    if (liveStamina < staminaCost) {
      console.log(`❌ Insufficient stamina: has ${liveStamina}, needs ${staminaCost}`)
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

    // Atualizar stamina. Gastar zera o cronômetro de 15 min (âncora = agora).
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        stamina: liveStamina - staminaCost,
        staminaUpdatedAt: new Date(),
      }
    })

    return NextResponse.json({
      success: true,
      character: updatedCharacter,
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
