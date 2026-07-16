/**
 * 🔄 API de Transformação
 * /api/character/[characterId]/transform
 *
 * No combate (PvP/treino) a FORMA é só da sessão (socket `sync_transformation`).
 * Esta rota cobra MP+stamina persistentes e NÃO grava isTransformed no personagem —
 * senão a próxima luta começava já transformada.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
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

    if (!Object.keys(TRANSFORMATION_CONFIG).includes(transformationType)) {
      return NextResponse.json({
        error: 'Tipo de transformação inválido',
        validTypes: Object.keys(TRANSFORMATION_CONFIG)
      }, { status: 400 })
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    character.stamina = (await regenAndPersist(character)).stamina

    const type = transformationType as TransformationType
    const allowed = getRaceTransformations(character.race)
    if (allowed.length === 0) {
      return NextResponse.json({ error: 'Sua raça não possui habilidade de transformação', canTransform: false }, { status: 400 })
    }
    if (!allowed.includes(type)) {
      return NextResponse.json({ error: 'Sua raça não pode assumir essa forma', canTransform: false }, { status: 400 })
    }
    const unlocked = (character.unlockedTransformation || '') as TransformationType
    if (allowed.length > 1 && unlocked && unlocked !== type) {
      return NextResponse.json({ error: 'Você só pode assumir a forma escolhida na criação', canTransform: false }, { status: 400 })
    }

    const config = TRANSFORMATION_CONFIG[type]
    if (!config) {
      return NextResponse.json({ error: 'Tipo de transformação inválido' }, { status: 400 })
    }

    if (character.mp < config.cost.mp) {
      return NextResponse.json({
        error: `MP insuficiente: precisa de ${config.cost.mp}, tem ${character.mp}`,
        canTransform: false,
      }, { status: 400 })
    }
    if (character.stamina < config.cost.stamina) {
      return NextResponse.json({
        error: `Stamina insuficiente: precisa de ${config.cost.stamina}, tem ${character.stamina}`,
        canTransform: false,
      }, { status: 400 })
    }

    const nextMp = Math.max(0, (character.mp || 0) - config.cost.mp)
    const nextStamina = Math.max(0, (character.stamina || 0) - config.cost.stamina)

    // Só cobra recursos. Limpa flag stale (lutas antigas que gravavam isTransformed).
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        isTransformed: false,
        transformationType: null,
        transformationData: {
          remainingTurns: 0,
          cooldownTurns: 0,
        },
        mp: nextMp,
        stamina: nextStamina,
        staminaUpdatedAt: new Date(),
      }
    })

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
        isTransformed: false,
        transformationType: null,
        transformationData: {
          remainingTurns: config.duration,
          cooldownTurns: 0,
        },
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

export async function GET(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const { characterId } = params

    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const availableTransformations = getRaceTransformations(character.race)

    const transformationStatus = availableTransformations.map(type => {
      const config = TRANSFORMATION_CONFIG[type]
      const mpOk = character.mp >= config.cost.mp
      const staOk = character.stamina >= config.cost.stamina
      const unlocked = (character.unlockedTransformation || '') as TransformationType
      const multi = availableTransformations.length > 1
      const lockedForm = multi && !!unlocked && unlocked !== type
      const available = mpOk && staOk && !lockedForm

      let reason: string | undefined
      if (lockedForm) reason = 'Você só pode assumir a forma escolhida na criação'
      else if (!mpOk) reason = `MP insuficiente: precisa de ${config.cost.mp}`
      else if (!staOk) reason = `Stamina insuficiente: precisa de ${config.cost.stamina}`

      return {
        type,
        name: config.name,
        description: config.description,
        cost: config.cost,
        duration: config.duration,
        cooldown: config.cooldown,
        available,
        reason,
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
        isTransformed: false,
        transformationType: null,
        currentTransformation: null
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
