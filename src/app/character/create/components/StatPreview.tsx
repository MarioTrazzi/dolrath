'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CharacterRace, BaseStats, FinalStats } from '@/types/character';
import { calculateFinalStats } from '@/lib/utils';

interface StatPreviewProps {
  race: CharacterRace | null;
  distributedPoints: BaseStats;
}

export function StatPreview({ race, distributedPoints }: StatPreviewProps) {
  const finalStats = race ? calculateFinalStats(race, distributedPoints) : null;

  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full flex flex-col">
      <h3 className="text-xl font-bold text-text-primary mb-4">
        Prévia dos Atributos Finais
      </h3>

      <AnimatePresence mode="wait">
        {finalStats && race ? (
          <motion.div
            key={race.id + JSON.stringify(distributedPoints)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {Object.entries(finalStats).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center py-1 border-b border-white/5 last:border-b-0">
                  <span className="text-text-secondary capitalize">{key}:</span>
                  <span className="font-bold text-text-primary text-base">{value.toFixed(1)}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-white/10">
              <h4 className="text-lg font-bold text-text-primary mb-3">Bônus Raciais:</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {Object.entries(race.bonusStats).length > 0 ? (
                  Object.entries(race.bonusStats).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-text-secondary capitalize">{key}:</span>
                      <span className="font-bold text-primary">+{value}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-text-secondary col-span-2">Nenhum bônus racial específico.</p>
                )}
              </div>
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
            <p>Selecione uma raça e distribua pontos para ver a prévia dos atributos.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
