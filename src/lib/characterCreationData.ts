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
    // 🔥 BALANCEADO: Equilibrado mas viável
    baseStats: { str: 11, agi: 10, int: 11, res: 10, hp: 90, mp: 65, crit: 5, speed: 8 },
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
