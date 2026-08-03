import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addHistoryEntry } from '@/lib/characterHistory'
import { restoreCost, FREE_RESTORE_MAX_LEVEL } from '@/lib/restoreCost'

// ⚗️ Restauração de HP/MP na Alquimista.
//
// HP e MP sobrevivem à run (o /finish persiste a fração com que o herói saiu),
// então voltar ao cheio virou um SERVIÇO — gratuito até o nível 6, cobrado daí
// em diante (src/lib/restoreCost.ts). O preço é SEMPRE recalculado aqui: o
// cliente só exibe o que o GET devolveu.
//
// Também é o que o piloto automático chama entre uma run e outra: quem opta
// pela facilidade paga a taxa; quem joga com estratégia usa as próprias poções.

const CHAR_SELECT = { id: true, level: true, hp: true, maxHp: true, mp: true, maxMp: true, gold: true } as const

// GET — estado dos pools + preço, para a UI mostrar antes do clique.
export async function GET(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const resolved = await requireApiActor(request, params.characterId)
    if ('error' in resolved) return resolved.error
    const userId = resolved.actor.userId

    const character = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
      select: CHAR_SELECT,
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const { cost, free, alreadyFull } = restoreCost(character)
    return NextResponse.json({
      hp: character.hp,
      maxHp: character.maxHp,
      mp: character.mp,
      maxMp: character.maxMp,
      level: character.level,
      gold: character.gold,
      cost,
      free,
      alreadyFull,
      freeUntilLevel: FREE_RESTORE_MAX_LEVEL,
    })
  } catch (error) {
    console.error('Error loading restore info:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const resolved = await requireApiActor(request, params.characterId)
    if ('error' in resolved) return resolved.error
    const userId = resolved.actor.userId

    const owned = await prisma.character.findFirst({
      where: { id: params.characterId, userId },
      select: { id: true },
    })
    if (!owned) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Relê TUDO dentro da transação: o preço depende de hp/mp/nível, que a run
      // que acabou de encerrar pode ter mudado há milissegundos.
      const character = await tx.character.findUnique({
        where: { id: owned.id },
        select: CHAR_SELECT,
      })
      if (!character) throw new Error('Personagem não encontrado')

      const { cost, free, alreadyFull } = restoreCost(character)

      // Nada a restaurar: não cobra e não escreve.
      if (alreadyFull) {
        return { restored: false, cost: 0, free, characterGold: character.gold, hp: character.hp, mp: character.mp }
      }

      if (cost > character.gold) {
        throw new Error(
          `GOLD insuficiente na carteira do personagem: precisa de ${cost} 🪙 para a restauração.`
        )
      }

      await tx.character.update({
        where: { id: character.id },
        data: {
          hp: character.maxHp,
          mp: character.maxMp,
          ...(cost > 0 ? { gold: { decrement: cost } } : {}),
        },
      })

      return {
        restored: true,
        cost,
        free,
        characterGold: character.gold - cost,
        hp: character.maxHp,
        mp: character.maxMp,
      }
    })

    // Histórico: pós-commit e best-effort (não pode derrubar a restauração).
    if (result.restored && result.cost > 0) {
      try {
        await addHistoryEntry({
          characterId: owned.id,
          activityType: 'GOLD_SPENT',
          description: `⚗️ A Alquimista restaurou sua vida e mana (−${result.cost} gold).`,
          goldAmount: -result.cost,
        })
      } catch (historyError) {
        console.error('Erro ao registrar histórico de restauração:', historyError)
      }
    }

    const message = !result.restored
      ? 'Você já está inteiro — nada a restaurar.'
      : result.cost > 0
        ? `⚗️ Vida e mana restauradas por ${result.cost} 🪙.`
        : '⚗️ Vida e mana restauradas — cortesia da Alquimista.'

    return NextResponse.json({ success: true, ...result, message })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|não encontrado/.test(message)
    console.error('Error restoring character:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
