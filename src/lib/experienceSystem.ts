/**
 * Sistema de Progressão de Experiência
 * 
 * Fórmula baseada em uma progressão exponencial suave:
 * XP_Para_Próximo_Nível = base * (level^exponent) + (level * multiplicador)
 */

interface LevelInfo {
  level: number;
  currentXP: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpToNextLevel: number;
  xpProgress: number;
  progressPercentage: number;
}

// Configurações do sistema de experiência
const XP_CONFIG = {
  baseXP: 100,           // XP base para o primeiro nível
  exponent: 1.4,         // Exponente para crescimento
  multiplier: 50,        // Multiplicador linear adicional
  maxLevel: 100,         // Nível máximo
};

/**
 * Calcula a XP total necessária para atingir um nível específico
 */
export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
  
  let totalXP = 0;
  for (let i = 2; i <= level; i++) {
    const xpForThisLevel = Math.floor(
      XP_CONFIG.baseXP * Math.pow(i - 1, XP_CONFIG.exponent) + 
      (i - 1) * XP_CONFIG.multiplier
    );
    totalXP += xpForThisLevel;
  }
  
  return totalXP;
}

/**
 * Calcula a XP necessária para o próximo nível a partir do nível atual
 */
export function getXPForNextLevel(currentLevel: number): number {
  if (currentLevel >= XP_CONFIG.maxLevel) return 0;
  
  return Math.floor(
    XP_CONFIG.baseXP * Math.pow(currentLevel, XP_CONFIG.exponent) + 
    currentLevel * XP_CONFIG.multiplier
  );
}

/**
 * Calcula o nível baseado na XP total acumulada
 */
export function getLevelFromXP(totalXP: number): number {
  if (totalXP <= 0) return 1;
  
  let level = 1;
  let accumulatedXP = 0;
  
  for (let i = 2; i <= XP_CONFIG.maxLevel; i++) {
    const xpForThisLevel = getXPForNextLevel(i - 1);
    if (accumulatedXP + xpForThisLevel > totalXP) {
      break;
    }
    accumulatedXP += xpForThisLevel;
    level = i;
  }
  
  return level;
}

/**
 * Retorna informações completas sobre o nível e progressão do personagem
 */
export function getLevelInfo(totalXP: number): LevelInfo {
  const currentLevel = getLevelFromXP(totalXP);
  const xpForCurrentLevel = getXPForLevel(currentLevel);
  const xpForNextLevel = getXPForLevel(currentLevel + 1);
  const xpProgress = totalXP - xpForCurrentLevel;
  const xpToNextLevel = xpForNextLevel - totalXP;
  const progressPercentage = xpForNextLevel > xpForCurrentLevel 
    ? (xpProgress / (xpForNextLevel - xpForCurrentLevel)) * 100 
    : 100;

  return {
    level: currentLevel,
    currentXP: totalXP,
    xpForCurrentLevel,
    xpForNextLevel: currentLevel >= XP_CONFIG.maxLevel ? totalXP : xpForNextLevel,
    xpToNextLevel: currentLevel >= XP_CONFIG.maxLevel ? 0 : xpToNextLevel,
    xpProgress,
    progressPercentage: Math.min(progressPercentage, 100),
  };
}

/**
 * Calcula os stats do personagem baseado no nível, raça e classe
 */
export function calculateCharacterStats(level: number, raceData: any, classData: any): {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina: number;
  maxStamina: number;
} {
  // Stats base padrão caso não haja dados da raça
  const defaultRaceStats = {
    strength: 10,
    dexterity: 10,
    intelligence: 10,
    constitution: 10,
  };

  // Usar stats base da raça se disponível, senão usar padrão
  const raceStats = raceData?.bonuses ? {
    ...defaultRaceStats,
    ...raceData.bonuses
  } : defaultRaceStats;

  // Bônus da classe (assumindo que existe no gameData)
  const classStats = classData?.bonuses ? {
    ...defaultRaceStats,
    ...classData.bonuses
  } : defaultRaceStats;

  // Combinar stats de raça e classe
  const totalStats = {
    strength: (raceStats.strength || 10) + (classStats.strength || 0),
    dexterity: (raceStats.dexterity || 10) + (classStats.dexterity || 0),
    intelligence: (raceStats.intelligence || 10) + (classStats.intelligence || 0),
    constitution: (raceStats.constitution || 10) + (classStats.constitution || 0),
  };

  // Crescimento por nível (10% de crescimento por nível)
  const levelMultiplier = 1 + (level - 1) * 0.1;

  // Stats base iniciais
  const baseHP = 100;
  const baseMP = 50;
  const baseStamina = 80;

  // Cálculo dos stats finais
  const maxHp = Math.floor((baseHP + (totalStats.constitution * 2) + (totalStats.strength * 1)) * levelMultiplier);
  const maxMp = Math.floor((baseMP + (totalStats.intelligence * 3) + (totalStats.dexterity * 0.5)) * levelMultiplier);
  const maxStamina = Math.floor((baseStamina + (totalStats.constitution * 2) + (totalStats.strength * 0.5)) * levelMultiplier);

  return {
    hp: maxHp, // Assumindo que está com vida cheia
    maxHp,
    mp: maxMp, // Assumindo que está com mana cheia
    maxMp,
    stamina: maxStamina, // Assumindo que está com stamina cheia
    maxStamina,
  };
}

/**
 * Gera uma tabela de níveis para debug/admin
 */
export function generateLevelTable(maxLevel: number = 20): Array<{level: number, totalXP: number, xpForNext: number}> {
  const table = [];
  
  for (let level = 1; level <= maxLevel; level++) {
    const totalXP = getXPForLevel(level);
    const xpForNext = level < maxLevel ? getXPForNextLevel(level) : 0;
    
    table.push({
      level,
      totalXP,
      xpForNext,
    });
  }
  
  return table;
}
