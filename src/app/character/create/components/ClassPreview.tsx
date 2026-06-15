'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CharacterClass } from '@/types/game';
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop';
import { getCreationVisual } from '@/lib/creationVisuals';
import { getClassStatBonuses } from '@/lib/characterStats';

interface ClassPreviewProps {
  characterClass: CharacterClass | null;
  showStats: boolean;
}

const STAT_LABELS = { str: 'Força', agi: 'Agilidade', int: 'Inteligência', def: 'Defesa' } as const;

export function ClassPreview({ characterClass, showStats }: ClassPreviewProps) {
  const visual = characterClass ? getCreationVisual(characterClass.id) : null;
  const classBonuses = characterClass ? getClassStatBonuses(characterClass.id) : null;

  return (
    <div
      className="relative overflow-hidden rounded-xl p-6 border-2 h-full flex flex-col transition-all duration-300"
      style={{ borderColor: visual ? `${visual.accent}66` : 'rgba(255,255,255,0.1)' }}
    >
      {/* Cenário animado segue a classe em foco */}
      {visual && (
        <div className="absolute inset-0">
          <CreationCardBackdrop theme={visual.theme} />
        </div>
      )}
      <div className={`absolute inset-0 ${visual ? 'bg-black/55' : 'bg-black/40'}`} />

      <div className="relative flex flex-col flex-1">
        <h3 className="text-xl font-bold text-white mb-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          Prévia da Classe
        </h3>

        <AnimatePresence mode="wait">
          {characterClass && visual ? (
            <motion.div
              key={characterClass.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-20 h-20 rounded-lg flex items-center justify-center text-4xl flex-shrink-0 border drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                  style={{ background: `linear-gradient(135deg, ${visual.accent}55, ${visual.accent}22)`, borderColor: `${visual.accent}66` }}
                >
                  {visual.emoji}
                </div>
                <div>
                  <h4 className="text-2xl font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{characterClass.name}</h4>
                  <p className="text-white/70 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{characterClass.description}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium mb-2" style={{ color: visual.accent }}>Habilidades:</p>
                <ul className="list-disc list-inside text-sm text-white/70">
                  {characterClass.abilities.map((ability, index) => (
                    <li key={index}>{ability}</li>
                  ))}
                </ul>
              </div>

              {showStats && classBonuses && (
                <div className="mt-auto pt-4 border-t border-white/15">
                  <h5 className="text-lg font-bold text-white mb-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Bônus de Atributos:</h5>
                  <p className="text-xs text-white/50 mb-3">Somados aos bônus raciais e aos pontos distribuídos.</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {(Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map((key) => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-white/60">{STAT_LABELS[key]}:</span>
                        <span className="font-bold" style={{ color: classBonuses[key] > 0 ? visual.accent : 'rgba(255,255,255,0.4)' }}>
                          {classBonuses[key] > 0 ? `+${classBonuses[key]}` : '—'}
                        </span>
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
              className="flex-1 flex items-center justify-center text-white/50 text-center"
            >
              <p>Selecione uma classe para ver os detalhes e bônus de atributos.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
