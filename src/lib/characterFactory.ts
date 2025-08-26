// Factory para criar personagens no Dolrath RPG

import { Character, Attributes, Equipment } from '@/types/game'
import { RACES, CLASSES, WEAPONS, ARMORS, getRaceById, getClassById, getWeaponById, getArmorById } from '@/lib/gameData'
import { v4 as uuidv4 } from 'uuid'

export class CharacterFactory {
  // Criar personagem base
  static createCharacter(
    name: string,
    raceId: string,
    classId: string,
    level: number = 1,
    weaponId?: string,
    armorId?: string
  ): Character {
    const race = getRaceById(raceId)
    const characterClass = getClassById(classId)
    
    if (!race) {
      throw new Error(`Raça não encontrada: ${raceId}`)
    }
    
    if (!characterClass) {
      throw new Error(`Classe não encontrada: ${classId}`)
    }
    
    // Atributos base
    const baseAttributes: Attributes = {
      strength: 100,
      dexterity: 100,
      intelligence: 100,
      constitution: 100,
      wisdom: 100,
      charisma: 100
    }
    
    // Aplicar bônus de raça
    const raceAttributes = this.applyBonuses(baseAttributes, race.bonuses)
    
    // Aplicar bônus de classe
    const finalAttributes = this.applyBonuses(raceAttributes, characterClass.bonuses)
    
    // Aplicar bônus de level
    const leveledAttributes = this.applyLevelBonuses(finalAttributes, level)
    
    // Criar equipamento
    const equipment: Equipment = {
      accessories: []
    }
    
    // Equipar arma se especificada
    if (weaponId) {
      const weapon = getWeaponById(weaponId)
      if (weapon) {
        equipment.weapon = weapon
        // Aplicar bônus da arma
        Object.entries(weapon.bonuses).forEach(([key, value]) => {
          if (value && key in leveledAttributes) {
            leveledAttributes[key as keyof Attributes] += value
          }
        })
      }
    }
    
    // Equipar armadura se especificada
    if (armorId) {
      const armor = getArmorById(armorId)
      if (armor) {
        equipment.armor = armor
        // Aplicar bônus da armadura
        Object.entries(armor.bonuses).forEach(([key, value]) => {
          if (value && key in leveledAttributes) {
            leveledAttributes[key as keyof Attributes] += value
          }
        })
      }
    }
    
    // Calcular HP baseado na constituição
    const maxHp = Math.floor(leveledAttributes.constitution / 10) + (level * 10)
    
    // Calcular MP baseado na sabedoria (se aplicável)
    const maxMp = Math.floor(leveledAttributes.wisdom / 10) + (level * 5)

    // Calcular Stamina baseado na destreza
    const maxStamina = Math.floor(leveledAttributes.dexterity / 10) + (level * 5)
    
    return {
      id: uuidv4(),
      name,
      race,
      class: characterClass,
      level,
      experience: 0,
      attributes: leveledAttributes,
      equipment,
      inventory: [],
      currency: 100,
      hp: maxHp,
      maxHp,
      mp: maxMp,
      maxMp,
      stamina: maxStamina,
      maxStamina,
      isTransformed: false
    }
  }
  
  // Aplicar bônus de atributos
  private static applyBonuses(base: Attributes, bonuses: Partial<Attributes>): Attributes {
    const result = { ...base }
    
    Object.entries(bonuses).forEach(([key, value]) => {
      if (value && key in result) {
        result[key as keyof Attributes] += value
      }
    })
    
    return result
  }
  
  // Aplicar bônus de level
  private static applyLevelBonuses(base: Attributes, level: number): Attributes {
    const bonusPerLevel = 5
    const totalBonus = (level - 1) * bonusPerLevel
    
    return {
      strength: base.strength + totalBonus,
      dexterity: base.dexterity + totalBonus,
      intelligence: base.intelligence + totalBonus,
      constitution: base.constitution + totalBonus,
      wisdom: base.wisdom + totalBonus,
      charisma: base.charisma + totalBonus
    }
  }
  
  // Criar personagem de teste para demonstração
  static createTestCharacter(type: 'warrior' | 'rogue' | 'mage' | 'monk' = 'warrior'): Character {
    switch (type) {
      case 'warrior':
        return this.createCharacter(
          'Gorak o Destemido',
          'human',
          'warrior',
          5,
          'iron_sword',
          'plate_armor'
        )
      
      case 'rogue':
        return this.createCharacter(
          'Sombra Veloz',
          'metamorph',
          'rogue',
          4,
          'steel_dagger',
          'leather_armor'
        )
      
      case 'mage':
        return this.createCharacter(
          'Arcano Sábio',
          'human',
          'mage',
          6,
          'oak_staff',
          'mage_robes'
        )
      
      case 'monk':
        return this.createCharacter(
          'Punho de Ferro',
          'human',
          'monk',
          3,
          undefined,
          'leather_armor'
        )
      
      default:
        return this.createCharacter('Teste', 'human', 'warrior', 1)
    }
  }
  
  // Criar personagem draconiano de teste
  static createDragonianWarrior(): Character {
    return this.createCharacter(
      'Drako Flamejante',
      'draconian',
      'warrior',
      8,
      'dragon_sword',
      'plate_armor'
    )
  }
  
  // Criar personagem metamorfo de teste
  static createMetamorphRogue(): Character {
    return this.createCharacter(
      'Lobo Sombrio',
      'metamorph',
      'rogue',
      6,
      'steel_dagger',
      'leather_armor'
    )
  }
  
  // Validar se arma é compatível com classe
  static isWeaponCompatible(characterClass: string, weaponId: string): boolean {
    const cls = getClassById(characterClass)
    const weapon = getWeaponById(weaponId)
    
    if (!cls || !weapon) {
      return false
    }
    
    return cls.availableWeapons.includes(weapon.type)
  }
  
  // Obter armas disponíveis para classe
  static getAvailableWeapons(characterClass: string): string[] {
    const cls = getClassById(characterClass)
    if (!cls) {
      return []
    }
    
    return WEAPONS
      .filter(weapon => cls.availableWeapons.includes(weapon.type))
      .map(weapon => weapon.id)
  }
  
  // Calcular poder de combate total
  static calculateCombatPower(character: Character): number {
    const attributes = character.attributes
    const weaponBonus = character.equipment.weapon?.bonuses.strength || 0
    const armorBonus = character.equipment.armor?.bonuses.constitution || 0
    
    return Math.floor(
      (attributes.strength + weaponBonus) * 0.3 +
      (attributes.dexterity) * 0.2 +
      (attributes.constitution + armorBonus) * 0.3 +
      (attributes.intelligence) * 0.1 +
      (attributes.wisdom) * 0.1 +
      character.level * 10
    )
  }
} 