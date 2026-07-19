import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { buildXpUpdate } from '@/lib/characterLevelSystem'
import { addDropToInventoryTx } from '@/lib/dungeonRunServer'
import { addHistoryEntry } from '@/lib/characterHistory'
import { getQuestById } from '@/lib/questCatalog'
import { periodKeyFor } from '@/lib/questServer'

export const dynamic = 'force-dynamic'

// Erros de negócio do resgate → resposta 4xx (o throw desfaz a transação inteira,
// inclusive a marca de claimedAt — a missão continua resgatável).
class ClaimError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

// 🎁 Resgate explícito de missão concluída. Recompensa fixa do catálogo, fora do
// teto diário de ouro da masmorra (emissão limitada por design: 1×/período) —
// auditada em goldGranted/xpGranted na própria linha de progresso.
export async function POST(req: Request) {
  const resolved = await requireApiActor(req)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const { characterId, questId } = await req.json()
    if (!characterId || !questId) {
      return NextResponse.json({ error: 'characterId e questId são obrigatórios' }, { status: 400 })
    }
    const def = getQuestById(questId)
    if (!def) return NextResponse.json({ error: 'Missão desconhecida' }, { status: 404 })

    const character = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!character) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })

    const periodKey = periodKeyFor(def.kind)
    const gold = Math.max(0, Math.floor(def.rewards.gold ?? 0))
    const xpReward = Math.max(0, Math.floor(def.rewards.xp ?? 0))
    // XP + level-up calculados fora e aplicados no mesmo update do gold, como na
    // rota de combate da masmorra.
    const xp = buildXpUpdate(character, xpReward)

    await prisma.$transaction(async (tx) => {
      // Gate de idempotência PRIMEIRO: só resgata quem está completo e não resgatado.
      // Reenvio/corrida perde aqui (count 0) — nenhum crédito duplo possível.
      const marked = await tx.questProgress.updateMany({
        where: { characterId, questId, periodKey, claimedAt: null, progress: { gte: def.objective.count } },
        data: { claimedAt: new Date(), goldGranted: gold, xpGranted: xpReward },
      })
      if (marked.count === 0) {
        throw new ClaimError('Missão não concluída ou já resgatada.', 409)
      }

      for (const item of def.rewards.items ?? []) {
        const added = await addDropToInventoryTx(tx, characterId, { name: item.name, qty: item.qty })
        if (!added) {
          throw new ClaimError('Inventário cheio — libere um slot e resgate de novo.', 409)
        }
      }

      await tx.character.update({
        where: { id: characterId },
        data: {
          ...xp.updateData,
          ...(gold > 0 ? { gold: { increment: gold } } : {}),
        },
      })
    })

    addHistoryEntry({
      characterId,
      activityType: 'XP_GAINED',
      description: `🗺️ Missão concluída: "${def.title}" (+${gold} 🪙${xpReward > 0 ? `, +${xpReward} XP` : ''}).`,
    }).catch(() => {})

    return NextResponse.json({
      granted: { gold, xp: xpReward, items: def.rewards.items ?? [] },
      leveledUp: xp.leveledUp,
      newLevel: xp.leveledUp ? xp.newLevelInfo.level : character.level,
    })
  } catch (error) {
    if (error instanceof ClaimError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Error claiming quest:', error)
    return NextResponse.json({ error: 'Failed to claim quest' }, { status: 500 })
  }
}
