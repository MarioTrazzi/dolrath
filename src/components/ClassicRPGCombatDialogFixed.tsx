'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

interface Equipment {
  id: string
  name: string
  stats: {
    attack?: number
    defense?: number
    hp?: number
    mp?: number
    bonusDamage?: number
  }
  durability?: number
  maxDurability?: number
}

interface ProcessedCharacter {
  id: string
  name: string
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  attack: number
  defense: number
  gold: number
  equipment: {
    weapon?: Equipment
    armor?: Equipment
    shield?: Equipment
  }
}

interface Monster {
  id: string
  name: string
  level: number
  hp: number
  maxHp: number
  attack: number
  defense: number
  goldReward: number
  xpReward: number
}

interface CombatRewards {
  gold: number
  xp: number
}

interface ClassicRPGCombatDialogProps {
  isOpen: boolean
  onClose: () => void
  character: ProcessedCharacter
  monster: Monster
  onCombatEnd: (victory: boolean, rewards?: CombatRewards) => void
}

enum CombatPhase {
  WAITING = 'waiting',
  PLAYER_TURN = 'player_turn',
  PLAYER_ATTACK = 'player_attack',
  MONSTER_TURN = 'monster_turn',
  MONSTER_ATTACK = 'monster_attack',
  PLAYER_DEFENSE = 'player_defense',
  DICE_ROLL = 'dice_roll',
  COMBAT_END = 'combat_end'
}

enum ActionType {
  LIGHT_ATTACK = 'light_attack',
  HEAVY_ATTACK = 'heavy_attack',
  SPECIAL_ATTACK = 'special_attack',
  DODGE = 'dodge',
  DEFEND = 'defend',
  USE_ITEM = 'use_item'
}

const DiceComponent = ({ 
  sides, 
  enabled, 
  onRoll, 
  lastRoll, 
  isRolling 
}: { 
  sides: number
  enabled: boolean
  onRoll: () => void
  lastRoll: { roll: number; modifier: number; total: number } | null
  isRolling: boolean
}) => {
  const getDiceColor = (sides: number) => {
    switch (sides) {
      case 4: return 'bg-red-600'
      case 6: return 'bg-blue-600'
      case 8: return 'bg-green-600'
      case 10: return 'bg-yellow-600'
      case 12: return 'bg-purple-600'
      case 20: return 'bg-pink-600'
      default: return 'bg-gray-600'
    }
  }

  return (
    <button
      onClick={onRoll}
      disabled={!enabled || isRolling}
      className={`
        w-12 h-12 rounded-lg text-white font-bold text-xs
        transition-all duration-200 transform
        ${enabled && !isRolling ? 'hover:scale-110 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
        ${getDiceColor(sides)}
        ${isRolling ? 'animate-bounce' : ''}
      `}
    >
      <div className="text-center">
        {isRolling ? '🎲' : (lastRoll ? lastRoll.total : `d${sides}`)}
      </div>
    </button>
  )
}

export default function ClassicRPGCombatDialog({
  isOpen,
  onClose,
  character,
  monster,
  onCombatEnd
}: ClassicRPGCombatDialogProps) {
  const [currentMonster, setCurrentMonster] = useState<Monster>(monster)
  const [playerHp, setPlayerHp] = useState(character.hp)
  const [playerMp, setPlayerMp] = useState(character.mp)
  const [combatLog, setCombatLog] = useState<string[]>([])
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [equipment, setEquipment] = useState(character.equipment)
  const [combatPhase, setCombatPhase] = useState<CombatPhase>(CombatPhase.WAITING)
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null)
  const [diceRolls, setDiceRolls] = useState<{[key: number]: { roll: number; modifier: number; total: number } | null}>({})
  const [isRollingDice, setIsRollingDice] = useState<{[key: number]: boolean}>({})
  const [enabledDice, setEnabledDice] = useState<number[]>([])
  
  // Ref para o container do chat
  const chatLogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setCurrentMonster(monster)
      setPlayerHp(character.hp)
      setPlayerMp(character.mp)
      setCombatLog([`⚔️ Combate iniciado contra ${monster.name}!`])
      setIsPlayerTurn(true)
      setCombatPhase(CombatPhase.WAITING)
      resetDice()
    }
  }, [isOpen, monster, character])

  // Auto-scroll do chat quando nova mensagem é adicionada
  useEffect(() => {
    if (chatLogRef.current && combatLog.length > 0) {
      const scrollToBottom = () => {
        if (chatLogRef.current) {
          chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
        }
      }
      
      // Múltiplas tentativas para garantir que funcione
      setTimeout(scrollToBottom, 0)
      setTimeout(scrollToBottom, 50)
      setTimeout(scrollToBottom, 100)
    }
  }, [combatLog])

  const resetDice = () => {
    setDiceRolls({})
    setIsRollingDice({})
    setEnabledDice([])
    setCurrentAction(null)
  }

  const addToCombatLog = useCallback((message: string) => {
    setCombatLog(prev => [...prev, message])
  }, [])

  const ACTION_DICE: Record<ActionType, number> = {
    [ActionType.LIGHT_ATTACK]: 6,
    [ActionType.HEAVY_ATTACK]: 10,
    [ActionType.SPECIAL_ATTACK]: 20,
    [ActionType.DODGE]: 20,
    [ActionType.DEFEND]: 12,
    [ActionType.USE_ITEM]: 4
  }

  // Função para rolar dados
  const rollDice = (sides: number, modifier: number = 0, entityName: string = 'Personagem') => {
    const roll = Math.floor(Math.random() * sides) + 1
    const total = roll + modifier
    const rollMessage = `${entityName}: Rolou d${sides} = ${roll} + (${modifier}) = ${total}`
    
    setCombatLog(prev => [...prev, rollMessage])
    
    return { roll, modifier, total }
  }

  // Reduzir durabilidade do equipamento
  const reduceDurability = (equipmentType: 'weapon' | 'armor' | 'shield', amount: number = 1) => {
    setEquipment(prev => {
      if (!prev[equipmentType]) return prev
      
      const newEquipment = { ...prev }
      const item = newEquipment[equipmentType]!
      const currentDurability = item.durability || item.maxDurability || 100
      const newDurability = Math.max(0, currentDurability - amount)
      
      newEquipment[equipmentType] = {
        ...item,
        durability: newDurability
      }
      
      if (newDurability <= 0) {
        addToCombatLog(`💥 Seu ${item.name} quebrou!`)
      }
      
      return newEquipment
    })
  }

  // Função para processar ação do jogador
  const handlePlayerAction = (action: ActionType) => {
    // Permitir ações tanto na fase WAITING quanto na PLAYER_DEFENSE
    const allowedPhases = [CombatPhase.WAITING, CombatPhase.PLAYER_DEFENSE]
    if (!isPlayerTurn || !allowedPhases.includes(combatPhase)) return

    const mpCost = action === ActionType.SPECIAL_ATTACK ? 15 : 0
    
    if (mpCost > 0 && playerMp < mpCost) {
      addToCombatLog(`❌ MP insuficiente para ataque especial! (${mpCost} MP necessário)`)
      return
    }

    if (mpCost > 0) {
      setPlayerMp(prev => prev - mpCost)
      addToCombatLog(`🔮 -${mpCost} MP`)
    }

    setCurrentAction(action)
    
    // Determinar que ações são de ataque (fase do jogador) ou defesa (fase de defesa)
    if ([ActionType.DODGE, ActionType.DEFEND].includes(action)) {
      setCombatPhase(CombatPhase.PLAYER_DEFENSE)
    } else {
      setCombatPhase(CombatPhase.PLAYER_ATTACK)
    }
    
    const diceType = ACTION_DICE[action]
    setEnabledDice([diceType])
    setIsPlayerTurn(false)

    const actionNames = {
      [ActionType.LIGHT_ATTACK]: 'Ataque Leve (Soco/Chute)',
      [ActionType.HEAVY_ATTACK]: 'Ataque Pesado (Arma)',
      [ActionType.SPECIAL_ATTACK]: 'Ataque Especial',
      [ActionType.DODGE]: 'Esquivar',
      [ActionType.DEFEND]: 'Defender',
      [ActionType.USE_ITEM]: 'Usar Item'
    }

    addToCombatLog(`🎯 ${actionNames[action]} selecionado! Role o d${diceType}`)
  }

  // Função para rolar um dado específico
  const handleDiceRoll = async (sides: number) => {
    if (!enabledDice.includes(sides) || isRollingDice[sides]) return

    setIsRollingDice(prev => ({ ...prev, [sides]: true }))

    // Simular rolagem com delay
    setTimeout(() => {
      const roll = rollDice(sides, 0, 'Personagem')
      setDiceRolls(prev => ({ ...prev, [sides]: roll }))
      setIsRollingDice(prev => ({ ...prev, [sides]: false }))
      setEnabledDice([])

      // Processar ação após rolagem
      if (combatPhase === CombatPhase.PLAYER_ATTACK && currentAction) {
        processPlayerAttack(roll.total)
      } else if (combatPhase === CombatPhase.PLAYER_DEFENSE && currentAction) {
        processPlayerDefense(roll.total)
      }
    }, 1000)
  }

  // Processar ataque do jogador
  const processPlayerAttack = (playerRoll: number) => {
    if (!currentAction) return

    let damage = 0
    let weaponBonus = 0

    // Calcular dano baseado no tipo de ataque
    switch (currentAction) {
      case ActionType.LIGHT_ATTACK:
        damage = Math.max(1, character.attack + Math.floor(playerRoll / 2))
        addToCombatLog(`👊 Ataque leve executado!`)
        break
      case ActionType.HEAVY_ATTACK:
        damage = Math.max(1, character.attack + playerRoll)
        if (equipment.weapon) {
          weaponBonus = equipment.weapon.stats.attack || 0
          reduceDurability('weapon', 2)
        }
        addToCombatLog(`⚔️ Ataque pesado com arma executado!`)
        break
      case ActionType.SPECIAL_ATTACK:
        damage = Math.max(1, character.attack * 2 + playerRoll)
        if (equipment.weapon) {
          weaponBonus = (equipment.weapon.stats.attack || 0) * 2
          reduceDurability('weapon', 3)
        }
        addToCombatLog(`✨ Ataque especial devastador executado!`)
        break
    }

    // Auto-rolar para o monstro após delay
    setTimeout(() => {
      const monsterRoll = rollDice(12, 0, monster.name)
      setDiceRolls(prev => ({ ...prev, [12]: monsterRoll }))

      // Comparar resultados
      if (playerRoll > monsterRoll.total) {
        const totalDamage = damage + weaponBonus + Math.floor(playerRoll / 3)
        addToCombatLog(`✅ Ataque bem-sucedido! Dano: ${damage} + ${weaponBonus} + ${Math.floor(playerRoll / 3)} = ${totalDamage}`)
        
        const newMonsterHp = Math.max(0, currentMonster.hp - totalDamage)
        setCurrentMonster(prev => ({ ...prev, hp: newMonsterHp }))

        if (newMonsterHp <= 0) {
          addToCombatLog(`🎉 Você derrotou ${currentMonster.name}!`)
          addToCombatLog(`💰 +${currentMonster.goldReward} Gold, +${currentMonster.xpReward} XP`)
          
          setTimeout(() => {
            onCombatEnd(true, {
              gold: currentMonster.goldReward,
              xp: currentMonster.xpReward
            })
          }, 2000)
          return
        }
      } else if (playerRoll === monsterRoll.total) {
        addToCombatLog(`⚡ Empate! Ambos rolaram ${playerRoll}`)
      } else {
        addToCombatLog(`❌ ${monster.name} defendeu com sucesso!`)
      }

      // Iniciar ataque do monstro
      setTimeout(() => {
        monsterAttack()
      }, 2000)
    }, 1500)
  }

  // Processar defesa do jogador
  const processPlayerDefense = (defenseRoll: number) => {
    if (!currentAction) return

    const defenseBonus = currentAction === ActionType.DEFEND && equipment.shield ? 
      (equipment.shield.stats.defense || 0) : 0

    addToCombatLog(`🛡️ Tentativa de ${currentAction === ActionType.DODGE ? 'esquiva' : 'defesa'}!`)

    // Continuar para o ataque do monstro mas com a defesa considerada
    setTimeout(() => {
      monsterAttackWithDefense(defenseRoll + defenseBonus)
    }, 1000)
  }

  // Ataque do monstro
  const monsterAttack = () => {
    if (currentMonster.hp <= 0) return

    addToCombatLog(`⚔️ ${currentMonster.name} está atacando! Escolha esquivar ou defender!`)
    
    // Mudar para fase de defesa do jogador
    setCombatPhase(CombatPhase.PLAYER_DEFENSE)
    setIsPlayerTurn(true)
    resetDice()
  }

  // Ataque do monstro com consideração da defesa
  const monsterAttackWithDefense = (playerDefense: number) => {
    // O monstro rola o mesmo tipo de dado que o jogador usou para defesa
    const diceType = currentAction === ActionType.DODGE ? 20 : 12
    const monsterRoll = rollDice(diceType, 0, currentMonster.name)
    
    if (monsterRoll.total > playerDefense) {
      const baseDamage = Math.max(1, currentMonster.attack + Math.floor(monsterRoll.total / 2) - character.defense)
      addToCombatLog(`💔 O ataque passou! Você recebeu ${baseDamage} de dano!`)
      
      const newPlayerHp = Math.max(0, playerHp - baseDamage)
      setPlayerHp(newPlayerHp)

      if (newPlayerHp <= 0) {
        addToCombatLog(`💀 Você foi derrotado!`)
        setTimeout(() => {
          onCombatEnd(false)
        }, 2000)
        return
      }
    } else {
      addToCombatLog(`✅ ${currentAction === ActionType.DODGE ? 'Esquiva' : 'Defesa'} bem-sucedida!`)
      if (currentAction === ActionType.DEFEND && equipment.shield) {
        reduceDurability('shield', 1)
      }
    }

    // Retornar turno ao jogador
    setTimeout(() => {
      setIsPlayerTurn(true)
      setCombatPhase(CombatPhase.WAITING)
      resetDice()
    }, 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-amber-50 border-4 border-amber-800 rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="bg-amber-800 text-amber-100 p-4 rounded-t-lg flex justify-between items-center">
          <h2 className="text-xl font-bold">⚔️ Combate Clássico RPG</h2>
          <button
            onClick={onClose}
            className="text-amber-200 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex">
          {/* Combat Area */}
          <div className="flex-1 flex flex-col">
            {/* Status Panels */}
            <div className="bg-amber-100 border-b-2 border-amber-800 p-4 flex justify-between">
              {/* Player Status */}
              <div className="bg-green-100 border-2 border-green-600 rounded-lg p-3 flex-1 mr-2">
                <h3 className="font-bold text-green-800 mb-2">{character.name}</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>HP:</span>
                    <span className="font-bold text-red-600">{playerHp}/{character.maxHp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>MP:</span>
                    <span className="font-bold text-blue-600">{playerMp}/{character.maxMp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ATK:</span>
                    <span className="font-bold">{character.attack}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DEF:</span>
                    <span className="font-bold">{character.defense}</span>
                  </div>
                </div>
              </div>

              {/* Monster Status */}
              <div className="bg-red-100 border-2 border-red-600 rounded-lg p-3 flex-1 ml-2">
                <h3 className="font-bold text-red-800 mb-2">{currentMonster.name}</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>HP:</span>
                    <span className="font-bold text-red-600">{currentMonster.hp}/{currentMonster.maxHp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ATK:</span>
                    <span className="font-bold">{currentMonster.attack}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>DEF:</span>
                    <span className="font-bold">{currentMonster.defense}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Level:</span>
                    <span className="font-bold">{currentMonster.level}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Combat Log */}
            <div className="flex-1 bg-amber-50 p-4 overflow-hidden min-h-0">
              <div className="bg-white border-2 border-amber-600 rounded-lg p-4 h-full flex flex-col min-h-0">
                <h3 className="font-bold text-amber-800 mb-2 text-center flex-shrink-0">📜 Registro de Combate</h3>
                <div 
                  ref={chatLogRef}
                  className="flex-1 space-y-1 text-sm font-mono overflow-y-auto combat-chat-scroll pr-2 min-h-0"
                  style={{ maxHeight: '400px' }}
                >
                  {combatLog.map((log, index) => (
                    <div key={index} className="text-amber-900 leading-relaxed">
                      {log}
                    </div>
                  ))}
                  {/* Elemento invisível para forçar scroll */}
                  <div ref={(el) => {
                    if (el && combatLog.length > 0) {
                      el.scrollIntoView({ behavior: 'smooth' })
                    }
                  }} />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-amber-100 border-t-2 border-amber-800 p-4">
              {combatPhase === CombatPhase.WAITING && isPlayerTurn ? (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handlePlayerAction(ActionType.LIGHT_ATTACK)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    👊 Ataque Leve
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.HEAVY_ATTACK)}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    ⚔️ Ataque Pesado
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.SPECIAL_ATTACK)}
                    disabled={playerMp < 15}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    ✨ Especial (15 MP)
                  </button>
                </div>
              ) : combatPhase === CombatPhase.PLAYER_DEFENSE && isPlayerTurn ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePlayerAction(ActionType.DODGE)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    🏃 Esquivar
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.DEFEND)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    🛡️ Defender
                  </button>
                </div>
              ) : (
                <div className="text-center text-amber-800 font-bold">
                  {combatPhase === CombatPhase.PLAYER_ATTACK ? '⚔️ Executando ataque...' :
                   combatPhase === CombatPhase.PLAYER_DEFENSE && !isPlayerTurn ? '🛡️ Processando defesa...' :
                   '⏳ Aguardando...'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dice Panel */}
        <div className="bg-amber-800 p-4 rounded-b-lg">
          <h3 className="text-amber-100 font-bold text-center mb-3">🎲 Dados Clássicos RPG</h3>
          <div className="flex justify-center space-x-4">
            <DiceComponent
              sides={4}
              enabled={enabledDice.includes(4)}
              onRoll={() => handleDiceRoll(4)}
              isRolling={isRollingDice[4] || false}
              lastRoll={diceRolls[4] || null}
            />
            <DiceComponent
              sides={6}
              enabled={enabledDice.includes(6)}
              onRoll={() => handleDiceRoll(6)}
              isRolling={isRollingDice[6] || false}
              lastRoll={diceRolls[6] || null}
            />
            <DiceComponent
              sides={8}
              enabled={enabledDice.includes(8)}
              onRoll={() => handleDiceRoll(8)}
              isRolling={isRollingDice[8] || false}
              lastRoll={diceRolls[8] || null}
            />
            <DiceComponent
              sides={10}
              enabled={enabledDice.includes(10)}
              onRoll={() => handleDiceRoll(10)}
              isRolling={isRollingDice[10] || false}
              lastRoll={diceRolls[10] || null}
            />
            <DiceComponent
              sides={12}
              enabled={enabledDice.includes(12)}
              onRoll={() => handleDiceRoll(12)}
              isRolling={isRollingDice[12] || false}
              lastRoll={diceRolls[12] || null}
            />
            <DiceComponent
              sides={20}
              enabled={enabledDice.includes(20)}
              onRoll={() => handleDiceRoll(20)}
              isRolling={isRollingDice[20] || false}
              lastRoll={diceRolls[20] || null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
