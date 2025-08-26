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

export default function XPProgressBar({ levelInfo, className = '' }: XPProgressBarProps) {
  const { level, xpProgress, xpForNextLevel, xpForCurrentLevel, progressPercentage } = levelInfo;
  
  const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
  
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Nível e XP */}
      <div className="flex justify-between items-center text-sm">
        <span className="font-semibold text-text-primary">Nível {level}</span>
        <span className="text-text-secondary">
          {xpProgress.toLocaleString()}/{xpNeededForNext.toLocaleString()} XP
        </span>
      </div>
      
      {/* Barra de Progressão */}
      <div className="w-full bg-surface/50 rounded-full h-3 overflow-hidden shadow-inner">
        <div 
          className="h-full bg-gradient-to-r from-primary to-primary-dark transition-all duration-500 ease-out rounded-full"
          style={{ width: `${Math.max(progressPercentage, 2)}%` }}
        />
      </div>
      
      {/* Porcentagem */}
      <div className="text-center text-xs text-text-secondary">
        {progressPercentage.toFixed(1)}% para o próximo nível
      </div>
    </div>
  );
}
