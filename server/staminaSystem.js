/**
 * 💰 SISTEMA DE STAMINA - Templo de Stamina (JavaScript Version)
 * 
 * Sistema balanceado de monetização ética que oferece conveniência
 * sem criar pay-to-win. Base em análise de dados de engagement.
 */

// 🎮 CUSTOS DE STAMINA POR ATIVIDADE
const STAMINA_COSTS = {
  // ⚔️ Combates PvP
  pvp: {
    basic: 25,     // Lutas PvP básicas (ajustado para 8 atividades)
    ranked: 35,    // Lutas ranqueadas
    tournament: 50 // Torneios especiais
  },

  // Dungeons - Conteúdo PvE
  dungeon: {
    simple: 18,          // Dungeon simples: 18 stamina
    normal: 25,          // Dungeon normal: 25 stamina
    hard: 35,            // Dungeon difícil: 35 stamina
    raid: 50             // Raid: 50 stamina
  },

  // Outras atividades
  activities: {
    training: 18,    // Treino de atributos (ajustado)
    exploration: 22, // Exploração de mapas (ajustado)
    crafting: 10,        // Crafting: 10 stamina
    transformation: 8    // Usar transformação: 8 stamina extra
  },

  // Transformações específicas
  transformation: {
    dragon: 50,    // Transformação em dragão
    wolf: 35,      // Forma de lobo
    bear: 40,      // Forma de urso  
    eagle: 30      // Forma de águia
  }
}

// 📊 PROGRESSÃO DE STAMINA POR LEVEL
const STAMINA_PROGRESSION = {
  // Novatos (Level 1-5): Foco em aprender
  beginner: {
    baseStamina: 200,
    dailyRegen: 200,     // Regenera 100% por dia
    activitiesPerDay: 8, // 8 atividades/dia
    description: "Stamina generosa para aprender o jogo"
  },

  // Intermediários (Level 6-15): Engajamento
  intermediate: {
    baseStamina: 250,
    dailyRegen: 200,     // Regenera 80% por dia  
    activitiesPerDay: 10,
    description: "Mais stamina conforme evolui"
  },

  // Veteranos (Level 16+): Otimização
  veteran: {
    baseStamina: 300,
    dailyRegen: 200,     // Regenera 66% por dia
    activitiesPerDay: 12,
    description: "Stamina máxima, mas regeneração limitada"
  }
}

// 🔧 FUNÇÕES UTILITÁRIAS
function calculateStaminaForLevel(level) {
  const baseStamina = 200
  const levelBonus = level * 10
  const agiBonus = 0 // Será calculado no character factory
  
  return baseStamina + levelBonus + agiBonus
}

function getStaminaCost(activity, options = {}) {
  // Suporte para diferentes formatos de chamada
  if (typeof options === 'string') {
    // Chamada antiga: getStaminaCost('pvp_basic', 'normal')
    const [category, type] = activity.split('_')
    
    if (STAMINA_COSTS[category] && STAMINA_COSTS[category][type]) {
      return STAMINA_COSTS[category][type]
    }
  } else if (typeof options === 'object' && options !== null) {
    // Chamada nova: getStaminaCost('transformation', { transformationType: 'dragon' })
    if (activity === 'transformation' && options.transformationType) {
      return STAMINA_COSTS.transformation[options.transformationType] || 35
    }
    
    // Chamada: getStaminaCost('pvp', { actionType: 'basic' })
    if (activity === 'pvp' && options.actionType) {
      return STAMINA_COSTS.pvp[options.actionType] || 25
    }
    
    // Tentar parsing padrão
    const [category, type] = activity.split('_')
    if (STAMINA_COSTS[category] && STAMINA_COSTS[category][type]) {
      return STAMINA_COSTS[category][type]
    }
  }
  
  // Fallback para atividades não mapeadas
  return 20
}

function canAffordActivity(currentStamina, activity) {
  const cost = getStaminaCost(activity)
  return currentStamina >= cost
}

function checkStaminaLevel(player, activity) {
  if (!player || typeof player.stamina === 'undefined') {
    return { canAfford: false, cost: 0, current: 0 }
  }
  
  const cost = getStaminaCost(activity)
  const canAfford = player.stamina >= cost
  
  return {
    canAfford,
    cost,
    current: player.stamina,
    remaining: Math.max(0, player.stamina - cost)
  }
}

function calculateStaminaRegeneration(player, hoursElapsed = 24) {
  if (!player || typeof player.maxStamina === 'undefined') {
    return 0
  }
  
  // Regenera 200 stamina por dia (24h)
  const regenPerHour = 200 / 24 // ~8.33 por hora
  const totalRegen = Math.floor(regenPerHour * hoursElapsed)
  
  return Math.min(totalRegen, player.maxStamina - (player.stamina || 0))
}

// Exportar para uso no servidor
module.exports = {
  STAMINA_COSTS,
  STAMINA_PROGRESSION,
  calculateStaminaForLevel,
  getStaminaCost,
  canAffordActivity,
  checkStaminaLevel,
  calculateStaminaRegeneration
}
