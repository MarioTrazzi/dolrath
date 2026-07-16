// ⚔️ Recompensas da ARENA — creditadas pelo SOCKET (server/socket-server.js), nunca
// pelo cliente. O socket é a autoridade do combate: ele rola os dados, valida custos e
// decide a vitória; esta rota só persiste o resultado dele.
//
// 🔒 2026-07-15 — SERVICE-ONLY: antes esta rota também aceitava sessão de usuário,
// exigindo apenas que o chamador fosse dono do vencedor OU do perdedor. Dava p/ forjar
// uma vitória contra QUALQUER personagem, cobrar a stamina do oponente e embolsar ouro
// e pontos de ranking sem lutar. Com a arena virando a fonte principal de ouro do jogo
// (PVP_GOLD_PER_STA 31) e o top 10 da season pagando DOL, isso deixou de ser aceitável.
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { addExperienceToCharacter } from '@/lib/characterLevelSystem'
import { addHistoryEntry } from '@/lib/characterHistory'
import { regenAndPersist } from '@/lib/staminaServer'
import { calculatePvpStaminaRewards, PVP_MIN_ENTRY_STAMINA, PVP_RANK_LOSS_POINTS, PVP_RANK_WIN_POINTS } from '@/lib/pvpRewards'
import { dailyGoldRemainingTx, applyGearWearTx } from '@/lib/dungeonRunServer'
import { wearForPvpFight } from '@/lib/durability'
import { ensureActivePvpSeason, applyPvpMatchRating } from '@/lib/pvpRanking'
import { ActivityType } from '@prisma/client'

interface BattleResult {
  winnerId: string
  loserId: string
  isFlawlessVictory?: boolean
  winnerTransformed?: boolean
  loserTransformed?: boolean
  /** Stamina que o socket contabilizou na luta (`fightStaminaSpent`), clampada pelo saldo real. */
  winnerStaminaSpent?: number
  loserStaminaSpent?: number
}

function isServiceCall(request: NextRequest): boolean {
  const secret = process.env.BATTLE_REWARDS_SECRET
  if (!secret) {
    // Sem o segredo, NADA credita — e o socket cai no fallback local, que mostra ouro
    // que nunca foi persistido. Falhar alto é melhor que mentir na UI.
    console.error('⚠️ BATTLE_REWARDS_SECRET não configurado — recompensas de PvP desativadas!')
    return false
  }
  return request.headers.get('x-battle-secret') === secret
}

interface PvpWearEntry {
  slot: string
  name: string
  durability: number
  maxDurability: number
  justBroke: boolean
}

type CharacterRow = { id: string; level: number }

/** Resposta de luta que NÃO gera faucet, no mesmo formato do sucesso (o socket lê os dois lados). */
function noReward(reason: 'same_user' | 'below_min_stamina', winner: CharacterRow, loser: CharacterRow) {
  const side = (c: CharacterRow) => ({
    id: c.id, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: c.level,
    staminaCharged: 0, equipmentWear: [] as PvpWearEntry[],
  })
  return { success: true, skipped: reason, winner: side(winner), loser: side(loser) }
}

/**
 * Aplica o desgaste de UMA luta ao gear equipado e devolve o que mudou — a arena
 * espelha a masmorra (dungeon/run/combat), inclusive no aviso de peça quebrada.
 */
async function applyFightWear(characterId: string): Promise<PvpWearEntry[]> {
  const weaponWear = wearForPvpFight('WEAPON')
  const gearWear = wearForPvpFight('ARMOR')
  return prisma.$transaction(async (tx) => {
    const equipped = await tx.characterEquipment.findMany({
      where: { characterId },
      include: { item: { select: { name: true } } },
    })
    const changed: PvpWearEntry[] = []
    for (const eq of equipped) {
      if (eq.durability <= 0) continue // já quebrada: não desgasta além de 0
      const wear = eq.slot === 'WEAPON' ? weaponWear : gearWear
      const after = Math.max(0, eq.durability - wear)
      if (after === eq.durability) continue
      changed.push({
        slot: eq.slot,
        name: eq.item.name,
        durability: after,
        maxDurability: eq.maxDurability,
        justBroke: after === 0,
      })
    }
    if (changed.length > 0) await applyGearWearTx(tx, characterId, weaponWear, gearWear)
    return changed
  })
}

export async function POST(request: NextRequest) {
  if (!isServiceCall(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const battleResult: BattleResult = await request.json()

    if (!battleResult.winnerId || !battleResult.loserId) {
      return NextResponse.json({ error: 'Missing battle result data' }, { status: 400 })
    }

    const [winner, loser] = await Promise.all([
      prisma.character.findUnique({ where: { id: battleResult.winnerId } }),
      prisma.character.findUnique({ where: { id: battleResult.loserId } }),
    ])

    if (!winner || !loser) {
      return NextResponse.json({ error: 'Characters not found' }, { status: 404 })
    }

    // 🤝 ANTI-CONLUIO: dois personagens da MESMA conta lutando entre si escolhem quem
    // vence — capturam o bônus de 1ª vitória do dia, o flawless e os pontos de ranking
    // (que pagam DOL no top 10) sem risco nenhum. Semântica de treino: não credita nada
    // e não cobra stamina. Não cobre conluio entre DUAS contas — ver o TODO no fim.
    if (winner.userId === loser.userId) {
      return NextResponse.json(noReward('same_user', winner, loser))
    }

    // ⚠️ DEDUP FRÁGIL (dívida conhecida): casa por PREFIXO DE STRING numa janela de
    // 120s, e depende do addHistoryEntry lá embaixo — que é best-effort. Se o history
    // falhar e o socket der retry no fetch, esta luta credita ouro E desgasta o gear
    // DE NOVO. O mesmo vale para o teto diário, que soma o ouro de PvP pela description
    // ('PvP%'): history perdido = ouro invisível ao cap. E a leitura do teto acontece
    // fora de transação, então duas lutas simultâneas do mesmo dono podem estourá-lo.
    // 🔧 A correção é a mesma para os três: `PvpMatch.matchKey @unique` (o socket gera
    // uma chave por luta) como lock de idempotência + `winnerUserId`/`loserUserId`
    // indexados, tudo dentro de UMA transação. Precisa de migration — ficou fora deste
    // PR, que já sobe o ouro da arena de 6.6 → 31/STA e fecha a rota para o cliente.
    const dedupWindow = new Date(Date.now() - 120_000)
    const alreadyCredited = await prisma.characterHistory.findFirst({
      where: {
        characterId: battleResult.winnerId,
        description: { startsWith: `PvP Victory vs ${loser.name}` },
        createdAt: { gte: dedupWindow },
      },
      select: { id: true },
    })
    if (alreadyCredited) {
      return NextResponse.json({
        success: true,
        deduped: true,
        winner: { id: battleResult.winnerId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: winner.level },
        loser: { id: battleResult.loserId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: loser.level },
      })
    }

    const winnerLevel = winner.level
    const loserLevel = loser.level

    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const winsToday = await prisma.characterHistory.count({
      where: {
        characterId: battleResult.winnerId,
        createdAt: { gte: startOfDay },
        description: { startsWith: 'PvP Victory' },
      },
    })
    const isFirstWin = winsToday === 0

    const winnerStaWanted = Math.max(0, Math.floor(Number(battleResult.winnerStaminaSpent) || 0))
    const loserStaWanted = Math.max(0, Math.floor(Number(battleResult.loserStaminaSpent) || 0))

    const chargeStamina = async (char: typeof winner, amount: number): Promise<number> => {
      if (!char || amount <= 0) return 0
      const { stamina } = await regenAndPersist(char as Parameters<typeof regenAndPersist>[0])
      const charge = Math.min(stamina, amount)
      await prisma.character.update({
        where: { id: char.id },
        data: { stamina: Math.max(0, stamina - charge), staminaUpdatedAt: new Date() },
      })
      return charge
    }

    // ⚡ Piso de entrada: uma luta que mal gastou stamina não gera faucet nem ranking.
    // Mata o farm de lutas de 1 turno (render/desistir em looping) — que com a arena
    // pagando 31 gold/STA seria o caminho mais barato de emitir ouro.
    if (winnerStaWanted < PVP_MIN_ENTRY_STAMINA && loserStaWanted < PVP_MIN_ENTRY_STAMINA) {
      return NextResponse.json(noReward('below_min_stamina', winner, loser))
    }

    const [winnerCharged, loserCharged] = await Promise.all([
      chargeStamina(winner, winnerStaWanted),
      chargeStamina(loser, loserStaWanted),
    ])

    const calc = calculatePvpStaminaRewards({
      winnerStaminaSpent: winnerCharged,
      loserStaminaSpent: loserCharged,
      isFlawless: battleResult.isFlawlessVictory,
      killTransformed: battleResult.loserTransformed,
      isFirstWinOfDay: isFirstWin,
      winnerLevel,
      loserLevel,
    })

    // Teto diário compartilhado com a masmorra (mesma função — a arena não tem mais
    // a própria cópia da conta). `prisma` serve de TransactionClient aqui: o crédito
    // do PvP não roda em transação própria.
    const [wRemain, lRemain] = await Promise.all([
      dailyGoldRemainingTx(prisma, winner.userId),
      dailyGoldRemainingTx(prisma, loser.userId),
    ])
    const winnerGold = Math.min(calc.winner.gold, wRemain)
    const loserGold = Math.min(calc.loser.gold, lRemain)
    const winnerXp = calc.winner.xp
    const loserXp = calc.loser.xp

    const [winnerXpResult] = await Promise.all([
      addExperienceToCharacter(battleResult.winnerId, winnerXp),
      winnerGold > 0
        ? prisma.character.update({
            where: { id: battleResult.winnerId },
            data: { gold: { increment: winnerGold } },
          })
        : Promise.resolve(),
    ])

    const [loserXpResult] = await Promise.all([
      addExperienceToCharacter(battleResult.loserId, loserXp),
      loserGold > 0
        ? prisma.character.update({
            where: { id: battleResult.loserId },
            data: { gold: { increment: loserGold } },
          })
        : Promise.resolve(),
    ])

    // ⚔️ Desgaste da luta (2026-07-15): a arena era a ÚNICA atividade sem custo
    // operacional, e ao virar a fonte de ouro do jogo isso a tornava dominante.
    // Vale p/ os DOIS lutadores — perder também gasta o equipamento. Best-effort:
    // a recompensa já foi creditada e não deve ser desfeita por falha no desgaste.
    // allSettled + paralelo: são dois personagens independentes — falhar num não pode
    // deixar o outro lutando de graça (com `for` + try único, um throw no vencedor
    // pulava o perdedor silenciosamente).
    const wearResults = await Promise.allSettled([
      applyFightWear(battleResult.winnerId),
      applyFightWear(battleResult.loserId),
    ])
    const equipmentWear: Record<string, PvpWearEntry[]> = {}
    wearResults.forEach((r, i) => {
      const id = i === 0 ? battleResult.winnerId : battleResult.loserId
      if (r.status === 'fulfilled') equipmentWear[id] = r.value
      else console.error(`PvP gear wear failed for ${id}:`, r.reason)
    })

    try {
      await Promise.all([
        addHistoryEntry({
          characterId: battleResult.winnerId,
          activityType: winnerXpResult.leveledUp ? ActivityType.LEVEL_UP : ActivityType.XP_GAINED,
          description: `PvP Victory vs ${loser.name} (−${winnerCharged} STA)`,
          xpAmount: winnerXp,
          goldAmount: winnerGold,
          oldLevel: winnerXpResult.leveledUp ? winnerLevel : undefined,
          newLevel: winnerXpResult.leveledUp ? winnerXpResult.newLevelInfo.level : undefined,
          details: { action: 'pvp_victory', staminaCharged: winnerCharged },
        }),
        addHistoryEntry({
          characterId: battleResult.loserId,
          activityType: loserXpResult.leveledUp ? ActivityType.LEVEL_UP : ActivityType.XP_GAINED,
          description: `PvP Defeat vs ${winner.name} (−${loserCharged} STA)`,
          xpAmount: loserXp,
          goldAmount: loserGold,
          oldLevel: loserXpResult.leveledUp ? loserLevel : undefined,
          newLevel: loserXpResult.leveledUp ? loserXpResult.newLevelInfo.level : undefined,
          details: { action: 'pvp_defeat', staminaCharged: loserCharged },
        }),
      ])
    } catch (histErr) {
      console.error('PvP history write failed:', histErr)
    }

    // Ranking — best-effort. Bots (User.isBot) também pontuam e aparecem no leaderboard;
    // o payout DOL da season continua filtrando bots em /api/ranking/payout.
    let ranking: { winnerPoints?: number; loserPoints?: number } = {}
    {
      try {
        const season = await ensureActivePvpSeason()
        ranking = await applyPvpMatchRating({
          seasonId: season.id,
          winnerId: battleResult.winnerId,
          loserId: battleResult.loserId,
          winPoints: PVP_RANK_WIN_POINTS,
          lossPoints: PVP_RANK_LOSS_POINTS,
          winnerStaminaSpent: winnerCharged,
          loserStaminaSpent: loserCharged,
          winnerGold,
          loserGold,
          winnerXp,
          loserXp,
        })
      } catch (rankErr) {
        console.error('PvP ranking update failed:', rankErr)
      }
    }

    return NextResponse.json({
      success: true,
      winner: {
        id: battleResult.winnerId,
        xpGained: winnerXp,
        goldGained: winnerGold,
        leveledUp: winnerXpResult.leveledUp,
        newLevel: winnerXpResult.newLevelInfo?.level ?? winnerLevel,
        staminaCharged: winnerCharged,
        rankPoints: ranking.winnerPoints,
        equipmentWear: equipmentWear[battleResult.winnerId] ?? [],
      },
      loser: {
        id: battleResult.loserId,
        xpGained: loserXp,
        goldGained: loserGold,
        leveledUp: loserXpResult.leveledUp,
        newLevel: loserXpResult.newLevelInfo?.level ?? loserLevel,
        staminaCharged: loserCharged,
        rankPoints: ranking.loserPoints,
        equipmentWear: equipmentWear[battleResult.loserId] ?? [],
      },
    })
  } catch (error) {
    console.error('Battle rewards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
