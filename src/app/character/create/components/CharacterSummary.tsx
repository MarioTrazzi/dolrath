'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CharacterRace, BaseStats, FinalStats } from '@/types/character';
import { calculateFinalStats } from '@/lib/utils';

interface CharacterSummaryProps {
  race: CharacterRace | null;
  distributedPoints: BaseStats;
  characterName: string;
  imageUrl: string | null;
}

export function CharacterSummary({ race, distributedPoints, characterName, imageUrl }: CharacterSummaryProps) {
  const finalStats = race ? calculateFinalStats(race, distributedPoints) : null;

  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full flex flex-col items-center text-center">
      <h3 className="text-xl font-bold text-text-primary mb-4">
        Resumo do Personagem
      </h3>

      <AnimatePresence mode="wait">
        {race && finalStats ? (
          <motion.div
            key="summary-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full flex flex-col items-center"
          >
            {imageUrl && (
              <motion.img
                src={imageUrl}
                alt="Character Avatar"
                className="w-40 h-40 rounded-full object-cover border-4 border-primary shadow-lg mb-4"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
              />
            )}

            <h4 className="text-3xl font-extrabold text-text-primary mb-2">
              {characterName || 'Seu Personagem'}
            </h4>
            <p className="text-lg text-primary mb-4">{race.name}</p>

            <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-6">
              {Object.entries(finalStats).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center py-1 border-b border-white/5 last:border-b-0">
                  <span className="text-text-secondary capitalize">{key}:</span>
                  <span className="font-bold text-text-primary text-base">{value.toFixed(1)}</span>
                </div>
              ))}
            </div>

            <div className="w-full text-left">
              <h5 className="text-lg font-bold text-text-primary mb-2">Habilidades e Bônus:</h5>
              <ul className="list-disc list-inside text-text-secondary text-sm space-y-1">
                <li><span className="font-medium text-primary">Habilidade Especial:</span> {race.specialAbility}</li>
                {race.transformation && (
                  <li><span className="font-medium text-accent">Transformação:</span> {race.transformation}</li>
                )}
                {Object.entries(race.bonusStats).length > 0 && (
                  <li><span className="font-medium text-primary">Bônus Raciais:</span> {Object.entries(race.bonusStats).map(([key, value]) => `${key}: +${value}`).join(', ')}</li>
                )}
                {race.restrictions && race.restrictions.length > 0 && (
                  <li><span className="font-medium text-red-400">Restrições:</span> {race.restrictions.join(', ')}</li>
                )}
              </ul>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="placeholder"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex items-center justify-center text-text-secondary/60 text-center"
          >
            <p>Preencha os passos anteriores para ver o resumo do seu personagem.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
