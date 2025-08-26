import { CharacterRace, BaseStats, PointDistribution } from '@/types/character';

export const races: CharacterRace[] = [
  {
    id: 'draconiano',
    name: 'Draconiano',
    description: 'Descendentes de dragões com força descomunal',
    baseStats: { str: 15, agi: 8, int: 10, res: 12, hp: 120, mp: 60, crit: 5, speed: 7 },
    bonusStats: { str: 3, res: 2, hp: 20 }, // Bônus racial
    specialAbility: 'Transformação em Dragão',
    transformation: 'Dragão',
    lore: 'Antigas linhagens dracônicas que mantiveram sua humanidade...',
    restrictions: ['Não pode usar armaduras leves']
  },
  {
    id: 'metamorfo',
    name: 'Metamorfo',
    description: 'Shapeshifters com agilidade sobrenatural',
    baseStats: { str: 10, agi: 15, int: 12, res: 8, hp: 90, mp: 80, crit: 8, speed: 12 },
    bonusStats: { agi: 3, int: 2, mp: 15 },
    specialAbility: 'Transformação Animal',
    transformation: 'Qualquer Animal',
    lore: 'Seres capazes de alterar sua forma física...',
    restrictions: ['Não pode usar armaduras pesadas']
  },
  {
    id: 'humano',
    name: 'Humano',
    description: 'Versáteis e adaptáveis a qualquer situação',
    baseStats: { str: 12, agi: 11, int: 11, res: 11, hp: 100, mp: 70, crit: 6, speed: 9 },
    bonusStats: { str: 1, agi: 1, int: 1, res: 1 }, // Bônus equilibrado
    specialAbility: 'Adaptabilidade',
    lore: 'A raça mais comum, conhecida por sua versatilidade...',
    restrictions: []
  }
];

export const pointSystem = {
  creation: {
    availablePoints: 15,      // 15 pontos na criação
    minStatValue: 0,          // Mínimo 0 pontos adicionais
    maxStatValue: 10,         // Máximo 10 pontos por stat
    costProgression: 'linear' // 1 ponto = 1 stat point
  },
  leveling: {
    pointsPerLevel: 3,        // 3 pontos por level up
    bonusEvery5Levels: 2,     // +2 pontos extras a cada 5 levels
    maxStatFromPoints: 50,    // Máximo de pontos que podem vir de distribuição
    costProgression: 'exponential' // Fica mais caro conforme aumenta
  }
};
