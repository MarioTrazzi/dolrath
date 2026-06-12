'use client'

import React, { useState } from 'react'
import ClassicRPGCombatDialog from './CombatDialog'
import ExplorationDialog from './ExplorationDialog'
import BossDialog from './BossDialog'

interface Monster {
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

interface DungeonRoom {
  id: string
  name: string
  description: string
  monster?: Monster
  isCompleted: boolean
}

interface CharacterData {
  id: string
  name: string
  race?: string
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  stamina: number
  maxStamina: number
  attack: number
  defense: number
  equipment: any[]
}

interface SimpleDungeonProps {
  characterId: string
  character: CharacterData
  onCharacterUpdate?: (updatedCharacter: Partial<CharacterData>) => void
}

export default function SimpleDungeon({ characterId, character, onCharacterUpdate }: SimpleDungeonProps) {
  const [instance, setInstance] = useState<any>(null)
  const [currentRoom, setCurrentRoom] = useState<DungeonRoom | null>(null)
  const [combatLog, setCombatLog] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // Estados para o dialog de combate aprimorado
  const [showEnhancedCombat, setShowEnhancedCombat] = useState(false)
  const [currentMonster, setCurrentMonster] = useState<Monster | null>(null)
  const [staminaError, setStaminaError] = useState<string | null>(null)
  
  // Estados para o sistema de exploração
  const [showExploration, setShowExploration] = useState(false)
  
  // Estados para o sistema de níveis da dungeon
  const [currentFloor, setCurrentFloor] = useState(1)
  const [showBossDialog, setShowBossDialog] = useState(false)
  
  // Custos de stamina por ação
  const STAMINA_COSTS = {
    COMBAT: 15,    // Combate custa mais
    EXPLORE: 8,    // Exploração custa médio
    NEXT_FLOOR: 7  // Avançar de andar custa menos
  }
  
  // Estado para persistir HP durante a dungeon
  const [dungeonHp, setDungeonHp] = useState<number | null>(null)
  const [dungeonMp, setDungeonMp] = useState<number | null>(null)

  // Função para gerar monstros baseados no andar atual
  const generateMonsterForFloor = (floor: number): Monster => {
    const baseLevel = character.level
    const floorMultiplier = 1 + (floor - 1) * 0.3 // 30% mais forte a cada andar
    
    const monsters = [
      { name: "Goblin", baseHp: 40, baseAttack: 8, baseDefense: 3 },
      { name: "Orc", baseHp: 60, baseAttack: 12, baseDefense: 5 },
      { name: "Skeleton", baseHp: 50, baseAttack: 10, baseDefense: 4 },
      { name: "Dark Wolf", baseHp: 70, baseAttack: 14, baseDefense: 6 },
      { name: "Troll", baseHp: 90, baseAttack: 16, baseDefense: 8 }
    ]
    
    const randomMonster = monsters[Math.floor(Math.random() * monsters.length)]
    
    return {
      id: `monster-${Date.now()}`,
      name: `${randomMonster.name} (Andar ${floor})`,
      hp: Math.floor(randomMonster.baseHp * floorMultiplier),
      maxHp: Math.floor(randomMonster.baseHp * floorMultiplier),
      attack: Math.floor(randomMonster.baseAttack * floorMultiplier),
      defense: Math.floor(randomMonster.baseDefense * floorMultiplier),
      level: baseLevel + floor - 1,
      goldReward: Math.floor((50 + Math.random() * 100) * floorMultiplier),
      xpReward: Math.floor((30 + Math.random() * 50) * floorMultiplier)
    }
  }

  // Função para gerar boss final
  const generateBoss = (): Monster => {
    const baseLevel = character.level
    const bossMultiplier = 2.5 // Boss é 250% mais forte que um monstro normal
    
    const bosses = [
      { name: "Dragon Ancião", baseHp: 200, baseAttack: 25, baseDefense: 15 },
      { name: "Lich Supremo", baseHp: 180, baseAttack: 30, baseDefense: 12 },
      { name: "Demônio das Trevas", baseHp: 220, baseAttack: 28, baseDefense: 18 },
      { name: "Rei Goblin", baseHp: 160, baseAttack: 22, baseDefense: 10 }
    ]
    
    const randomBoss = bosses[Math.floor(Math.random() * bosses.length)]
    
    return {
      id: `boss-${Date.now()}`,
      name: `👑 ${randomBoss.name}`,
      hp: Math.floor(randomBoss.baseHp * bossMultiplier),
      maxHp: Math.floor(randomBoss.baseHp * bossMultiplier),
      attack: Math.floor(randomBoss.baseAttack * bossMultiplier),
      defense: Math.floor(randomBoss.baseDefense * bossMultiplier),
      level: baseLevel + 3,
      goldReward: Math.floor(500 + Math.random() * 1000),
      xpReward: Math.floor(200 + Math.random() * 300)
    }
  }

  // Função para consumir stamina
  const consumeStamina = async (cost: number, actionName: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/character/${characterId}/update-stamina`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staminaCost: cost })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        setStaminaError(`❌ Erro ao consumir stamina: ${errorData.error || 'Erro desconhecido'}`)
        return false
      }

      // Buscar stamina atualizada do servidor
      const result = await response.json()
      
      // Atualizar stamina local com o valor do servidor
      if (result.character) {
        character.stamina = result.character.stamina
        // Notificar o componente pai sobre a mudança
        if (onCharacterUpdate) {
          onCharacterUpdate({ stamina: result.character.stamina })
        }
      }
      
      setStaminaError(null)
      setCombatLog(prev => [...prev, `⚡ ${actionName}: -${cost} stamina (${result.character?.stamina || character.stamina}/${character.maxStamina})`])
      return true
    } catch (error) {
      setStaminaError('❌ Erro ao consumir stamina.')
      return false
    }
  }

  // Processar equipamentos do personagem para o formato esperado
  const processedCharacter = {
    ...character,
    hp: dungeonHp !== null ? dungeonHp : character.hp,
    mp: dungeonMp !== null ? dungeonMp : (character as any).mp || 50,
    gold: 0,
    equipment: {
      weapon: character.equipment?.find(e => e.slot === 'WEAPON')?.item ? {
        id: character.equipment.find(e => e.slot === 'WEAPON')!.item.id,
        name: character.equipment.find(e => e.slot === 'WEAPON')!.item.name,
        type: character.equipment.find(e => e.slot === 'WEAPON')!.item.type,
        durability: 90,
        maxDurability: 100,
        stats: character.equipment.find(e => e.slot === 'WEAPON')!.item.stats
      } : undefined,
      armor: character.equipment?.find(e => e.slot === 'ARMOR')?.item ? {
        id: character.equipment.find(e => e.slot === 'ARMOR')!.item.id,
        name: character.equipment.find(e => e.slot === 'ARMOR')!.item.name,
        type: character.equipment.find(e => e.slot === 'ARMOR')!.item.type,
        durability: 90,
        maxDurability: 100,
        stats: character.equipment.find(e => e.slot === 'ARMOR')!.item.stats
      } : undefined,
      shield: character.equipment?.find(e => e.slot === 'SHIELD')?.item ? {
        id: character.equipment.find(e => e.slot === 'SHIELD')!.item.id,
        name: character.equipment.find(e => e.slot === 'SHIELD')!.item.name,
        type: character.equipment.find(e => e.slot === 'SHIELD')!.item.type,
        durability: 90,
        maxDurability: 100,
        stats: character.equipment.find(e => e.slot === 'SHIELD')!.item.stats
      } : undefined
    }
  }

  const enterDungeon = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/dungeons/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dungeonId: 'goblin_caves',
          characterId: characterId
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setInstance(result.instance)
        setCurrentRoom(result.currentRoom)
        setDungeonHp(character.hp)
        setDungeonMp((character as any).mp || 50)
        setCombatLog([`✅ Entrou na dungeon: ${result.currentRoom.name} - Andar ${currentFloor}`])
      } else {
        const errorMsg = result.message || `Erro ao entrar na dungeon`
        setStaminaError(errorMsg)
        setCombatLog([`❌ ${result.error}`, errorMsg])
      }
    } catch (error) {
      console.error('Erro ao entrar na dungeon:', error)
      setCombatLog(['❌ Erro ao conectar com o servidor'])
    } finally {
      setIsLoading(false)
    }
  }

  const attack = async () => {
    // Gerar monstro baseado no andar atual e abrir dialog diretamente
    const monster = generateMonsterForFloor(currentFloor)
    setCurrentMonster(monster)
    setShowEnhancedCombat(true)
  }

  const explore = async () => {
    // Não consumir stamina aqui - será consumido no dialog
    setShowExploration(true)
  }

  const nextFloor = async () => {
    const canAdvance = await consumeStamina(STAMINA_COSTS.NEXT_FLOOR, 'Próximo Andar')
    if (!canAdvance) return

    if (currentFloor < 3) {
      setCurrentFloor(prev => prev + 1)
      setCombatLog(prev => [...prev, `🏰 Avançou para o Andar ${currentFloor + 1}! Monstros mais fortes aguardam...`])
    } else {
      setCombatLog(prev => [...prev, `⚠️ Você já está no último andar da dungeon!`])
    }
  }

  const finishDungeon = async () => {
    if (currentFloor === 3) {
      // 30% de chance de encontrar boss no último andar
      const bossChance = Math.random()
      if (bossChance <= 0.3) {
        setCombatLog(prev => [...prev, `👑 Um boss poderoso apareceu!`])
        const boss = generateBoss()
        setCurrentMonster(boss)
        setShowBossDialog(true)
        return
      }
    }
    
    // Sair normalmente da dungeon
    exitDungeon()
  }

  const handleBossFight = () => {
    setShowBossDialog(false)
    setShowEnhancedCombat(true)
  }

  const handleBossDecline = () => {
    setShowBossDialog(false)
    setCurrentMonster(null)
    exitDungeon()
  }

  const exitDungeon = () => {
    setInstance(null)
    setCurrentRoom(null)
    setCurrentFloor(1)
    setDungeonHp(null)
    setDungeonMp(null)
    setCombatLog(['🏃‍♂️ Você saiu da dungeon com segurança!'])
  }

  // Função para lidar com o fim do combate
  const handleCombatEnd = async (victory: boolean, rewards?: any, finalHp?: number, finalMp?: number) => {
    setShowEnhancedCombat(false)
    
    // Se foi uma batalha de boss, processar recompensas especiais
    const wasBossFight = currentMonster?.name.includes('👑')
    
    if (finalHp !== undefined) {
      setDungeonHp(finalHp)
    }
    if (finalMp !== undefined) {
      setDungeonMp(finalMp)
    }

    if (victory) {
      setCombatLog(prev => [...prev, `🎉 Você derrotou ${wasBossFight ? 'o BOSS' : 'o monstro'}!`])
      
      if (wasBossFight) {
        // Processar recompensas especiais do boss
        try {
          const response = await fetch('/api/dungeons/boss-rewards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId: characterId,
              bossLevel: currentMonster?.level || character.level,
              victory: true
            })
          })
          
          const bossRewards = await response.json()
          if (bossRewards.success) {
            setCombatLog(prev => [...prev, `👑 RECOMPENSAS DE BOSS: ${bossRewards.message}`])
          }
        } catch (error) {
          console.error('Erro ao processar recompensas do boss:', error)
        }
      } else if (rewards) {
        setCombatLog(prev => [...prev, `💰 +${rewards.gold} Gold, +${rewards.xp} XP`])
      }
    } else {
      setCombatLog(prev => [...prev, `💀 Você foi derrotado!`, `🏃 Saindo da dungeon...`])
      setTimeout(() => {
        exitDungeon()
      }, 2000)
    }
    
    setCurrentMonster(null)
  }

  // Função para lidar com resultados da exploração
  const handleExplorationResult = async (result: any) => {
    setCombatLog(prev => [...prev, `🔍 Exploração: ${result.narrative}`])
    
    switch (result.type) {
      case 'monster':
        setCombatLog(prev => [...prev, `⚔️ Iniciando combate contra ${result.monster.name}!`])
        
        const monster: Monster = {
          id: `exploration-${Date.now()}`,
          name: result.monster.name,
          hp: result.monster.hp,
          maxHp: result.monster.hp,
          attack: Math.max(5, character.level * 2 + Math.floor(Math.random() * 5)),
          defense: Math.max(2, character.level + Math.floor(Math.random() * 3)),
          level: result.monster.level,
          goldReward: Math.floor((5 + Math.random() * 10) * character.level),
          xpReward: Math.floor((10 + Math.random() * 15) * character.level)
        }
        
        setCurrentMonster(monster)
        setShowEnhancedCombat(true)
        break
        
      case 'item':
        setCombatLog(prev => [...prev, `📦 Item encontrado: ${result.item.name}`])
        
        try {
          const response = await fetch('/api/inventory/add-exploration-reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId: characterId,
              itemName: result.item.name,
              itemDescription: result.item.description,
              rarity: result.rarity,
              gold: 0
            })
          })
          
          if (response.ok) {
            setCombatLog(prev => [...prev, `📦 ${result.item.name} adicionado ao inventário!`])
          }
        } catch (error) {
          console.error('Erro ao adicionar item:', error)
        }
        break
        
      case 'gold':
        setCombatLog(prev => [...prev, `💰 Ouro encontrado: ${result.amount} gold!`])
        
        try {
          const response = await fetch('/api/inventory/add-exploration-reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId: characterId,
              itemName: null,
              itemDescription: null,
              rarity: null,
              gold: result.amount
            })
          })
          
          if (response.ok) {
            setCombatLog(prev => [...prev, `💰 ${result.amount} gold adicionado à sua carteira!`])
          }
        } catch (error) {
          console.error('Erro ao adicionar gold:', error)
        }
        break
        
      case 'nothing':
        setCombatLog(prev => [...prev, `🚫 Nada de interessante foi encontrado.`])
        break
    }
  }

  return (
    <div className="space-y-6">
      {/* Status da Dungeon */}
      {instance && (
        <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
          <h3 className="font-bold text-blue-800 dark:text-blue-200">
            🏰 Dungeon Ativa - Andar {currentFloor}/3
          </h3>
          <p className="text-blue-600 dark:text-blue-300 text-sm">
            HP: {dungeonHp || character.hp}/{character.maxHp} | 
            MP: {dungeonMp || character.mp}/{character.maxMp}
          </p>
        </div>
      )}

      {/* Erro de Stamina */}
      {staminaError && (
        <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded">
          {staminaError}
        </div>
      )}

      {/* Entrada da Dungeon */}
      {!instance && (
        <div className="text-center space-y-4">
          <h3 className="text-xl font-bold">🗡️ Cavernas dos Goblins (3 Andares)</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Uma dungeon com 3 andares progressivamente mais difíceis. No último andar, há 30% de chance de enfrentar um boss ao sair!
          </p>
          <button
            onClick={enterDungeon}
            disabled={isLoading}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-bold"
          >
            {isLoading ? 'Entrando...' : '🚪 Entrar na Dungeon'}
          </button>
        </div>
      )}

      {/* Ações da Dungeon */}
      {instance && (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={explore}
            className="p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            disabled={isLoading}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">🔍</div>
              <div className="font-bold">Explorar</div>
              <div className="text-sm opacity-80">Abrir menu de exploração</div>
            </div>
          </button>

          <button
            onClick={attack}
            className="p-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            disabled={isLoading}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">⚔️</div>
              <div className="font-bold">Combate Clássico RPG</div>
              <div className="text-sm opacity-80">Stamina por ação dentro do combate</div>
            </div>
          </button>

          <button
            onClick={nextFloor}
            className="p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={isLoading || currentFloor >= 3}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">🏰</div>
              <div className="font-bold">Próximo Andar</div>
              <div className="text-sm opacity-80">⚡ {STAMINA_COSTS.NEXT_FLOOR} stamina</div>
            </div>
          </button>

          <button
            onClick={finishDungeon}
            className="p-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            disabled={isLoading}
          >
            <div className="text-center">
              <div className="text-2xl mb-2">🚪</div>
              <div className="font-bold">Finalizar</div>
              <div className="text-sm opacity-80">
                {currentFloor === 3 ? '👑 30% chance de boss!' : 'Gratuito'}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Log de Combate */}
      <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg max-h-64 overflow-y-auto">
        <h4 className="font-bold mb-2">📜 Log de Eventos</h4>
        {combatLog.map((log, index) => (
          <div key={index} className="text-sm py-1">
            {log}
          </div>
        ))}
      </div>
      
      {/* Dialog de Combate Clássico */}
      {showEnhancedCombat && currentMonster && (
        <ClassicRPGCombatDialog
          isOpen={showEnhancedCombat}
          monster={currentMonster}
          character={processedCharacter}
          onClose={() => {
            setShowEnhancedCombat(false)
            setCurrentMonster(null)
          }}
          onCombatEnd={handleCombatEnd}
          characterId={characterId}
          onStaminaUpdate={(newStamina) => {
            character.stamina = newStamina
            if (onCharacterUpdate) {
              onCharacterUpdate({ stamina: newStamina })
            }
          }}
        />
      )}

      {/* Dialog de Exploração */}
      {showExploration && (
        <ExplorationDialog
          isOpen={showExploration}
          onClose={() => setShowExploration(false)}
          onResult={handleExplorationResult}
          characterLevel={character.level}
          currentFloor={currentFloor}
          characterId={characterId}
          dungeonId={instance?.dungeonId}
          characterRace={character.race}
          onStaminaUpdate={(newStamina) => {
            character.stamina = newStamina
            if (onCharacterUpdate) {
              onCharacterUpdate({ stamina: newStamina })
            }
          }}
        />
      )}

      {/* Dialog de Boss */}
      {showBossDialog && currentMonster && (
        <BossDialog
          isOpen={showBossDialog}
          onClose={() => setShowBossDialog(false)}
          onAcceptFight={handleBossFight}
          onDeclineFight={handleBossDecline}
          bossName={currentMonster.name}
        />
      )}
    </div>
  )
}
