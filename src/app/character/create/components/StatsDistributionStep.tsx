'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Dice6 } from 'lucide-react';
import { StatBar } from './StatBar';
import { StatPreview } from './StatPreview';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { pointSystem } from '@/lib/characterCreationData';
import { BaseStats } from '@/types/character';

export function StatsDistributionStep() {
  const {
    selectedRace,
    selectedClass,
    selectedSpecialization,
    distributedPoints,
    setDistributedPoints,
    markStepComplete,
  } = useCharacterCreationStore();

  const [isRolling, setIsRolling] = useState(false);

  const maxPointsPerStat = pointSystem.creation.maxStatValue;
  const totalPoints = pointSystem.creation.availablePoints;

  const localDistributedPoints = distributedPoints;

  const totalDistributed =
    (localDistributedPoints?.str || 0) +
    (localDistributedPoints?.agi || 0) +
    (localDistributedPoints?.int || 0) +
    (localDistributedPoints?.res || 0);

  const getClassWeights = (classId: string | undefined) => {
    switch (classId) {
      case 'warrior':
        return { str: 4, agi: 1, int: 1, res: 3 };
      case 'rogue':
        return { str: 2, agi: 4, int: 2, res: 1 };
      case 'mage':
        return { str: 1, agi: 2, int: 5, res: 1 };
      case 'monk':
        return { str: 2, agi: 3, int: 2, res: 2 };
      default:
        return { str: 2, agi: 2, int: 2, res: 2 };
    }
  };

  const rollDistributedPoints = (): BaseStats => {
    const base = getClassWeights(selectedClass?.id);
    const weights: Record<'str' | 'agi' | 'int' | 'res', number> = { ...base } as any;

    if (selectedSpecialization) {
      weights[selectedSpecialization] = (weights[selectedSpecialization] || 0) + 3;
    }

    const next: BaseStats = { str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 };

    const pick = () => {
      const entries = Object.entries(weights) as Array<['str' | 'agi' | 'int' | 'res', number]>;
      const totalW = entries.reduce((sum, [, w]) => sum + w, 0);
      const r = Math.random() * totalW;
      let acc = 0;
      for (const [k, w] of entries) {
        acc += w;
        if (r <= acc) return k;
      }
      return 'str' as const;
    };

    for (let i = 0; i < totalPoints; i++) {
      // Try a few times to avoid exceeding max cap.
      for (let tries = 0; tries < 20; tries++) {
        const stat = pick();
        if (next[stat] < maxPointsPerStat) {
          next[stat] += 1;
          break;
        }
      }
    }

    return next;
  };

  useEffect(() => {
    const isValid = totalDistributed === totalPoints;
    markStepComplete('stats-distribution', isValid);
  }, [markStepComplete, totalDistributed, totalPoints]);

  useEffect(() => {
    // Roll only once: if not set yet and prerequisites exist.
    if (!selectedClass || !selectedSpecialization) return;
    if (totalDistributed > 0) return;

    setIsRolling(true);
    const rolled = rollDistributedPoints();
    setDistributedPoints(rolled);
    setIsRolling(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSpecialization]);
  
  const stats = useMemo(() => [
    {
      key: 'str' as const,
      name: 'Força',
      description: 'Aumenta dano físico e pontos de vida',
      icon: '💪',
      color: 'from-red-500 to-red-600'
    },
    {
      key: 'agi' as const,
      name: 'Agilidade', 
      description: 'Aumenta velocidade, esquiva e chance crítica',
      icon: '⚡',
      color: 'from-yellow-500 to-yellow-600'
    },
    {
      key: 'int' as const,
      name: 'Inteligência',
      description: 'Aumenta pontos de mana e dano mágico',
      icon: '🧠',
      color: 'from-blue-500 to-blue-600'
    },
    {
      key: 'res' as const,
      name: 'Defesa',
      description: 'Aumenta durabilidade e resistência',
      icon: '🛡️',
      color: 'from-green-500 to-green-600'
    }
  ], []);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Stats Distribution */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Atributos Aleatórios</h2>
          <p className="text-text-secondary">
            Seus atributos são rolados automaticamente com base na classe e especialização escolhidas.
          </p>
        </div>

        <div className="bg-gradient-to-r from-primary/20 to-primary-dark/20 border border-primary/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-text-primary font-medium">
              <Dice6 className="w-4 h-4" />
              Rolagem
            </div>
            <span className="text-text-secondary text-sm">
              {isRolling ? 'Gerando...' : totalDistributed === totalPoints ? 'Concluída' : 'Pendente'}
            </span>
          </div>
          <div className="mt-2 text-sm text-text-secondary">
            Total de pontos: <span className="text-text-primary font-semibold">{totalPoints}</span>
          </div>
        </div>
        
        {/* Rolled Stats */}
        <div className="space-y-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-surface/50 border border-white/10 rounded-lg p-4"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center text-2xl`}>
                  {stat.icon}
                </div>
                
                <div className="flex-1">
                  <h4 className="font-medium text-text-primary">
                    {stat.name}
                  </h4>
                  <p className="text-sm text-text-secondary">
                    {stat.description}
                  </p>
                </div>
                
                <div className="w-16 text-center">
                  <div className="text-lg font-bold text-text-primary">
                    {localDistributedPoints[stat.key]}
                  </div>
                  <div className="text-xs text-text-secondary">/ {maxPointsPerStat}</div>
                </div>
              </div>
              
              {/* Stat Bar */}
              <div className="mt-3">
                <StatBar
                  value={localDistributedPoints[stat.key]}
                  max={maxPointsPerStat}
                  color={stat.color}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* Live Preview */}
      <div className="lg:sticky lg:top-8">
        <StatPreview
          race={selectedRace}
          distributedPoints={localDistributedPoints}
        />
      </div>
    </div>
  );
}
