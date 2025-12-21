'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CharacterRace, BaseStats, FinalStats } from '@/types/character';
import { calculateFinalStats } from '@/lib/utils';

interface RacePreviewProps {
  race: CharacterRace | null;
  showStats: boolean;
}

export function RacePreview({ race, showStats }: RacePreviewProps) {
  const initialStats: BaseStats = { str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 };
  const finalStats = race ? calculateFinalStats(race, initialStats) : null;

  const displayKey = (key: string) => (key === 'res' ? 'DEF' : key);

  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full flex flex-col">
      <h3 className="text-xl font-bold text-text-primary mb-4">
        Prévia da Raça
      </h3>

      <AnimatePresence mode="wait">
        {race ? (
          <motion.div
            key={race.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-dark rounded-lg flex items-center justify-center text-4xl flex-shrink-0">
                {race.id === 'draconiano' && '🐉'}
                {race.id === 'metamorfo' && '🐺'}
                {race.id === 'humano' && '⚔️'}
                {race.id === 'elfo' && '🧝'}
              </div>
              <div>
                <h4 className="text-2xl font-bold text-text-primary">{race.name}</h4>
                <p className="text-text-secondary text-sm">{race.description}</p>
              </div>
            </div>

            <p className="text-text-secondary mb-4 text-sm leading-relaxed">
              {race.lore}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-background/50 rounded-md p-3">
                <p className="text-xs text-text-secondary">Habilidade Especial</p>
                <p className="font-medium text-primary text-sm">{race.specialAbility}</p>
              </div>
              {race.transformation && (
                <div className="bg-background/50 rounded-md p-3">
                  <p className="text-xs text-text-secondary">Transformação</p>
                  <p className="font-medium text-accent text-sm">{race.transformation}</p>
                </div>
              )}
            </div>

            {race.restrictions && race.restrictions.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-red-400 mb-2">Restrições:</p>
                <ul className="list-disc list-inside text-sm text-red-300">
                  {race.restrictions.map((restriction, index) => (
                    <li key={index}>{restriction}</li>
                  ))}
                </ul>
              </div>
            )}

            {showStats && finalStats && (
              <div className="mt-auto pt-4 border-t border-white/10">
                <h5 className="text-lg font-bold text-text-primary mb-3">Atributos da Raça:</h5>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {Object.entries(finalStats).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-text-secondary capitalize">{displayKey(key)}:</span>
                      <span className="font-bold text-text-primary">{value.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            <p>Selecione uma raça para ver os detalhes e bônus raciais. Os atributos finais do personagem serão rolados automaticamente mais adiante.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
