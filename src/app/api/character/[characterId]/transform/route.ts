/**
 * 🔄 API de Transformação
 * /api/character/[characterId]/transform
 *
 * No combate (PvP/treino) a FORMA é só da sessão (socket `sync_transformation`).
 * Esta rota cobra MP+stamina persistentes e NÃO grava isTransformed no personagem —
 * senão a próxima luta começava já transformada.
 *
 * ⚔️ Exceção: `arena: true` (PvP) NÃO cobra nada. Lá os recursos são da luta e a
 * carteira paga a taxa fixa de entrada — ver src/lib/pvpRewards.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  TransformationType,
  TRANSFORMATION_CONFIG,
  getRaceTransformations
} from '@/lib/transformationSystem'
import { regenAndPersist } from '@/lib/staminaServer'
import { requireApiActor } from '@/lib/botFleetAuth'
import { getT, getLocale } from '@/lib/i18n/server'
import { localizeTransformationName } from '@/lib/i18n/combatNames'

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const t = getT()
  try {
    const { characterId } = params
    const { transformationType, arena } = await req.json()

    // 🏟️ ARENA: a luta de PvP já cobra uma TAXA FIXA de stamina (PVP_FIGHT_STAMINA) e
    // os recursos DENTRO dela (barra de stamina, MP) são da luta, não do personagem.
    // Cobrar aqui também fazia a transformação custar quase DUAS lutas da carteira —
    // e furava o "10 lutas por dia" de quem usa a forma.
    const isArena = arena === true

    if (!characterId) {
      return NextResponse.json({ error: t('Character ID is required') }, { status: 400 })
    }

    if (!transformationType) {
      return NextResponse.json({ error: t('Transformation type is required') }, { status: 400 })
    }

    if (!Object.keys(TRANSFORMATION_CONFIG).includes(transformationType)) {
      return NextResponse.json({
        error: t('Invalid transformation type'),
        validTypes: Object.keys(TRANSFORMATION_CONFIG)
      }, { status: 400 })
    }

    // 🔒 Só o DONO transforma (e paga MP/stamina). A rota não tinha auth nenhuma:
    // com o id de qualquer herói (público no ranking/mercado) dava para drenar a
    // stamina e o MP dele em loop.
    const resolved = await requireApiActor(req, characterId)
    if ('error' in resolved) return resolved.error

    const character = await prisma.character.findFirst({
      where: { id: characterId, userId: resolved.actor.userId }
    })

    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }

    character.stamina = (await regenAndPersist(character)).stamina

    const type = transformationType as TransformationType
    const allowed = getRaceTransformations(character.race)
    if (allowed.length === 0) {
      return NextResponse.json({ error: t('Your race has no transformation ability'), canTransform: false }, { status: 400 })
    }
    if (!allowed.includes(type)) {
      return NextResponse.json({ error: t('Your race cannot take this form'), canTransform: false }, { status: 400 })
    }
    const unlocked = (character.unlockedTransformation || '') as TransformationType
    if (allowed.length > 1 && unlocked && unlocked !== type) {
      return NextResponse.json({ error: t('You can only take the form chosen at creation'), canTransform: false }, { status: 400 })
    }

    const config = TRANSFORMATION_CONFIG[type]
    if (!config) {
      return NextResponse.json({ error: t('Invalid transformation type') }, { status: 400 })
    }

    if (!isArena && character.mp < config.cost.mp) {
      return NextResponse.json({
        error: t('Not enough MP: you need {need}, you have {have}', { need: config.cost.mp, have: character.mp }),
        canTransform: false,
      }, { status: 400 })
    }
    if (!isArena && character.stamina < config.cost.stamina) {
      return NextResponse.json({
        error: t('Not enough stamina: you need {need}, you have {have}', { need: config.cost.stamina, have: character.stamina }),
        canTransform: false,
      }, { status: 400 })
    }

    // Na arena os custos saem das barras DA LUTA (socket) — aqui só o estado persiste.
    const nextMp = isArena ? character.mp : Math.max(0, (character.mp || 0) - config.cost.mp)
    const nextStamina = isArena ? character.stamina : Math.max(0, (character.stamina || 0) - config.cost.stamina)

    // Só cobra recursos (fora da arena). Limpa flag stale (lutas antigas gravavam isTransformed).
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
        // Âncora do regen só se DEBITOU: na arena nada foi gasto, e reancorar zeraria
        // 15 min de regen a cada transformação.
        ...(isArena ? {} : { staminaUpdatedAt: new Date() }),
      }
    })

    return NextResponse.json({
      success: true,
      message: t('🎯 Transformation into {name} activated!', { name: localizeTransformationName(config.name, getLocale()) }),
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
  const t = getT()
  try {
    const { characterId } = params

    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
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
