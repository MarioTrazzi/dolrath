/**
 * ⏪ API para Reverter Transformação
 * /api/character/[characterId]/detransform
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { revertTransformation } from '@/lib/transformationSystem'
import { requireApiActor } from '@/lib/botFleetAuth'

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const { characterId } = params

    if (!characterId) {
      return NextResponse.json({ error: 'Character ID é obrigatório' }, { status: 400 })
    }

    // 🔒 Dono do herói OU o socket da arena (que limpa a forma ao fim da luta,
    // servidor-a-servidor, com o mesmo segredo de /api/battle/*). Antes não havia
    // auth nenhuma.
    const battleSecret = process.env.BATTLE_REWARDS_SECRET
    const isService = !!battleSecret && req.headers.get('x-battle-secret') === battleSecret
    let ownerId: string | null = null
    if (!isService) {
      const resolved = await requireApiActor(req, characterId)
      if ('error' in resolved) return resolved.error
      ownerId = resolved.actor.userId
    }

    // Buscar personagem
    const character = await prisma.character.findFirst({
      where: { id: characterId, ...(ownerId ? { userId: ownerId } : {}) }
    })

    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    // Verificar se está transformado
    if (!character.isTransformed) {
      return NextResponse.json({ 
        error: 'Personagem não está transformado',
        isTransformed: false 
      }, { status: 400 })
    }

    // Reverter: só limpa flags/cooldown. O pool HP/MP e baseStats não são mais
    // alterados em /transform (buff de combate = levers na sala).
    const revertedCharacter = revertTransformation(character)

    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        isTransformed: false,
        transformationType: null,
        transformationData: revertedCharacter.transformationData,
      }
    })

    return NextResponse.json({
      success: true,
      message: '🔄 Transformação revertida com sucesso!',
      character: {
        id: updatedCharacter.id,
        name: updatedCharacter.name,
        hp: updatedCharacter.hp,
        maxHp: updatedCharacter.maxHp,
        mp: updatedCharacter.mp,
        maxMp: updatedCharacter.maxMp,
        isTransformed: updatedCharacter.isTransformed,
        transformationType: updatedCharacter.transformationType,
        transformationData: updatedCharacter.transformationData,
      },
      cooldownInfo: {
        cooldownTurns: revertedCharacter.transformationData?.cooldownTurns || 0,
        message: revertedCharacter.transformationData?.cooldownTurns > 0 ? 
          `Transformação em cooldown por ${revertedCharacter.transformationData.cooldownTurns} turnos` :
          'Nenhum cooldown ativo'
      }
    })

  } catch (error) {
    console.error('Erro ao reverter transformação:', error)
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}
