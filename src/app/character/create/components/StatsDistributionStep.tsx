'use client';

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { StatBar } from './StatBar';
import { StatPreview } from './StatPreview';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { pointSystem } from '@/lib/characterCreationData';

export function StatsDistributionStep() {
  const {
    selectedRace,
    selectedClass,
    distributedPoints,
    setDistributedPoints,
    markStepComplete,
  } = useCharacterCreationStore();

  const maxPointsPerStat = pointSystem.creation.maxStatValue;
  const totalPoints = pointSystem.creation.availablePoints;

  const localDistributedPoints = distributedPoints;

  const totalDistributed =
    (localDistributedPoints?.str || 0) +
    (localDistributedPoints?.agi || 0) +
    (localDistributedPoints?.int || 0) +
    (localDistributedPoints?.res || 0);

  const remainingPoints = Math.max(0, totalPoints - totalDistributed);

  const adjustPoint = (key: 'str' | 'agi' | 'int' | 'res', delta: number) => {
    if (!selectedClass) return;

    const current = Number((localDistributedPoints as any)?.[key] || 0);
    const nextValue = Math.max(0, Math.min(maxPointsPerStat, current + delta));
    if (nextValue === current) return;

    // Prevent exceeding available pool.
    if (delta > 0 && remainingPoints <= 0) return;

    setDistributedPoints({
      ...localDistributedPoints,
      [key]: nextValue,
    });
  };

  useEffect(() => {
    const isValid = totalDistributed === totalPoints;
    markStepComplete('stats-distribution', isValid);
  }, [markStepComplete, totalDistributed, totalPoints]);
  
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
          <h2 className="text-2xl font-bold text-text-primary mb-2">Distribuir Atributos</h2>
          <p className="text-text-secondary">
            Você tem {totalPoints} pontos para distribuir livremente.
          </p>
        </div>

        <div className="bg-gradient-to-r from-primary/20 to-primary-dark/20 border border-primary/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="text-text-primary font-medium">Pontos</div>
            <span className="text-text-secondary text-sm">
              Restantes: <span className="text-text-primary font-semibold">{remainingPoints}</span>
            </span>
          </div>
          {!selectedClass && (
            <div className="mt-2 text-sm text-text-secondary">Selecione uma classe para distribuir pontos.</div>
          )}
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustPoint(stat.key, -1)}
                    disabled={!selectedClass || (localDistributedPoints?.[stat.key] || 0) <= 0}
                    className="w-8 h-8 rounded-full bg-error/20 text-error hover:bg-error/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    aria-label={`Diminuir ${stat.name}`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <div className="w-16 text-center">
                    <div className="text-lg font-bold text-text-primary">{localDistributedPoints[stat.key]}</div>
                    <div className="text-xs text-text-secondary">/ {maxPointsPerStat}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => adjustPoint(stat.key, 1)}
                    disabled={!selectedClass || remainingPoints <= 0 || (localDistributedPoints?.[stat.key] || 0) >= maxPointsPerStat}
                    className="w-8 h-8 rounded-full bg-success/20 text-success hover:bg-success/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    aria-label={`Aumentar ${stat.name}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
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
