/**
 * 🐉 SISTEMA DE TRANSFORMAÇÃO - Configurações e Mecânicas
 * 
 * Sistema estratégico onde transformações são habilidades limitadas que mudam
 * temporariamente os stats e concedem habilidades especiais.
 */

// Tipos para o sistema de transformação
export type TransformationType = 'dragon' | 'wolf' | 'bear' | 'eagle' | 'seventh_sense' | 'celestial'

// Transformações disponíveis por raça (fonte única usada por API/UI/combate)
export const RACE_TRANSFORMATIONS: Record<string, TransformationType[]> = {
  draconiano: ['dragon'],
  metamorfo: ['wolf', 'bear', 'eagle'],
  humano: ['seventh_sense'],
  elfo: ['celestial'],
}

export function getRaceTransformations(race?: string | null): TransformationType[] {
  return RACE_TRANSFORMATIONS[(race || '').toLowerCase()] || []
}

// 🎨 Cor do brilho do card por forma (usado no combate). hex = cor base do glow.
export const TRANSFORMATION_GLOW: Record<TransformationType, { hex: string; label: string }> = {
  dragon: { hex: '#ef4444', label: 'vermelho dracônico' },      // vermelho/fogo
  wolf: { hex: '#93c5fd', label: 'prata-azulado' },             // prata-azul feral
  bear: { hex: '#d97706', label: 'âmbar' },                     // âmbar/marrom
  eagle: { hex: '#22d3ee', label: 'ciano' },                    // ciano/vento
  seventh_sense: { hex: '#ffffff', label: 'cosmo branco' },     // branco/cosmo
  celestial: { hex: '#fbbf24', label: 'dourado celestial' },    // dourado astral
}

export function getTransformationGlow(type?: string | null): { hex: string; label: string } {
  const cfg = TRANSFORMATION_GLOW[(type || '') as TransformationType]
  return cfg || { hex: '#a855f7', label: 'arcano' } // fallback roxo (comportamento antigo)
}

export interface TransformationConfig {
  name: string
  description: string
  duration: number
  cooldown: number
  cost: { mp: number; stamina: number }
  statModifiers: {
    strength: number
    defense: number
    hp: number
    agility: number
    intelligence: number
    attack: number
    critical: number
    mpPool?: number // amplia a reserva de mana (caster sustenta a luta longa)
  }
  specialAbilities: Array<{
    id: string
    name: string
    description: string
    damage?: string
    cost: { mp?: number; stamina?: number }
    effect: string
  }>
  resistances: string[]
  vulnerabilities: string[]
}

// 🔥 CONFIGURAÇÕES DE TRANSFORMAÇÃO BALANCEADAS
export const TRANSFORMATION_CONFIG: Record<TransformationType, TransformationConfig> = {
  // Draconiano - Transformação única e poderosa mas balanceada
  dragon: {
    name: '🐉 Dragão',
    description: 'Transformação ancestral dracônica que aumenta drasticamente força e resistência',
    duration: 4,
    cooldown: 5,
    cost: { mp: 20, stamina: 40 },

    // ⚖️ Rebalanceado (scripts/pvp-race-class-sim.js, teste simétrico das 4 raças):
    // "B modesto" — PISO de 1.20 nos atributos centrais (str/agi/int/hp/attack) p/ que
    // TODO stat suba de forma visível (mesmo o atributo descartado), assinatura mais alta,
    // DEF deliberadamente baixa (não inflar RES → mago vive), +mpPool (caster sustenta).
    // Draconiano tem a base mais forte → forma mais fraca (compensação inversa).
    statModifiers: {
      strength: 1.20,
      defense: 1.03,
      hp: 1.20,
      agility: 1.22,
      intelligence: 1.25,
      attack: 1.20,
      critical: 1.12,
      mpPool: 1.26
    },
    
    // Habilidades especiais exclusivas durante transformação
    specialAbilities: [
      {
        id: 'dragon_breath',
        name: '🔥 Sopro de Fogo',
        description: 'Ataque devastador que ignora 50% da defesa',
        damage: 'dado + (STR * 1.8)', // Era 2.0 - balanceado
        cost: { stamina: 12 }, // Era 15 - reduzido
        effect: 'ignores_50_percent_defense'
      },
      {
        id: 'dragon_roar',
        name: '🦅 Rugido Dracônico', 
        description: 'Intimida o oponente, reduzindo seu ataque por 2 turnos',
        cost: { stamina: 8 }, // Era 10 - reduzido
        effect: 'reduce_enemy_attack_20_percent_2_turns'
      },
      {
        id: 'dragon_scales',
        name: '🛡️ Escamas Dracônicas',
        description: 'Reduz todo dano recebido em 4 pontos por 3 turnos',
        cost: { mp: 12 }, // Era 15 - reduzido
        effect: 'damage_reduction_4_for_3_turns'
      }
    ],
    
    // Resistências e vulnerabilidades para balance
    resistances: ['fire', 'physical_critical'],
    vulnerabilities: ['ice', 'magic_piercing']
  },

  // Metamorfo - Múltiplas formas especializadas e balanceadas
  wolf: {
    name: '🐺 Lobo',
    description: 'Forma predatória focada em velocidade e ataques críticos',
    duration: 4,
    cooldown: 5,
    cost: { mp: 20, stamina: 30 },

    // ⚖️ Metamorfo: forma ÁGIL (striker). Piso 1.20 nos centrais; AGI é a assinatura.
    statModifiers: {
      agility: 1.32,
      strength: 1.20,
      critical: 1.22,
      attack: 1.20,
      defense: 1.03,
      hp: 1.20,
      intelligence: 1.22,
      mpPool: 1.22
    },
    
    specialAbilities: [
      {
        id: 'pack_hunt',
        name: '🏃 Caçada em Matilha',
        description: 'Sequência de 3 ataques rápidos',
        damage: 'dado + (AGI * 1.0) cada ataque',
        cost: { stamina: 20 },
        effect: 'triple_attack_sequence'
      },
      {
        id: 'howl',
        name: '🌙 Uivo Selvagem',
        description: 'Aumenta permanently velocidade em +2 AGI',
        cost: { stamina: 15 },
        effect: 'permanent_agility_boost_2'
      },
      {
        id: 'bite_bleeding',
        name: '🩸 Mordida Sangrenta',
        description: 'Causa sangramento que ignora defesa por 3 turnos',
        damage: 'dado + (STR * 1.5)',
        cost: { stamina: 12 },
        effect: 'bleeding_dot_3_turns_ignores_defense'
      }
    ],
    
    resistances: ['speed_reduction'],
    vulnerabilities: ['area_attacks', 'magic_missiles']
  },

  bear: {
    name: '🐻 Urso',
    description: 'Forma defensiva suprema com alta resistência e força bruta',
    duration: 4,
    cooldown: 5,
    cost: { mp: 20, stamina: 40 },

    // ⚖️ Metamorfo: forma TANK. DEF moderada (inflar DEF mataria o mago via RES);
    // a tankeza vem do HP. Piso 1.20 nos centrais; HP é a assinatura.
    statModifiers: {
      strength: 1.22,
      defense: 1.07,
      hp: 1.28,
      agility: 1.20,
      critical: 1.12,
      attack: 1.22,
      intelligence: 1.20,
      mpPool: 1.22
    },
    
    specialAbilities: [
      {
        id: 'bear_hug',
        name: '🤗 Abraço do Urso',
        description: 'Immobiliza o oponente por 2 turnos e causa DoT',
        damage: 'dado + (STR * 1.2) por turno',
        cost: { stamina: 25 },
        effect: 'immobilize_2_turns_with_dot'
      },
      {
        id: 'intimidating_roar',
        name: '😤 Rugido Intimidador',
        description: 'Reduz o dano do oponente em 30% por 4 turnos',
        cost: { stamina: 15 },
        effect: 'reduce_enemy_damage_30_percent_4_turns'
      },
      {
        id: 'unstoppable_charge',
        name: '💥 Investida Imparável',
        description: 'Ataque que atravessa completamente a defesa',
        damage: 'dado + (STR * 2.5)',
        cost: { stamina: 30 },
        effect: 'ignores_all_defense'
      }
    ],
    
    resistances: ['physical_attacks', 'knockback', 'status_effects'],
    vulnerabilities: ['magic_attacks', 'piercing_attacks']
  },

  eagle: {
    name: '🦅 Águia',
    description: 'Forma aérea focada em esquiva suprema e ataques precisos',
    duration: 4,
    cooldown: 5,
    cost: { mp: 20, stamina: 30 },

    // ⚖️ Metamorfo: forma CASTER/crítico (agi+int). Piso 1.20 nos centrais;
    // DEF=1.0 é a FRAQUEZA de assinatura (frágil), sustenta via mpPool.
    statModifiers: {
      agility: 1.28,
      intelligence: 1.33,
      critical: 1.25,
      attack: 1.20,
      strength: 1.20,
      defense: 1.00,
      hp: 1.20,
      mpPool: 1.32
    },
    
    specialAbilities: [
      {
        id: 'dive_attack',
        name: '💨 Ataque em Mergulho',
        description: 'Crítico garantido com dano aumentado',
        damage: 'dado + (AGI * 2.0) + garanteed_critical',
        cost: { stamina: 20 },
        effect: 'guaranteed_critical_hit'
      },
      {
        id: 'aerial_superiority',
        name: '☁️ Superioridade Aérea',
        description: 'Imune a ataques terrestres por 1 turno',
        cost: { mp: 15 },
        effect: 'immune_to_ground_attacks_1_turn'
      },
      {
        id: 'keen_sight',
        name: '👁️ Visão Aguçada',
        description: 'Próximo ataque ignora esquiva do oponente',
        cost: { stamina: 10 },
        effect: 'ignore_enemy_dodge_next_attack'
      }
    ],
    
    resistances: ['ground_attacks_while_flying'],
    vulnerabilities: ['area_magic', 'wind_attacks', 'ranged_attacks']
  },

  // Humano - Despertar do 7º Sentido: forma coringa equilibrada com percepção sobre-humana
  seventh_sense: {
    name: '✨ Despertar do 7º Sentido',
    description: 'O humano desperta o cosmo interior: reflexos, força e mente elevados em harmonia. Forma versátil, sem fraquezas marcantes.',
    duration: 4,
    cooldown: 5,
    cost: { mp: 20, stamina: 35 },

    // ⚖️ Humano: forma UNIVERSAL (str≈agi≈int) — serve qualquer classe, sem fraquezas.
    statModifiers: {
      strength: 1.20,
      defense: 1.02,
      hp: 1.21,
      agility: 1.23,
      intelligence: 1.27,
      attack: 1.20,
      critical: 1.15,
      mpPool: 1.28
    },

    specialAbilities: [
      {
        id: 'cosmo_burst',
        name: '🌌 Explosão de Cosmo',
        description: 'Concentra o cosmo num golpe que cresce com todos os atributos',
        damage: 'dado + ((STR+AGI+INT) * 0.6)',
        cost: { stamina: 15, mp: 10 },
        effect: 'scaling_all_stats_strike'
      },
      {
        id: 'precognitive_counter',
        name: '👁️ Contra-ataque Precognitivo',
        description: 'Prevê o próximo ataque: esquiva garantida e devolve metade do dano',
        cost: { stamina: 12 },
        effect: 'guaranteed_dodge_and_counter_next'
      },
      {
        id: 'cosmo_focus',
        name: '🧘 Foco do Cosmo',
        description: 'Serenidade absoluta: +2 em todos os atributos por 3 turnos',
        cost: { mp: 12 },
        effect: 'all_stats_plus_2_for_3_turns'
      }
    ],

    resistances: ['surprise_attacks', 'status_effects'],
    vulnerabilities: ['sustained_pressure']
  },

  // Elfo - Forma Celestial: avatar arcano que amplifica magia e reflexos
  celestial: {
    name: '🌟 Forma Celestial',
    description: 'O elfo ascende a uma forma de luz astral, amplificando drasticamente o poder mágico e os reflexos — mas com corpo etéreo e frágil.',
    duration: 4,
    cooldown: 5,
    cost: { mp: 20, stamina: 30 },

    // ⚖️ Elfo: forma ARCANA (lean INT + mpPool alto). Base élfica é a mais fraca
    // fisicamente → forma um pouco mais forte (compensação inversa). Piso 1.20 nos
    // centrais: agora o STR do elfo sobe de forma visível (era 1.16+floor ≈ +0).
    statModifiers: {
      intelligence: 1.34,
      agility: 1.24,
      critical: 1.20,
      attack: 1.20,
      strength: 1.20,
      defense: 1.02,
      hp: 1.22,
      mpPool: 1.40
    },

    specialAbilities: [
      {
        id: 'holy_nova',
        name: '💥 Nova Sagrada',
        description: 'Explosão de luz arcana que ignora resistência mágica',
        damage: 'dado + (INT * 1.8)',
        cost: { mp: 18 },
        effect: 'magic_burst_ignores_resistance'
      },
      {
        id: 'restoring_blessing',
        name: '🕊️ Bênção Restauradora',
        description: 'A luz celestial cura uma parcela do HP máximo',
        cost: { mp: 20 },
        effect: 'heal_25_percent_max_hp'
      },
      {
        id: 'arcane_torrent',
        name: '🔷 Torrente Arcana',
        description: 'O próximo feitiço causa o dobro de dano mágico',
        cost: { stamina: 10 },
        effect: 'double_magic_damage_next'
      }
    ],

    resistances: ['magic_attacks', 'curses'],
    vulnerabilities: ['physical_critical', 'silence']
  }
}

// 🎯 VALIDAÇÃO DE TRANSFORMAÇÃO
export function canTransform(character: any, transformationType: TransformationType): { canTransform: boolean, reason?: string } {
  // Verificar se a raça pode se transformar nesta forma específica
  const allowed = getRaceTransformations(character.race)
  if (allowed.length === 0) {
    return { canTransform: false, reason: 'Sua raça não possui habilidade de transformação' }
  }
  if (!allowed.includes(transformationType)) {
    return { canTransform: false, reason: 'Sua raça não pode assumir essa forma' }
  }
  // Metamorfo (e qualquer raça multi-forma) é travado na forma escolhida na criação.
  const unlocked = (character.unlockedTransformation || '') as TransformationType
  if (allowed.length > 1 && unlocked && unlocked !== transformationType) {
    return { canTransform: false, reason: 'Você só pode assumir a forma escolhida na criação' }
  }

  // Verificar se já está transformado
  if (character.isTransformed) {
    return { canTransform: false, reason: 'Já está transformado' }
  }
  
  // Verificar cooldown
  const transformationData = character.transformationData || {}
  if (transformationData.cooldownTurns > 0) {
    return { canTransform: false, reason: `Transformação em cooldown: ${transformationData.cooldownTurns} turnos restantes` }
  }
  
  // Verificar custos
  const config = TRANSFORMATION_CONFIG[transformationType as TransformationType]
  if (!config) {
    return { canTransform: false, reason: 'Tipo de transformação inválido' }
  }
  
  if (character.mp < config.cost.mp) {
    return { canTransform: false, reason: `MP insuficiente: precisa de ${config.cost.mp}, tem ${character.mp}` }
  }
  
  if (character.stamina < config.cost.stamina) {
    return { canTransform: false, reason: `Stamina insuficiente: precisa de ${config.cost.stamina}, tem ${character.stamina}` }
  }
  
  return { canTransform: true }
}

// 🔄 APLICAR TRANSFORMAÇÃO
export function applyTransformation(character: any, transformationType: TransformationType) {
  const config = TRANSFORMATION_CONFIG[transformationType as TransformationType]
  if (!config) throw new Error('Tipo de transformação inválido')
  
  // Salvar stats originais
  const originalStats = {
    strength: character.strength || character.baseStats?.str || 0,
    agility: character.agility || character.baseStats?.agi || 0,
    intelligence: character.intelligence || character.baseStats?.int || 0,
    defense: character.defense || character.baseStats?.def || 0,
    hp: character.hp,
    maxHp: character.maxHp,
    mp: character.mp,
    maxMp: character.maxMp,
    attack: character.baseStats?.attack || 0,
    critical: character.baseStats?.critical || 0
  }

  // Aplicar multiplicadores
  // Math.round (não floor): num atributo descartado (ex.: STR do elfo), floor(base*1.2x)
  // engolia o ganho e exibia +0. round mostra o buff visivelmente.
  const transformedStats: any = {
    strength: Math.round(originalStats.strength * config.statModifiers.strength),
    agility: Math.round(originalStats.agility * config.statModifiers.agility),
    intelligence: Math.round(originalStats.intelligence * config.statModifiers.intelligence),
    defense: Math.round(originalStats.defense * config.statModifiers.defense),
    attack: Math.round(originalStats.attack * config.statModifiers.attack),
    critical: originalStats.critical * config.statModifiers.critical
  }

  // Aplicar mudanças de HP se necessário
  if (config.statModifiers.hp !== 1.0) {
    const newMaxHp = Math.floor(originalStats.maxHp * config.statModifiers.hp)
    const hpDifference = newMaxHp - originalStats.maxHp
    transformedStats.hp = Math.min(character.hp + hpDifference, newMaxHp)
    transformedStats.maxHp = newMaxHp
  }

  // Ampliar a reserva de mana (caster sustenta a luta longa transformado)
  if (config.statModifiers.mpPool && config.statModifiers.mpPool !== 1.0) {
    const newMaxMp = Math.floor((originalStats.maxMp || 0) * config.statModifiers.mpPool)
    const mpDifference = newMaxMp - (originalStats.maxMp || 0)
    transformedStats.maxMp = newMaxMp
    transformedStats.mp = Math.min((character.mp || 0) + mpDifference, newMaxMp)
  }
  
  return {
    ...character,
    isTransformed: true,
    transformationType,
    transformationData: {
      remainingTurns: config.duration,
      cooldownTurns: 0,
      originalStats,
      transformedStats,
      specialAbilities: config.specialAbilities,
      resistances: config.resistances,
      vulnerabilities: config.vulnerabilities
    },
    // Aplicar stats transformados
    strength: transformedStats.strength,
    agility: transformedStats.agility,
    intelligence: transformedStats.intelligence,
    defense: transformedStats.defense,
    hp: transformedStats.hp || character.hp,
    maxHp: transformedStats.maxHp || character.maxHp,
    maxMp: transformedStats.maxMp || character.maxMp,
    // Recalcular stats derivados com novos valores
    baseStats: {
      ...character.baseStats,
      str: transformedStats.strength,
      agi: transformedStats.agility,
      int: transformedStats.intelligence,
      def: transformedStats.defense,
      attack: transformedStats.attack,
      critical: transformedStats.critical,
      hp: transformedStats.hp || character.hp,
      maxHp: transformedStats.maxHp || character.maxHp,
      maxMp: transformedStats.maxMp || character.maxMp
    },
    // Consumir recursos (a reserva ampliada pelo mpPool já está em transformedStats.mp)
    mp: (transformedStats.mp ?? character.mp) - config.cost.mp,
    stamina: character.stamina - config.cost.stamina
  }
}

// ⏪ REVERTER TRANSFORMAÇÃO
export function revertTransformation(character: any) {
  if (!character.isTransformed || !character.transformationData) {
    return character
  }
  
  const original = character.transformationData.originalStats
  const config = TRANSFORMATION_CONFIG[character.transformationType as TransformationType]
  
  return {
    ...character,
    isTransformed: false,
    transformationType: null,
    transformationData: {
      ...character.transformationData,
      cooldownTurns: config.cooldown,
      remainingTurns: 0
    },
    // Restaurar stats originais
    strength: original.strength,
    agility: original.agility,
    intelligence: original.intelligence,
    defense: original.defense,
    hp: Math.min(character.hp, original.maxHp), // Não pode ter mais HP que o máximo original
    maxHp: original.maxHp,
    maxMp: original.maxMp ?? character.maxMp,
    mp: Math.min(character.mp, original.maxMp ?? character.maxMp),
    baseStats: {
      ...character.baseStats,
      str: original.strength,
      agi: original.agility,
      int: original.intelligence,
      def: original.defense,
      attack: original.attack,
      critical: original.critical,
      hp: Math.min(character.hp, original.maxHp),
      maxHp: original.maxHp,
      maxMp: original.maxMp ?? character.maxMp
    }
  }
}

export default {
  TRANSFORMATION_CONFIG,
  canTransform,
  applyTransformation,
  revertTransformation
}
