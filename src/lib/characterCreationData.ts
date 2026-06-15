import { CharacterRace, BaseStats, PointDistribution } from '@/types/character';

export const races: CharacterRace[] = [
  {
    id: 'draconiano',
    name: 'Draconiano',
    description: 'Descendentes de dragões com força descomunal',
    // 🔥 BALANCEADO: STR alto mas não extremo
    baseStats: { str: 13, agi: 8, int: 9, res: 12, hp: 100, mp: 60, crit: 4, speed: 6 },
    bonusStats: { str: 2, res: 2, hp: 15 }, // Bônus racial reduzido
    specialAbility: 'Transformação em Dragão',
    transformation: 'Dragão',
    lore: 'Antigas linhagens dracônicas que mantiveram sua humanidade...',
    restrictions: ['Não pode usar armaduras leves']
  },
  {
    id: 'metamorfo',
    name: 'Metamorfo',
    description: 'Shapeshifters com agilidade sobrenatural',
    // 🔥 BALANCEADO: AGI especialista
    baseStats: { str: 9, agi: 13, int: 11, res: 8, hp: 85, mp: 75, crit: 7, speed: 10 },
    bonusStats: { agi: 3, int: 1, mp: 10 }, // AGI foco
    specialAbility: 'Transformação Animal',
    transformation: 'Qualquer Animal',
    lore: 'Seres capazes de alterar sua forma física...',
    restrictions: ['Não pode usar armaduras pesadas']
  },
  {
    id: 'humano',
    name: 'Humano',
    description: 'Versáteis e adaptáveis a qualquer situação',
    // 🔥 BUFF: Compensação pela falta de transformação
    baseStats: { str: 12, agi: 11, int: 12, res: 11, hp: 100, mp: 70, crit: 6, speed: 9 },
    bonusStats: { str: 2, agi: 2, int: 2, res: 2, hp: 10 }, // 🔥 BUFF: Bônus dobrado
    specialAbility: 'Adaptabilidade Suprema',
    transformation: 'Despertar do 7º Sentido',
    lore: 'Versáteis e de crescimento acelerado, os humanos podem despertar o 7º Sentido — elevando reflexos, força e mente em harmonia, sem fraquezas marcantes.',
    restrictions: []
  },
  {
    id: 'elfo',
    name: 'Elfo',
    description: 'Seres mágicos com afinidade natural para arcanos',
    // 🔥 BUFF: Especialização extrema para compensar falta de transformação
    baseStats: { str: 8, agi: 14, int: 16, res: 10, hp: 85, mp: 95, crit: 8, speed: 11 },
    bonusStats: { int: 4, agi: 3, mp: 20, crit: 2 }, // 🔥 BUFF: Bônus maiores
    specialAbility: 'Maestria Arcana',
    transformation: 'Forma Celestial',
    lore: 'Antigos guardiões da magia, os elfos podem ascender à Forma Celestial — um avatar de luz astral que amplifica o poder mágico e os reflexos, ao custo de um corpo etéreo e frágil.',
    restrictions: ['Não pode usar armaduras pesadas']
  }
];

export const pointSystem = {
  creation: {
    availablePoints: 10,      // 10 pontos livres na criação
    minStatValue: 0,          // Mínimo 0 pontos adicionais
    maxStatValue: 10,         // Máximo 10 pontos por stat
    costProgression: 'linear' // 1 ponto = 1 stat point
  },
  leveling: {
    pointsPerLevel: 1,        // 1 ponto por level up (fonte: characterLevelSystem)
    bonusEvery5Levels: 0,     // sem bônus extra a cada 5 levels
    maxStatFromPoints: 50,    // Máximo de pontos que podem vir de distribuição
    costProgression: 'linear' // 1 ponto = 1 stat
  }
};
