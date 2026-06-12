import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ItemType } from '@prisma/client'
import { getCatalogItemByName } from '@/lib/itemCatalog'

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const { characterId, itemName, itemDescription, rarity, gold } = await req.json()

    if (!characterId) {
      return NextResponse.json(
        { error: 'Character ID is required' },
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

    if (!character) {
      return NextResponse.json(
        { error: 'Personagem não encontrado' },
        { status: 404 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      let updatedCharacter = character

      // Adicionar ouro se especificado
      if (gold > 0) {
        updatedCharacter = await tx.character.update({
          where: { id: characterId },
          data: {
            gold: {
              increment: gold
            }
          }
        })
      }

      // Adicionar item se especificado
      if (itemName) {
        // Primeiro, verificar se o item já existe na base de dados
        let existingItem = await tx.item.findFirst({
          where: {
            name: itemName
          }
        })

        // Se não existir, criar o item.
        // Itens do catálogo são criados com o tipo/stats reais (equipamento);
        // os demais caem no fallback genérico (CONSUMABLE).
        if (!existingItem) {
          const catalogItem = getCatalogItemByName(itemName)
          if (catalogItem) {
            existingItem = await tx.item.create({
              data: {
                name: catalogItem.name,
                description: catalogItem.description,
                type: catalogItem.type as ItemType,
                level: catalogItem.level,
                goldPrice: catalogItem.goldPrice,
                stats: {
                  ...catalogItem.stats,
                  rarity: catalogItem.rarity,
                  raceRestriction: catalogItem.raceRestriction ?? null,
                  dungeons: catalogItem.dungeons,
                  sellPrice: Math.floor(catalogItem.goldPrice * 0.6),
                }
              }
            })
          } else {
            existingItem = await tx.item.create({
              data: {
                name: itemName,
                description: itemDescription || 'Item encontrado durante exploração',
                type: 'CONSUMABLE',
                level: 1,
                goldPrice: getRarityValue(rarity || 'COMMON'),
                stats: {
                  rarity: rarity || 'COMMON',
                  value: getRarityValue(rarity || 'COMMON'),
                  sellPrice: Math.floor(getRarityValue(rarity || 'COMMON') * 0.6)
                }
              }
            })
          }
        }

        // Adicionar ao inventário do personagem
        const existingInventoryItem = await tx.characterInventory.findFirst({
          where: {
            characterId: characterId,
            itemId: existingItem.id
          }
        })

        if (existingInventoryItem) {
          await tx.characterInventory.update({
            where: {
              id: existingInventoryItem.id
            },
            data: {
              quantity: {
                increment: 1
              }
            }
          })
        } else {
          await tx.characterInventory.create({
            data: {
              characterId: characterId,
              itemId: existingItem.id,
              quantity: 1
            }
          })
        }
      }

      return updatedCharacter
    })

    return NextResponse.json({
      success: true,
      character: result,
      message: 'Recompensas adicionadas com sucesso!'
    })

  } catch (error) {
    console.error('Error adding exploration rewards:', error)
    return NextResponse.json(
      { error: 'Failed to add rewards' },
      { status: 500 }
    )
  }
}

function getRarityValue(rarity: string): number {
  switch (rarity) {
    case 'COMMON': return 5
    case 'UNCOMMON': return 15
    case 'RARE': return 50
    case 'EPIC': return 150
    case 'LEGENDARY': return 500
    default: return 5
  }
}
