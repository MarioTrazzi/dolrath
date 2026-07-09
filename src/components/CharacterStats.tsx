import React from 'react';
import { Heart, Zap, Shield } from 'lucide-react';

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

// Barras de vitals no estilo chumbo + ouro (mesma linguagem da EnhancementDialog):
// trilho escuro com borda preta e preenchimento em gradiente inline — as classes
// Tailwind dinâmicas antigas (from-red-400 via replace) nem eram geradas no build.
export default function CharacterStats({ character, className = '' }: CharacterStatsProps) {
  const hpPercentage = (character.hp / character.maxHp) * 100;
  const mpPercentage = (character.mp / character.maxMp) * 100;
  const staminaPercentage = (character.stamina / character.maxStamina) * 100;

  const StatBar = ({
    current,
    max,
    percentage,
    fill,
    icon: Icon,
    iconColor,
    label,
  }: {
    current: number;
    max: number;
    percentage: number;
    fill: string;
    icon: React.ComponentType<any>;
    iconColor: string;
    label: string;
  }) => (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="flex items-center gap-1.5 text-[#c9c9ce]">
          <Icon className="w-3 h-3" style={{ color: iconColor }} />
          {label}
        </span>
        <span className="font-medium tabular-nums text-[#ece7da]">
          {current}/{max}
        </span>
      </div>
      <div className="h-[7px] w-full overflow-hidden rounded-[2px] border border-black/70 bg-[#101013]">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${Math.max(percentage, 2)}%`, background: fill }}
        />
      </div>
    </div>
  );

  return (
    <div className={`space-y-3 ${className}`}>
      <StatBar
        current={character.hp}
        max={character.maxHp}
        percentage={hpPercentage}
        fill="linear-gradient(to right, #7a2222, #e05252)"
        icon={Heart}
        iconColor="#e05252"
        label="HP"
      />

      <StatBar
        current={character.mp}
        max={character.maxMp}
        percentage={mpPercentage}
        fill="linear-gradient(to right, #2b4a7a, #6aa9d6)"
        icon={Zap}
        iconColor="#6aa9d6"
        label="MP"
      />

      <StatBar
        current={character.stamina}
        max={character.maxStamina}
        percentage={staminaPercentage}
        fill="linear-gradient(to right, #2f6b3a, #7ac95f)"
        icon={Shield}
        iconColor="#7ac95f"
        label="Stamina"
      />
    </div>
  );
}
