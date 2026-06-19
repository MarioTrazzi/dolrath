import { ItemType } from '@prisma/client';

export interface Item {
  id: string;
  name: string;
  description?: string;
  image?: string | null;
  type: ItemType;
  level: number;
  goldPrice: number;
  stats: ItemStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemStats {
  str?: number;
  def?: number;
  hp?: number;
  mp?: number;
  stamina?: number;
  bonusDamage?: number;
  bonusSpeed?: number;
  specialEffect?: string;
}

export enum PotionType {
  HEALING = 'healing',
  REVIVAL = 'revival',
  STAMINA = 'stamina',
  MANA = 'mana',
  STRENGTH = 'strength'
}

export interface Potion {
  id: string;
  name: string;
  type: PotionType;
  effectValue: number;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  goldPrice: number;
}

export interface CharacterStatus {
  isAlive: boolean;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  deathTimestamp?: Date;
}

// Poções predefinidas
export const PREDEFINED_POTIONS: Record<string, Potion> = {
  REVIVAL_POTION: {
    id: 'revival_potion',
    name: 'Poção de Reviver',
    type: PotionType.REVIVAL,
    effectValue: 50, // Revive com 50% HP
    description: 'Uma poção mágica que pode trazer um personagem de volta à vida.',
    rarity: 'rare',
    goldPrice: 500
  },
  HEALTH_POTION_SMALL: {
    id: 'health_potion_small',
    name: 'Poção de Cura Pequena',
    type: PotionType.HEALING,
    effectValue: 25,
    description: 'Restaura 25 pontos de vida.',
    rarity: 'common',
    goldPrice: 50
  },
  STAMINA_POTION: {
    id: 'stamina_potion',
    name: 'Poção de Energia',
    type: PotionType.STAMINA,
    effectValue: 30,
    description: 'Restaura 30 pontos de energia.',
    rarity: 'common',
    goldPrice: 30
  },
  MANA_POTION: {
    id: 'mana_potion',
    name: 'Poção de Mana',
    type: PotionType.MANA,
    effectValue: 25,
    description: 'Restaura 25 pontos de mana.',
    rarity: 'common',
    goldPrice: 40
  }
}
