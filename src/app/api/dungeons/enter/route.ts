import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { newDungeonSystem } from '@/lib/newDungeonSystem'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { dungeonId, characterId } = await req.json()
    
    console.log('🏰 Entrando na dungeon:', { dungeonId, characterId })

    // Verificar se já tem instância ativa
    const existingInstance = newDungeonSystem.getActiveInstance(characterId)
    if (existingInstance) {
      return NextResponse.json({
        success: true,
        instance: existingInstance,
        currentRoom: existingInstance.rooms[existingInstance.currentRoom]
      })
    }

    // Buscar o personagem 
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    // Criar nova instância com nível do personagem
    const instance = newDungeonSystem.createInstance(dungeonId, characterId, character.level)
    const currentRoom = instance.rooms[instance.currentRoom]

    // Log detalhado das melhorias de escalabilidade
    console.log(`🎯 DUNGEON APRIMORADA - Escalada para nível ${character.level}`)
    console.log(`📊 Dificuldade: ${instance.scaledDifficulty}`)
    console.log(`👹 Primeiro monstro: ${currentRoom.monster?.name} (HP: ${currentRoom.monster?.maxHp}, ATK: ${currentRoom.monster?.attack}, DEF: ${currentRoom.monster?.defense})`)
    console.log(`💎 Sistema de escalabilidade 2.0 ativo - Multiplicadores agressivos aplicados!`)

    return NextResponse.json({
      success: true,
      instance,
      currentRoom,
      scalingInfo: {
        characterLevel: character.level,
        difficulty: instance.scaledDifficulty,
        monstersScaled: instance.rooms.length,
        firstMonsterStats: {
          name: currentRoom.monster?.name,
          hp: currentRoom.monster?.maxHp,
          attack: currentRoom.monster?.attack,
          defense: currentRoom.monster?.defense
        }
      },
      message: `🔥 Dungeon APRIMORADA iniciada no nível ${character.level}! Dificuldade: ${instance.scaledDifficulty}. Prepare-se para o desafio!`
    })

  } catch (error) {
    console.error('❌ Erro ao entrar na dungeon:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
