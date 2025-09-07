'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import CombatConsumablesDialog from './CombatConsumablesDialog'
import { 
  calculateCombatStats, 
  rollDiceWithCrit, 
  processCombatRound,
  generateCombatNarrative 
} from '@/lib/enhancedCombatSystem'

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
  onCombatEnd: (victory: boolean, rewards?: CombatRewards, finalHp?: number, finalMp?: number) => void
  characterId?: string
  onStaminaUpdate?: (stamina: number) => void
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
  onCombatEnd,
  characterId,
  onStaminaUpdate
}: ClassicRPGCombatDialogProps) {
  const [currentMonster, setCurrentMonster] = useState<Monster>(monster)
  const [playerHp, setPlayerHp] = useState(character.hp)
  const [playerMp, setPlayerMp] = useState(character.mp)
  const [playerStamina, setPlayerStamina] = useState((character as any).stamina || 100)
  const [combatLog, setCombatLog] = useState<string[]>([])
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [equipment, setEquipment] = useState(character.equipment)
  const [combatPhase, setCombatPhase] = useState<CombatPhase>(CombatPhase.WAITING)
  const [isConsumablesDialogOpen, setIsConsumablesDialogOpen] = useState(false)
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null)
  const [diceRolls, setDiceRolls] = useState<{[key: number]: { roll: number; modifier: number; total: number } | null}>({})
  const [isRollingDice, setIsRollingDice] = useState<{[key: number]: boolean}>({})
  const [enabledDice, setEnabledDice] = useState<number[]>([])
  const [lastAttackDice, setLastAttackDice] = useState<number | null>(null) // Rastrear último dado de ataque usado
  
  // Custos de stamina por ação
  const STAMINA_COSTS = {
    [ActionType.LIGHT_ATTACK]: 1,
    [ActionType.HEAVY_ATTACK]: 2,
    [ActionType.SPECIAL_ATTACK]: 4,
    [ActionType.DODGE]: 1,
    [ActionType.DEFEND]: 1,
    [ActionType.USE_ITEM]: 0
  }
  
  // Atualizar HP/MP do personagem quando character mudar (ex: stamina update)
  // Mas NÃO durante o combate para não resetar dano/consumo de MP
  useEffect(() => {
    if (isOpen && character && combatLog.length <= 1) { // Só no início do combate
      console.log('🔄 Inicializando stats do personagem - HP:', character.hp, 'MP:', character.mp)
      setPlayerHp(character.hp)
      setPlayerMp(character.mp)
    }
  }, [character, isOpen, combatLog.length])

  // Debug dos estados
  useEffect(() => {
    console.log('🎯 DEBUG: enabledDice mudou para:', enabledDice)
  }, [enabledDice])
  
  useEffect(() => {
    console.log('🎯 DEBUG: combatLog mudou - agora tem', combatLog.length, 'mensagens')
  }, [combatLog])
  
  // Função para consumir stamina
  const consumeStamina = async (cost: number): Promise<boolean> => {
    if (!characterId || cost === 0) return true
    
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
      if (result.character) {
        setPlayerStamina(result.character.stamina)
        if (onStaminaUpdate) {
          onStaminaUpdate(result.character.stamina)
        }
      }
      
      return true
    } catch (error) {
      return false
    }
  }
  
  // Ref para o container do chat
  const chatLogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      console.log('🚀 Combat dialog initialized')
      setCurrentMonster(monster)
      setPlayerHp(character.hp)
      setPlayerMp(character.mp)
      // Só inicializar o log se estiver vazio (para não resetar durante o combate)
      setCombatLog(prev => prev.length === 0 ? [`⚔️ Combate iniciado contra ${monster.name}!`] : prev)
      setIsPlayerTurn(true)
      setCombatPhase(CombatPhase.WAITING)
      console.log('✅ Combat initialization complete')
      resetDice()
    }
  }, [isOpen, monster])

  // Auto-scroll do chat quando nova mensagem é adicionada
  useEffect(() => {
    const scrollToBottom = () => {
      if (chatLogRef.current) {
        const element = chatLogRef.current
        element.scrollTop = element.scrollHeight
        console.log('Scroll executado:', element.scrollHeight, element.scrollTop) // Debug
      }
    }
    
    if (combatLog.length > 0) {
      // Múltiplas tentativas para garantir que funcione
      setTimeout(scrollToBottom, 0)
      setTimeout(scrollToBottom, 100)
      requestAnimationFrame(scrollToBottom)
      requestAnimationFrame(() => setTimeout(scrollToBottom, 50))
    }
  }, [combatLog])

  const resetDice = () => {
    setDiceRolls({})
    setIsRollingDice({})
    setEnabledDice([])
    setCurrentAction(null)
  }

  // Função para usar consumíveis
  const handleUseConsumable = (item: any) => {
    console.log('🧪 Usando consumível:', item.name, 'stats:', item.stats)
    
    const itemName = item.name.toLowerCase()
    const stats = item.stats || {}
    
    // Usar dados estruturados dos stats primeiro, depois fallback para nome
    if (stats.healAmount || itemName.includes('vida') || itemName.includes('health') || itemName.includes('hp')) {
      const healAmount = Math.min(stats.healAmount || 50, character.hp - playerHp)
      setPlayerHp(prev => Math.min(prev + (stats.healAmount || 50), character.hp))
      addToCombatLog(`🧪 Usou ${item.name}! Recuperou ${healAmount} HP!`)
      
      // Se também tiver mana (elixires)
      if (stats.manaAmount) {
        const restoreAmount = Math.min(stats.manaAmount, character.mp - playerMp)
        setPlayerMp(prev => Math.min(prev + stats.manaAmount, character.mp))
        addToCombatLog(`✨ Também recuperou ${restoreAmount} MP!`)
      }
    } else if (stats.manaAmount || itemName.includes('mana') || itemName.includes('mp')) {
      const restoreAmount = Math.min(stats.manaAmount || 30, character.mp - playerMp)
      setPlayerMp(prev => Math.min(prev + (stats.manaAmount || 30), character.mp))
      addToCombatLog(`🧪 Usou ${item.name}! Recuperou ${restoreAmount} MP!`)
    } else if (stats.staminaAmount || itemName.includes('stamina')) {
      // Para poções de stamina, só mostrar mensagem (stamina é gerenciada pelo servidor)
      addToCombatLog(`🧪 Usou ${item.name}! Restaurou ${stats.staminaAmount || 20} Stamina!`)
    } else if (stats.attackBonus) {
      // Buff de força
      addToCombatLog(`🧪 Usou ${item.name}! Ataque aumentado por ${stats.duration || 3} turnos!`)
      // TODO: Implementar sistema de buffs temporários
    } else if (stats.defenseBonus) {
      // Buff de defesa
      addToCombatLog(`🧪 Usou ${item.name}! Defesa aumentada por ${stats.duration || 3} turnos!`)
      // TODO: Implementar sistema de buffs temporários
    } else if (stats.dodgeBonus) {
      // Buff de agilidade
      addToCombatLog(`🧪 Usou ${item.name}! Chance de esquiva aumentada por ${stats.duration || 3} turnos!`)
      // TODO: Implementar sistema de buffs temporários
    } else {
      // Item genérico
      addToCombatLog(`🧪 Usou ${item.name}! Recebeu efeito especial!`)
    }
    
    // Passar o turno para o monstro
    addToCombatLog(`⏭️ Turno perdido! O monstro vai atacar...`)
    
    setTimeout(() => {
      monsterAttack()
    }, 1500)
  }

  const addToCombatLog = useCallback((message: string) => {
    console.log('📝 Adding to combat log:', message)
    setCombatLog(prev => {
      const newLog = [...prev, message]
      console.log('📝 New log length:', newLog.length)
      
      // Scroll imediato após adicionar mensagem
      setTimeout(() => {
        if (chatLogRef.current) {
          chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
          console.log('Scroll direto na função:', chatLogRef.current.scrollHeight) // Debug
        }
      }, 10)
      
      return newLog
    })
  }, [])

  // Mapeamento de ações para dados (base)
  const BASE_ACTION_DICE: Record<ActionType, number> = {
    [ActionType.LIGHT_ATTACK]: 6,
    [ActionType.HEAVY_ATTACK]: 10,
    [ActionType.SPECIAL_ATTACK]: 20,
    [ActionType.DODGE]: 6, // Será substituído pelo último dado de ataque
    [ActionType.DEFEND]: 6, // Será substituído pelo último dado de ataque
    [ActionType.USE_ITEM]: 4
  }

  // Função para obter o dado correto para uma ação
  const getActionDice = (action: ActionType): number => {
    if ([ActionType.DODGE, ActionType.DEFEND].includes(action) && lastAttackDice) {
      console.log(`🎯 DEBUG: Usando dado ${lastAttackDice} para ${action === ActionType.DODGE ? 'esquiva' : 'defesa'} (baseado no último ataque)`)
      return lastAttackDice // Usar o mesmo dado do último ataque
    }
    const dice = BASE_ACTION_DICE[action]
    console.log(`🎯 DEBUG: Usando dado padrão ${dice} para ação ${action}`)
    return dice
  }

  // Função para rolar dados com sistema de crítico aprimorado
  const rollDice = (sides: number, modifier: number = 0, entityName: string = 'Personagem') => {
    const diceResult = rollDiceWithCrit(sides, modifier);
    
    const rollMessage = `${entityName}: Rolou d${sides} = ${diceResult.roll}${diceResult.isMaxRoll ? ' (MAX!)' : ''} + (${modifier}) = ${diceResult.total}`;
    
    setCombatLog(prev => [...prev, rollMessage]);
    
    return { 
      roll: diceResult.roll, 
      modifier: diceResult.modifier, 
      total: diceResult.total,
      isMaxRoll: diceResult.isMaxRoll 
    };
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
  const handlePlayerAction = async (action: ActionType) => {
    console.log('🎯 handlePlayerAction called with:', action)
    
    // Permitir ações tanto na fase WAITING quanto na PLAYER_DEFENSE
    const allowedPhases = [CombatPhase.WAITING, CombatPhase.PLAYER_DEFENSE]
    if (!isPlayerTurn || !allowedPhases.includes(combatPhase)) {
      console.log('❌ Action blocked - not player turn or wrong phase')
      return
    }

    console.log('✅ Action allowed, processing...')

    const mpCost = action === ActionType.SPECIAL_ATTACK ? 15 : 0
    const staminaCost = STAMINA_COSTS[action]
    
    console.log('Costs:', { mpCost, staminaCost })
    
    if (mpCost > 0 && playerMp < mpCost) {
      addToCombatLog(`❌ MP insuficiente para ataque especial! (${mpCost} MP necessário)`)
      return
    }

    // Consumir stamina ANTES de executar a ação
    if (staminaCost > 0) {
      console.log('🔥 Consuming stamina...')
      const canUseStamina = await consumeStamina(staminaCost)
      if (!canUseStamina) {
        addToCombatLog(`❌ Stamina insuficiente para esta ação! (${staminaCost} stamina necessária)`)
        return
      }
      addToCombatLog(`⚡ -${staminaCost} Stamina`)
      console.log('✅ Stamina consumed successfully')
    }

    if (mpCost > 0) {
      setPlayerMp(prev => prev - mpCost)
      addToCombatLog(`🔮 -${mpCost} MP`)
    }

    console.log('🎲 Setting up action and dice...')
    setCurrentAction(action)
    
    // Determinar que ações são de ataque (fase do jogador) ou defesa (fase de defesa)
    if ([ActionType.DODGE, ActionType.DEFEND].includes(action)) {
      setCombatPhase(CombatPhase.PLAYER_DEFENSE)
    } else {
      setCombatPhase(CombatPhase.PLAYER_ATTACK)
    }
    
    const diceType = getActionDice(action)
    console.log('🎯 DEBUG: Dice type calculado:', diceType)
    console.log('🎯 DEBUG: Estado atual enabledDice antes de setar:', enabledDice)
    console.log('🎯 DEBUG: Estado atual combatLog antes de setar dados:', combatLog.length, 'mensagens')
    setEnabledDice([diceType])
    console.log('🎯 DEBUG: setEnabledDice executado com:', [diceType])
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
    console.log('✅ Action processing complete')
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

    // Calcular stats de combate para ambos os personagens
    const playerStats = calculateCombatStats(character);
    const monsterStats = calculateCombatStats(currentMonster);

    // Salvar o dado usado neste ataque para uso posterior em defesa/esquiva
    if ([ActionType.LIGHT_ATTACK, ActionType.HEAVY_ATTACK, ActionType.SPECIAL_ATTACK].includes(currentAction)) {
      const attackDice = getActionDice(currentAction)
      setLastAttackDice(attackDice)
      console.log('🎯 DEBUG: Salvando dado de ataque para defesa/esquiva:', attackDice)
    }

    // Determinar tipo de ataque
    const attackTypeMap: { [key: string]: 'light' | 'heavy' | 'special' } = {
      [ActionType.LIGHT_ATTACK]: 'light',
      [ActionType.HEAVY_ATTACK]: 'heavy',
      [ActionType.SPECIAL_ATTACK]: 'special'
    };
    const attackType = attackTypeMap[currentAction];

    // Criar roll do dado do jogador
    const playerDiceRoll = {
      roll: diceRolls[getActionDice(currentAction)]?.roll || playerRoll,
      modifier: 0,
      total: playerRoll,
      isMaxRoll: diceRolls[getActionDice(currentAction)]?.roll === getActionDice(currentAction)
    };

    // Auto-rolar para o monstro defender após delay
    setTimeout(() => {
      const attackDice = getActionDice(currentAction!)
      console.log('🎯 DEBUG: Monstro rolando para se defender usando mesmo dado do ataque do jogador:', attackDice)
      const monsterRoll = rollDice(attackDice, 0, monster.name)
      setDiceRolls(prev => ({ ...prev, [attackDice]: monsterRoll }))

      // Criar roll do dado do monstro (sempre assume bloqueio como defesa padrão)
      const monsterDiceRoll = {
        roll: monsterRoll.roll,
        modifier: monsterRoll.modifier,
        total: monsterRoll.total,
        isMaxRoll: monsterRoll.isMaxRoll || false
      };

      // Processar combate completo com o novo sistema
      const combatResult = processCombatRound(
        character,
        currentMonster,
        attackType,
        'block', // Monstro sempre tenta bloquear por padrão
        playerDiceRoll,
        monsterDiceRoll
      );

      // Gerar narrativa do combate
      const narrative = generateCombatNarrative(character.name, currentMonster.name, currentAction, combatResult);
      addToCombatLog(narrative);

      // Mostrar detalhes do resultado
      if (combatResult.actualDamage > 0) {
        addToCombatLog(`💥 Dano final: ${combatResult.actualDamage}${combatResult.isCritical ? ' (CRÍTICO!)' : ''}`);
        
        // Mostrar stats de combate para debug/transparência
        addToCombatLog(`📊 Stats: CRIT ${playerStats.crit.toFixed(1)}% | SPEED ${playerStats.speed.toFixed(1)}`);
      }

      // Aplicar dano
      const newMonsterHp = Math.max(0, currentMonster.hp - combatResult.actualDamage)
      setCurrentMonster(prev => ({ ...prev, hp: newMonsterHp }))

      // Reduzir durabilidade de equipamentos baseado no tipo de ataque
      if (equipment.weapon) {
        const durabilityLoss = attackType === 'special' ? 3 : attackType === 'heavy' ? 2 : 1;
        reduceDurability('weapon', durabilityLoss);
      }

      if (newMonsterHp <= 0) {
        addToCombatLog(`🎉 Você derrotou ${currentMonster.name}!`)
        addToCombatLog(`💰 +${currentMonster.goldReward} Gold, +${currentMonster.xpReward} XP`)
        
        setTimeout(() => {
          onCombatEnd(true, {
            gold: currentMonster.goldReward,
            xp: currentMonster.xpReward
          }, playerHp, playerMp)
        }, 2000)
        return
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

    // Calcular stats de combate
    const playerStats = calculateCombatStats(character);
    const monsterStats = calculateCombatStats(currentMonster);

    const isDoging = currentAction === ActionType.DODGE;
    const actionName = isDoging ? 'esquiva' : 'defesa';
    
    // Adicionar bônus de equipamento para defesa
    const shieldBonus = currentAction === ActionType.DEFEND && equipment.shield ? 
      (equipment.shield.stats.defense || 0) : 0;

    addToCombatLog(`🛡️ Tentativa de ${actionName}!`);

    // Criar dados para simulação de combate
    const playerDiceRoll = {
      roll: defenseRoll,
      modifier: 0,
      total: defenseRoll,
      isMaxRoll: false // Para defesa não há crítico
    };

    // Mostrar modificadores
    if (isDoging) {
      addToCombatLog(`🌪️ Usando SPEED ${playerStats.speed.toFixed(1)} para esquiva`);
    } else {
      addToCombatLog(`🛡️ Usando RES ${playerStats.res} + Escudo ${shieldBonus} para defesa`);
    }

    // Continuar para o ataque do monstro mas com a defesa considerada
    setTimeout(() => {
      monsterAttackWithDefense(defenseRoll, playerStats, isDoging, shieldBonus)
    }, 1000)
  }

  // Ataque do monstro
  const monsterAttack = () => {
    if (currentMonster.hp <= 0) return

    // Determinar tipo de ataque do monstro (aleatório) e salvar o dado para defesa/esquiva
    const attackTypes = [
      { type: 'light', dice: 6, name: 'ataque rápido' },
      { type: 'heavy', dice: 10, name: 'ataque pesado' },
      { type: 'special', dice: 20, name: 'ataque especial' }
    ]
    
    const randomAttack = attackTypes[Math.floor(Math.random() * attackTypes.length)]
    setLastAttackDice(randomAttack.dice)
    console.log('🎯 DEBUG: Monstro vai usar', randomAttack.name, 'com dado', randomAttack.dice)

    addToCombatLog(`⚔️ ${currentMonster.name} está preparando um ${randomAttack.name}! Escolha esquivar ou defender!`)
    
    // Mudar para fase de defesa do jogador
    setCombatPhase(CombatPhase.PLAYER_DEFENSE)
    setIsPlayerTurn(true)
    resetDice()
  }

  // Ataque do monstro com consideração da defesa aprimorada
  const monsterAttackWithDefense = (playerDefenseRoll: number, playerStats: any, isDodging: boolean, shieldBonus: number) => {
    // O monstro rola o mesmo tipo de dado que foi definido para seu ataque
    const diceType = lastAttackDice || 6 // fallback para d6 se não houver dado salvo
    console.log('🎯 DEBUG: Monstro rolando dado', diceType, 'contra defesa do jogador', playerDefenseRoll)
    const monsterRoll = rollDice(diceType, 0, currentMonster.name)
    
    // Determinar tipo de ataque do monstro baseado no dado
    const attackType = diceType === 20 ? 'special' : diceType === 10 ? 'heavy' : 'light';
    
    // Criar dados para simulação
    const monsterDiceRoll = {
      roll: monsterRoll.roll,
      modifier: monsterRoll.modifier,
      total: monsterRoll.total,
      isMaxRoll: monsterRoll.isMaxRoll || false
    };

    const playerDiceRoll = {
      roll: playerDefenseRoll,
      modifier: 0,
      total: playerDefenseRoll,
      isMaxRoll: false
    };

    // Processar combate com defesa específica
    const defenseAction = isDodging ? 'dodge' : 'block';
    const combatResult = processCombatRound(
      currentMonster,
      character,
      attackType,
      defenseAction,
      monsterDiceRoll,
      playerDiceRoll
    );

    // Gerar narrativa
    const narrative = generateCombatNarrative(currentMonster.name, character.name, attackType, combatResult);
    addToCombatLog(narrative);

    if (combatResult.actualDamage > 0) {
      addToCombatLog(`💔 Você recebeu ${combatResult.actualDamage} de dano!`);
      
      const newPlayerHp = Math.max(0, playerHp - combatResult.actualDamage)
      setPlayerHp(newPlayerHp)

      if (newPlayerHp <= 0) {
        addToCombatLog(`💀 Você foi derrotado!`)
        setTimeout(() => {
          onCombatEnd(false, undefined, newPlayerHp, playerMp)
        }, 2000)
        return
      }
    } else {
      if (combatResult.dodgeSuccess) {
        addToCombatLog(`🌪️ Esquiva perfeita! Usando SPEED ${playerStats.speed.toFixed(1)}`);
      } else if (combatResult.blockSuccess) {
        addToCombatLog(`🛡️ Bloqueio perfeito! Usando RES ${playerStats.res} + Escudo ${shieldBonus}`);
      }
    }

    // Voltar para a fase de espera do jogador
    setCombatPhase(CombatPhase.WAITING)
    setIsPlayerTurn(true)
    resetDice()
  }

  // Função auxiliar para atualizar stamina do personagem
  const handleStaminaUpdate = async (newStamina: number) => {
    try {
      const response = await fetch(`/api/character/${characterId}/update-stamina`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stamina: newStamina }),
      })

      if (!response.ok) {
        console.error('Failed to update stamina')
      }
    } catch (error) {
      console.error('Error updating stamina:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2">
      <div className="bg-surface/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark text-white p-3 rounded-t-2xl flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-bold">⚔️ Combate Clássico RPG</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Status Panels - Mais compacto */}
          <div className="bg-background/30 border-b border-white/10 p-3 flex justify-between flex-shrink-0">
            {/* Player Status */}
            <div className="bg-gradient-to-br from-success/20 to-success/10 border border-success/30 rounded-xl p-3 flex-1 mr-3 backdrop-blur-sm">
              <h3 className="font-bold text-success mb-2 text-sm">{character.name}</h3>
              <div className="grid grid-cols-3 gap-1 text-xs">
                <div className="text-text-secondary">HP: <span className="font-bold text-error">{playerHp}/{character.maxHp}</span></div>
                <div className="text-text-secondary">MP: <span className="font-bold text-blue-400">{playerMp}/{character.maxMp}</span></div>
                <div className="text-text-secondary">⚡: <span className="font-bold text-warning">{playerStamina}</span></div>
                <div className="text-text-secondary">ATK: <span className="font-bold text-text-primary">{character.attack}</span></div>
                <div className="text-text-secondary">DEF: <span className="font-bold text-text-primary">{character.defense}</span></div>
                <div className="text-text-secondary">LVL: <span className="font-bold text-primary">{character.level}</span></div>
                
                {/* Novos stats baseados em combate aprimorado */}
                {(() => {
                  const playerStats = calculateCombatStats(character);
                  return (
                    <>
                      <div className="text-text-secondary">STR: <span className="font-bold text-yellow-400">{playerStats.str}</span></div>
                      <div className="text-text-secondary">AGI: <span className="font-bold text-cyan-400">{playerStats.agi}</span></div>
                      <div className="text-text-secondary">INT: <span className="font-bold text-purple-400">{playerStats.int}</span></div>
                      <div className="text-text-secondary">RES: <span className="font-bold text-green-400">{playerStats.res}</span></div>
                      <div className="text-text-secondary">CRIT: <span className="font-bold text-yellow-300">{playerStats.crit.toFixed(1)}%</span></div>
                      <div className="text-text-secondary">SPD: <span className="font-bold text-emerald-400">{playerStats.speed.toFixed(1)}</span></div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Monster Status */}
            <div className="bg-gradient-to-br from-error/20 to-error/10 border border-error/30 rounded-xl p-3 flex-1 ml-3 backdrop-blur-sm">
              <h3 className="font-bold text-error mb-2 text-sm">{currentMonster.name}</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-text-secondary">HP: <span className="font-bold text-error">{currentMonster.hp}/{currentMonster.maxHp}</span></div>
                <div className="text-text-secondary">Level: <span className="font-bold text-text-primary">{currentMonster.level}</span></div>
                <div className="text-text-secondary">ATK: <span className="font-bold text-text-primary">{currentMonster.attack}</span></div>
                <div className="text-text-secondary">DEF: <span className="font-bold text-text-primary">{currentMonster.defense}</span></div>
              </div>
            </div>
          </div>

          {/* Combat Area - Layout horizontal */}
          <div className="flex-1 flex min-h-0">
            {/* Combat Log - Ocupa mais espaço */}
            <div className="flex-1 bg-background/20 p-4">
              <div className="bg-background/50 backdrop-blur-xl border border-white/10 rounded-xl p-4 h-full">
                <h3 className="font-bold text-text-primary mb-3 text-center text-sm">📜 Registro de Combate</h3>
                <div 
                  ref={chatLogRef}
                  className="h-64 overflow-y-auto combat-chat-scroll p-3 space-y-2 bg-surface/30 rounded-lg border border-white/5"
                  style={{ maxHeight: '280px' }}
                >
                  {combatLog.map((log, index) => {
                    if (index === 0) {
                      console.log('🎯 DEBUG: Renderizando combatLog com', combatLog.length, 'mensagens')
                    }
                    return (
                      <div key={index} className="text-text-secondary text-xs leading-relaxed">
                        {log}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Action Buttons - Lateral direita */}
            <div className="w-64 bg-surface/30 p-4 flex flex-col">
              <h3 className="font-bold text-text-primary mb-3 text-sm text-center">🎯 Ações</h3>
              
              {combatPhase === CombatPhase.WAITING && isPlayerTurn ? (
                <div className="space-y-2 flex-1">
                  {/* Botões de Ataque */}
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => handlePlayerAction(ActionType.LIGHT_ATTACK)}
                      className="bg-gradient-to-r from-warning to-yellow-500 hover:from-yellow-500 hover:to-warning text-white px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                    >
                      👊 Ataque Leve (1⚡)
                    </button>
                    <button
                      onClick={() => handlePlayerAction(ActionType.HEAVY_ATTACK)}
                      className="bg-gradient-to-r from-error to-red-600 hover:from-red-600 hover:to-error text-white px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                    >
                      ⚔️ Ataque Pesado (2⚡)
                    </button>
                    <button
                      onClick={() => handlePlayerAction(ActionType.SPECIAL_ATTACK)}
                      disabled={playerMp < 15}
                      className="bg-gradient-to-r from-primary to-primary-dark hover:shadow-lg hover:shadow-primary/25 disabled:from-gray-600 disabled:to-gray-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 transform hover:scale-[1.02] shadow-lg disabled:hover:scale-100"
                    >
                      ✨ Especial (15🔮 4⚡)
                    </button>
                  </div>
                  
                  {/* Separador */}
                  <div className="border-t border-white/10 my-3"></div>
                  
                  {/* Botões de Ação Especial */}
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => {
                        console.log('🧪 DEBUG: Botão Consumíveis clicado')
                        console.log('🧪 DEBUG: characterId:', characterId)
                        console.log('🧪 DEBUG: Abrindo dialog de consumíveis...')
                        setIsConsumablesDialogOpen(true)
                      }}
                      className="bg-gradient-to-r from-success to-emerald-600 hover:from-emerald-600 hover:to-success text-white px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                    >
                      🧪 Consumíveis
                    </button>
                    <button
                      disabled={true}
                      className="bg-gradient-to-r from-accent to-indigo-800 opacity-50 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 shadow-lg cursor-not-allowed"
                      title="Em desenvolvimento"
                    >
                      🔮 Transformação
                    </button>
                  </div>
                </div>
              ) : combatPhase === CombatPhase.PLAYER_DEFENSE && isPlayerTurn ? (
                <div className="grid grid-cols-1 gap-2 flex-1">
                  <button
                    onClick={() => handlePlayerAction(ActionType.DODGE)}
                    className="bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    🏃 Esquivar (1⚡)
                  </button>
                  <button
                    onClick={() => handlePlayerAction(ActionType.DEFEND)}
                    className="bg-gradient-to-r from-success to-green-700 hover:from-green-600 hover:to-green-800 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200 transform hover:scale-[1.02] shadow-lg"
                  >
                    🛡️ Defender (1⚡)
                  </button>
                </div>
              ) : (
                <div className="text-center text-text-secondary font-bold text-xs flex-1 flex items-center justify-center">
                  {combatPhase === CombatPhase.PLAYER_ATTACK ? '⚔️ Executando ataque...' :
                   combatPhase === CombatPhase.PLAYER_DEFENSE && !isPlayerTurn ? '🛡️ Processando defesa...' :
                   '⏳ Aguardando...'}
                </div>
              )}
            </div>
          </div>

          {/* Dice Panel - Fixo na parte inferior */}
          <div className="bg-gradient-to-br from-surface/95 to-background/90 backdrop-blur-md border-t border-white/10 p-3 flex-shrink-0">
            <h3 className="text-text-primary font-bold text-center mb-2 text-sm">🎲 Dados Clássicos RPG</h3>
            <div className="flex justify-center space-x-3">
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
      
      {/* Dialog de Consumíveis */}
      <CombatConsumablesDialog
        isOpen={isConsumablesDialogOpen}
        onClose={() => setIsConsumablesDialogOpen(false)}
        characterId={characterId || '0'}
        onUseItem={handleUseConsumable}
        currentHp={playerHp}
        maxHp={character.hp}
        currentMp={playerMp}
        maxMp={character.mp}
      />
    </div>
  )
}
