/**
 * 💰 SISTEMA DE STAMINA - Templo de Stamina
 * 
 * Sistema balanceado de monetização ética que oferece conveniência
 * sem criar pay-to-win. Base em análise de dados de engagement.
 */

// � CUSTOS DE STAMINA POR ATIVIDADE
export const STAMINA_COSTS = {
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
    // 🎓 Desenvolvimento
  training: 18,    // Treino de atributos (ajustado)
  exploration: 22, // Exploração de mapas (ajustado)
    crafting: 10,        // Crafting: 10 stamina
    transformation: 8    // Usar transformação: 8 stamina extra
  }
}

// 📊 PROGRESSÃO DE STAMINA POR LEVEL
export const STAMINA_PROGRESSION = {
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

// 💎 SISTEMA PREMIUM - TEMPLO DE STAMINA
export const STAMINA_PREMIUM = {
  // Opções de recarga
  recharge_options: [
    {
      id: 'small_potion',
      name: 'Poção Pequena',
      stamina: 50,
      price_usd: 0.99,
      price_gems: 100,
      cooldown_hours: 2,
      description: '+50 stamina - 2h cooldown'
    },
    {
      id: 'medium_potion', 
      name: 'Poção Média',
      stamina: 100,
      price_usd: 1.99,
      price_gems: 180,
      cooldown_hours: 4,
      description: '+100 stamina - 4h cooldown'
    },
    {
      id: 'large_potion',
      name: 'Poção Grande', 
      stamina: 200,
      price_usd: 3.99,
      price_gems: 350,
      cooldown_hours: 8,
      description: '+200 stamina - 8h cooldown'
    },
    {
      id: 'daily_pass',
      name: 'Passe Diário',
      stamina: 'unlimited_regen',
      price_usd: 4.99,
      price_gems: 500,
      duration_hours: 24,
      description: 'Regeneração ilimitada por 24h'
    }
  ],

  // Limites anti-vício
  limits: {
    max_purchases_per_day: 3,
    max_stamina_cap: 500,          // Não pode passar de 500
    cooldown_between_purchases: 1,  // 1h entre compras
    warning_on_excessive_use: true
  }
}

// 🎮 CENÁRIOS DE USO TÍPICOS
export const USAGE_SCENARIOS = {
  // F2P Satisfatório
  free_to_play: {
    morning: [
      { activity: 'pvp_basic', count: 3, stamina: 66 },    // 3 lutas básicas
      { activity: 'training', count: 1, stamina: 15 }      // 1 treino
    ],
    afternoon: [
      { activity: 'dungeon_normal', count: 2, stamina: 50 } // 2 dungeons
    ],
    evening: [
      { activity: 'pvp_basic', count: 2, stamina: 44 },    // 2 lutas
      { activity: 'exploration', count: 1, stamina: 20 }   // 1 exploração
    ],
    total_stamina: 195,
    remaining: 5,
    satisfaction: "Bom - consegue fazer tudo que quer"
  },

  // Premium Engaged
  premium: {
    base_activities: 195,  // Mesmo do F2P
    bonus_with_potion: 100, // +100 stamina = +4 atividades
    total_activities: 12,
    satisfaction: "Excelente - pode jogar o dobro!",
    conversion_appeal: "Vale a pena para quem joga bastante"
  }
}

// 🔧 FUNÇÕES UTILITÁRIAS
export function calculateStaminaForLevel(level: number): number {
  const baseStamina = 200
  const levelBonus = level * 10
  const agiBonus = 0 // Será calculado no character factory
  
  return baseStamina + levelBonus + agiBonus
}

export function getStaminaCost(activity: string, difficulty?: string): number {
  const [category, type] = activity.split('_')
  
  if (STAMINA_COSTS[category as keyof typeof STAMINA_COSTS] && 
      STAMINA_COSTS[category as keyof typeof STAMINA_COSTS][type as keyof typeof STAMINA_COSTS[keyof typeof STAMINA_COSTS]]) {
    return STAMINA_COSTS[category as keyof typeof STAMINA_COSTS][type as keyof typeof STAMINA_COSTS[keyof typeof STAMINA_COSTS]]
  }
  
  // Fallback para atividades não mapeadas
  return 20
}

export function canAffordActivity(currentStamina: number, activity: string): boolean {
  const cost = getStaminaCost(activity)
  return currentStamina >= cost
}

export function getRecommendedActivities(stamina: number): string[] {
  const activities = []
  let remainingStamina = stamina
  
  // Priorizar atividades por eficiência de diversão
  const priorities = [
    'pvp_basic',      // 22 stamina - alta diversão
    'dungeon_normal', // 25 stamina - boa recompensa  
    'training',       // 15 stamina - progressão
    'exploration'     // 20 stamina - descoberta
  ]
  
  for (const activity of priorities) {
    const cost = getStaminaCost(activity)
    while (remainingStamina >= cost) {
      activities.push(activity)
      remainingStamina -= cost
    }
  }
  
  return activities
}

// 📈 ANALYTICS IMPORTANTES
export const ANALYTICS_TRACKING = {
  events_to_track: [
    'stamina_depleted',           // Quando stamina chega a 0
    'stamina_purchase_viewed',    // Quando vê opções de compra
    'stamina_purchase_completed', // Quando compra stamina
    'activity_blocked_by_stamina', // Quando não pode fazer atividade
    'daily_stamina_usage',        // Total usado por dia
    'peak_stamina_usage_time'     // Horário de maior uso
  ],
  
  kpis: [
    'average_daily_stamina_usage',
    'stamina_depletion_frequency', 
    'f2p_to_premium_conversion_rate',
    'premium_user_retention_rate',
    'average_revenue_per_stamina_user'
  ]
}

export default {
  STAMINA_COSTS,
  STAMINA_PROGRESSION, 
  STAMINA_PREMIUM,
  USAGE_SCENARIOS,
  calculateStaminaForLevel,
  getStaminaCost,
  canAffordActivity,
  getRecommendedActivities,
  ANALYTICS_TRACKING
}
