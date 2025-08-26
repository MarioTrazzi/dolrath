// Tipos básicos do jogo Dolrath RPG

export interface Character {
  id: string
  name: string
  race: Race | string
  class: CharacterClass | string
  level: number
  experience: number
  nextLevelExperience?: number
  currentLevelXP?: number
  xpToNextLevel?: number
  xpProgress?: number
  progressPercentage?: number
  availablePoints?: number
  attributes: Attributes
  baseStats: {
    hp: number
    maxHp: number
    mp: number
    maxMp: number
    stamina: number
    maxStamina: number
    str: number
    def: number
  }
  // Campos diretos de vida/morte/stamina
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  isAlive: boolean
  deathTimestamp?: Date
  equipment: CharacterEquipment[]
  inventory: CharacterInventory[]
  gold: number
  inventorySlots: number
  avatar?: string
  createdAt: Date
  updatedAt: Date
}

export enum EquipmentSlotType {
  HELMET = 'HELMET',
  NECKLACE = 'NECKLACE',
  RING_1 = 'RING_1',
  RING_2 = 'RING_2',
  ARMOR = 'ARMOR',
  WEAPON = 'WEAPON',
  SHIELD = 'SHIELD',
  GLOVES = 'GLOVES',
  BOOTS = 'BOOTS'
}

export interface CharacterEquipment {
  id: string
  characterId: string
  item: Item
  itemId: string
  slot: EquipmentSlotType
  createdAt: Date
  updatedAt: Date
}

export interface CharacterInventory {
  id: string
  characterId: string
  item: Item
  itemId: string
  quantity: number
  createdAt: Date
  updatedAt: Date
}

import { Item } from './item';

export interface EquipmentItem {
  id: string
  name: string
  type: string
  level: number
  stats?: {
    str?: number
    def?: number
    hp?: number
    mp?: number
  }
}

export interface Attributes {
  strength: number     // Força - bônus em ataques físicos
  dexterity: number    // Destreza - bônus em esquiva
  intelligence: number // Inteligência - bônus em magias
  constitution: number // Constituição - bônus em HP
  wisdom: number       // Sabedoria - bônus em MP
  charisma: number     // Carisma - bônus em liderança
}

export interface Race {
  id: string
  name: string
  description: string
  bonuses: Partial<Attributes>
  abilities: string[]
  transformationAvailable: boolean
}

export interface CharacterClass {
  id: string
  name: string
  description: string
  bonuses: Partial<Attributes>
  availableWeapons: WeaponType[]
  abilities: string[]
}

export interface Equipment {
  weapon?: Weapon
  armor?: Armor
  accessories: Accessory[]
}

export interface Weapon {
  id: string
  name: string
  type: WeaponType
  diceType: DiceType
  bonuses: Partial<Attributes>
  durability: number
  maxDurability: number
  value: number
  rarity: Rarity
  description: string
}

export interface Armor {
  id: string
  name: string
  type: ArmorType
  bonuses: Partial<Attributes>
  durability: number
  maxDurability: number
  value: number
  rarity: Rarity
  description: string
}

export interface Accessory {
  id: string
  name: string
  type: AccessoryType
  bonuses: Partial<Attributes>
  value: number
  rarity: Rarity
  description: string
}

export interface Combat {
  id: string
  participants: Character[]
  currentTurn: number
  turnOrder: string[]
  actions: CombatAction[]
  status: CombatStatus
  winner?: string
}

export interface CombatAction {
  id: string
  characterId: string
  actionType: ActionType
  target?: string
  diceRoll?: DiceRoll
  damage?: number
  healing?: number
  description: string
  timestamp: Date
}

export interface DiceRoll {
  diceType: DiceType
  baseRoll: number
  modifier: number
  total: number
  isCritical: boolean
}

export interface TransformationData {
  type: TransformationType
  duration: number
  attributeModifiers: Partial<Attributes>
  availableActions: string[]
}

// Enums

export enum DiceType {
  D4 = 4,
  D6 = 6,
  D8 = 8,
  D10 = 10,
  D12 = 12,
  D20 = 20
}

export enum WeaponType {
  SWORD = 'sword',
  DAGGER = 'dagger',
  STAFF = 'staff',
  BOW = 'bow',
  MACE = 'mace',
  SPEAR = 'spear',
  FISTS = 'fists'
}

export enum ArmorType {
  LIGHT = 'light',
  MEDIUM = 'medium',
  HEAVY = 'heavy',
  ROBES = 'robes'
}

export enum AccessoryType {
  RING = 'ring',
  AMULET = 'amulet',
  BRACELET = 'bracelet',
  BOOTS = 'boots'
}

export enum ActionType {
  ATTACK = 'attack',
  DEFEND = 'defend',
  DODGE = 'dodge',
  COUNTER_ATTACK = 'counter_attack',
  MAGIC = 'magic',
  ITEM = 'item',
  TRANSFORM = 'transform'
}

export enum CombatStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished'
}

export enum TransformationType {
  DRAGON = 'dragon',
  WOLF = 'wolf',
  BEAR = 'bear',
  EAGLE = 'eagle',
  SNAKE = 'snake'
}

export enum Rarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary'
}

// === DUNGEON SYSTEM TYPES ===

export interface Dungeon {
  id: string
  name: string
  type: DungeonType
  rank: DungeonRank
  minLevel: number
  maxLevel: number
  description: string
  biome: BiomeType
  floors: number
  cooldown: number // minutes
  isActive: boolean
  imageUrl?: string
  rewards: DungeonReward[]
}

export interface DungeonInstance {
  id: string
  dungeonId: string
  characterId: string
  currentFloor: number
  status: DungeonStatus
  startTime: Date
  endTime?: Date
  log: DungeonEvent[]
  inventory: DungeonLoot[]
  stats: DungeonStats
}

export interface DungeonEvent {
  id: string
  type: DungeonEventType
  floor: number
  timestamp: Date
  description: string
  playerAction?: string
  result?: DungeonEventResult
  rewards?: DungeonLoot[]
  monster?: DungeonMonster // Para eventos de combate
}

export interface DungeonEventResult {
  success: boolean
  diceRoll?: DiceRoll
  damage?: number
  healing?: number
  materialsFound?: DungeonLoot[]
  xpGained?: number
}

export interface DungeonReward {
  id: string
  dungeonId: string
  itemType: RewardType
  itemName: string
  rarity: Rarity
  dropRate: number // 0.0 to 1.0
  minFloor: number
  maxFloor?: number
  quantity: number
}

export interface DungeonLoot {
  id: string
  type: RewardType
  name: string
  rarity: Rarity
  quantity: number
  value: number
  description: string
}

export interface DungeonStats {
  monstersKilled: number
  materialsCollected: number
  floorstransversal: number
  totalXpGained: number
  totalDamageDealt: number
  totalDamageTaken: number
  timeSpent: number // minutes
}

export interface Material {
  id: string
  name: string
  description: string
  rarity: Rarity
  type: MaterialType
  useFor: MaterialUse[]
  tokenValue: number
  imageUrl?: string
}

export interface CharacterMaterial {
  id: string
  characterId: string
  materialId: string
  quantity: number
  lastUpdated: Date
}

export interface DungeonMonster {
  id: string
  name: string
  level: number
  attributes: Attributes
  hp: number
  maxHp: number
  abilities: string[]
  dropTable: MonsterDrop[]
  xpReward: number
  description: string
}

export interface MonsterDrop {
  itemType: RewardType
  itemName: string
  rarity: Rarity
  dropRate: number
  minQuantity: number
  maxQuantity: number
}

// === DUNGEON ENUMS ===

export enum DungeonType {
  COMBAT = 'combat',
  MINING = 'mining',
  MIXED = 'mixed'
}

export enum DungeonRank {
  E = 'E',
  D = 'D',
  C = 'C',
  B = 'B',
  A = 'A',
  S = 'S'
}

export enum DungeonStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABANDONED = 'abandoned'
}

export enum BiomeType {
  FOREST = 'forest',
  CAVE = 'cave',
  DESERT = 'desert',
  VOLCANO = 'volcano',
  ICE = 'ice',
  SWAMP = 'swamp',
  RUINS = 'ruins',
  CRYSTAL = 'crystal'
}

export enum DungeonEventType {
  EXPLORATION = 'exploration',
  COMBAT = 'combat',
  MINING = 'mining',
  TRAP = 'trap',
  MERCHANT = 'merchant',
  TREASURE = 'treasure',
  BOSS = 'boss',
  FLOOR_COMPLETE = 'floor_complete',
  DUNGEON_COMPLETE = 'dungeon_complete'
}

export enum RewardType {
  MATERIAL = 'material',
  EQUIPMENT = 'equipment',
  TOKEN = 'token',
  EXPERIENCE = 'experience',
  ITEM = 'item'
}

export enum MaterialType {
  METAL = 'metal',
  GEM = 'gem',
  ORGANIC = 'organic',
  MAGICAL = 'magical',
  RARE_EARTH = 'rare_earth',
  ESSENCE = 'essence'
}

export enum MaterialUse {
  WEAPON_REPAIR = 'weapon_repair',
  ARMOR_REPAIR = 'armor_repair',
  WEAPON_CRAFT = 'weapon_craft',
  ARMOR_CRAFT = 'armor_craft',
  ENHANCEMENT = 'enhancement',
  TRADING = 'trading',
  ALCHEMY = 'alchemy'
}

// === DUNGEON ACTION TYPES ===

export enum DungeonAction {
  EXPLORE = 'explore',
  MINE = 'mine',
  ATTACK = 'attack',
  DEFEND = 'defend',
  USE_ITEM = 'use_item',
  FLEE = 'flee',
  SEARCH = 'search',
  REST = 'rest',
  ADVANCE_FLOOR = 'advance_floor',
  EXIT_DUNGEON = 'exit_dungeon'
}

export interface DungeonActionRequest {
  instanceId: string
  action: DungeonAction
  target?: string
  data?: any
}

export interface DungeonActionResponse {
  success: boolean
  event: DungeonEvent
  updatedInstance: DungeonInstance
  narrative: string
  availableActions: DungeonAction[]
}

// === AI DUNGEON MASTER TYPES ===

export interface AIPromptContext {
  dungeon: Dungeon
  instance: DungeonInstance
  character: Character
  currentFloor: number
  lastAction?: string
  eventHistory: DungeonEvent[]
}

export interface AIResponse {
  narrative: string
  eventType: DungeonEventType
  result?: DungeonEventResult
  availableActions: DungeonAction[]
  floorAdvance?: boolean
} 