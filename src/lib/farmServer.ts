// ============================================================
// FAZENDA SERVIDOR-AUTORITATIVA — núcleo compartilhado pelas rotas
// /api/farm/{state,plant,harvest,well-collect,pen-feed}.
//
// A fazenda é GLOBAL da conta: os canteiros (FarmPlot kind='crop'), o poço
// (kind='well') e o cercado (kind='pen') pertencem ao User, e todos os
// personagens cultivam nos mesmos slots. O NÍVEL da fazenda deriva da SOMA do
// farmXp de todos os personagens (todo mundo desenvolve a mesma fazenda); o XP
// de cada ação é creditado no personagem que agiu. O estado "pronto/crescendo"
// é DERIVADO dos timestamps na leitura (lazy, sem cron) — o campo state do
// FarmPlot é só cache de conveniência. Colher/coletar/alimentar custam stamina
// do personagem ativo; plantar e o crescimento em si são grátis.
// ============================================================

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  CROPS,
  PEN,
  PEN_SLOT_INDEX,
  WELL,
  WELL_SLOT_INDEX,
  cropSecondsLeft,
  getCropById,
  isCropReady,
  isPenReady,
  penSecondsLeft,
  wellPending,
  farmStoneChance,
  FARM_ACTION_STAMINA,
} from './farming'
import { farmPlotCount, getProfessionLevel, getProfessionLevelInfo, FARM_PEN_MIN_LEVEL } from './professionSystem'

export interface FarmCropPlotState {
  slotIndex: number
  cropId: string | null
  plantedAt: Date | null
  state: 'empty' | 'growing' | 'ready'
  secondsLeft: number
  outputName: string | null
}

export interface FarmState {
  farm: ReturnType<typeof getProfessionLevelInfo>
  unlockedPlots: number
  plots: FarmCropPlotState[]
  well: { pending: number; cap: number; intervalSeconds: number }
  pen: {
    unlocked: boolean
    minLevel: number
    state: 'empty' | 'growing' | 'ready'
    secondsLeft: number
    feedName: string
    outputName: string
    yield: number
  }
  crops: typeof CROPS
  actionStamina: number
  /** Chance (%) de a colheita de um canteiro render um Estilhaço de Pedra Negra. */
  stoneChance: number
}

/** XP de Fazenda da CONTA: soma do farmXp de todos os personagens do usuário. */
export async function getUserFarmXp(userId: string): Promise<number> {
  const agg = await prisma.character.aggregate({ where: { userId }, _sum: { farmXp: true } })
  return agg._sum.farmXp ?? 0
}

/** Estado derivado da fazenda da conta (cria o poço na primeira visita). */
export async function getFarmState(userId: string, userFarmXp: number, now: Date = new Date()): Promise<FarmState> {
  const farmLevel = getProfessionLevel(userFarmXp)
  const rows = await prisma.farmPlot.findMany({ where: { userId } })
  const bySlot = new Map(rows.map((r) => [r.slotIndex, r]))

  // Poço nasce ancorado na primeira visita (começa a gotejar dali).
  let well = bySlot.get(WELL_SLOT_INDEX)
  if (!well) {
    well = await prisma.farmPlot.create({
      data: { userId, slotIndex: WELL_SLOT_INDEX, kind: 'well', plantedAt: now, state: 'growing' },
    })
  }

  const unlockedPlots = farmPlotCount(farmLevel)
  const plots: FarmCropPlotState[] = []
  for (let slot = 0; slot < unlockedPlots; slot++) {
    const row = bySlot.get(slot)
    const crop = row?.cropId ? getCropById(row.cropId) : undefined
    if (!row || !row.plantedAt || !crop) {
      plots.push({ slotIndex: slot, cropId: null, plantedAt: null, state: 'empty', secondsLeft: 0, outputName: null })
    } else {
      const ready = isCropReady(row.plantedAt, crop, farmLevel, now)
      plots.push({
        slotIndex: slot,
        cropId: crop.id,
        plantedAt: row.plantedAt,
        state: ready ? 'ready' : 'growing',
        secondsLeft: ready ? 0 : cropSecondsLeft(row.plantedAt, crop, farmLevel, now),
        outputName: crop.outputName,
      })
    }
  }

  const pen = bySlot.get(PEN_SLOT_INDEX)
  const penFed = pen?.plantedAt ?? null
  const penState: 'empty' | 'growing' | 'ready' = !penFed ? 'empty' : isPenReady(penFed, now) ? 'ready' : 'growing'

  return {
    farm: getProfessionLevelInfo(userFarmXp),
    unlockedPlots,
    plots,
    well: { pending: wellPending(well.plantedAt, now), cap: WELL.cap, intervalSeconds: WELL.intervalSeconds },
    pen: {
      unlocked: farmLevel >= FARM_PEN_MIN_LEVEL,
      minLevel: FARM_PEN_MIN_LEVEL,
      state: penState,
      secondsLeft: penFed && penState === 'growing' ? penSecondsLeft(penFed, now) : 0,
      feedName: PEN.feedName,
      outputName: PEN.outputName,
      yield: PEN.yield,
    },
    crops: CROPS,
    actionStamina: FARM_ACTION_STAMINA,
    stoneChance: farmStoneChance(farmLevel),
  }
}

/**
 * Debita a stamina de uma AÇÃO de fazenda (colher/coletar/alimentar) dentro
 * da transação. Lança erro de validação quando não há stamina.
 */
export async function spendFarmActionStaminaTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  cost: number = FARM_ACTION_STAMINA,
): Promise<number> {
  const c = await tx.character.findUnique({ where: { id: characterId }, select: { stamina: true } })
  if (!c || c.stamina < cost) {
    throw new Error(`Stamina insuficiente (a ação custa ${cost}).`)
  }
  await tx.character.update({
    where: { id: characterId },
    data: { stamina: { decrement: cost }, staminaUpdatedAt: new Date() },
  })
  return c.stamina - cost
}
