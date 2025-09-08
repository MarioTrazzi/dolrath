import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { addExperienceToCharacter } from '@/lib/characterLevelSystem';
import { recordXpGained } from '@/lib/characterHistory';

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
const PVP_REWARDS_CONFIG = {
  victory: {
    xpBase: 50,
    goldBase: 15,
    bonusMultiplier: 1.5
  },
  
  defeat: {
    xpBase: 25,
    goldBase: 8,
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
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const battleResult: BattleResult = await request.json();
    
    // Validar dados obrigatórios
    if (!battleResult.winnerId || !battleResult.loserId || !battleResult.winnerLevel || !battleResult.loserLevel) {
      return NextResponse.json({ error: 'Missing battle result data' }, { status: 400 });
    }

    // Buscar personagens
    const [winner, loser] = await Promise.all([
      prisma.character.findUnique({ where: { id: battleResult.winnerId } }),
      prisma.character.findUnique({ where: { id: battleResult.loserId } })
    ]);

    if (!winner || !loser) {
      return NextResponse.json({ error: 'Characters not found' }, { status: 404 });
    }

    // Verificar se os personagens pertencem a usuários autenticados
    if (winner.userId !== session.user.id && loser.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized for these characters' }, { status: 403 });
    }

    // Calcular recompensas do vencedor
    const winnerRewards = calculateBattleRewards(
      battleResult.winnerLevel,
      true,
      battleResult.loserLevel,
      {
        isFlawless: battleResult.isFlawlessVictory,
        killTransformed: battleResult.loserTransformed,
        winStreak: battleResult.winStreak,
        isFirstWin: battleResult.isFirstWinOfDay
      }
    );

    // Calcular recompensas do perdedor (sempre recebe algo)
    const loserRewards = calculateBattleRewards(
      battleResult.loserLevel,
      false,
      battleResult.winnerLevel
    );

    // Atualizar vencedor
    const [winnerXpResult] = await Promise.all([
      addExperienceToCharacter(battleResult.winnerId, winnerRewards.xp),
      prisma.character.update({
        where: { id: battleResult.winnerId },
        data: { gold: { increment: winnerRewards.gold } }
      })
    ]);

    // Atualizar perdedor
    const [loserXpResult] = await Promise.all([
      addExperienceToCharacter(battleResult.loserId, loserRewards.xp),
      prisma.character.update({
        where: { id: battleResult.loserId },
        data: { gold: { increment: loserRewards.gold } }
      })
    ]);

    // Registrar no histórico
    try {
      await Promise.all([
        recordXpGained(
          battleResult.winnerId, 
          winnerRewards.xp, 
          `PvP Victory vs ${loser.name}`,
          winnerXpResult.leveledUp ? battleResult.winnerLevel : undefined,
          winnerXpResult.leveledUp ? winnerXpResult.newLevelInfo.level : undefined
        ),
        recordXpGained(
          battleResult.loserId, 
          loserRewards.xp, 
          `PvP Defeat vs ${winner.name}`,
          loserXpResult.leveledUp ? battleResult.loserLevel : undefined,
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
        newLevel: winnerXpResult.leveledUp ? winnerXpResult.newLevelInfo.level : battleResult.winnerLevel
      },
      loser: {
        id: battleResult.loserId,
        xpGained: loserRewards.xp,
        goldGained: loserRewards.gold,
        leveledUp: loserXpResult.leveledUp,
        newLevel: loserXpResult.leveledUp ? loserXpResult.newLevelInfo.level : battleResult.loserLevel
      }
    });

  } catch (error) {
    console.error('Error processing battle rewards:', error);
    return NextResponse.json({ error: 'Error processing battle rewards' }, { status: 500 });
  }
}
