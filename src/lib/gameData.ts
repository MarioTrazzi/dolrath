// Dados de teste para o sistema Dolrath RPG

import { Race, CharacterClass, Weapon, Armor, WeaponType, ArmorType, DiceType, Rarity } from '@/types/game'

export const RACES: Race[] = [
  {
    id: 'humano',
    name: 'Humano',
    description: 'Versáteis com crescimento superior e o Despertar do 7º Sentido',
    bonuses: { strength: 20, dexterity: 20, intelligence: 20, constitution: 20 }, // 🔥 BUFF
    abilities: ['Adaptabilidade Suprema', 'Crescimento Acelerado', 'Despertar do 7º Sentido'],
    transformationAvailable: true
  },
  {
    id: 'draconiano',
    name: 'Draconiano',
    description: 'Descendentes de dragões com capacidade de transformação',
    bonuses: { constitution: 50, strength: 30 }, // Mantido igual
    abilities: ['Transformação Dracônica', 'Resistência ao Fogo', 'Escamas Protetoras'],
    transformationAvailable: true
  },
  {
    id: 'metamorfo',
    name: 'Metamorfo',
    description: 'Capazes de se transformar em animais, excelentes em esquiva',
    bonuses: { dexterity: 50, wisdom: 30 }, // Mantido igual
    abilities: ['Transformação Animal', 'Instintos Selvagens', 'Agilidade Aprimorada'],
    transformationAvailable: true
  },
  {
    id: 'elfo',
    name: 'Elfo',
    description: 'Maestros mágicos supremos que ascendem à Forma Celestial',
    bonuses: { intelligence: 40, dexterity: 30, wisdom: 20 }, // 🔥 BUFF
    abilities: ['Maestria Arcana', 'Tiro Certeiro Élfico', 'Forma Celestial'],
    transformationAvailable: true
  }
]

export const CLASSES: CharacterClass[] = [
  {
    id: 'warrior',
    name: 'Guerreiro',
    description: 'Especialista em combate corpo a corpo com armas pesadas',
    bonuses: { strength: 40, constitution: 30 },
    availableWeapons: [WeaponType.SWORD, WeaponType.MACE, WeaponType.SPEAR],
    abilities: ['Fúria de Batalha', 'Defesa Férrea', 'Golpe Devastador']
  },
  {
    id: 'rogue',
    name: 'Ladino',
    description: 'Especialista em ataques rápidos e furtivos',
    bonuses: { dexterity: 40, intelligence: 20 },
    availableWeapons: [WeaponType.DAGGER, WeaponType.BOW],
    abilities: ['Ataque Furtivo', 'Esquiva Aprimorada', 'Precisão Mortal']
  },
  {
    id: 'mage',
    name: 'Mago',
    description: 'Manipulador de energias arcanas e magias poderosas',
    bonuses: { intelligence: 50, wisdom: 30 },
    availableWeapons: [WeaponType.STAFF],
    abilities: ['Bola de Fogo', 'Escudo Mágico', 'Cura Menor']
  },
  {
    id: 'monk',
    name: 'Monge',
    description: 'Lutador desarmado que usa o próprio corpo como arma',
    bonuses: { dexterity: 30, wisdom: 30, constitution: 20 },
    availableWeapons: [WeaponType.FISTS],
    abilities: ['Punho de Ferro', 'Meditação', 'Rajada de Socos']
  }
]

export const WEAPONS: Weapon[] = [
  {
    id: 'iron_sword',
    name: 'Espada de Ferro',
    type: WeaponType.SWORD,
    diceType: DiceType.D10,
    bonuses: { strength: 20 },
    durability: 80,
    maxDurability: 100,
    value: 150,
    rarity: Rarity.COMMON,
    description: 'Uma espada comum feita de ferro forjado'
  },
  {
    id: 'steel_dagger',
    name: 'Adaga de Aço',
    type: WeaponType.DAGGER,
    diceType: DiceType.D6,
    bonuses: { dexterity: 15 },
    durability: 90,
    maxDurability: 100,
    value: 75,
    rarity: Rarity.COMMON,
    description: 'Uma adaga leve e afiada, perfeita para ataques rápidos'
  },
  {
    id: 'oak_staff',
    name: 'Cajado de Carvalho',
    type: WeaponType.STAFF,
    diceType: DiceType.D8,
    bonuses: { intelligence: 25, wisdom: 15 },
    durability: 70,
    maxDurability: 100,
    value: 200,
    rarity: Rarity.UNCOMMON,
    description: 'Cajado entalhado em madeira de carvalho, conduz energia mágica'
  },
  {
    id: 'iron_mace',
    name: 'Maça de Ferro',
    type: WeaponType.MACE,
    diceType: DiceType.D10,
    bonuses: { strength: 25 },
    durability: 85,
    maxDurability: 100,
    value: 180,
    rarity: Rarity.COMMON,
    description: 'Maça pesada capaz de causar dano devastador'
  },
  {
    id: 'hunting_bow',
    name: 'Arco de Caça',
    type: WeaponType.BOW,
    diceType: DiceType.D8,
    bonuses: { dexterity: 20 },
    durability: 75,
    maxDurability: 100,
    value: 120,
    rarity: Rarity.COMMON,
    description: 'Arco flexível ideal para caça e combate à distância'
  },
  {
    id: 'dragon_sword',
    name: 'Espada Dracônica',
    type: WeaponType.SWORD,
    diceType: DiceType.D12,
    bonuses: { strength: 50, constitution: 20 },
    durability: 95,
    maxDurability: 100,
    value: 1500,
    rarity: Rarity.LEGENDARY,
    description: 'Espada forjada com escamas de dragão, irradia poder ancestral'
  }
]

export const ARMORS: Armor[] = [
  {
    id: 'leather_armor',
    name: 'Armadura de Couro',
    type: ArmorType.LIGHT,
    bonuses: { dexterity: 10, constitution: 15 },
    durability: 80,
    maxDurability: 100,
    value: 100,
    rarity: Rarity.COMMON,
    description: 'Armadura leve que permite boa mobilidade'
  },
  {
    id: 'chain_mail',
    name: 'Cota de Malha',
    type: ArmorType.MEDIUM,
    bonuses: { constitution: 25 },
    durability: 85,
    maxDurability: 100,
    value: 250,
    rarity: Rarity.UNCOMMON,
    description: 'Armadura de anéis metálicos entrelaçados'
  },
  {
    id: 'plate_armor',
    name: 'Armadura de Placas',
    type: ArmorType.HEAVY,
    bonuses: { constitution: 40, strength: 10 },
    durability: 90,
    maxDurability: 100,
    value: 500,
    rarity: Rarity.RARE,
    description: 'Armadura pesada de placas metálicas, máxima proteção'
  },
  {
    id: 'mage_robes',
    name: 'Vestes Arcanas',
    type: ArmorType.ROBES,
    bonuses: { intelligence: 30, wisdom: 20 },
    durability: 60,
    maxDurability: 100,
    value: 300,
    rarity: Rarity.UNCOMMON,
    description: 'Vestes imbuídas com energia mágica'
  }
]

// Funções utilitárias para buscar dados
export const getRaceById = (id: string): Race | undefined => {
  return RACES.find(race => race.id === id)
}

export const getClassById = (id: string): CharacterClass | undefined => {
  return CLASSES.find(cls => cls.id === id)
}

export const getWeaponById = (id: string): Weapon | undefined => {
  return WEAPONS.find(weapon => weapon.id === id)
}

export const getArmorById = (id: string): Armor | undefined => {
  return ARMORS.find(armor => armor.id === id)
}

export const getWeaponsByType = (type: WeaponType): Weapon[] => {
  return WEAPONS.filter(weapon => weapon.type === type)
} 