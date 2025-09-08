// 🏆 SISTEMA DE RECOMPENSAS PVP - DOLRATH RPG
// Cálculos de balanceamento para progressão diária motivante

/*
📊 ANÁLISE ATUAL DO SISTEMA:

STAMINA POR DIA:
- Level 1-5 (Novatos): 200 stamina/dia, 10 atividades (~20 stamina/luta)
- Level 6-15 (Intermediários): 250 stamina/dia, 12 atividades 
- Level 16+ (Veteranos): 300 stamina/dia, 15 atividades

XP NECESSÁRIA PARA LEVEL UP:
- Level 1 → 2: 150 XP
- Level 2 → 3: 363 XP  
- Level 3 → 4: 615 XP
- Level 4 → 5: 906 XP
- Level 5 → 6: 1,201 XP

OBJETIVO: Garantir pelo menos 1 level por dia usando toda stamina
*/

// 🎯 CONFIGURAÇÃO DE RECOMPENSAS PVP
const PVP_REWARDS_CONFIG = {
  // Recompensas base por resultado
  victory: {
    xpBase: 50,        // 50 XP base por vitória
    goldBase: 15,      // 15 gold base por vitória
    bonusMultiplier: 1.5 // 50% bonus na vitória
  },
  
  defeat: {
    xpBase: 25,        // 25 XP base por derrota (50% da vitória)
    goldBase: 8,       // 8 gold base por derrota
    bonusMultiplier: 1.0 // Sem bonus na derrota
  },
  
  participation: {
    xpBase: 15,        // 15 XP só por participar (mesmo que fuja/desconecte)
    goldBase: 5        // 5 gold mínimo por participação
  },

  // 📈 MULTIPLICADORES POR NÍVEL (para manter relevância)
  levelScaling: {
    xpMultiplier: 1.1,    // +10% XP por nível
    goldMultiplier: 1.08, // +8% gold por nível
    maxScaling: 5.0       // Máximo de 5x multiplier
  },

  // 🎖️ BÔNUS ESPECIAIS 
  specialBonuses: {
    perfectVictory: {     // Vitória sem perder HP
      xpBonus: 1.3,       // +30% XP
      goldBonus: 1.5      // +50% gold
    },
    
    comboVictory: {       // Vitórias consecutivas
      perWin: 0.1,        // +10% por vitória consecutiva
      maxBonus: 1.0       // Máximo +100%
    },
    
    transformationKill: { // Matar oponente transformado
      xpBonus: 1.2,       // +20% XP
      goldBonus: 1.2      // +20% gold
    },
    
    firstWinOfDay: {      // Primeira vitória do dia
      xpBonus: 2.0,       // +100% XP (dobra)
      goldBonus: 1.5      // +50% gold
    }
  },

  // ⚖️ BALANCEAMENTO POR DIFERENÇA DE NÍVEL
  levelDifferenceBalancing: {
    // Vitória contra nível superior = mais XP
    // Vitória contra nível inferior = menos XP
    perLevelDifference: 0.15, // ±15% por nível de diferença
    maxDifference: 10,        // Máximo 10 níveis considerados
    underdog_bonus: 1.5,      // +50% se vencer alguém 5+ níveis acima
    bully_penalty: 0.7        // -30% se vencer alguém 5+ níveis abaixo
  }
}

// 🧮 CÁLCULOS DE PROGRESSÃO GARANTIDA
const DAILY_PROGRESSION_TARGETS = {
  // Meta: garantir pelo menos 1 level por dia com toda stamina gasta
  novice: {
    battles_per_day: 10,     // 200 stamina ÷ 20 = 10 batalhas
    target_xp_per_day: 400,  // Para subir 1 level nos primeiros níveis
    avg_xp_per_battle: 40,   // 400 ÷ 10 batalhas = 40 XP/batalha
    win_rate_assumption: 0.5 // Assumindo 50% win rate
  },
  
  intermediate: {
    battles_per_day: 12,     // 250 stamina ÷ ~20 = 12 batalhas  
    target_xp_per_day: 600,  // Para progression contínua
    avg_xp_per_battle: 50,   // 600 ÷ 12 = 50 XP/batalha
    win_rate_assumption: 0.5
  },
  
  veteran: {
    battles_per_day: 15,     // 300 stamina ÷ 20 = 15 batalhas
    target_xp_per_day: 900,  // Para manter progressão em high level
    avg_xp_per_battle: 60,   // 900 ÷ 15 = 60 XP/batalha  
    win_rate_assumption: 0.5
  }
}

console.log('🎯 Sistema de Recompensas PVP - Análise de Balanceamento')
console.log('='*60)

// Simular recompensas para diferentes cenários
function simulateRewards(playerLevel, isVictory, opponentLevel = null) {
  const config = PVP_REWARDS_CONFIG
  const baseRewards = isVictory ? config.victory : config.defeat
  
  // XP e Gold base
  let xp = baseRewards.xpBase
  let gold = baseRewards.goldBase
  
  // Scaling por nível
  const levelMult = Math.min(
    Math.pow(config.levelScaling.xpMultiplier, playerLevel - 1),
    config.levelScaling.maxScaling
  )
  
  xp = Math.floor(xp * levelMult)
  gold = Math.floor(gold * levelMult * config.levelScaling.goldMultiplier)
  
  // Bônus por diferença de nível (se especificado)
  if (opponentLevel && isVictory) {
    const levelDiff = opponentLevel - playerLevel
    const diffMultiplier = 1 + (levelDiff * config.levelDifferenceBalancing.perLevelDifference)
    
    xp = Math.floor(xp * diffMultiplier)
    gold = Math.floor(gold * diffMultiplier)
    
    // Bônus especiais
    if (levelDiff >= 5) {
      xp = Math.floor(xp * config.levelDifferenceBalancing.underdog_bonus)
      gold = Math.floor(gold * config.levelDifferenceBalancing.underdog_bonus)
    } else if (levelDiff <= -5) {
      xp = Math.floor(xp * config.levelDifferenceBalancing.bully_penalty)
      gold = Math.floor(gold * config.levelDifferenceBalancing.bully_penalty)
    }
  }
  
  return { xp, gold, level: playerLevel }
}

// Testar cenários
console.log('\n📊 Simulação de Recompensas:')
console.log('\nLevel 1 (Novice):')
console.log('  Vitória:', simulateRewards(1, true))
console.log('  Derrota:', simulateRewards(1, false))

console.log('\nLevel 5 (Novice → Intermediate):')
console.log('  Vitória:', simulateRewards(5, true))
console.log('  Derrota:', simulateRewards(5, false))

console.log('\nLevel 10 (Intermediate):')
console.log('  Vitória:', simulateRewards(10, true))
console.log('  Derrota:', simulateRewards(10, false))

console.log('\nLevel 20 (Veteran):')
console.log('  Vitória:', simulateRewards(20, true))
console.log('  Derrota:', simulateRewards(20, false))

// Calcular se as metas são atingidas
console.log('\n🎯 Verificação das Metas de Progressão:')
Object.keys(DAILY_PROGRESSION_TARGETS).forEach(tier => {
  const target = DAILY_PROGRESSION_TARGETS[tier]
  const level = tier === 'novice' ? 3 : tier === 'intermediate' ? 8 : 15
  
  const winRewards = simulateRewards(level, true)
  const lossRewards = simulateRewards(level, false)
  
  const avgXpPerBattle = (winRewards.xp * target.win_rate_assumption) + 
                        (lossRewards.xp * (1 - target.win_rate_assumption))
                        
  const dailyXp = avgXpPerBattle * target.battles_per_day
  
  console.log(`\n${tier.toUpperCase()} (Level ${level}):`)
  console.log(`  Batalhas/dia: ${target.battles_per_day}`)
  console.log(`  XP médio/batalha: ${avgXpPerBattle.toFixed(1)}`)
  console.log(`  XP total/dia: ${dailyXp.toFixed(0)}`)
  console.log(`  Meta: ${target.target_xp_per_day} XP`)
  console.log(`  Status: ${dailyXp >= target.target_xp_per_day ? '✅ META ATINGIDA' : '❌ Ajuste necessário'}`)
})

console.log('\n🎉 Sistema balanceado para garantir progressão motivante!')
console.log('📝 Próximo passo: Implementar no socket-server.js')
