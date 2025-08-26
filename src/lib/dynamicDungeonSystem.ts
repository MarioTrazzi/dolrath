/**
 * Sistema Dinâmico de Dungeons
 * Escala monstros, recompensas e dificuldade baseado no nível do personagem
 */

import { DungeonMonster, Material, Rarity, RewardType } from '@/types/game'
import { DUNGEON_MONSTERS, MATERIALS } from './dungeonData'

// Configurações de escalonamento - SISTEMA APRIMORADO
export const SCALING_CONFIG = {
  // Multiplicadores por nível do personagem - MAIS AGRESSIVOS
  HP_SCALING: 1.25,          // HP dos monstros cresce 25% por nível (era 15%)
  DAMAGE_SCALING: 1.20,      // Dano cresce 20% por nível (era 12%)
  DEFENSE_SCALING: 1.18,     // Nova: Defesa cresce 18% por nível
  XP_SCALING: 1.12,          // XP recompensa cresce 12% por nível (era 8%)
  GOLD_SCALING: 1.15,        // Gold cresce 15% por nível (era 10%)
  DROP_RATE_SCALING: 1.03,   // Drop rate cresce 3% por nível (era 2%)
  
  // Multiplicadores exponenciais para níveis altos
  HIGH_LEVEL_THRESHOLD: 10,   // A partir do nível 10
  EXPONENTIAL_SCALING: 1.05,  // Multiplicador adicional exponencial
  
  // Níveis base dos monstros (serão escalados)
  BASE_MONSTER_LEVEL: 1,
  
  // Faixas de dificuldade por tipo de dungeon - MAIS DESAFIADORAS  
  DIFFICULTY_RANGES: {
    EXPLORATION: { min: 0.9, max: 1.4 },    // Exploração: -10% a +40% (era -20% a +20%)
    COMBAT: { min: 1.2, max: 1.8 },         // Combate: +20% a +80% (era +0% a +50%)
    BOSS: { min: 1.6, max: 2.5 },           // Boss: +60% a +150% (era +30% a +100%)
    RESOURCE: { min: 0.8, max: 1.2 },       // Recursos: -20% a +20% (era -40% a +0%)
  },

  // Novos: Multiplicadores especiais por tipo de dificuldade
  ELITE_MULTIPLIER: 1.8,      // Monstros elite são 80% mais fortes
  CHAMPION_MULTIPLIER: 2.2,   // Monstros champion são 120% mais fortes
  LEGENDARY_MULTIPLIER: 3.0   // Monstros lendários são 200% mais fortes
}

/**
 * Calcula os stats de um monstro baseado no nível do personagem - SISTEMA APRIMORADO
 */
export function calculateScaledMonsterStats(
  baseMonster: DungeonMonster, 
  characterLevel: number,
  dungeonDifficulty: 'easy' | 'normal' | 'hard' | 'extreme' = 'normal'
): DungeonMonster {
  // Multiplicador base por nível - MUITO MAIS AGRESSIVO
  const levelMultiplier = Math.pow(SCALING_CONFIG.HP_SCALING, characterLevel - 1)
  const damageMultiplier = Math.pow(SCALING_CONFIG.DAMAGE_SCALING, characterLevel - 1)
  const defenseMultiplier = Math.pow(SCALING_CONFIG.DEFENSE_SCALING, characterLevel - 1)
  
  // Multiplicador exponencial para níveis altos
  let exponentialBonus = 1
  if (characterLevel > SCALING_CONFIG.HIGH_LEVEL_THRESHOLD) {
    const levelsAboveThreshold = characterLevel - SCALING_CONFIG.HIGH_LEVEL_THRESHOLD
    exponentialBonus = Math.pow(SCALING_CONFIG.EXPONENTIAL_SCALING, levelsAboveThreshold)
  }
  
  // Multiplicador por dificuldade - MAIS EXTREMOS
  const difficultyMultipliers = {
    easy: 0.8,    // -20% (era 0.7)
    normal: 1.2,  // +20% (era 1.0) 
    hard: 1.6,    // +60% (era 1.3)
    extreme: 2.2  // +120% (era 1.6)
  }
  const difficultyMult = difficultyMultipliers[dungeonDifficulty]
  
  // Multiplicador final com bonus exponencial
  const finalHpMultiplier = levelMultiplier * difficultyMult * exponentialBonus
  const finalDamageMultiplier = damageMultiplier * difficultyMult * exponentialBonus
  const finalDefenseMultiplier = defenseMultiplier * difficultyMult * exponentialBonus
  
  // Escalar atributos - MUITO MAIS FORTE
  const scaledAttributes = {
    strength: Math.floor(baseMonster.attributes.strength * finalDamageMultiplier * 1.5), // +50% bonus
    dexterity: Math.floor(baseMonster.attributes.dexterity * finalDamageMultiplier * 1.3), // +30% bonus
    intelligence: Math.floor(baseMonster.attributes.intelligence * finalDamageMultiplier * 1.3), // +30% bonus
    constitution: Math.floor(baseMonster.attributes.constitution * finalHpMultiplier * 1.4), // +40% bonus
    wisdom: Math.floor(baseMonster.attributes.wisdom * Math.pow(1.08, characterLevel - 1)), // Melhorado
    charisma: Math.floor(baseMonster.attributes.charisma * Math.pow(1.06, characterLevel - 1)) // Melhorado
  }
  
  // Escalar HP - MUITO MAIS VIDA
  const baseHpWithConstitution = baseMonster.maxHp + (scaledAttributes.constitution * 3)
  const scaledMaxHp = Math.floor(baseHpWithConstitution * finalHpMultiplier)
  
  // Escalar XP recompensa proporcionalmente à dificuldade
  const scaledXpReward = Math.floor(
    baseMonster.xpReward * 
    Math.pow(SCALING_CONFIG.XP_SCALING, characterLevel - 1) * 
    difficultyMult * 
    exponentialBonus
  )
  
  // Escalar drop rates (com cap de 95%)
  const scaledDropTable = baseMonster.dropTable.map(drop => ({
    ...drop,
    dropRate: Math.min(0.95, drop.dropRate * Math.pow(SCALING_CONFIG.DROP_RATE_SCALING, characterLevel - 1)),
    minQuantity: drop.minQuantity,
    maxQuantity: Math.max(drop.maxQuantity, Math.floor(drop.maxQuantity * Math.pow(1.05, characterLevel - 1)))
  }))
  
  // Determinar título baseado na dificuldade
  let titlePrefix = ''
  if (difficultyMult >= 2.0) titlePrefix = '🔥 Elite '
  else if (difficultyMult >= 1.5) titlePrefix = '⚔️ Veterano '
  else if (difficultyMult >= 1.3) titlePrefix = '💀 Forte '
  
  return {
    ...baseMonster,
    level: characterLevel,
    attributes: scaledAttributes,
    hp: scaledMaxHp,
    maxHp: scaledMaxHp,
    xpReward: scaledXpReward,
    dropTable: scaledDropTable,
    name: `${titlePrefix}${baseMonster.name} (Nv. ${characterLevel})`
  }
}

/**
 * Seleciona monstros apropriados para o nível do personagem - SISTEMA APRIMORADO
 */
export function getScaledMonstersForLevel(
  characterLevel: number,
  dungeonType: string,
  quantity: number = 3
): DungeonMonster[] {
  // Selecionar monstros base aleatórios
  const availableMonsters = DUNGEON_MONSTERS.slice(0, 8) // Mais variedade de monstros
  const selectedMonsters: DungeonMonster[] = []
  
  for (let i = 0; i < quantity; i++) {
    const randomMonster = availableMonsters[Math.floor(Math.random() * availableMonsters.length)]
    
    // Determinar dificuldade baseada no tipo de dungeon - MAIS AGRESSIVO
    let difficulty: 'easy' | 'normal' | 'hard' | 'extreme' = 'normal'
    
    // Sistema de progressão de dificuldade baseado na posição na dungeon
    const progressionFactor = i / (quantity - 1) // 0 para primeiro, 1 para último
    
    if (dungeonType.includes('boss') || dungeonType.includes('elite')) {
      // Dungeons de boss são SEMPRE difíceis
      difficulty = progressionFactor > 0.5 ? 'extreme' : 'hard'
    } else if (dungeonType.includes('easy') || dungeonType.includes('resource')) {
      // Dungeons fáceis ficam progressivamente mais difíceis
      difficulty = progressionFactor > 0.7 ? 'normal' : 'easy'
    } else if (dungeonType.includes('hard') || dungeonType.includes('combat')) {
      // Dungeons difíceis são BRUTAIS
      difficulty = progressionFactor > 0.3 ? 'extreme' : 'hard'
    } else {
      // Dungeons normais têm progressão equilibrada mas desafiadora
      if (progressionFactor < 0.3) difficulty = 'normal'
      else if (progressionFactor < 0.7) difficulty = 'hard'
      else difficulty = 'extreme'
    }
    
    // Para níveis altos, sempre aumentar a dificuldade mínima
    if (characterLevel >= 10) {
      if (difficulty === 'easy') difficulty = 'normal'
      if (difficulty === 'normal') difficulty = 'hard'
    }
    
    if (characterLevel >= 15) {
      if (difficulty === 'normal') difficulty = 'hard'
      if (difficulty === 'hard') difficulty = 'extreme'
    }
    
    const scaledMonster = calculateScaledMonsterStats(randomMonster, characterLevel, difficulty)
    selectedMonsters.push(scaledMonster)
  }
  
  return selectedMonsters
}

/**
 * Calcula recompensas escaladas para o nível do personagem
 */
export function calculateScaledRewards(
  characterLevel: number,
  dungeonCompleted: boolean = true,
  baseGoldReward: number = 10
) {
  const levelMultiplier = Math.pow(SCALING_CONFIG.GOLD_SCALING, characterLevel - 1)
  
  // Gold base escalado
  const scaledGold = Math.floor(baseGoldReward * levelMultiplier)
  
  // XP base escalado (se não vier de monstros)
  const scaledXp = Math.floor(15 * Math.pow(SCALING_CONFIG.XP_SCALING, characterLevel - 1))
  
  // Chance de itens raros baseada no nível
  const rareItemChance = Math.min(0.3, 0.05 + (characterLevel * 0.02))
  const epicItemChance = Math.min(0.1, Math.max(0, (characterLevel - 10) * 0.01))
  
  return {
    gold: scaledGold,
    xp: scaledXp,
    rareItemChance,
    epicItemChance,
    materialBonus: Math.floor(characterLevel / 5) + 1 // +1 material extra a cada 5 níveis
  }
}

/**
 * Gera loot dinâmico baseado no nível do personagem
 */
export function generateLevelScaledLoot(characterLevel: number): Array<{
  type: 'material' | 'gold' | 'item',
  id: string,
  name: string,
  quantity: number,
  rarity: Rarity
}> {
  const loot = []
  const rewards = calculateScaledRewards(characterLevel)
  
  // Sempre dar gold
  loot.push({
    type: 'gold' as const,
    id: 'gold',
    name: 'Gold',
    quantity: rewards.gold,
    rarity: Rarity.COMMON
  })
  
  // Materiais baseados no nível
  const availableMaterials = MATERIALS.filter(material => {
    // Materiais mais raros aparecem em níveis mais altos
    if (material.rarity === Rarity.LEGENDARY) return characterLevel >= 15
    if (material.rarity === Rarity.EPIC) return characterLevel >= 10
    if (material.rarity === Rarity.RARE) return characterLevel >= 5
    return true // Common sempre disponível
  })
  
  // Adicionar 1-3 materiais
  const materialCount = Math.min(3, 1 + rewards.materialBonus)
  for (let i = 0; i < materialCount; i++) {
    const material = availableMaterials[Math.floor(Math.random() * availableMaterials.length)]
    const quantity = Math.floor(1 + Math.random() * 2) // 1-2 materiais
    
    loot.push({
      type: 'material' as const,
      id: material.id,
      name: material.name,
      quantity,
      rarity: material.rarity
    })
  }
  
  return loot
}

/**
 * Calcula a dificuldade recomendada para uma dungeon baseada no nível do personagem
 */
export function getRecommendedDungeonDifficulty(characterLevel: number, dungeonBaseLevel: number) {
  const levelDifference = characterLevel - dungeonBaseLevel
  
  if (levelDifference >= 5) return 'easy'
  if (levelDifference >= 0) return 'normal'  
  if (levelDifference >= -3) return 'hard'
  return 'extreme'
}

/**
 * Função principal para obter dados dinâmicos de uma dungeon
 */
export function getDynamicDungeonData(
  dungeonId: string,
  characterLevel: number,
  characterStats?: { str: number, agi: number, int: number, res: number }
) {
  // Monstros escalados
  const monsters = getScaledMonstersForLevel(characterLevel, dungeonId, 3)
  
  // Recompensas escaladas
  const rewards = calculateScaledRewards(characterLevel)
  
  // Loot escalado
  const loot = generateLevelScaledLoot(characterLevel)
  
  // Estatísticas da dungeon
  const estimatedDifficulty = getRecommendedDungeonDifficulty(characterLevel, 1)
  
  return {
    monsters,
    rewards,
    loot,
    estimatedDifficulty,
    scalingInfo: {
      characterLevel,
      difficultyMultiplier: estimatedDifficulty,
      recommendedStats: {
        minStr: Math.floor(5 + characterLevel * 2),
        minAgi: Math.floor(5 + characterLevel * 1.5),
        minInt: Math.floor(5 + characterLevel * 1.5),
        minRes: Math.floor(5 + characterLevel * 2)
      }
    }
  }
}
