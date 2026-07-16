/**
 * 🔄 API de Transformação
 * /api/character/[characterId]/transform
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  canTransform,
  applyTransformation,
  TransformationType,
  TRANSFORMATION_CONFIG,
  getRaceTransformations
} from '@/lib/transformationSystem'
import { regenAndPersist } from '@/lib/staminaServer'

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const { characterId } = params
    const { transformationType } = await req.json()

    if (!characterId) {
      return NextResponse.json({ error: 'Character ID é obrigatório' }, { status: 400 })
    }

    if (!transformationType) {
      return NextResponse.json({ error: 'Tipo de transformação é obrigatório' }, { status: 400 })
    }

    // Verificar se o tipo de transformação é válido
    if (!Object.keys(TRANSFORMATION_CONFIG).includes(transformationType)) {
      return NextResponse.json({ 
        error: 'Tipo de transformação inválido',
        validTypes: Object.keys(TRANSFORMATION_CONFIG)
      }, { status: 400 })
    }

    // Buscar personagem
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    // Stamina viva sincronizada antes de checar/cobrar o custo da forma (regen
    // passivo ou, se coletando, débito dos tiques da sessão).
    character.stamina = (await regenAndPersist(character)).stamina

    // Verificar se pode transformar
    const validationResult = canTransform(character, transformationType as TransformationType)
    if (!validationResult.canTransform) {
      return NextResponse.json({ 
        error: validationResult.reason,
        canTransform: false 
      }, { status: 400 })
    }

    // Aplicar transformação
    const transformedCharacter = applyTransformation(character, transformationType as TransformationType)

    // Atualizar no banco de dados
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        isTransformed: transformedCharacter.isTransformed,
        transformationType: transformedCharacter.transformationType,
        transformationData: transformedCharacter.transformationData,
        
        // Atualizar stats temporários no banco
        hp: transformedCharacter.hp,
        maxHp: transformedCharacter.maxHp,
        mp: transformedCharacter.mp,
        maxMp: transformedCharacter.maxMp, // mpPool amplia a reserva durante a forma
        stamina: transformedCharacter.stamina,
        staminaUpdatedAt: new Date(), // transformar gasta stamina: reinicia a espera do regen

        // Atualizar baseStats que agora contém os stats modificados
        baseStats: transformedCharacter.baseStats
      }
    })

    const config = TRANSFORMATION_CONFIG[transformationType as TransformationType]

    // Payload sem BigInt (`nftTokenId`) — NextResponse.json() não serializa BigInt.
    return NextResponse.json({
      success: true,
      message: `🎯 Transformação em ${config.name} ativada!`,
      character: {
        id: updatedCharacter.id,
        name: updatedCharacter.name,
        hp: updatedCharacter.hp,
        maxHp: updatedCharacter.maxHp,
        mp: updatedCharacter.mp,
        maxMp: updatedCharacter.maxMp,
        stamina: updatedCharacter.stamina,
        maxStamina: updatedCharacter.maxStamina,
        isTransformed: updatedCharacter.isTransformed,
        transformationType: updatedCharacter.transformationType,
        transformationData: updatedCharacter.transformationData,
        unlockedTransformation: updatedCharacter.unlockedTransformation,
        baseStats: updatedCharacter.baseStats,
      },
      transformation: {
        name: config.name,
        description: config.description,
        duration: config.duration,
        specialAbilities: config.specialAbilities,
        resistances: config.resistances,
        vulnerabilities: config.vulnerabilities
      }
    })

  } catch (error) {
    console.error('Erro ao aplicar transformação:', error)
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}

// Endpoint GET para listar transformações disponíveis
export async function GET(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const { characterId } = params

    // Buscar personagem
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    // Determinar transformações disponíveis baseado na raça
    const availableTransformations: string[] = getRaceTransformations(character.race)

    // Verificar status de cada transformação
    const transformationStatus = availableTransformations.map(type => {
      const config = TRANSFORMATION_CONFIG[type as TransformationType]
      const validation = canTransform(character, type as TransformationType)
      
      return {
        type,
        name: config.name,
        description: config.description,
        cost: config.cost,
        duration: config.duration,
        cooldown: config.cooldown,
        available: validation.canTransform,
        reason: validation.reason,
        specialAbilities: config.specialAbilities.map(ability => ({
          name: ability.name,
          description: ability.description
        }))
      }
    })

    return NextResponse.json({
      character: {
        id: character.id,
        name: character.name,
        race: character.race,
        isTransformed: character.isTransformed,
        transformationType: character.transformationType,
        currentTransformation: character.isTransformed ? 
          TRANSFORMATION_CONFIG[character.transformationType as TransformationType] : null
      },
      availableTransformations: transformationStatus
    })

  } catch (error) {
    console.error('Erro ao buscar transformações:', error)
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 })
  }
}
