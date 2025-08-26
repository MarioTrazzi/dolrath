import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const { itemId, characterId } = await req.json()

    if (!itemId || !characterId) {
      return NextResponse.json(
        { error: 'Item ID and Character ID are required' },
        { status: 400 }
      )
    }

    // Verificar se o usuário possui o item no inventário global ou do personagem
    let userItem = await prisma.userInventory.findFirst({
      where: {
        userId: userId,
        itemId: itemId,
        quantity: {
          gt: 0
        }
      },
      include: {
        item: true
      }
    })

    let characterItem = null
    let isFromCharacterInventory = false
    let itemToUse: any = null

    if (!userItem) {
      // Tentar encontrar no inventário do personagem
      characterItem = await prisma.characterInventory.findFirst({
        where: {
          characterId: characterId,
          itemId: itemId,
          quantity: {
            gt: 0
          }
        },
        include: {
          item: true
        }
      })
      
      if (characterItem) {
        itemToUse = characterItem
        isFromCharacterInventory = true
      }
    } else {
      itemToUse = userItem
    }

    if (!itemToUse) {
      return NextResponse.json(
        { error: 'Você não possui este item' },
        { status: 404 }
      )
    }

    // Verificar se o item é consumível
    if (itemToUse.item.type !== 'CONSUMABLE') {
      return NextResponse.json(
        { error: 'Este item não pode ser usado' },
        { status: 400 }
      )
    }

    // Buscar o personagem
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json(
        { error: 'Personagem não encontrado' },
        { status: 404 }
      )
    }

    // Aplicar efeitos baseados no item
    let updateData: any = {}
    let effectMessage = ''

    switch (itemToUse.item.name.toLowerCase()) {
      case 'poção de stamina':
      case 'stamina potion':
        const staminaRestore = 50 // Restaura 50 stamina
        const newStamina = Math.min(character.maxStamina, character.stamina + staminaRestore)
        updateData.stamina = newStamina
        effectMessage = `Stamina restaurada! +${newStamina - character.stamina} stamina (${newStamina}/${character.maxStamina})`
        break

      case 'poção de vida':
      case 'health potion':
        const healthRestore = 50 // Restaura 50 HP
        const newHp = Math.min(character.maxHp, character.hp + healthRestore)
        updateData.hp = newHp
        effectMessage = `Vida restaurada! +${newHp - character.hp} HP (${newHp}/${character.maxHp})`
        break

      case 'poção de mana':
      case 'mana potion':
        const manaRestore = 30 // Restaura 30 MP
        const newMp = Math.min(character.maxMp, character.mp + manaRestore)
        updateData.mp = newMp
        effectMessage = `Mana restaurada! +${newMp - character.mp} MP (${newMp}/${character.maxMp})`
        break

      default:
        return NextResponse.json(
          { error: 'Efeito do item não implementado' },
          { status: 400 }
        )
    }

    // Usar transação para garantir atomicidade
    const result = await prisma.$transaction(async (tx) => {
      // Reduzir quantidade do item
      if (isFromCharacterInventory) {
        await tx.characterInventory.update({
          where: {
            id: itemToUse.id
          },
          data: {
            quantity: {
              decrement: 1
            }
          }
        })
      } else {
        await tx.userInventory.update({
          where: {
            id: itemToUse.id
          },
          data: {
            quantity: {
              decrement: 1
            }
          }
        })
      }

      // Aplicar efeitos no personagem
      const updatedCharacter = await tx.character.update({
        where: { id: characterId },
        data: updateData
      })

      return updatedCharacter
    })

    return NextResponse.json({
      success: true,
      character: result,
      effect: effectMessage,
      itemUsed: itemToUse.item.name
    })

  } catch (error) {
    console.error('Error using item:', error)
    return NextResponse.json(
      { error: 'Failed to use item' },
      { status: 500 }
    )
  }
}
