'use client'

import React, { useState, useEffect } from 'react'

interface ExplorationResult {
  type: 'monster' | 'item' | 'gold' | 'nothing'
  rarity?: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
  item?: any
  gold?: number
  monster?: any
  narrative: string
}

interface ExplorationDialogProps {
  isOpen: boolean
  onClose: () => void
  onResult: (result: ExplorationResult) => void
  characterLevel: number
  currentFloor?: number
  characterId: string
  onStaminaUpdate?: (stamina: number) => void
}

export default function ExplorationDialog({ 
  isOpen, 
  onClose, 
  onResult, 
  characterLevel,
  currentFloor = 1,
  characterId,
  onStaminaUpdate 
}: ExplorationDialogProps) {
  const [isExploring, setIsExploring] = useState(false)
  const [currentNarrative, setCurrentNarrative] = useState('')
  const [result, setResult] = useState<ExplorationResult | null>(null)

  // Narrativas para diferentes tipos de exploração
  const narratives = {
    exploring: [
      "Você caminha cautelosamente pelos corredores sombrios...",
      "Suas pegadas ecoam nas pedras antigas...",
      "Uma brisa fria sopra através das passagens...",
      "Você examina as paredes em busca de segredos...",
      "A luz da sua tocha dança nas sombras...",
      "Você ouve sons estranhos à distância...",
      "O cheiro de mofo e aventura preenche o ar..."
    ],
    foundItem: [
      "Algo brilha entre os escombros!",
      "Você descobre um tesouro escondido!",
      "Um item misterioso chama sua atenção!",
      "Entre as pedras, algo valioso aguarda!",
      "Sua busca é recompensada com um achado!"
    ],
    foundGold: [
      "Moedas douradas cintilam no chão!",
      "Um pequeno tesouro de moedas antigas!",
      "Ouro esquecido por aventureiros anteriores!",
      "Suas moedas fazem um som satisfatório!"
    ],
    foundMonster: [
      "Olhos vermelhos brilham na escuridão!",
      "Algo se move nas sombras... PERIGO!",
      "Um rugido ecoa pelos corredores!",
      "Você despertou algo que deveria dormir!",
      "Uma criatura emerge das trevas!"
    ],
    foundNothing: [
      "Apenas silêncio e poeira...",
      "Nada além de pedras e sombras...",
      "A busca não revela nenhum segredo...",
      "Apenas ecos dos seus próprios passos...",
      "As antigas paredes guardam seus segredos..."
    ]
  }

  // Sistema de chances melhorado baseado no andar
  const calculateExplorationResult = (): ExplorationResult => {
    const roll = Math.random() * 100
    const floorMultiplier = 1 + (currentFloor - 1) * 0.2 // 20% melhor chance a cada andar

    // 30% Monstro
    if (roll < 30) {
      return {
        type: 'monster',
        narrative: narratives.foundMonster[Math.floor(Math.random() * narratives.foundMonster.length)],
        monster: generateRandomMonster()
      }
    }
    
    // 35% Ouro (aumenta com andar)
    if (roll < 65) {
      const baseGold = Math.floor((10 + Math.random() * 20) * characterLevel)
      const goldAmount = Math.floor(baseGold * floorMultiplier)
      return {
        type: 'gold',
        gold: goldAmount,
        narrative: `${narratives.foundGold[Math.floor(Math.random() * narratives.foundGold.length)]} Você encontrou ${goldAmount} moedas de ouro!`
      }
    }

    // Chances de itens melhores por andar
    const rarityBonus = (currentFloor - 1) * 5 // 5% melhor chance de raridade por andar
    
    // Ajustar chances baseado no andar
    const commonChance = Math.max(5, 20 - rarityBonus) // Menos comum em andares altos
    const uncommonChance = Math.min(25, 10 + rarityBonus) // Mais incomum em andares altos
    const rareChance = Math.min(15, 4 + rarityBonus) // Mais raro em andares altos
    const epicChance = Math.min(8, 0.9 + rarityBonus * 0.5) // Mais épico em andares altos
    const legendaryChance = Math.min(3, 0.1 + rarityBonus * 0.2) // Mais lendário em andares altos

    // Item Comum
    if (roll < 65 + commonChance) {
      return {
        type: 'item',
        rarity: 'COMMON',
        item: generateRandomItem('COMMON'),
        narrative: `${narratives.foundItem[Math.floor(Math.random() * narratives.foundItem.length)]} Um item comum! (Andar ${currentFloor})`
      }
    }

    // Item Incomum
    if (roll < 65 + commonChance + uncommonChance) {
      return {
        type: 'item',
        rarity: 'UNCOMMON', 
        item: generateRandomItem('UNCOMMON'),
        narrative: `${narratives.foundItem[Math.floor(Math.random() * narratives.foundItem.length)]} Um item incomum! (Andar ${currentFloor})`
      }
    }

    // Item Raro
    if (roll < 65 + commonChance + uncommonChance + rareChance) {
      return {
        type: 'item',
        rarity: 'RARE',
        item: generateRandomItem('RARE'),
        narrative: `${narratives.foundItem[Math.floor(Math.random() * narratives.foundItem.length)]} ✨ Um item raro! (Andar ${currentFloor})`
      }
    }

    // Item Épico
    if (roll < 65 + commonChance + uncommonChance + rareChance + epicChance) {
      return {
        type: 'item',
        rarity: 'EPIC',
        item: generateRandomItem('EPIC'),
        narrative: `${narratives.foundItem[Math.floor(Math.random() * narratives.foundItem.length)]} 🌟 Um item ÉPICO! (Andar ${currentFloor})`
      }
    }

    // Item Lendário (muito mais provável em andares altos)
    if (roll < 65 + commonChance + uncommonChance + rareChance + epicChance + legendaryChance) {
      return {
        type: 'item',
        rarity: 'LEGENDARY',
        item: generateRandomItem('LEGENDARY'),
        narrative: `${narratives.foundItem[Math.floor(Math.random() * narratives.foundItem.length)]} ⭐ Um item LENDÁRIO! (Andar ${currentFloor})`
      }
    }

    // Nada encontrado (muito raro em andares altos)
    return {
      type: 'nothing',
      narrative: `${narratives.foundNothing[Math.floor(Math.random() * narratives.foundNothing.length)]} (Andar ${currentFloor})`
    }
  }

  const generateRandomMonster = () => {
    const monsters = [
      { name: "Goblin Explorador", level: characterLevel, hp: 40 + (characterLevel * 5) },
      { name: "Esqueleto Guardião", level: characterLevel, hp: 50 + (characterLevel * 6) },
      { name: "Rato Gigante", level: characterLevel, hp: 35 + (characterLevel * 4) },
      { name: "Morcego Sombrio", level: characterLevel, hp: 30 + (characterLevel * 3) },
      { name: "Aranha Venenosa", level: characterLevel, hp: 45 + (characterLevel * 5) }
    ]
    return monsters[Math.floor(Math.random() * monsters.length)]
  }

  const generateRandomItem = (rarity: string) => {
    const items = {
      COMMON: [
        { name: "Poção de Vida Pequena", description: "Restaura 25 HP" },
        { name: "Moedas Antigas", description: "Algumas moedas extras" },
        { name: "Pedra Comum", description: "Uma pedra sem valor especial" }
      ],
      UNCOMMON: [
        { name: "Poção de Vida", description: "Restaura 50 HP" },
        { name: "Poção de Mana", description: "Restaura 30 MP" },
        { name: "Cristal Azul", description: "Um cristal com energia mágica" }
      ],
      RARE: [
        { name: "Poção de Stamina", description: "Restaura 50 Stamina" },
        { name: "Elixir Maior", description: "Restaura HP e MP" },
        { name: "Gema Rara", description: "Uma gema preciosa e valiosa" }
      ],
      EPIC: [
        { name: "Elixir Épico", description: "Restaura completamente HP/MP/Stamina" },
        { name: "Cristal do Poder", description: "Aumenta temporariamente os atributos" },
        { name: "Relíquia Antiga", description: "Um artefato de poder místico" }
      ],
      LEGENDARY: [
        { name: "Ambrosia dos Deuses", description: "Poção lendária de restauração total" },
        { name: "Orbe da Eternidade", description: "Artefato de poder incomparável" },
        { name: "Essência Primordial", description: "A essência pura da magia" }
      ]
    }
    const rarityItems = items[rarity as keyof typeof items]
    return rarityItems[Math.floor(Math.random() * rarityItems.length)]
  }

  // Função para consumir stamina
  const consumeStamina = async (cost: number): Promise<boolean> => {
    try {
      const response = await fetch(`/api/character/${characterId}/update-stamina`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staminaCost: cost })
      })
      
      if (!response.ok) {
        return false
      }

      const result = await response.json()
      if (result.character && onStaminaUpdate) {
        onStaminaUpdate(result.character.stamina)
      }
      
      return true
    } catch (error) {
      return false
    }
  }

  const startExploration = async () => {
    // Consumir stamina AGORA, quando o usuário confirma a exploração
    const canExplore = await consumeStamina(8) // 8 stamina para exploração
    if (!canExplore) {
      alert('❌ Stamina insuficiente para explorar!')
      return
    }

    setIsExploring(true)
    setResult(null)
    setCurrentNarrative('')
    
    // Sequência de narrativas durante a exploração
    const explorationSequence = [
      narratives.exploring[Math.floor(Math.random() * narratives.exploring.length)],
      narratives.exploring[Math.floor(Math.random() * narratives.exploring.length)],
      "Você continua sua busca meticulosa...",
    ]

    let step = 0
    const interval = setInterval(() => {
      if (step < explorationSequence.length) {
        setCurrentNarrative(explorationSequence[step])
        step++
      } else {
        clearInterval(interval)
        // Calcular resultado final
        const finalResult = calculateExplorationResult()
        setResult(finalResult)
        setCurrentNarrative(finalResult.narrative)
        setIsExploring(false)
      }
    }, 1500)
  }

  const handleClose = () => {
    if (result) {
      onResult(result)
    }
    onClose()
    setResult(null)
    setCurrentNarrative('')
    setIsExploring(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          {/* Header */}
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              🔍 Exploração da Dungeon
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Explore os cantos escuros em busca de tesouros...
            </p>
          </div>

          {/* Animação de Exploração */}
          {isExploring && (
            <div className="mb-6">
              <div className="text-6xl animate-pulse mb-4">🔍</div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
                <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{width: '70%'}}></div>
              </div>
            </div>
          )}

          {/* Resultado Visual */}
          {result && !isExploring && (
            <div className="mb-6">
              {result.type === 'monster' && <div className="text-6xl mb-4">👹</div>}
              {result.type === 'item' && (
                <div className="text-6xl mb-4">
                  {result.rarity === 'LEGENDARY' && '⭐'}
                  {result.rarity === 'EPIC' && '🌟'}
                  {result.rarity === 'RARE' && '✨'}
                  {result.rarity === 'UNCOMMON' && '💎'}
                  {result.rarity === 'COMMON' && '📦'}
                </div>
              )}
              {result.type === 'gold' && <div className="text-6xl mb-4">💰</div>}
              {result.type === 'nothing' && <div className="text-6xl mb-4">😐</div>}
            </div>
          )}

          {/* Narrativa */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6 min-h-[80px] flex items-center">
            <p className="text-gray-700 dark:text-gray-300 text-sm italic">
              {currentNarrative || "Clique em 'Explorar' para começar sua busca..."}
            </p>
          </div>

          {/* Detalhes do Resultado */}
          {result && result.type === 'item' && result.item && (
            <div className="bg-blue-50 dark:bg-blue-900 p-3 rounded-lg mb-4">
              <h4 className="font-bold text-blue-800 dark:text-blue-200">
                {result.item.name}
              </h4>
              <p className="text-blue-600 dark:text-blue-300 text-sm">
                {result.item.description}
              </p>
            </div>
          )}

          {result && result.type === 'gold' && (
            <div className="bg-yellow-50 dark:bg-yellow-900 p-3 rounded-lg mb-4">
              <h4 className="font-bold text-yellow-800 dark:text-yellow-200">
                💰 {result.gold} Moedas de Ouro
              </h4>
            </div>
          )}

          {result && result.type === 'monster' && result.monster && (
            <div className="bg-red-50 dark:bg-red-900 p-3 rounded-lg mb-4">
              <h4 className="font-bold text-red-800 dark:text-red-200">
                ⚔️ {result.monster.name} (Level {result.monster.level})
              </h4>
              <p className="text-red-600 dark:text-red-300 text-sm">
                HP: {result.monster.hp} - Prepare-se para o combate!
              </p>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3">
            {!result && !isExploring && (
              <button
                onClick={startExploration}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-medium"
              >
                🔍 Explorar
              </button>
            )}
            
            {(result || !isExploring) && (
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg font-medium"
              >
                {result ? 'Continuar' : 'Fechar'}
              </button>
            )}
          </div>

          {/* Chances Info */}
          {!result && !isExploring && (
            <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              <p>Chances: 30% Monstro | 35% Ouro | 20% Comum | 10% Incomum | 4% Raro | 0.9% Épico | 0.1% Lendário</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
