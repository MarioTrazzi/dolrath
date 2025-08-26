// Novo Sistema de Dungeons - Dinâmico e Escalável
import { v4 as uuidv4 } from 'uuid'
import { getDynamicDungeonData, calculateScaledMonsterStats, generateLevelScaledLoot } from './dynamicDungeonSystem'
import { DUNGEON_MONSTERS } from './dungeonData'

// Tipos básicos
export interface Monster {
  id: string
  name: string
  hp: number
  maxHp: number
  attack: number
  defense: number
  level: number
  goldReward: number
  xpReward: number
}

export interface DungeonRoom {
  id: string
  name: string
  description: string
  monster?: Monster
  isCompleted: boolean
  rewards?: {
    gold: number
    xp: number
    items?: string[]
  }
}

export interface DungeonInstance {
  id: string
  dungeonId: string
  characterId: string
  characterLevel: number  // Novo: nível do personagem quando entrou
  currentRoom: number
  rooms: DungeonRoom[]
  isActive: boolean
  createdAt: Date
  scaledDifficulty: string  // Novo: dificuldade escalada
}

// Sistema principal
export class NewDungeonSystem {
  private instances = new Map<string, DungeonInstance>()

  // Criar nova instância
  createInstance(dungeonId: string, characterId: string, characterLevel: number = 1): DungeonInstance {
    const dynamicData = getDynamicDungeonData(dungeonId, characterLevel)
    
    const instance: DungeonInstance = {
      id: uuidv4(),
      dungeonId,
      characterId,
      characterLevel,
      currentRoom: 0,
      rooms: this.generateRooms(dungeonId, characterLevel, dynamicData),
      isActive: true,
      createdAt: new Date(),
      scaledDifficulty: dynamicData.estimatedDifficulty
    }

    this.instances.set(instance.id, instance)
    console.log('✅ Nova instância criada:', instance.id, `| Nível ${characterLevel} | Dificuldade: ${dynamicData.estimatedDifficulty}`)
    return instance
  }

  // Gerar salas para a dungeon baseado no nível do personagem
  private generateRooms(dungeonId: string, characterLevel: number, dynamicData: any): DungeonRoom[] {
    const rooms: DungeonRoom[] = []
    
    // Goblin Caves - salas escaláveis
    if (dungeonId === 'goblin_caves') {
      // Usar monstros escalados do sistema dinâmico
      const scaledMonsters = dynamicData.monsters
      
      rooms.push({
        id: 'room_1',
        name: 'Entrada da Caverna',
        description: `Uma caverna escura. ${this.getDifficultyDescription(dynamicData.estimatedDifficulty)}`,
        monster: this.convertToSimpleMonster(scaledMonsters[0] || this.getDefaultScaledMonster(characterLevel, 'goblin_warrior')),
        isCompleted: false
      })

      rooms.push({
        id: 'room_2', 
        name: 'Corredor Principal',
        description: `Um corredor com pegadas ameaçadoras. ${this.getDifficultyDescription(dynamicData.estimatedDifficulty)}`,
        monster: this.convertToSimpleMonster(scaledMonsters[1] || this.getDefaultScaledMonster(characterLevel, 'goblin_archer')),
        isCompleted: false
      })

      rooms.push({
        id: 'room_3',
        name: 'Câmara do Tesouro',
        description: `A sala final brilha com tesouros. ${this.getDifficultyDescription(dynamicData.estimatedDifficulty)}`,
        monster: this.convertToSimpleMonster(scaledMonsters[2] || this.getDefaultScaledMonster(characterLevel, 'goblin_chief', 'hard')),
        isCompleted: false,
        rewards: {
          gold: dynamicData.rewards.gold * 2, // Bonus na sala final
          xp: dynamicData.rewards.xp,
          items: dynamicData.loot.map((item: any) => `${item.name} x${item.quantity}`)
        }
      })
    }

    return rooms
  }

  // Métodos auxiliares para conversão - APRIMORADO
  private convertToSimpleMonster(dungeonMonster: any): Monster {
    // Usar os atributos escalados para calcular attack e defense mais realistas
    const baseAttack = Math.floor(dungeonMonster.attributes.strength / 3) + dungeonMonster.level
    const weaponBonus = Math.floor(dungeonMonster.level * 1.5) // Bonus de arma escalado
    const finalAttack = baseAttack + weaponBonus
    
    const baseDefense = Math.floor(dungeonMonster.attributes.constitution / 8) + 
                      Math.floor(dungeonMonster.attributes.dexterity / 10)
    const armorBonus = Math.floor(dungeonMonster.level * 1.2) // Bonus de armadura escalado
    const finalDefense = baseDefense + armorBonus
    
    return {
      id: dungeonMonster.id,
      name: dungeonMonster.name,
      hp: dungeonMonster.maxHp,
      maxHp: dungeonMonster.maxHp,
      attack: finalAttack,
      defense: finalDefense,
      level: dungeonMonster.level,
      goldReward: Math.floor(dungeonMonster.xpReward * 0.9), // Mais gold
      xpReward: dungeonMonster.xpReward
    }
  }

  private getDefaultScaledMonster(characterLevel: number, monsterId: string, difficulty: 'easy' | 'normal' | 'hard' = 'normal'): any {
    // Fallback caso não tenha monstro do sistema dinâmico
    const baseMonster = DUNGEON_MONSTERS.find(m => m.id.includes(monsterId.split('_')[0])) || DUNGEON_MONSTERS[0]
    return calculateScaledMonsterStats(baseMonster, characterLevel, difficulty)
  }

  private getDifficultyDescription(difficulty: string): string {
    const descriptions = {
      easy: '⭐ (Fácil)',
      normal: '⭐⭐ (Normal)', 
      hard: '⭐⭐⭐ (Difícil)',
      extreme: '⭐⭐⭐⭐ (Extremo)'
    }
    return descriptions[difficulty as keyof typeof descriptions] || '⭐⭐ (Normal)'
  }

  // Obter instância
  getInstance(instanceId: string): DungeonInstance | null {
    return this.instances.get(instanceId) || null
  }

  // Obter instância ativa do personagem  
  getActiveInstance(characterId: string): DungeonInstance | null {
    let result: DungeonInstance | null = null
    this.instances.forEach((instance) => {
      if (instance.characterId === characterId && instance.isActive && !result) {
        result = instance
      }
    })
    return result
  }

  // Executar ação de combate - SISTEMA APRIMORADO
  executeCombat(instanceId: string, action: 'attack' | 'defend' | 'flee'): any {
    const instance = this.getInstance(instanceId)
    if (!instance) {
      throw new Error('Instância não encontrada')
    }

    const currentRoom = instance.rooms[instance.currentRoom]
    if (!currentRoom.monster || currentRoom.isCompleted) {
      return { error: 'Nenhum monstro para combater' }
    }

    const monster = currentRoom.monster
    let result: any = {}

    if (action === 'attack') {
      // Dano do jogador no monstro - MAIS REALISTA
      const baseDamage = Math.floor(Math.random() * 8) + 3 // 3-10 base
      const levelBonus = Math.floor(instance.characterLevel * 1.5) // Bonus por nível
      const playerDamage = Math.max(1, baseDamage + levelBonus - monster.defense)
      
      monster.hp = Math.max(0, monster.hp - playerDamage)
      
      result.playerDamage = playerDamage
      result.monsterHp = monster.hp
      result.monsterMaxHp = monster.maxHp

      // Se monstro morreu
      if (monster.hp <= 0) {
        currentRoom.isCompleted = true
        result.victory = true
        result.rewards = {
          gold: monster.goldReward,
          xp: monster.xpReward
        }
        
        console.log(`💀 ${monster.name} derrotado! +${monster.xpReward} XP, +${monster.goldReward} Gold`)
        
        // Avançar para próxima sala
        if (instance.currentRoom < instance.rooms.length - 1) {
          instance.currentRoom++
          result.nextRoom = instance.rooms[instance.currentRoom]
          console.log(`🚪 Avançando para: ${result.nextRoom.name}`)
        } else {
          // Dungeon completa
          instance.isActive = false
          result.dungeonComplete = true
          if (currentRoom.rewards) {
            result.finalRewards = currentRoom.rewards
          }
          console.log(`🏆 Dungeon "${instance.dungeonId}" completada!`)
        }
      } else {
        // Monstro ataca de volta - MUITO MAIS PERIGOSO
        const monsterBaseDamage = Math.floor(Math.random() * 6) + monster.attack
        const criticalChance = Math.min(0.15 + (monster.level * 0.01), 0.35) // 15-35% crit
        
        let monsterDamage = monsterBaseDamage
        let isCritical = false
        
        if (Math.random() < criticalChance) {
          monsterDamage = Math.floor(monsterDamage * 1.8) // 80% mais dano no crítico
          isCritical = true
        }
        
        result.monsterDamage = monsterDamage
        result.isCritical = isCritical
        result.playerHp = Math.max(0, 100 - monsterDamage) // Simplificado - seria melhor pegar do banco
        
        if (isCritical) {
          console.log(`💥 ${monster.name} acertou um CRÍTICO! ${monsterDamage} de dano!`)
        } else {
          console.log(`⚔️ ${monster.name} atacou por ${monsterDamage} de dano`)
        }
      }
    } else if (action === 'defend') {
      // Ação de defesa - reduz dano do próximo ataque
      const monsterBaseDamage = Math.floor(Math.random() * 4) + Math.floor(monster.attack * 0.6)
      const reducedDamage = Math.max(1, Math.floor(monsterBaseDamage * 0.5)) // 50% redução
      
      result.defended = true
      result.monsterDamage = reducedDamage
      result.damageReduced = monsterBaseDamage - reducedDamage
      result.playerHp = Math.max(0, 100 - reducedDamage)
      
      console.log(`🛡️ Defendeu! Dano reduzido de ${monsterBaseDamage} para ${reducedDamage}`)
    } else if (action === 'flee') {
      // Chance de fuga baseada no nível vs nível do monstro
      const fleeChance = Math.max(0.3, 0.7 - ((monster.level - instance.characterLevel) * 0.1))
      const successful = Math.random() < fleeChance
      
      if (successful) {
        instance.isActive = false
        result.fled = true
        console.log(`🏃 Fugiu com sucesso da dungeon!`)
      } else {
        // Falha na fuga, monstro ataca
        const monsterDamage = Math.floor(Math.random() * 8) + monster.attack
        result.fleeFailed = true
        result.monsterDamage = monsterDamage
        result.playerHp = Math.max(0, 100 - monsterDamage)
        console.log(`❌ Falha na fuga! ${monster.name} atacou por ${monsterDamage} de dano!`)
      }
    }

    return result
  }

  // Listar instâncias ativas (debug)
  listActiveInstances(): string[] {
    const active: string[] = []
    this.instances.forEach((instance, id) => {
      if (instance.isActive) {
        active.push(`${id} - Character: ${instance.characterId}`)
      }
    })
    return active
  }

  // Limpar instâncias de um personagem  
  clearCharacterInstances(characterId: string): number {
    let cleared = 0
    const toDelete: string[] = []
    this.instances.forEach((instance, id) => {
      if (instance.characterId === characterId) {
        toDelete.push(id)
      }
    })
    toDelete.forEach(id => {
      this.instances.delete(id)
      cleared++
    })
    return cleared
  }
}

// Singleton
export const newDungeonSystem = new NewDungeonSystem()
