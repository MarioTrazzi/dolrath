/**
 * ⏪ API para Reverter Transformação
 * /api/character/[characterId]/detransform
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { revertTransformation } from '@/lib/transformationSystem'

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const { characterId } = params

    if (!characterId) {
      return NextResponse.json({ error: 'Character ID é obrigatório' }, { status: 400 })
    }

    // Buscar personagem
    const character = await prisma.character.findUnique({
      where: { id: characterId }
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

    // Reverter transformação
    const revertedCharacter = revertTransformation(character)

    // Atualizar no banco de dados
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        isTransformed: revertedCharacter.isTransformed,
        transformationType: revertedCharacter.transformationType,
        transformationData: revertedCharacter.transformationData,
        
        // Restaurar stats originais
        hp: revertedCharacter.hp,
        maxHp: revertedCharacter.maxHp,

        // Restaurar baseStats originais
        baseStats: revertedCharacter.baseStats
      }
    })

    return NextResponse.json({
      success: true,
      message: '🔄 Transformação revertida com sucesso!',
      character: updatedCharacter,
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
