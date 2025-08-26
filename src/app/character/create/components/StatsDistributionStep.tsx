'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, RotateCcw } from 'lucide-react';
import { StatBar } from './StatBar';
import { StatPreview } from './StatPreview';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { pointSystem } from '@/lib/characterCreationData';
import { BaseStats } from '@/types/character';

export function StatsDistributionStep() {
  const { selectedRace, distributedPoints, setDistributedPoints, markStepComplete } = useCharacterCreationStore();
  const [localDistributedPoints, setLocalDistributedPoints] = useState<BaseStats>(distributedPoints);
  const [availablePoints, setAvailablePoints] = useState(pointSystem.creation.availablePoints);
  
  const maxPointsPerStat = pointSystem.creation.maxStatValue;
  const initialAvailablePoints = pointSystem.creation.availablePoints;

  useEffect(() => {
    // Initialize local state from global store on mount
    setLocalDistributedPoints(distributedPoints);
    const totalDistributed = Object.values(distributedPoints).reduce((a, b) => a + b, 0);
    setAvailablePoints(initialAvailablePoints - totalDistributed);
  }, [distributedPoints, initialAvailablePoints]);

  useEffect(() => {
    // Mark step complete if all points are distributed or if it's valid to proceed
    const totalDistributed = Object.values(localDistributedPoints).reduce((a, b) => a + b, 0);
    const isComplete = availablePoints === 0 && totalDistributed === initialAvailablePoints;
    markStepComplete('stats-distribution', isComplete);
  }, [localDistributedPoints, availablePoints, initialAvailablePoints, markStepComplete]);

  const adjustStat = (stat: keyof BaseStats, delta: number) => {
    const currentValue = localDistributedPoints[stat];
    const newValue = currentValue + delta;
    
    if (newValue < pointSystem.creation.minStatValue || newValue > maxPointsPerStat) return;
    if (delta > 0 && availablePoints <= 0) return;
    
    setLocalDistributedPoints(prev => ({
      ...prev,
      [stat]: newValue
    }));
    setAvailablePoints(prev => prev - delta);
    setDistributedPoints({
      ...localDistributedPoints,
      [stat]: newValue
    }); // Update global store immediately
  };
  
  const resetStats = () => {
    setLocalDistributedPoints({ str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 });
    setAvailablePoints(initialAvailablePoints);
    setDistributedPoints({ str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 }); // Reset global store
  };
  
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
      name: 'Resistência',
      description: 'Reduz dano recebido e aumenta stamina',
      icon: '🛡️',
      color: 'from-green-500 to-green-600'
    }
  ], []);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Stats Distribution */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">
              Distribuir Atributos
            </h2>
            <p className="text-text-secondary">
              Você tem {availablePoints} pontos para distribuir
            </p>
          </div>
          
          <button
            onClick={resetStats}
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-white/20 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
        
        {/* Available Points Counter */}
        <div className="bg-gradient-to-r from-primary/20 to-primary-dark/20 border border-primary/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-text-primary font-medium">
              Pontos Disponíveis
            </span>
            <span className="text-2xl font-bold text-primary">
              {availablePoints}
            </span>
          </div>
          <div className="w-full bg-background/50 rounded-full h-2 mt-2">
            <motion.div
              className="bg-gradient-to-r from-primary to-primary-dark h-2 rounded-full"
              initial={{ width: "100%" }}
              animate={{ width: `${(availablePoints / initialAvailablePoints) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
        
        {/* Stat Adjusters */}
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
                
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => adjustStat(stat.key, -1)}
                    disabled={localDistributedPoints[stat.key] <= pointSystem.creation.minStatValue}
                    className="w-8 h-8 bg-background border border-white/20 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  
                  <div className="w-16 text-center">
                    <div className="text-lg font-bold text-text-primary">
                      {localDistributedPoints[stat.key]}
                    </div>
                    <div className="text-xs text-text-secondary">
                      / {maxPointsPerStat}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => adjustStat(stat.key, 1)}
                    disabled={localDistributedPoints[stat.key] >= maxPointsPerStat || availablePoints <= 0}
                    className="w-8 h-8 bg-background border border-white/20 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
