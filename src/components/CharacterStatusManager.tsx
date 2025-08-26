'use client'

import React, { useState } from 'react'
import { Character } from '@/types/game'
import { Potion, PotionType, PREDEFINED_POTIONS, CharacterStatus } from '@/types/item'

interface CharacterStatusManagerProps {
  character: Character
  onStatusChange: (newStatus: CharacterStatus) => void
  onPotionUse: (potionId: string) => void
  availablePotions: Potion[]
}

export default function CharacterStatusManager({
  character,
  onStatusChange,
  onPotionUse,
  availablePotions
}: CharacterStatusManagerProps) {
  const [showDeathDialog, setShowDeathDialog] = useState(false)

  const currentHp = (character as any).hp || character.baseStats?.hp || 100
  const maxHp = (character as any).maxHp || character.baseStats?.maxHp || 100
  const currentStamina = (character as any).stamina || character.baseStats?.stamina || 100
  const maxStamina = (character as any).maxStamina || character.baseStats?.maxStamina || 100
  
  const isAlive = currentHp > 0
  const isDead = currentHp <= 0

  const revivalPotions = availablePotions.filter(p => p.type === PotionType.REVIVAL)
  const hasRevivalPotion = revivalPotions.length > 0

  const handleRevive = (potionId: string) => {
    const potion = availablePotions.find(p => p.id === potionId)
    if (!potion || potion.type !== PotionType.REVIVAL) return

    const revivedHp = Math.floor((maxHp * potion.effectValue) / 100)
    
    const newStatus: CharacterStatus = {
      isAlive: true,
      hp: revivedHp,
      maxHp,
      stamina: currentStamina,
      maxStamina
    }

    onStatusChange(newStatus)
    onPotionUse(potionId)
    setShowDeathDialog(false)
  }

  const handlePotionUse = (potionId: string) => {
    const potion = availablePotions.find(p => p.id === potionId)
    if (!potion) return

    let newHp = currentHp
    let newStamina = currentStamina

    switch (potion.type) {
      case PotionType.HEALING:
        newHp = Math.min(maxHp, currentHp + potion.effectValue)
        break
      case PotionType.STAMINA:
        newStamina = Math.min(maxStamina, currentStamina + potion.effectValue)
        break
    }

    const newStatus: CharacterStatus = {
      isAlive: newHp > 0,
      hp: newHp,
      maxHp,
      stamina: newStamina,
      maxStamina
    }

    onStatusChange(newStatus)
    onPotionUse(potionId)
  }

  // Mostrar dialog de morte se o personagem morreu
  React.useEffect(() => {
    if (isDead && !showDeathDialog) {
      setShowDeathDialog(true)
    }
  }, [isDead, showDeathDialog])

  const getHealthBarColor = (percentage: number) => {
    if (percentage > 60) return 'bg-green-500'
    if (percentage > 30) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getStaminaBarColor = (percentage: number) => {
    if (percentage > 60) return 'bg-blue-500'
    if (percentage > 30) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const hpPercentage = Math.max(0, (currentHp / maxHp) * 100)
  const staminaPercentage = Math.max(0, (currentStamina / maxStamina) * 100)

  return (
    <div className="space-y-4">
      {/* Status Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Health Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-red-600 dark:text-red-400">❤️ Vida</span>
            <span className={`${isDead ? 'text-red-700 font-bold' : ''}`}>
              {isDead ? '💀 MORTO' : `${currentHp}/${maxHp}`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
            <div 
              className={`h-3 rounded-full transition-all duration-300 ${getHealthBarColor(hpPercentage)}`}
              style={{ width: `${hpPercentage}%` }}
            />
          </div>
        </div>

        {/* Stamina Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-blue-600 dark:text-blue-400">⚡ Energia</span>
            <span>{currentStamina}/{maxStamina}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 dark:bg-gray-700">
            <div 
              className={`h-3 rounded-full transition-all duration-300 ${getStaminaBarColor(staminaPercentage)}`}
              style={{ width: `${staminaPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick Potions */}
      {!isDead && availablePotions.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          <h4 className="text-sm font-medium mb-2">🧪 Poções Disponíveis</h4>
          <div className="flex flex-wrap gap-2">
            {availablePotions.filter(p => p.type !== PotionType.REVIVAL).map(potion => (
              <button
                key={potion.id}
                onClick={() => handlePotionUse(potion.id)}
                className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white text-xs rounded-full transition-colors"
                disabled={
                  (potion.type === PotionType.HEALING && currentHp >= maxHp) ||
                  (potion.type === PotionType.STAMINA && currentStamina >= maxStamina)
                }
              >
                {potion.name} (+{potion.effectValue})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Death Dialog */}
      {showDeathDialog && isDead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md mx-4">
            <div className="text-center">
              <div className="text-6xl mb-4">💀</div>
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
                Você Morreu!
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Seu personagem foi derrotado. Use uma Poção de Reviver para continuar ou saia da dungeon.
              </p>

              {hasRevivalPotion ? (
                <div className="space-y-4">
                  <h3 className="font-medium">Poções de Reviver Disponíveis:</h3>
                  <div className="space-y-2">
                    {revivalPotions.map(potion => (
                      <button
                        key={potion.id}
                        onClick={() => handleRevive(potion.id)}
                        className="w-full bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg transition-colors"
                      >
                        🧪 Usar {potion.name} (Revive com {potion.effectValue}% HP)
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-red-600 dark:text-red-400 font-medium">
                    ❌ Você não possui Poções de Reviver!
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Compre uma Poção de Reviver na loja para poder continuar depois da morte.
                  </p>
                </div>
              )}

              <div className="mt-6 space-y-2">
                <button
                  onClick={() => setShowDeathDialog(false)}
                  className="w-full bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  🚪 Sair da Dungeon
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
