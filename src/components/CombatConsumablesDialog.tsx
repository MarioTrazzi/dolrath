'use client'

import React, { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { localizeItemName, localizeItemDesc } from '@/lib/i18n/catalog'

interface ConsumableItem {
  id: number
  name: string
  description: string
  type: 'health' | 'mana' | 'stamina' | 'buff'
  effect: {
    value: number
    type: 'heal' | 'restore' | 'buff'
    extraEffect?: { mp?: number } // Para elixires que curam HP e MP
  }
  quantity: number
  icon: string
}

interface CombatConsumablesDialogProps {
  isOpen: boolean
  onClose: () => void
  characterId: string
  onUseItem: (item: ConsumableItem) => void
  currentHp: number
  maxHp: number
  currentMp: number
  maxMp: number
}

export default function CombatConsumablesDialog({
  isOpen,
  onClose,
  characterId,
  onUseItem,
  currentHp,
  maxHp,
  currentMp,
  maxMp
}: CombatConsumablesDialogProps) {
  const { locale, t } = useI18n()
  const [consumables, setConsumables] = useState<ConsumableItem[]>([])
  const [loading, setLoading] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  // Carregar consumíveis do inventário
  useEffect(() => {
    console.log('🧪 DEBUG: useEffect - isOpen:', isOpen, 'characterId:', characterId)
    if (isOpen && characterId && characterId !== '0' && characterId !== 'undefined') {
      console.log('🧪 DEBUG: Iniciando carregamento de consumíveis...')
      loadConsumables()
    } else {
      console.log('🧪 DEBUG: Não carregando - condições não atendidas')
    }
  }, [isOpen, characterId])

  const loadConsumables = async () => {
    console.log('🧪 DEBUG: loadConsumables iniciada para characterId:', characterId)
    setLoading(true)
    try {
      // Carregar inventário real do personagem usando a API correta
      const url = `/api/store/inventory?characterId=${characterId}`
      console.log('🧪 DEBUG: Fazendo fetch para URL:', url)
      
      const response = await fetch(url)
      console.log('🧪 DEBUG: Response status:', response.status, response.ok)
      
      if (!response.ok) {
        throw new Error(`Erro ao carregar inventário do personagem - Status: ${response.status}`)
      }
      
      const inventoryData = await response.json()
      console.log('🎒 Inventário do personagem carregado:', inventoryData)
      console.log('🎒 Quantidade de itens no inventário:', inventoryData.length)
      
      // Primeiro, vamos ver TODOS os consumíveis para debug
      console.log('🧪 DEBUG: Verificando TODOS os consumíveis no inventário...')
      const allConsumables = inventoryData.filter((item: any) => item.item.type === 'consumable')
      console.log('🧪 DEBUG: Todos os consumíveis encontrados:', allConsumables)
      
      allConsumables.forEach((item: any, index: number) => {
        console.log(`🧪 DEBUG: Item ${index + 1}:`, {
          name: item.item.name,
          type: item.item.type,
          subtype: item.item.subtype,
          description: item.item.description,
          quantity: item.quantity,
          stats: item.item.stats
        })
      })

      // Filtrar apenas consumíveis de batalha (regeneração e buffs)
      const battleConsumables = inventoryData
        .filter((item: any) => {
          // Verificar se é consumível de batalha
          const battleSubtypes = [
            'HEALTH_POTION',
            'MANA_POTION', 
            'STAMINA_POTION',
            'ELIXIR',
            'STRENGTH_BUFF',
            'DEFENSE_BUFF',
            'AGILITY_BUFF',
            'INTELLIGENCE_BUFF',
            'TEMPORARY_BUFF'
          ]
          
          const nameCheck = item.item.name?.toLowerCase() || ''
          
          const isBattleConsumable = 
            item.item.type === 'CONSUMABLE' && 
            (
              // Verificar se tem subtype válido para batalha
              battleSubtypes.includes(item.item.subtype) ||
              // Verificar se o stats indica que é battleUsable
              item.item.stats?.battleUsable === true ||
              // Usar nome como fallback (para itens antigos)
              nameCheck.includes('poção') ||
              nameCheck.includes('elixir') ||
              nameCheck.includes('vida') ||
              nameCheck.includes('mana') ||
              nameCheck.includes('stamina') ||
              nameCheck.includes('força') ||
              nameCheck.includes('defesa') ||
              nameCheck.includes('agilidade')
            )
          
          return isBattleConsumable && item.quantity > 0
        })
        .map((item: any) => ({
          id: item.item.id,
          name: item.item.name,
          description: item.item.description,
          type: getConsumableType(item.item.subtype),
          effect: getConsumableEffect(item.item.subtype, item.item.stats),
          quantity: item.quantity,
          icon: getConsumableIcon(item.item.subtype)
        }))
      
      console.log('⚔️ Consumíveis de batalha filtrados:', battleConsumables)
      console.log('⚔️ Quantidade de consumíveis encontrados:', battleConsumables.length)
      setConsumables(battleConsumables)
    } catch (error) {
      console.error('❌ Erro ao carregar consumíveis:', error)
      setConsumables([])
    } finally {
      console.log('🧪 DEBUG: loadConsumables finalizada')
      setLoading(false)
    }
  }

  // Função para determinar o tipo do consumível
  const getConsumableType = (subtype: string): 'health' | 'mana' | 'stamina' | 'buff' => {
    if (subtype === 'health_potion') return 'health'
    if (subtype === 'mana_potion') return 'mana'
    if (subtype === 'elixir') return 'health' // Elixir maior cura HP e MP
    return 'buff'
  }

  // Função para determinar o efeito do consumível
  const getConsumableEffect = (subtype: string, stats: any) => {
    switch (subtype) {
      case 'health_potion':
        return { value: stats?.hp_restore || 50, type: 'heal' as const }
      case 'mana_potion':
        return { value: stats?.mp_restore || 30, type: 'restore' as const }
      case 'elixir':
        return { value: stats?.hp_restore || 100, type: 'heal' as const, extraEffect: { mp: stats?.mp_restore || 50 } }
      case 'strength_potion':
        return { value: stats?.attack_boost || 10, type: 'buff' as const }
      case 'defense_potion':
        return { value: stats?.defense_boost || 10, type: 'buff' as const }
      case 'speed_potion':
        return { value: stats?.speed_boost || 5, type: 'buff' as const }
      case 'magic_potion':
        return { value: stats?.magic_boost || 10, type: 'buff' as const }
      default:
        return { value: 0, type: 'heal' as const }
    }
  }

  // Função para determinar o ícone do consumível
  const getConsumableIcon = (subtype: string): string => {
    switch (subtype) {
      case 'health_potion': return '❤️'
      case 'mana_potion': return '🔮'
      case 'elixir': return '💖'
      case 'strength_potion': return '💪'
      case 'defense_potion': return '🛡️'
      case 'speed_potion': return '⚡'
      case 'magic_potion': return '✨'
      default: return '🧪'
    }
  }

  const handleUseItem = (item: ConsumableItem) => {
    // Verificar se o item pode ser usado
    if (item.type === 'health' && !item.effect.extraEffect && currentHp >= maxHp) {
      alert(t('Your HP is already full!'))
      return
    }

    if (item.type === 'mana' && currentMp >= maxMp) {
      alert(t('Your MP is already full!'))
      return
    }

    // Para elixires, verificar se pelo menos um está baixo
    if (item.effect.extraEffect?.mp && currentHp >= maxHp && currentMp >= maxMp) {
      alert(t('Your HP and MP are already full!'))
      return
    }

    if (item.quantity <= 0) {
      alert(t("You don't have this item!"))
      return
    }

    // Usar o item
    onUseItem(item)
    
    // Reduzir quantidade
    setConsumables(prev => 
      prev.map(consumable => 
        consumable.id === item.id 
          ? { ...consumable, quantity: consumable.quantity - 1 }
          : consumable
      )
    )
    
    // Fechar dialog após usar item
    handleClose()
  }

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 300)
  }

  if (!isOpen) return null

  console.log('🧪 DEBUG: Renderizando CombatConsumablesDialog - loading:', loading, 'consumables:', consumables.length)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 transform transition-all duration-300 ${
        isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
      }`}>
        
        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">
            {t('🧪 Battle Consumables')}
          </h2>
          <div className="flex justify-center space-x-4 text-xs">
            <div className="text-red-600">❤️ {currentHp}/{maxHp}</div>
            <div className="text-blue-600">🔮 {currentMp}/{maxMp}</div>
          </div>
        </div>

        {/* Items List */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <div className="text-gray-500">{t('Loading consumables...')}</div>
            </div>
          ) : consumables.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 text-sm">
                {t('No consumables available')}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {consumables
                .filter(item => item.quantity > 0)
                .map((item) => (
                <div 
                  key={item.id}
                  className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl">{item.icon}</div>
                      <div>
                        <div className="font-bold text-sm text-gray-800 dark:text-gray-200">
                          {localizeItemName(item.name, locale)}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {localizeItemDesc(item.name, item.description, locale)}
                        </div>
                        <div className="text-xs text-emerald-600 dark:text-emerald-400">
                          {t('Quantity: {n}', { n: item.quantity })}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUseItem(item)}
                      disabled={
                        (item.type === 'health' && !item.effect.extraEffect && currentHp >= maxHp) ||
                        (item.type === 'mana' && currentMp >= maxMp) ||
                        (item.effect.extraEffect?.mp && currentHp >= maxHp && currentMp >= maxMp) ||
                        item.quantity <= 0
                      }
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs font-bold transition-colors"
                    >
                      {t('Use')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="text-center">
            <button
              onClick={handleClose}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
            >
              {t('❌ Cancel')}
            </button>
          </div>
          <div className="text-center mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('Using a consumable spends your attack turn')}
          </div>
        </div>
      </div>
    </div>
  )
}
