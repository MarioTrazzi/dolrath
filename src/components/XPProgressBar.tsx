import React from 'react';

interface XPProgressBarProps {
  levelInfo: {
    level: number;
    currentXP: number;
    xpForCurrentLevel: number;
    xpForNextLevel: number;
    xpToNextLevel: number;
    xpProgress: number;
    progressPercentage: number;
  };
  className?: string;
}

// Barra de XP no estilo chumbo + ouro envelhecido (mesma da ficha do personagem).
// Layout fixo em uma linha de rótulos + trilho: nada muda de posição entre breakpoints.
export default function XPProgressBar({ levelInfo, className = '' }: XPProgressBarProps) {
  const { level, xpProgress, xpForNextLevel, xpForCurrentLevel, progressPercentage } = levelInfo;

  const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[#77777d]">
        <span>
          Experiência · <span style={{ color: '#e7c682' }}>Nível {level}</span>
        </span>
        <span className="normal-case tracking-normal tabular-nums text-[#8a8a90]">
          {xpProgress.toLocaleString()}/{xpNeededForNext.toLocaleString()} XP · {progressPercentage.toFixed(1)}%
        </span>
      </div>

      <div className="h-[7px] w-full overflow-hidden rounded-[2px] border border-black/70 bg-[#101013]">
        <div
          className="h-full bg-gradient-to-r from-[#8a6d3b] to-[#e7c682] transition-all duration-500 ease-out"
          style={{ width: `${Math.max(progressPercentage, 2)}%` }}
        />
      </div>
    </div>
  );
}
