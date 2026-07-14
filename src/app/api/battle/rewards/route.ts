import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { addExperienceToCharacter } from '@/lib/characterLevelSystem';
import { recordXpGained } from '@/lib/characterHistory';
import { regenAndPersist } from '@/lib/staminaServer';

interface BattleResult {
  winnerId: string;
  loserId: string;
  winnerLevel: number;
  loserLevel: number;
  battleType: 'pvp' | 'pve';
  isFlawlessVictory?: boolean;
  winnerTransformed?: boolean;
  loserTransformed?: boolean;
  winStreak?: number;
  isFirstWinOfDay?: boolean;
}

// 🏆 CONFIGURAÇÃO DE RECOMPENSAS PVP
// ⚖️ Lançamento (P1 PvP, 2026-07-05): goldBase 15→40 / derrota 8→12 — o PvP
// pagava ~170g/dia/conta (esmola vs 6-9k da masmorra). Em troca, cada luta
// agora CUSTA stamina persistente (abaixo): sem stamina, luta vale 0 gold/xp
// (dá pra jogar por diversão, mas não farmar infinito).
const PVP_STAMINA_COST = 20;
const PVP_REWARDS_CONFIG = {
  victory: {
    xpBase: 50,
    goldBase: 40,
    bonusMultiplier: 1.5
  },
  
  defeat: {
    xpBase: 25,
    goldBase: 12,
    bonusMultiplier: 1.0
  },
  
  participation: {
    xpBase: 15,
    goldBase: 5
  },

  levelScaling: {
    xpMultiplier: 1.1,
    goldMultiplier: 1.08,
    maxScaling: 5.0
  },

  specialBonuses: {
    perfectVictory: {
      xpBonus: 1.3,
      goldBonus: 1.5
    },
    
    comboVictory: {
      perWin: 0.1,
      maxBonus: 1.0
    },
    
    transformationKill: {
      xpBonus: 1.2,
      goldBonus: 1.2
    },
    
    firstWinOfDay: {
      xpBonus: 2.0,
      goldBonus: 1.5
    }
  },

  levelDifferenceBalancing: {
    perLevelDifference: 0.15,
    maxDifference: 10,
    underdog_bonus: 1.5,
    bully_penalty: 0.7
  }
}

function calculateBattleRewards(
  playerLevel: number, 
  isVictory: boolean, 
  opponentLevel: number,
  specialBonuses: {
    isFlawless?: boolean;
    killTransformed?: boolean;
    winStreak?: number;
    isFirstWin?: boolean;
  } = {}
) {
  const config = PVP_REWARDS_CONFIG;
  const baseRewards = isVictory ? config.victory : config.defeat;
  
  // XP e Gold base
  let xp = baseRewards.xpBase;
  let gold = baseRewards.goldBase;
  
  // Scaling por nível
  const levelMult = Math.min(
    Math.pow(config.levelScaling.xpMultiplier, playerLevel - 1),
    config.levelScaling.maxScaling
  );
  
  xp = Math.floor(xp * levelMult);
  gold = Math.floor(gold * levelMult * config.levelScaling.goldMultiplier);
  
  // Bônus/Penalidade por diferença de nível
  if (isVictory) {
    const levelDiff = opponentLevel - playerLevel;
    const diffMultiplier = 1 + (levelDiff * config.levelDifferenceBalancing.perLevelDifference);
    
    xp = Math.floor(xp * diffMultiplier);
    gold = Math.floor(gold * diffMultiplier);
    
    // Bônus especiais por diferença extrema
    if (levelDiff >= 5) {
      xp = Math.floor(xp * config.levelDifferenceBalancing.underdog_bonus);
      gold = Math.floor(gold * config.levelDifferenceBalancing.underdog_bonus);
    } else if (levelDiff <= -5) {
      xp = Math.floor(xp * config.levelDifferenceBalancing.bully_penalty);
      gold = Math.floor(gold * config.levelDifferenceBalancing.bully_penalty);
    }
  }

  // Aplicar bônus especiais
  if (specialBonuses.isFlawless && isVictory) {
    xp = Math.floor(xp * config.specialBonuses.perfectVictory.xpBonus);
    gold = Math.floor(gold * config.specialBonuses.perfectVictory.goldBonus);
  }

  if (specialBonuses.killTransformed && isVictory) {
    xp = Math.floor(xp * config.specialBonuses.transformationKill.xpBonus);
    gold = Math.floor(gold * config.specialBonuses.transformationKill.goldBonus);
  }

  if (specialBonuses.isFirstWin && isVictory) {
    xp = Math.floor(xp * config.specialBonuses.firstWinOfDay.xpBonus);
    gold = Math.floor(gold * config.specialBonuses.firstWinOfDay.goldBonus);
  }

  if (specialBonuses.winStreak && specialBonuses.winStreak > 1 && isVictory) {
    const streakBonus = Math.min(
      1 + (specialBonuses.winStreak - 1) * config.specialBonuses.comboVictory.perWin,
      1 + config.specialBonuses.comboVictory.maxBonus
    );
    xp = Math.floor(xp * streakBonus);
    gold = Math.floor(gold * streakBonus);
  }

  return { xp: Math.max(5, xp), gold: Math.max(1, gold) };
}

export async function POST(request: NextRequest) {
  // 🔒 Faucet de GOLD: SEMPRE exige sessão autenticada. O antigo "isInternalCall"
  // por user-agent (node-fetch/undici) era forjável e permitia creditar gold a
  // qualquer winnerId sem login — removido. Esta rota não tem chamador interno.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const battleResult: BattleResult = await request.json();
    
    // Validar dados obrigatórios
    if (!battleResult.winnerId || !battleResult.loserId || !battleResult.winnerLevel || !battleResult.loserLevel) {
      return NextResponse.json({ error: 'Missing battle result data' }, { status: 400 });
    }

    // 🤖 LUTA CONTRA BOT DE PVP (ids `bot_`, efêmeros, sem linha no DB): só o
    // personagem HUMANO existe/recebe. O bot conta como oponente do MESMO nível
    // do humano (nada do body entra na conta), e o humano pode estar em qualquer
    // lado (vitória OU derrota). Fluxo humano×humano segue intocado abaixo.
    const winnerIsBot = String(battleResult.winnerId).startsWith('bot_');
    const loserIsBot = String(battleResult.loserId).startsWith('bot_');
    if (winnerIsBot && loserIsBot) {
      return NextResponse.json({ error: 'Invalid battle participants' }, { status: 400 });
    }
    if (winnerIsBot || loserIsBot) {
      const humanId = winnerIsBot ? battleResult.loserId : battleResult.winnerId;
      const humanWon = !winnerIsBot;

      const human = await prisma.character.findUnique({ where: { id: humanId } });
      if (!human) {
        return NextResponse.json({ error: 'Characters not found' }, { status: 404 });
      }
      if (human.userId !== userId) {
        return NextResponse.json({ error: 'Unauthorized for these characters' }, { status: 403 });
      }

      // 🔁 DEDUP ancorado no humano: o rastro "vs Bot" desta própria rota dentro
      // da janela vira no-op (também dedupa duas lutas vs bot em <120s — aceitável
      // e anti-farm, já que o claim vem do cliente).
      const historyLabel = humanWon ? 'PvP Victory vs Bot' : 'PvP Defeat vs Bot';
      const dedupWindow = new Date(Date.now() - 120_000);
      const alreadyCredited = await prisma.characterHistory.findFirst({
        where: {
          characterId: human.id,
          description: { startsWith: historyLabel },
          createdAt: { gte: dedupWindow },
        },
        select: { id: true },
      });
      if (alreadyCredited) {
        return NextResponse.json({
          success: true,
          deduped: true,
          winner: { id: battleResult.winnerId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: humanWon ? human.level : 1 },
          loser: { id: battleResult.loserId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: humanWon ? 1 : human.level },
        });
      }

      // 🔒 1ª vitória do dia no SERVIDOR (prefixo "PvP Victory" casa com "vs Bot")
      const botStartOfDay = new Date();
      botStartOfDay.setUTCHours(0, 0, 0, 0);
      const botWinsToday = await prisma.characterHistory.count({
        where: {
          characterId: human.id,
          createdAt: { gte: botStartOfDay },
          description: { startsWith: 'PvP Victory' },
        },
      });

      // ⚡ Stamina persistente só do humano (mesma regra do PvP normal): exausto
      // (< 20) ⇒ luta vale 0 gold/xp.
      const { stamina } = await regenAndPersist(human as any);
      const hasStamina = stamina >= PVP_STAMINA_COST;
      await prisma.character.update({
        where: { id: human.id },
        data: { stamina: Math.max(0, stamina - PVP_STAMINA_COST), staminaUpdatedAt: new Date() },
      });

      // Oponente = MESMO nível do humano (sem bônus/penalidade de diferença)
      const rewards = hasStamina
        ? calculateBattleRewards(human.level, humanWon, human.level, humanWon ? {
            isFlawless: battleResult.isFlawlessVictory,
            killTransformed: battleResult.loserTransformed,
            isFirstWin: botWinsToday === 0,
          } : {})
        : { xp: 0, gold: 0 };

      const [xpResult] = await Promise.all([
        addExperienceToCharacter(human.id, rewards.xp),
        rewards.gold > 0
          ? prisma.character.update({
              where: { id: human.id },
              data: { gold: { increment: rewards.gold } }
            })
          : Promise.resolve()
      ]);

      try {
        await recordXpGained(
          human.id,
          rewards.xp,
          historyLabel,
          xpResult.leveledUp ? human.level : undefined,
          xpResult.leveledUp ? xpResult.newLevelInfo.level : undefined
        );
      } catch (historyError) {
        console.error('Error recording bot battle history:', historyError);
      }

      const humanSide = {
        id: human.id,
        xpGained: rewards.xp,
        goldGained: rewards.gold,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.leveledUp ? xpResult.newLevelInfo.level : human.level
      };
      const botSide = {
        id: winnerIsBot ? battleResult.winnerId : battleResult.loserId,
        xpGained: 0,
        goldGained: 0,
        leveledUp: false,
        newLevel: human.level
      };
      return NextResponse.json({
        success: true,
        winner: humanWon ? humanSide : botSide,
        loser: humanWon ? botSide : humanSide
      });
    }

    // Buscar personagens
    const [winner, loser] = await Promise.all([
      prisma.character.findUnique({ where: { id: battleResult.winnerId } }),
      prisma.character.findUnique({ where: { id: battleResult.loserId } })
    ]);

    if (!winner || !loser) {
      return NextResponse.json({ error: 'Characters not found' }, { status: 404 });
    }

    // O usuário autenticado precisa ser dono de um dos participantes da luta.
    if (winner.userId !== userId && loser.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized for these characters' }, { status: 403 });
    }

    // 🔁 DEDUP (pendência 2 do balance): a mesma luta pode chegar aqui DUAS
    // vezes (cliente do vencedor E do perdedor chamam a rota) — sem isto o
    // crédito dobrava. O registro de histórico "PvP Victory vs <nome>" é
    // escrito nesta própria rota, então uma segunda chamada do MESMO confronto
    // dentro da janela encontra o rastro da primeira e vira no-op.
    const dedupWindow = new Date(Date.now() - 120_000);
    const alreadyCredited = await prisma.characterHistory.findFirst({
      where: {
        characterId: battleResult.winnerId,
        description: { startsWith: `PvP Victory vs ${loser.name}` },
        createdAt: { gte: dedupWindow },
      },
      select: { id: true },
    });
    if (alreadyCredited) {
      return NextResponse.json({
        success: true,
        deduped: true,
        winner: { id: battleResult.winnerId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: winner.level },
        loser: { id: battleResult.loserId, xpGained: 0, goldGained: 0, leveledUp: false, newLevel: loser.level },
      });
    }

    // 🔒 Níveis do BANCO, não do body (o cliente escolhia o multiplicador ×5 de
    // nível mandando winnerLevel=50). O body segue mandando os níveis só por
    // compat de payload; os valores dele não entram mais na conta.
    const winnerLevel = winner.level;
    const loserLevel = loser.level;

    // 🔒 1ª vitória do dia verificada no SERVIDOR (histórico de hoje), não no body.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const winsToday = await prisma.characterHistory.count({
      where: {
        characterId: battleResult.winnerId,
        createdAt: { gte: startOfDay },
        description: { startsWith: 'PvP Victory' },
      },
    });
    const isFirstWin = winsToday === 0;

    // ⚡ P1: cada luta consome stamina PERSISTENTE dos participantes (o custo em
    // luta é recurso de sessão e não gateava nada). Exausto (< custo) ⇒ luta
    // vale 0 gold/xp — segue podendo jogar, mas o faucet fecha.
    const chargeStamina = async (char: typeof winner): Promise<boolean> => {
      if (!char) return false;
      // Stamina viva sincronizada (regen passivo ou tiques de coleta debitados)
      // antes de cobrar; gastar reancora o cronômetro de regen (âncora = agora).
      const { stamina } = await regenAndPersist(char as any);
      const ok = stamina >= PVP_STAMINA_COST;
      await prisma.character.update({
        where: { id: char.id },
        data: { stamina: Math.max(0, stamina - PVP_STAMINA_COST), staminaUpdatedAt: new Date() },
      });
      return ok;
    };
    const [winnerHasStamina, loserHasStamina] = await Promise.all([
      chargeStamina(winner),
      chargeStamina(loser),
    ]);

    // Calcular recompensas do vencedor
    const winnerRewards = winnerHasStamina
      ? calculateBattleRewards(
          winnerLevel,
          true,
          loserLevel,
          {
            isFlawless: battleResult.isFlawlessVictory,
            killTransformed: battleResult.loserTransformed,
            winStreak: battleResult.winStreak,
            isFirstWin,
          }
        )
      : { xp: 0, gold: 0 };

    // Calcular recompensas do perdedor (recebe algo se tinha stamina)
    const loserRewards = loserHasStamina
      ? calculateBattleRewards(loserLevel, false, winnerLevel)
      : { xp: 0, gold: 0 };

    // O ouro vai para a CARTEIRA DO PERSONAGEM que lutou (Character.gold —
    // "dinheiro na mão"). Para dar claim, deposita no banco. [[bank — Opção B]]
    const [winnerXpResult] = await Promise.all([
      addExperienceToCharacter(battleResult.winnerId, winnerRewards.xp),
      winnerRewards.gold > 0
        ? prisma.character.update({
            where: { id: battleResult.winnerId },
            data: { gold: { increment: winnerRewards.gold } }
          })
        : Promise.resolve()
    ]);

    // Atualizar perdedor
    const [loserXpResult] = await Promise.all([
      addExperienceToCharacter(battleResult.loserId, loserRewards.xp),
      loserRewards.gold > 0
        ? prisma.character.update({
            where: { id: battleResult.loserId },
            data: { gold: { increment: loserRewards.gold } }
          })
        : Promise.resolve()
    ]);

    // Registrar no histórico
    try {
      await Promise.all([
        recordXpGained(
          battleResult.winnerId, 
          winnerRewards.xp, 
          `PvP Victory vs ${loser.name}`,
          winnerXpResult.leveledUp ? winnerLevel : undefined,
          winnerXpResult.leveledUp ? winnerXpResult.newLevelInfo.level : undefined
        ),
        recordXpGained(
          battleResult.loserId, 
          loserRewards.xp, 
          `PvP Defeat vs ${winner.name}`,
          loserXpResult.leveledUp ? loserLevel : undefined,
          loserXpResult.leveledUp ? loserXpResult.newLevelInfo.level : undefined
        )
      ]);
    } catch (historyError) {
      console.error('Error recording battle history:', historyError);
    }

    return NextResponse.json({
      success: true,
      winner: {
        id: battleResult.winnerId,
        xpGained: winnerRewards.xp,
        goldGained: winnerRewards.gold,
        leveledUp: winnerXpResult.leveledUp,
        newLevel: winnerXpResult.leveledUp ? winnerXpResult.newLevelInfo.level : winnerLevel
      },
      loser: {
        id: battleResult.loserId,
        xpGained: loserRewards.xp,
        goldGained: loserRewards.gold,
        leveledUp: loserXpResult.leveledUp,
        newLevel: loserXpResult.leveledUp ? loserXpResult.newLevelInfo.level : loserLevel
      }
    });

  } catch (error) {
    console.error('Error processing battle rewards:', error);
    return NextResponse.json({ error: 'Error processing battle rewards' }, { status: 500 });
  }
}
