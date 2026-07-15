import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { findOpenGatheringSession, syncGatheringSession } from '@/lib/gatheringServer'
import { getProfessionLevelInfo } from '@/lib/professionSystem'
import { GATHER_TICK_SECONDS, GATHER_TICK_STAMINA } from '@/lib/gathering'

export const dynamic = 'force-dynamic'

// ⛏️ Estado vivo da sessão de coleta do personagem. É o "relógio" da coleta:
// cada chamada computa lazy os tiques decorridos (debita stamina, acumula
// rendimento em pendingYield) e devolve o retrato atual. Idempotente — chamar
// duas vezes seguidas não rende nada a mais.
export async function GET(req: Request) {
  const resolved = await requireApiActor(req)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const { searchParams } = new URL(req.url)
    const characterId = searchParams.get('characterId')
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }

    const character = await prisma.character.findFirst({
      where: { id: characterId, userId },
      select: { id: true, stamina: true, maxStamina: true, gatherXp: true },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }

    const open = await findOpenGatheringSession(characterId)
    if (!open) {
      return NextResponse.json({
        session: null,
        stamina: character.stamina,
        maxStamina: character.maxStamina,
        gather: getProfessionLevelInfo(character.gatherXp),
        tickSeconds: GATHER_TICK_SECONDS,
        tickStamina: GATHER_TICK_STAMINA,
      })
    }

    const synced = await syncGatheringSession(open)

    // "Aguardar último ciclo" fechou sozinho nesta sincronização: para o
    // cliente, é como se não houvesse mais sessão aberta — mas com o aviso
    // do que foi depositado automaticamente.
    if (synced.autoStopped) {
      return NextResponse.json({
        session: null,
        stamina: synced.stamina,
        maxStamina: character.maxStamina,
        gather: getProfessionLevelInfo(synced.autoStopped.gatherXp),
        tickSeconds: GATHER_TICK_SECONDS,
        tickStamina: GATHER_TICK_STAMINA,
        autoStopped: {
          deposited: synced.autoStopped.deposited,
          skipped: synced.autoStopped.skipped,
          xpGained: synced.autoStopped.xpGained,
        },
      })
    }

    const gatherXp = await prisma.character.findUnique({
      where: { id: characterId },
      select: { gatherXp: true },
    })

    return NextResponse.json({
      session: {
        id: synced.session.id,
        fieldId: synced.session.fieldId,
        status: synced.session.status,
        startedAt: synced.session.startedAt,
        lastTickAt: synced.session.lastTickAt,
        stopRequested: synced.session.stopRequested,
      },
      pending: synced.pending,
      stamina: synced.stamina,
      maxStamina: character.maxStamina,
      secondsToNextTick: synced.secondsToNextTick,
      inventoryFull: synced.inventoryFull,
      // Ferramenta/traje de coleta equipados p/ este campo (bônus + durabilidade).
      gear: synced.gear
        ? {
            mult: synced.gear.mult,
            tool: synced.gear.tool
              ? { name: synced.gear.tool.name, enhancementLevel: synced.gear.tool.enhancementLevel, yieldBonus: synced.gear.tool.yieldBonus, durability: synced.gear.tool.durability, maxDurability: synced.gear.tool.maxDurability, broken: synced.gear.tool.broken }
              : undefined,
            garb: synced.gear.garb
              ? { name: synced.gear.garb.name, enhancementLevel: synced.gear.garb.enhancementLevel, yieldBonus: synced.gear.garb.yieldBonus, durability: synced.gear.garb.durability, maxDurability: synced.gear.garb.maxDurability, broken: synced.gear.garb.broken }
              : undefined,
          }
        : undefined,
      gather: getProfessionLevelInfo(gatherXp?.gatherXp ?? character.gatherXp),
      tickSeconds: GATHER_TICK_SECONDS,
      tickStamina: GATHER_TICK_STAMINA,
    })
  } catch (error) {
    console.error('Error syncing gathering session:', error)
    return NextResponse.json({ error: 'Failed to sync gathering session' }, { status: 500 })
  }
}
