'use client'

import React, { useState } from 'react'
import EnhancedCombatDialogV2 from './EnhancedCombatDialogV2'

interface Monster {
  id: string
  name: string
  hp: number
  maxHp: number
  attack: number
  defense: number
  level: number
  g      {/* Dialog de Combate Aprimorado */}
      {showEnhancedCombat && currentMonster && (
        <EnhancedCombatDialogV2
          isOpen={showEnhancedCombat}
          monster={current}ward: number
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
}

export default function SimpleDungeon({ characterId, character }: SimpleDungeonProps) {
  const [instance, setInstance] = useState<any>(null)
  const [currentRoom, setCurrentRoom] = useState<DungeonRoom | null>(null)
  const [combatLog, setCombatLog] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // Estados para o dialog de combate aprimorado
  const [showEnhancedCombat, setShowEnhancedCombat] = useState(false)
  const [currentMonster, setCurrentMonster] = useState<Monster | null>(null)

  // Processar equipamentos do personagem para o formato esperado
  const processedCharacter = {
    ...character,
    equipment: {
      weapon: character.equipment?.find(e => e.slot === 'WEAPON')?.item ? {
        id: character.equipment.find(e => e.slot === 'WEAPON')!.item.id,
        name: character.equipment.find(e => e.slot === 'WEAPON')!.item.name,
        type: character.equipment.find(e => e.slot === 'WEAPON')!.item.type,
        durability: 90, // Valor padrão - pode ser implementado no banco depois
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
        setCombatLog([`✅ Entrou na dungeon: ${result.currentRoom.name}`])
      }
    } catch (error) {
      console.error('Erro ao entrar na dungeon:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const attack = async () => {
    if (!instance || !currentRoom?.monster) return

    // Abrir dialog de combate aprimorado
    setCurrentMonster(currentRoom.monster)
    setShowEnhancedCombat(true)
  }

  // Função para lidar com o fim do combate no dialog aprimorado
  const handleCombatEnd = (victory: boolean, rewards?: any) => {
    setShowEnhancedCombat(false)
    setCurrentMonster(null)

    const newLog = [...combatLog]
    
    if (victory) {
      newLog.push(`🎉 Você derrotou o monstro!`)
      if (rewards) {
        newLog.push(`💰 +${rewards.gold} Gold, +${rewards.xp} XP`)
      }
      
      // Completar a sala atual
      if (currentRoom) {
        const updatedRoom = { ...currentRoom, isCompleted: true }
        setCurrentRoom(updatedRoom)
        newLog.push(`✅ Sala completada: ${currentRoom.name}`)
        
        // Simular avanço para próxima sala (simplificado)
        if (instance.rooms && instance.currentRoom < instance.rooms.length - 1) {
          setTimeout(() => {
            const nextRoomIndex = instance.currentRoom + 1
            const nextRoom = instance.rooms[nextRoomIndex]
            setCurrentRoom(nextRoom)
            instance.currentRoom = nextRoomIndex
            newLog.push(`🚪 Avançando para: ${nextRoom.name}`)
            setCombatLog([...newLog, `🚪 Avançando para: ${nextRoom.name}`])
          }, 2000)
        } else {
          newLog.push(`🏆 Dungeon completada!`)
        }
      }
    } else {
      newLog.push(`💀 Você foi derrotado!`)
      newLog.push(`🏃 Saindo da dungeon...`)
      // Resetar instância
      setTimeout(() => {
        setInstance(null)
        setCurrentRoom(null)
      }, 2000)
    }
    
    setCombatLog(newLog)
  }

  if (!instance) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold mb-4">🏰 Cavernas dos Goblins</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Uma dungeon perigosa habitada por goblins. Perfeita para aventureiros iniciantes.
        </p>
        <button
          onClick={enterDungeon}
          disabled={isLoading}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg disabled:opacity-50"
        >
          {isLoading ? '🔄 Entrando...' : '🚪 Entrar na Dungeon'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">🏰 {currentRoom?.name || 'Dungeon'}</h2>
        <button
          onClick={() => {
            setInstance(null)
            setCurrentRoom(null)
            setCombatLog([])
          }}
          className="text-red-500 hover:text-red-700"
        >
          🚪 Sair
        </button>
      </div>

      {/* Descrição da Sala */}
      {currentRoom && (
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <p className="text-gray-700 dark:text-gray-300">{currentRoom.description}</p>
        </div>
      )}

      {/* Monstro */}
      {currentRoom?.monster && !currentRoom.isCompleted && (
        <div className="bg-red-50 dark:bg-red-900 p-4 rounded-lg">
          <h3 className="font-bold text-red-800 dark:text-red-200 mb-2">
            👹 {currentRoom.monster.name}
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>❤️ HP: {currentRoom.monster.hp}/{currentRoom.monster.maxHp}</div>
            <div>⚔️ ATK: {currentRoom.monster.attack}</div>
            <div>🛡️ DEF: {currentRoom.monster.defense}</div>
            <div>📊 Level: {currentRoom.monster.level}</div>
          </div>
          <div className="mt-4">
            <button
              onClick={attack}
              disabled={isLoading}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              ⚔️ Atacar (Dialog Aprimorado)
            </button>
          </div>
        </div>
      )}

      {/* Sala Completada */}
      {currentRoom?.isCompleted && (
        <div className="bg-green-50 dark:bg-green-900 p-4 rounded-lg">
          <p className="text-green-800 dark:text-green-200">✅ Sala completada!</p>
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
      
      {/* Dialog de Combate Aprimorado */}
      {showEnhancedCombat && currentMonster && (
        <EnhancedCombatDialogV2
          isOpen={showEnhancedCombat}
          monster={currentMonster}
          character={processedCharacter}
          instanceId={instance?.id || ''}
          onClose={() => {
            setShowEnhancedCombat(false)
            setCurrentMonster(null)
          }}
          onCombatEnd={handleCombatEnd}
        />
      )}
    </div>
  )
}
