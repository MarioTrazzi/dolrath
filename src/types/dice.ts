// Sistema de dados do Dolrath RPG

export enum AttackType {
  PUNCH = 'punch',          // Soco - d6
  KICK = 'kick',            // Chute - d6
  WEAPON = 'weapon',        // Arma equipada - d12
  SPECIAL = 'special'       // Ataque especial - d20
}

export enum DefenseType {
  DODGE = 'dodge',          // Esquivar - d12
  BLOCK = 'block',          // Bloquear - d10
  PARRY = 'parry'          // Aparar - d8
}

export interface DiceResult {
  diceType: number
  roll: number
  modifier: number
  total: number
  isCritical: boolean
  description: string
}

export interface DiceRollRequest {
  diceType: number
  modifier: number
  criticalRange?: number[]
  advantage?: boolean
  disadvantage?: boolean
}

export interface CombatDiceResult extends DiceResult {
  actionType: AttackType | DefenseType | string
  characterName: string
  targetName?: string
  damage?: number
  healing?: number
  narrative: string
  attackType?: AttackType
  defenseType?: DefenseType
}

export interface InitiativeRoll {
  characterId: string
  characterName: string
  roll: number
  modifier: number
  total: number
}

// Configurações de dados por tipo de ação
export const ACTION_DICE_CONFIG = {
  [AttackType.PUNCH]: { dice: 6, baseDamage: 1 },
  [AttackType.KICK]: { dice: 6, baseDamage: 1 },
  [AttackType.WEAPON]: { dice: 12, baseDamage: 3 },
  [AttackType.SPECIAL]: { dice: 20, baseDamage: 5 },
  [DefenseType.DODGE]: { dice: 12, baseDefense: 2 },
  [DefenseType.BLOCK]: { dice: 10, baseDefense: 3 },
  [DefenseType.PARRY]: { dice: 8, baseDefense: 4 }
}

// Consumo de stamina por ação
export const STAMINA_COSTS: Record<string, number> = {
  [AttackType.PUNCH]: 2,
  [AttackType.KICK]: 3,
  [AttackType.WEAPON]: 4,
  [AttackType.SPECIAL]: 8,
  [DefenseType.DODGE]: 3,
  [DefenseType.BLOCK]: 2,
  [DefenseType.PARRY]: 4,
  'explore': 5,
  'search': 3,
  'rest': 0,
  'mine': 6,
  'attack': 4,
  'flee': 3,
  'advance_floor': 2,
  'exit_dungeon': 0,
  'use_item': 1,
  'defend': 2
}

// Funções utilitárias para dados
export const rollDice = (sides: number): number => {
  return Math.floor(Math.random() * sides) + 1
}

export const rollWithModifier = (sides: number, modifier: number): DiceResult => {
  const roll = rollDice(sides)
  const total = roll + modifier
  const isCritical = (roll >= 19 && sides === 20) || (roll === sides && sides < 20) // Crítico no máximo do dado
  
  return {
    diceType: sides,
    roll,
    modifier,
    total,
    isCritical,
    description: `${roll} + ${modifier} = ${total} (d${sides})`
  }
}

// Nova função para rolagem de combate
export const rollCombatAction = (
  actionType: AttackType | DefenseType, 
  character: any, 
  modifier: number = 0
): CombatDiceResult => {
  const config = ACTION_DICE_CONFIG[actionType]
  const diceResult = rollWithModifier(config.dice, modifier)
  
  let damage = 0
  let defense = 0
  
  if (Object.values(AttackType).includes(actionType as AttackType)) {
    const attackConfig = config as { dice: number; baseDamage: number }
    damage = attackConfig.baseDamage + (diceResult.isCritical ? attackConfig.baseDamage : 0)
  } else {
    const defenseConfig = config as { dice: number; baseDefense: number }
    defense = defenseConfig.baseDefense + (diceResult.isCritical ? 2 : 0)
  }
  
  return {
    ...diceResult,
    actionType,
    characterName: character.name,
    damage,
    narrative: generateCombatNarrative(actionType, diceResult, character.name)
  }
}

// Função para verificar se personagem pode realizar ação (stamina)
export const canPerformAction = (character: any, actionType: string): boolean => {
  const currentStamina = character.stamina || character.baseStats?.stamina || 100
  const staminaCost = STAMINA_COSTS[actionType] || 5
  return currentStamina >= staminaCost
}

// Função para consumir stamina
export const consumeStamina = (character: any, actionType: string): number => {
  const staminaCost = STAMINA_COSTS[actionType] || 5
  const currentStamina = character.stamina || character.baseStats?.stamina || 100
  return Math.max(0, currentStamina - staminaCost)
}

// Gerar narrativa de combate
export const generateCombatNarrative = (
  actionType: AttackType | DefenseType, 
  diceResult: DiceResult, 
  characterName: string
): string => {
  const { roll, total, isCritical } = diceResult
  
  const narratives = {
    [AttackType.PUNCH]: [
      `${characterName} desfere um soco poderoso!`,
      `${characterName} ataca com os punhos!`,
      `${characterName} lança um direto certeiro!`
    ],
    [AttackType.KICK]: [
      `${characterName} desfere um chute devastador!`,
      `${characterName} ataca com uma rasteira!`,
      `${characterName} salta e desfere um chute voador!`
    ],
    [AttackType.WEAPON]: [
      `${characterName} empunha sua arma com destreza!`,
      `${characterName} ataca com precisão letal!`,
      `${characterName} desfere um golpe devastador!`
    ],
    [AttackType.SPECIAL]: [
      `${characterName} canaliza energia para um ataque especial!`,
      `${characterName} executa uma técnica secreta!`,
      `${characterName} libera todo seu poder!`
    ],
    [DefenseType.DODGE]: [
      `${characterName} se esquiva agilmente!`,
      `${characterName} desvia com graça!`,
      `${characterName} rola para o lado!`
    ],
    [DefenseType.BLOCK]: [
      `${characterName} bloqueia o ataque!`,
      `${characterName} levanta a guarda!`,
      `${characterName} protege-se firmemente!`
    ],
    [DefenseType.PARRY]: [
      `${characterName} apara o golpe habilmente!`,
      `${characterName} desvia a arma inimiga!`,
      `${characterName} contra-ataca na defesa!`
    ]
  }
  
  const baseNarrative = narratives[actionType]?.[Math.floor(Math.random() * narratives[actionType].length)] || 
                       `${characterName} executa ${actionType}!`
  
  if (isCritical) {
    return `${baseNarrative} ✨ CRÍTICO! (${roll})`
  }
  
  return `${baseNarrative} (${total})`
}

export const rollInitiative = (characters: { id: string; name: string; dexterity: number }[]): InitiativeRoll[] => {
  return characters.map(char => {
    const modifier = Math.floor(char.dexterity / 100) * 10
    const roll = rollDice(20)
    return {
      characterId: char.id,
      characterName: char.name,
      roll,
      modifier,
      total: roll + modifier
    }
  }).sort((a, b) => b.total - a.total)
}

export const calculateModifier = (attribute: number): number => {
  return Math.floor(attribute / 100) * 10
} 