import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { characterId, bossLevel, victory } = await request.json()

    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }

    // Buscar o personagem
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    if (!victory) {
      return NextResponse.json({ 
        success: true, 
        message: 'Boss derrotou o jogador - sem recompensas' 
      })
    }

    // Gerar recompensas especiais de boss
    const baseGoldReward = 500 + Math.floor(Math.random() * 1000)
    const baseXpReward = 200 + Math.floor(Math.random() * 300)
    const levelMultiplier = 1 + (bossLevel || character.level) * 0.1

    const goldReward = Math.floor(baseGoldReward * levelMultiplier)
    const xpReward = Math.floor(baseXpReward * levelMultiplier)

    // Atualizar gold do personagem
    await prisma.character.update({
      where: { id: characterId },
      data: {
        gold: {
          increment: goldReward
        }
      }
    })

    // Adicionar XP
    await prisma.character.update({
      where: { id: characterId },
      data: {
        experience: {
          increment: xpReward
        }
      }
    })

    // Chance de drop de item especial (50% para boss)
    const dropChance = Math.random()
    let specialItem = null

    if (dropChance <= 0.5) {
      // Itens especiais de boss
      const bossItems = [
        {
          name: "Coroa do Dragão",
          description: "Uma coroa antiga que emana poder dracônico",
          type: "HELMET" as const,
          rarity: "LEGENDARY" as const,
          stats: { str: 15, def: 10, hp: 50 }
        },
        {
          name: "Espada Sombria do Lich",
          description: "Uma lâmina amaldiçoada que drena a vida dos inimigos",
          type: "WEAPON" as const,
          rarity: "EPIC" as const,
          stats: { str: 20, mp: 30 }
        },
        {
          name: "Armadura Demoníaca",
          description: "Armadura forjada nas chamas do inferno",
          type: "ARMOR" as const,
          rarity: "EPIC" as const,
          stats: { def: 25, hp: 100 }
        },
        {
          name: "Anel do Rei Goblin",
          description: "Um anel que concede comando sobre criaturas menores",
          type: "ACCESSORY" as const,
          rarity: "RARE" as const,
          stats: { str: 8, def: 8, mp: 20 }
        }
      ]

      const randomItem = bossItems[Math.floor(Math.random() * bossItems.length)]
      
      // Criar o item no banco
      const createdItem = await prisma.item.create({
        data: {
          name: randomItem.name,
          description: randomItem.description,
          type: randomItem.type,
          rarity: randomItem.rarity,
          stats: randomItem.stats
        }
      })

      // Adicionar ao inventário do usuário
      await prisma.userInventory.create({
        data: {
          characterId: characterId,
          itemId: createdItem.id,
          quantity: 1
        }
      })

      specialItem = createdItem
    }

    return NextResponse.json({
      success: true,
      rewards: {
        gold: goldReward,
        xp: xpReward,
        specialItem: specialItem
      },
      message: `Boss derrotado! +${goldReward} gold, +${xpReward} XP${specialItem ? `, +${specialItem.name}` : ''}`
    })

  } catch (error) {
    console.error('Erro ao processar recompensas do boss:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
