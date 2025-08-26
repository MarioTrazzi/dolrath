export interface BaseStats {
  // Atributos de Combate
  str: number; // Força - Aumenta dano físico e HP
  agi: number; // Agilidade - Aumenta velocidade, esquiva e crítico
  int: number; // Inteligência - Aumenta MP e dano mágico
  res: number; // Resistência - Reduz dano recebido e aumenta stamina
  
  // Atributos Derivados (calculados automaticamente)
  hp: number;     // HP = base_hp + (str * 3) + (res * 2)
  mp: number;     // MP = base_mp + (int * 4) + (agi * 1)
  crit: number;   // Critical = base_crit + (agi * 0.2)
  speed: number;  // Speed = base_speed + (agi * 0.5)
}

export interface CharacterRace {
  id: string;
  name: string;
  description: string;
  baseStats: BaseStats;
  bonusStats: Partial<BaseStats>; // Bônus racial
  specialAbility: string;
  transformation?: string;
  restrictions?: string[];
  lore: string;
}

export interface FinalStats extends BaseStats {}

export interface PointDistribution {
  availablePoints: number;    // Pontos disponíveis para distribuir
  minStatValue: number;       // Valor mínimo por atributo
  maxStatValue: number;       // Valor máximo por atributo
  totalPointsPerLevel: number; // Pontos ganhos por level
}

export enum ItemType {
  WEAPON = 'WEAPON',
  ARMOR = 'ARMOR',
  HELMET = 'HELMET',
  GLOVES = 'GLOVES',
  BOOTS = 'BOOTS',
  RING = 'RING',
  NECKLACE = 'NECKLACE',
  SHIELD = 'SHIELD'
}

export interface ItemStats extends Partial<BaseStats> {
  bonusDamage?: number;
  bonusDefense?: number;
  bonusSpeed?: number;
  bonusHealth?: number;
  bonusMana?: number;
  specialEffect?: string;
}

export interface Item {
  id: string;
  name: string;
  description?: string;
  type: ItemType;
  level: number;
  stats: ItemStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterEquipment {
  id: string;
  characterId: string;
  item: Item;
  itemId: string;
  equipped: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Character {
  id: string;
  name: string;
  level: number;
  experience: number;
  userId: string;
  race: string | CharacterRace;
  class: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina: number;
  maxStamina: number;
  isTransformed: boolean;
  equipment?: CharacterEquipment[];
  createdAt: Date;
  updatedAt: Date;
  avatar?: string;
  str?: number;
  res?: number;
  agi?: number;
  int?: number;
  availablePoints?: number;
  levelInfo?: {
    level: number;
    currentXP: number;
    xpForCurrentLevel: number;
    xpForNextLevel: number;
    xpToNextLevel: number;
    xpProgress: number;
    progressPercentage: number;
  };
}
