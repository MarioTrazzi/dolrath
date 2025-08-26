// Sistema de combate aprimorado com mecânicas de CRIT e SPEED
// Implementa dano crítico e modificadores de velocidade/resistência

export interface CombatStats {
  str: number;
  agi: number;
  int: number;
  res: number;
  crit: number;  // AGI × 0.2 (percentual)
  speed: number; // AGI × 0.5
}

export interface CombatResult {
  damage: number;
  isCritical: boolean;
  criticalMultiplier: number;
  dodgeSuccess: boolean;
  blockSuccess: boolean;
  actualDamage: number;
  description: string;
}

export interface DiceRoll {
  roll: number;
  modifier: number;
  total: number;
  isMaxRoll: boolean; // Para determinar críticos
}

/**
 * Calcula os stats de combate baseados nos atributos do personagem
 */
export function calculateCombatStats(character: any): CombatStats {
  const baseAgi = (character.attributes?.agi || character.baseStats?.agi || 0);
  const baseStr = (character.attributes?.str || character.baseStats?.str || 0);
  const baseInt = (character.attributes?.int || character.baseStats?.int || 0);
  const baseRes = (character.attributes?.res || character.baseStats?.res || 0);

  // Somar bônus de equipamentos se existirem
  const equipmentArray = Array.isArray(character.equipment) ? character.equipment : [];
  const equipmentBonus = equipmentArray.reduce((total: any, equipment: any) => {
    const stats = equipment.item?.stats || {};
    return {
      agi: total.agi + (stats.agi || 0),
      str: total.str + (stats.str || 0),
      int: total.int + (stats.int || 0),
      res: total.res + (stats.def || 0), // ItemStats usa 'def' em vez de 'res'
    };
  }, { agi: 0, str: 0, int: 0, res: 0 });

  const totalAgi = baseAgi + equipmentBonus.agi;
  const totalStr = baseStr + equipmentBonus.str;
  const totalInt = baseInt + equipmentBonus.int;
  const totalRes = baseRes + equipmentBonus.res;

  return {
    str: totalStr,
    agi: totalAgi,
    int: totalInt,
    res: totalRes,
    crit: totalAgi * 0.2, // Percentual de chance crítica
    speed: totalAgi * 0.5  // Modificador de velocidade
  };
}

/**
 * Rola um dado e verifica se é crítico (maior número possível)
 */
export function rollDiceWithCrit(sides: number, modifier: number = 0): DiceRoll {
  const roll = Math.floor(Math.random() * sides) + 1;
  const isMaxRoll = roll === sides;
  const total = roll + modifier;

  return {
    roll,
    modifier,
    total,
    isMaxRoll
  };
}

/**
 * Calcula dano de ataque com possibilidade de crítico
 */
export function calculateAttackDamage(
  attackerStats: CombatStats,
  baseDamage: number,
  diceRoll: DiceRoll,
  weaponBonus: number = 0
): { damage: number; isCritical: boolean; criticalMultiplier: number } {
  let damage = baseDamage + attackerStats.str + diceRoll.total + weaponBonus;
  let isCritical = false;
  let criticalMultiplier = 1;

  // Crítico acontece quando:
  // 1. Rolou o maior número no dado E
  // 2. Passou no teste de chance crítica baseado na AGI
  if (diceRoll.isMaxRoll) {
    const critChance = attackerStats.crit; // Chance em percentual
    const critRoll = Math.random() * 100;
    
    if (critRoll <= critChance) {
      isCritical = true;
      // Multiplicador crítico: 1.5 + (crit/100) para dar mais valor ao CRIT alto
      criticalMultiplier = 1.5 + (attackerStats.crit / 100);
      damage = Math.floor(damage * criticalMultiplier);
    }
  }

  return { damage, isCritical, criticalMultiplier };
}

/**
 * Calcula tentativa de esquiva baseada em SPEED
 */
export function calculateDodgeAttempt(
  defenderStats: CombatStats,
  diceRoll: DiceRoll,
  attackerSpeed: number
): { success: boolean; dodgeValue: number } {
  // Valor base de esquiva: dado + speed do defensor
  const dodgeValue = diceRoll.total + defenderStats.speed;
  
  // Dificuldade de esquiva aumenta com a velocidade do atacante
  const dodgeDifficulty = 10 + (attackerSpeed * 0.3);
  
  const success = dodgeValue >= dodgeDifficulty;

  return { success, dodgeValue };
}

/**
 * Calcula tentativa de bloqueio/defesa baseada em RES
 */
export function calculateBlockAttempt(
  defenderStats: CombatStats,
  diceRoll: DiceRoll,
  shieldBonus: number = 0
): { success: boolean; blockValue: number; damageReduction: number } {
  // Valor base de bloqueio: dado + resistência + bônus do escudo
  const blockValue = diceRoll.total + defenderStats.res + shieldBonus;
  
  // Bloqueio sempre reduz dano, mas só é "sucesso total" se passar da dificuldade
  const blockDifficulty = 12;
  const success = blockValue >= blockDifficulty;
  
  // Redução de dano baseada na resistência (mínimo 1, máximo 80%)
  const damageReduction = Math.min(0.8, Math.max(0.1, defenderStats.res / 100));

  return { success, blockValue, damageReduction };
}

/**
 * Processa um round completo de combate
 */
export function processCombatRound(
  attacker: any,
  defender: any,
  attackAction: 'light' | 'heavy' | 'special',
  defenseAction: 'dodge' | 'block',
  attackDiceRoll: DiceRoll,
  defenseDiceRoll: DiceRoll
): CombatResult {
  const attackerStats = calculateCombatStats(attacker);
  const defenderStats = calculateCombatStats(defender);

  // Determinar dano base por tipo de ataque
  const baseDamageMap = {
    light: 8,
    heavy: 12,
    special: 20
  };
  const baseDamage = baseDamageMap[attackAction];

  // Calcular bônus de arma
  const equipmentArray = Array.isArray(attacker.equipment) ? attacker.equipment : [];
  const weapon = equipmentArray.find((e: any) => e.slot === 'WEAPON');
  const weaponBonus = weapon?.item?.stats?.bonusDamage || weapon?.item?.stats?.str || 0;

  // Calcular dano com possibilidade de crítico
  const { damage, isCritical, criticalMultiplier } = calculateAttackDamage(
    attackerStats,
    baseDamage,
    attackDiceRoll,
    weaponBonus
  );

  let actualDamage = damage;
  let dodgeSuccess = false;
  let blockSuccess = false;
  let description = '';

  if (defenseAction === 'dodge') {
    const dodgeResult = calculateDodgeAttempt(defenderStats, defenseDiceRoll, attackerStats.speed);
    dodgeSuccess = dodgeResult.success;
    
    if (dodgeSuccess) {
      actualDamage = 0;
      description = `🌪️ Esquiva perfeita! (${dodgeResult.dodgeValue} vs ${10 + (attackerStats.speed * 0.3)})`;
    } else {
      description = `❌ Esquiva falhou! (${dodgeResult.dodgeValue} vs ${10 + (attackerStats.speed * 0.3)})`;
    }
  } else if (defenseAction === 'block') {
    const defenderEquipmentArray = Array.isArray(defender.equipment) ? defender.equipment : [];
    const shield = defenderEquipmentArray.find((e: any) => e.slot === 'SHIELD');
    const shieldBonus = shield?.item?.stats?.res || shield?.item?.stats?.defense || 0;
    
    const blockResult = calculateBlockAttempt(defenderStats, defenseDiceRoll, shieldBonus);
    blockSuccess = blockResult.success;
    
    if (blockSuccess) {
      actualDamage = Math.floor(actualDamage * 0.2); // Bloqueio perfeito reduz 80% do dano
      description = `🛡️ Bloqueio perfeito! Dano reduzido para ${actualDamage} (${blockResult.blockValue} vs 12)`;
    } else {
      actualDamage = Math.floor(actualDamage * (1 - blockResult.damageReduction));
      description = `🛡️ Bloqueio parcial! Dano reduzido em ${Math.floor(blockResult.damageReduction * 100)}% = ${actualDamage}`;
    }
  }

  // Adicionar informação de crítico na descrição
  if (isCritical && actualDamage > 0) {
    description = `⭐ CRÍTICO! ${description} (×${criticalMultiplier.toFixed(1)})`;
  }

  return {
    damage,
    isCritical,
    criticalMultiplier,
    dodgeSuccess,
    blockSuccess,
    actualDamage: Math.max(0, actualDamage),
    description
  };
}

/**
 * Função auxiliar para determinar o tipo de dado baseado na ação
 */
export function getActionDice(action: string): number {
  const diceMap: { [key: string]: number } = {
    'light_attack': 6,
    'heavy_attack': 10,
    'special_attack': 20,
    'dodge': 12,
    'defend': 10
  };
  
  return diceMap[action] || 6;
}

/**
 * Gera uma descrição narrativa do combate
 */
export function generateCombatNarrative(
  attackerName: string,
  defenderName: string,
  attackAction: string,
  result: CombatResult
): string {
  const actionNames: { [key: string]: string } = {
    'light_attack': 'ataque rápido',
    'heavy_attack': 'ataque pesado',
    'special_attack': 'ataque especial'
  };

  let narrative = `${attackerName} executa um ${actionNames[attackAction] || attackAction}`;
  
  if (result.dodgeSuccess) {
    narrative += `, mas ${defenderName} esquiva habilmente!`;
  } else if (result.blockSuccess) {
    narrative += `, ${defenderName} bloqueia perfeitamente!`;
  } else if (result.actualDamage > 0) {
    narrative += result.isCritical 
      ? ` e acerta um GOLPE CRÍTICO causando ${result.actualDamage} de dano!`
      : ` causando ${result.actualDamage} de dano!`;
  } else {
    narrative += `, mas o ataque foi completamente anulado!`;
  }

  return narrative;
}
