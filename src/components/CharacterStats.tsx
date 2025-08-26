import React from 'react';
import { Heart, Zap, Shield, TrendingUp, Star } from 'lucide-react';

interface CharacterStatsProps {
  character: {
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    stamina: number;
    maxStamina: number;
    level: number;
  };
  className?: string;
}

export default function CharacterStats({ character, className = '' }: CharacterStatsProps) {
  // Calcular porcentagens para as barras de status
  const hpPercentage = (character.hp / character.maxHp) * 100;
  const mpPercentage = (character.mp / character.maxMp) * 100;
  const staminaPercentage = (character.stamina / character.maxStamina) * 100;

  const StatBar = ({ 
    current, 
    max, 
    percentage, 
    color, 
    icon: Icon, 
    label 
  }: {
    current: number;
    max: number;
    percentage: number;
    color: string;
    icon: React.ComponentType<any>;
    label: string;
  }) => (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-text-secondary flex items-center gap-1">
          <Icon className={`w-3 h-3 ${color}`} />
          {label}
        </span>
        <span className="font-medium text-text-primary">
          {current}/{max}
        </span>
      </div>
      <div className="w-full bg-surface/50 rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full bg-gradient-to-r ${color.replace('text-', 'from-').replace('-500', '-400')} to-${color.replace('text-', '').replace('-500', '-600')} transition-all duration-300`}
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Nível */}
      <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-primary/20 to-primary-dark/20 rounded-lg py-2 px-3">
        <Star className="w-4 h-4 text-primary" />
        <span className="font-bold text-primary">Nível {character.level}</span>
      </div>

      {/* Stats com barras */}
      <div className="space-y-3">
        <StatBar
          current={character.hp}
          max={character.maxHp}
          percentage={hpPercentage}
          color="text-red-500"
          icon={Heart}
          label="HP"
        />
        
        <StatBar
          current={character.mp}
          max={character.maxMp}
          percentage={mpPercentage}
          color="text-blue-500"
          icon={Zap}
          label="MP"
        />
        
        <StatBar
          current={character.stamina}
          max={character.maxStamina}
          percentage={staminaPercentage}
          color="text-green-500"
          icon={Shield}
          label="Stamina"
        />
      </div>
    </div>
  );
}
