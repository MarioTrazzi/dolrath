import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { PotionType, PREDEFINED_POTIONS } from '@/types/item'

export async function POST(
  req: Request,
  { params }: { params: { characterId: string } }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const characterId = params.characterId

  try {
    const body = await req.json()
    const { potionId } = body

    console.log('🧪 Revive attempt:', { characterId, potionId, userId: session.user.id })

    // Verificar se é uma poção de reviver válida
    const revivalPotion = PREDEFINED_POTIONS.REVIVAL_POTION
    if (!potionId || potionId !== revivalPotion.id) {
      console.log('❌ Invalid potion:', { potionId, expected: revivalPotion.id })
      return NextResponse.json({ error: 'Poção de reviver inválida' }, { status: 400 })
    }

    // Verificar se o personagem existe e pertence ao usuário
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    })

    console.log('🔍 Character found:', {
      id: character?.id,
      name: character?.name,
      isAlive: character?.isAlive,
      hp: character?.hp,
      maxHp: character?.maxHp
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verificar se o personagem está realmente morto
    if (character.isAlive) {
      return NextResponse.json({ error: 'Personagem já está vivo' }, { status: 400 })
    }

    // TODO: Verificar se o usuário tem a poção no inventário e remover uma unidade
    // Por enquanto, vamos assumir que o usuário tem a poção

    // Calcular HP de revival (50% do HP máximo)
    const revivalHp = Math.floor(character.maxHp * (revivalPotion.effectValue / 100))

    console.log('💊 Reviving character:', {
      characterName: character.name,
      maxHp: character.maxHp,
      revivalHp,
      effectValue: revivalPotion.effectValue
    })

    // Reviver o personagem
    const revivedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        hp: revivalHp,
        isAlive: true,
        deathTimestamp: null,
      },
    })

    console.log('✅ Character revived successfully:', {
      id: revivedCharacter.id,
      name: revivedCharacter.name,
      hp: revivedCharacter.hp,
      isAlive: revivedCharacter.isAlive
    })

    return NextResponse.json({
      success: true,
      character: revivedCharacter,
      message: `${character.name} foi revivido com ${revivalHp} HP!`
    })
  } catch (error) {
    console.error('Error reviving character:', error)
    return NextResponse.json(
      { error: 'Failed to revive character' },
      { status: 500 }
    )
  }
}
