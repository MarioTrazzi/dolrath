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
import {
  calculatePvpStaminaRewards,
  PVP_FIGHT_STAMINA,
  PVP_PAIR_DAILY_POINT_CAP,
  PVP_RANK_LOSS_POINTS,
  PVP_RANK_WIN_POINTS,
} from '@/lib/pvpRewards'
import { dailyGoldRemainingTx, applyGearWearTx } from '@/lib/dungeonRunServer'
import { wearForPvpFight } from '@/lib/durability'
import { ensureActivePvpSeason, applyPvpMatchRating, isScoringSeason } from '@/lib/pvpRanking'
import { isEnrolled } from '@/lib/seasonPool'
import { advanceQuestProgress } from '@/lib/questServer'
import { ActivityType } from '@prisma/client'

interface BattleResult {
  winnerId: string
  loserId: string
  isFlawlessVictory?: boolean
  winnerTransformed?: boolean
  loserTransformed?: boolean
  /**
   * ⚠️ IGNORADOS desde a taxa fixa (2026-08-14). O socket costumava mandar a stamina
   * gasta golpe a golpe e a cobrança saía daí; hoje toda luta custa PVP_FIGHT_STAMINA.
   * Continuam aceitos no corpo só para um socket ainda não redeployado não quebrar.
   */
  winnerStaminaSpent?: number
  loserStaminaSpent?: number
  /** Chave única da luta gerada pelo socket — lock de idempotência via PvpMatch.matchKey. */
  matchKey?: string
  /** Nome do lado SINTÉTICO (bot da fila) — o lado real sempre lê o nome do banco. */
  winnerName?: string
  loserName?: string
}

/**
 * 🤖 Oponente sintético da fila de PvP (server/pvp-bot.js): quando ninguém aparece em
 * ~10s, o socket sobe um bot espelho do jogador. Ele NÃO existe no banco — não recebe
 * ouro/XP, não gasta stamina, não desgasta gear e não entra em PvpRating (que tem FK
 * para Character). O humano recebe normalmente.
 *
 * O que a luta contra bot NÃO faz é PONTUAR a temporada: a pool paga DOL de verdade e
 * um oponente garantido a cada 10s viraria uma escada infinita no leaderboard. O ledger
 * PvpMatch continua sendo escrito (winnerId/loserId são String pura, sem FK) — é ele
 * que dá idempotência por matchKey e alimenta o teto diário de ouro.
 */
const BOT_FIGHTER_PREFIX = 'bot_'
function isVirtualFighter(id: string): boolean {
  return typeof id === 'string' && id.startsWith(BOT_FIGHTER_PREFIX)
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
function noReward(reason: 'same_user' | 'cannot_pay_entry', winner: CharacterRow, loser: CharacterRow) {
  const side = (c: CharacterRow) => ({
    id: c.id, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: c.level,
    staminaCharged: 0, equipmentWear: [] as PvpWearEntry[],
  })
  return { success: true, skipped: reason, winner: side(winner), loser: side(loser) }
}

/**
 * Por que esta luta NÃO deve pontuar (ouro e XP são pagos de qualquer jeito).
 * Devolve null quando pontua normalmente.
 *
 * Três motivos, todos consequência de a pool pagar DOL de verdade:
 *  • `offseason` — entressafra: o mundo roda, o placar não.
 *  • `not_enrolled` — quem não pagou a inscrição não disputa a pool.
 *  • `pair_cap` — duas contas trocando vitórias em série. O bloqueio de mesma
 *    conta (`same_user`) não cobre conluio entre contas distintas; aqui, a
 *    partir da N-ésima luta do dia contra o MESMO oponente, os pontos zeram.
 */
async function resolveRankingSkip(opts: {
  season: { id: string; status: string }
  winnerId: string
  loserId: string
  winnerUserId: string
  loserUserId: string
  since: Date
}): Promise<string | null> {
  if (!isScoringSeason(opts.season)) return 'offseason'

  const [winnerIn, loserIn] = await Promise.all([
    isEnrolled(opts.season.id, opts.winnerId),
    isEnrolled(opts.season.id, opts.loserId),
  ])
  if (!winnerIn || !loserIn) return 'not_enrolled'

  const pairMatchesToday = await prisma.pvpMatch.count({
    where: {
      createdAt: { gte: opts.since },
      OR: [
        { winnerUserId: opts.winnerUserId, loserUserId: opts.loserUserId },
        { winnerUserId: opts.loserUserId, loserUserId: opts.winnerUserId },
      ],
    },
  })
  // O ledger desta luta já foi criado, então a 1ª luta do par conta 1.
  if (pairMatchesToday > PVP_PAIR_DAILY_POINT_CAP) return 'pair_cap'

  return null
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

    // Um dos lados pode ser o bot da fila. Os dois, nunca — não existe luta sem humano.
    const winnerVirtual = isVirtualFighter(battleResult.winnerId)
    const loserVirtual = isVirtualFighter(battleResult.loserId)
    if (winnerVirtual && loserVirtual) {
      return NextResponse.json({ error: 'Bot vs bot has no rewards' }, { status: 400 })
    }

    const [winnerRow, loserRow] = await Promise.all([
      winnerVirtual ? null : prisma.character.findUnique({ where: { id: battleResult.winnerId } }),
      loserVirtual ? null : prisma.character.findUnique({ where: { id: battleResult.loserId } }),
    ])

    if ((!winnerVirtual && !winnerRow) || (!loserVirtual && !loserRow)) {
      return NextResponse.json({ error: 'Characters not found' }, { status: 404 })
    }

    // O bot espelha o nível do humano, então o nível dele NÃO vem do payload: é o do
    // personagem real desta luta. Nada do lado sintético é forjável a não ser o nome,
    // que só aparece no texto do histórico.
    const humanLevel = (winnerRow ?? loserRow)!.level
    const winner = {
      id: battleResult.winnerId,
      name: winnerRow?.name ?? (battleResult.winnerName || 'Desafiante'),
      level: winnerRow?.level ?? humanLevel,
      userId: winnerRow?.userId ?? null,
    }
    const loser = {
      id: battleResult.loserId,
      name: loserRow?.name ?? (battleResult.loserName || 'Desafiante'),
      level: loserRow?.level ?? humanLevel,
      userId: loserRow?.userId ?? null,
    }

    // 🤝 ANTI-CONLUIO: dois personagens da MESMA conta lutando entre si escolhem quem
    // vence — capturam o bônus de 1ª vitória do dia, o flawless e os pontos de ranking
    // (que pagam DOL no top 10) sem risco nenhum. Semântica de treino: não credita nada
    // e não cobra stamina. Não cobre conluio entre DUAS contas — ver o TODO no fim.
    if (winnerRow && loserRow && winner.userId === loser.userId) {
      return NextResponse.json(noReward('same_user', winner, loser))
    }

    // 🔒 IDEMPOTÊNCIA: o socket manda uma matchKey única por luta; a criação do
    // PvpMatch (matchKey @unique) é o lock — retry da MESMA luta bate no P2002 e
    // devolve `deduped` sem creditar/desgastar de novo. O ledger criado aqui também
    // alimenta o teto diário e o bônus de 1ª vitória (antes tudo dependia do
    // characterHistory best-effort, por prefixo de string — crédito duplo possível).
    // Fallback: socket antigo sem matchKey ganha uma chave gerada (ledger sempre
    // existe) + o dedup legado por prefixo cobre a janela de deploy skew.
    const matchKeyRaw = typeof battleResult.matchKey === 'string' ? battleResult.matchKey.trim() : ''
    const matchKey = matchKeyRaw ? matchKeyRaw.slice(0, 200) : `srv:${crypto.randomUUID()}`
    if (!matchKeyRaw) {
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
    }

    const winnerLevel = winner.level
    const loserLevel = loser.level

    // 🎟️ TAXA FIXA: a luta custa PVP_FIGHT_STAMINA, ponto. Nem o número de turnos, nem
    // os golpes escolhidos, nem a transformação mexem nisso — é o que fixa a arena em
    // PVP_FIGHTS_PER_DAY lutas por dia em QUALQUER nível (antes o nv50 conseguia 8/dia
    // e o iniciante 14/dia, porque a cobrança era a stamina gasta na luta).
    // O que o socket declarou (winner/loserStaminaSpent) não é mais lido.

    // Stamina VIVA dos dois lados (regen aplicado e persistido pelo relógio único),
    // ainda SEM debitar. A leitura vem antes da cobrança de propósito — ver o portão
    // sobre o cobrável logo abaixo.
    // `char` null = lado sintético: não existe linha para regenerar nem debitar.
    const liveStaminaOf = async (char: typeof winnerRow): Promise<number> => {
      if (!char) return 0
      const { stamina } = await regenAndPersist(char as Parameters<typeof regenAndPersist>[0])
      return stamina
    }
    const [winnerLive, loserLive] = await Promise.all([
      liveStaminaOf(winnerRow),
      liveStaminaOf(loserRow),
    ])
    // ⚖️ PAGA INTEIRO OU NÃO RECEBE, LADO A LADO. Cobrança parcial não existe mais:
    // quem torrou a stamina numa masmorra em outra aba não tem os 19⚡ e sai da luta
    // sem ouro, sem XP, sem ranking — e sem ser debitado do troco que tinha.
    //
    // POR LADO, e não pela luta inteira, de propósito: com um portão único o adversário
    // decidia o seu prêmio (bastava esvaziar a própria stamina no meio da luta para o
    // oponente honesto não receber nada). Aqui o honesto recebe normalmente.
    const winnerPays = !!winnerRow && winnerLive >= PVP_FIGHT_STAMINA
    const loserPays = !!loserRow && loserLive >= PVP_FIGHT_STAMINA

    // Nenhum humano pagante = luta sem faucet. Checado ANTES do lock E ANTES do débito,
    // os dois de propósito: sem linha no ledger (não infla wins/1ª vitória) e sem
    // cobrar stamina de uma luta que não paga.
    const anyHumanPays = winnerVirtual ? loserPays : loserVirtual ? winnerPays : (winnerPays || loserPays)
    if (!anyHumanPays) {
      return NextResponse.json(noReward('cannot_pay_entry', winner, loser))
    }
    const winnerWillCharge = winnerPays ? PVP_FIGHT_STAMINA : 0
    const loserWillCharge = loserPays ? PVP_FIGHT_STAMINA : 0

    // Débito propriamente dito, sobre o saldo já lido acima.
    const chargeStamina = async (char: typeof winnerRow, live: number, amount: number): Promise<number> => {
      if (!char || amount <= 0) return 0
      await prisma.character.update({
        where: { id: char.id },
        data: { stamina: Math.max(0, live - amount), staminaUpdatedAt: new Date() },
      })
      return amount
    }

    const season = await ensureActivePvpSeason()

    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const winsToday = await prisma.pvpMatch.count({
      where: { winnerId: battleResult.winnerId, createdAt: { gte: startOfDay } },
    })
    const isFirstWin = winsToday === 0

    // O lock (e ledger) da luta: uma linha por matchKey. O ranking atualiza esta
    // mesma linha com stamina/XP/pontos lá no fim.
    try {
      await prisma.pvpMatch.create({
        data: {
          matchKey,
          seasonId: season.id,
          winnerId: battleResult.winnerId,
          loserId: battleResult.loserId,
          winnerUserId: winner.userId,
          loserUserId: loser.userId,
        },
      })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return NextResponse.json({
          success: true,
          deduped: true,
          winner: { id: battleResult.winnerId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: winner.level },
          loser: { id: battleResult.loserId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: loser.level },
        })
      }
      throw err
    }

    const [winnerCharged, loserCharged] = await Promise.all([
      chargeStamina(winnerRow, winnerLive, winnerWillCharge),
      chargeStamina(loserRow, loserLive, loserWillCharge),
    ])

    // 💰 A APOSTA DA ARENA É FIXA: os dois lados valem PVP_FIGHT_STAMINA no pool, então
    // o prêmio da luta é o mesmo em qualquer nível. O lado sintético (bot da fila) entra
    // com a taxa dele também — sem isso o pool cairia pela metade e vencer um bot
    // pagaria ~50% de uma luta humana equivalente.
    // Quem não conseguiu pagar não leva prêmio (zerado logo abaixo), mas a aposta do
    // oponente honesto continua de pé.
    const calc = calculatePvpStaminaRewards({
      winnerStaminaSpent: PVP_FIGHT_STAMINA,
      loserStaminaSpent: PVP_FIGHT_STAMINA,
      isFlawless: battleResult.isFlawlessVictory,
      killTransformed: battleResult.loserTransformed,
      isFirstWinOfDay: isFirstWin,
      winnerLevel,
      loserLevel,
    })

    // Quem não pagou a taxa não fatura: o prêmio dele fica no lado que pagou (o pool é
    // fixo). Vale também para o lado sintético, que não tem carteira nenhuma.
    const winnerEarns = winnerPays ? calc.winner : { gold: 0, xp: 0 }
    const loserEarns = loserPays ? calc.loser : { gold: 0, xp: 0 }

    // Teto diário compartilhado com a masmorra, agora DENTRO de uma transação com o
    // crédito e o registro no ledger PvpMatch — duas lutas simultâneas do mesmo dono
    // não estouram mais o cap, e o valor pago fica auditável na própria luta.
    const { winnerGold, loserGold } = await prisma.$transaction(async (tx) => {
      const [wRemain, lRemain] = await Promise.all([
        winner.userId ? dailyGoldRemainingTx(tx, winner.userId) : Promise.resolve(0),
        loser.userId ? dailyGoldRemainingTx(tx, loser.userId) : Promise.resolve(0),
      ])
      const wGold = Math.min(winnerEarns.gold, wRemain)
      const lGold = Math.min(loserEarns.gold, lRemain)
      if (wGold > 0) {
        await tx.character.update({ where: { id: battleResult.winnerId }, data: { gold: { increment: wGold } } })
      }
      if (lGold > 0) {
        await tx.character.update({ where: { id: battleResult.loserId }, data: { gold: { increment: lGold } } })
      }
      if (wGold > 0 || lGold > 0) {
        await tx.pvpMatch.update({ where: { matchKey }, data: { winnerGold: wGold, loserGold: lGold } })
      }
      return { winnerGold: wGold, loserGold: lGold }
    })
    const winnerXp = winnerEarns.xp
    const loserXp = loserEarns.xp

    // Lado sintético não ganha XP nem progride missão: `noXp` devolve o formato do
    // addExperienceToCharacter sem tocar no banco.
    const noXp = (level: number) => ({ leveledUp: false, newLevelInfo: { level } }) as
      Awaited<ReturnType<typeof addExperienceToCharacter>>
    const [winnerXpResult, loserXpResult] = await Promise.all([
      winnerVirtual ? noXp(winner.level) : addExperienceToCharacter(battleResult.winnerId, winnerXp),
      loserVirtual ? noXp(loser.level) : addExperienceToCharacter(battleResult.loserId, loserXp),
    ])

    // 🗺️ Missões: pós-commit e fire-and-forget (pvp_win também conta pvp_fight via alias).
    if (!winnerVirtual) advanceQuestProgress(battleResult.winnerId, { type: 'pvp_win', amount: 1 }).catch(() => {})
    if (!loserVirtual) advanceQuestProgress(battleResult.loserId, { type: 'pvp_fight', amount: 1 }).catch(() => {})
    if (!winnerVirtual && winnerXpResult.leveledUp) {
      advanceQuestProgress(battleResult.winnerId, { type: 'level_reach', value: winnerXpResult.newLevelInfo.level }).catch(() => {})
    }
    if (!loserVirtual && loserXpResult.leveledUp) {
      advanceQuestProgress(battleResult.loserId, { type: 'level_reach', value: loserXpResult.newLevelInfo.level }).catch(() => {})
    }

    // ⚔️ Desgaste da luta (2026-07-15): a arena era a ÚNICA atividade sem custo
    // operacional, e ao virar a fonte de ouro do jogo isso a tornava dominante.
    // Vale p/ os DOIS lutadores — perder também gasta o equipamento. Best-effort:
    // a recompensa já foi creditada e não deve ser desfeita por falha no desgaste.
    // allSettled + paralelo: são dois personagens independentes — falhar num não pode
    // deixar o outro lutando de graça (com `for` + try único, um throw no vencedor
    // pulava o perdedor silenciosamente).
    // O bot não tem peças: pular o desgaste do lado sintético.
    const wearResults = await Promise.allSettled([
      winnerVirtual ? Promise.resolve([] as PvpWearEntry[]) : applyFightWear(battleResult.winnerId),
      loserVirtual ? Promise.resolve([] as PvpWearEntry[]) : applyFightWear(battleResult.loserId),
    ])
    const equipmentWear: Record<string, PvpWearEntry[]> = {}
    wearResults.forEach((r, i) => {
      const id = i === 0 ? battleResult.winnerId : battleResult.loserId
      if (r.status === 'fulfilled') equipmentWear[id] = r.value
      else console.error(`PvP gear wear failed for ${id}:`, r.reason)
    })

    try {
      await Promise.all([
        winnerVirtual ? null : addHistoryEntry({
          characterId: battleResult.winnerId,
          activityType: winnerXpResult.leveledUp ? ActivityType.LEVEL_UP : ActivityType.XP_GAINED,
          description: `PvP Victory vs ${loser.name} (−${winnerCharged} STA)`,
          xpAmount: winnerXp,
          goldAmount: winnerGold,
          oldLevel: winnerXpResult.leveledUp ? winnerLevel : undefined,
          newLevel: winnerXpResult.leveledUp ? winnerXpResult.newLevelInfo.level : undefined,
          details: { action: 'pvp_victory', staminaCharged: winnerCharged },
        }),
        loserVirtual ? null : addHistoryEntry({
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

    // Ranking. Bots (User.isBot) também pontuam e aparecem no leaderboard; o
    // payout DOL continua filtrando bots em getPayoutBoard.
    //
    // A luta SEMPRE paga ouro e XP — o que as regras abaixo decidem é só se ela
    // conta pontos. `skipped` volta no payload para a UI poder avisar em vez de
    // o jogador descobrir sozinho que lutou à toa.
    let ranking: { winnerPoints?: number; loserPoints?: number; skipped?: string } = {}
    if (winnerVirtual || loserVirtual) {
      // 🤖 Luta contra o oponente da fila: paga ouro e XP, mas NÃO pontua. Um oponente
      // que aparece garantido a cada 10s valendo 25 pontos por vitória viraria uma
      // escada infinita num placar que paga DOL de verdade.
      ranking = { skipped: 'bot_opponent' }
    } else if (!winnerPays || !loserPays) {
      // Um dos dois entrou sem a taxa. A luta rolou e o lado pagante recebeu ouro/XP,
      // mas pontuar seria abrir uma escada de graça num placar que paga DOL.
      ranking = { skipped: 'unpaid_entry' }
    } else {
      const rankSkip = await resolveRankingSkip({
        season,
        winnerId: battleResult.winnerId,
        loserId: battleResult.loserId,
        winnerUserId: winner.userId!,
        loserUserId: loser.userId!,
        since: startOfDay,
      })

      if (rankSkip) {
        ranking = { skipped: rankSkip }
      } else {
        try {
          ranking = await applyPvpMatchRating({
            matchKey,
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
          // Antes isso era engolido em silêncio: a luta pagava ouro e não
          // pontuava sem ninguém ficar sabendo.
          console.error('PvP ranking update failed:', rankErr)
          ranking = { skipped: 'error' }
        }
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
        // `rankPoints` = acumulado da TEMPORADA (o que applyPvpMatchRating devolve).
        // `rankPointsGained` = o que ESTA luta somou — a UI mostrava só o acumulado,
        // rotulado "N pts", e o jogador lia como se fosse o ganho da partida.
        rankPoints: ranking.winnerPoints,
        rankPointsGained: ranking.skipped ? 0 : PVP_RANK_WIN_POINTS,
        equipmentWear: equipmentWear[battleResult.winnerId] ?? [],
      },
      rankingSkipped: ranking.skipped,
      loser: {
        id: battleResult.loserId,
        xpGained: loserXp,
        goldGained: loserGold,
        leveledUp: loserXpResult.leveledUp,
        newLevel: loserXpResult.newLevelInfo?.level ?? loserLevel,
        staminaCharged: loserCharged,
        rankPoints: ranking.loserPoints,
        rankPointsGained: ranking.skipped ? 0 : PVP_RANK_LOSS_POINTS,
        equipmentWear: equipmentWear[battleResult.loserId] ?? [],
      },
    })
  } catch (error) {
    console.error('Battle rewards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
