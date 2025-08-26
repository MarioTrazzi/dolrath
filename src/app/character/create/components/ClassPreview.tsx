'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CharacterClass } from '@/types/game';

interface ClassPreviewProps {
  characterClass: CharacterClass | null;
  showStats: boolean;
}

export function ClassPreview({ characterClass, showStats }: ClassPreviewProps) {
  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full flex flex-col">
      <h3 className="text-xl font-bold text-text-primary mb-4">
        Prévia da Classe
      </h3>

      <AnimatePresence mode="wait">
        {characterClass ? (
          <motion.div
            key={characterClass.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-dark rounded-lg flex items-center justify-center text-4xl flex-shrink-0">
                {characterClass.id === 'warrior' && '⚔️'}
                {characterClass.id === 'rogue' && '🏹'}
                {characterClass.id === 'mage' && '🧙'}
                {characterClass.id === 'monk' && '✊'}
              </div>
              <div>
                <h4 className="text-2xl font-bold text-text-primary">{characterClass.name}</h4>
                <p className="text-text-secondary text-sm">{characterClass.description}</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium text-primary mb-2">Habilidades:</p>
              <ul className="list-disc list-inside text-sm text-text-secondary">
                {characterClass.abilities.map((ability, index) => (
                  <li key={index}>{ability}</li>
                ))}
              </ul>
            </div>

            {showStats && characterClass.bonuses && (
              <div className="mt-auto pt-4 border-t border-white/10">
                <h5 className="text-lg font-bold text-text-primary mb-3">Bônus de Atributos:</h5>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {Object.entries(characterClass.bonuses).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-text-secondary capitalize">{key}:</span>
                      <span className="font-bold text-text-primary">+{value}</span>
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
            <p>Selecione uma classe para ver os detalhes e bônus de atributos.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}