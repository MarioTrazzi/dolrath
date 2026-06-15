'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CharacterRace, BaseStats } from '@/types/character';
import { CharacterClass } from '@/types/game';
import { computeCreationStats, type StatFour, type DerivedStats } from '@/lib/characterStats';

interface StatPreviewProps {
  race: CharacterRace | null;
  characterClass?: CharacterClass | null;
  distributedPoints: BaseStats;
}

export function StatPreview({ race, characterClass, distributedPoints }: StatPreviewProps) {
  const stats = race
    ? computeCreationStats(race.id, characterClass?.id, {
        str: distributedPoints.str,
        agi: distributedPoints.agi,
        int: distributedPoints.int,
        def: (distributedPoints as any).res ?? 0,
      })
    : null;

  const primary: { key: keyof StatFour; label: string }[] = [
    { key: 'str', label: 'Força' },
    { key: 'agi', label: 'Agilidade' },
    { key: 'int', label: 'Inteligência' },
    { key: 'def', label: 'Defesa' },
  ];

  const derived: { key: keyof DerivedStats; label: string; fixed?: number }[] = [
    { key: 'hp', label: '❤️ HP' },
    { key: 'mp', label: '🔮 MP' },
    { key: 'stamina', label: '⚡ Stamina' },
    { key: 'attack', label: '⚔️ Ataque' },
    { key: 'defense', label: '🛡️ Mitigação' },
    { key: 'magicPower', label: '✨ Poder Mágico' },
    { key: 'critical', label: '🎯 Crítico %', fixed: 1 },
    { key: 'dodgeChance', label: '💨 Esquiva %', fixed: 1 },
  ];

  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full flex flex-col">
      <h3 className="text-xl font-bold text-text-primary mb-4">
        Prévia dos Atributos Finais
      </h3>

      <AnimatePresence mode="wait">
        {race && stats ? (
          <motion.div
            key={race.id + (characterClass?.id ?? '') + JSON.stringify(distributedPoints)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col"
          >
            {/* Atributos primários com decomposição base + raça + classe */}
            <div className="space-y-2">
              {primary.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between text-sm py-1 border-b border-white/5">
                  <span className="text-text-secondary">{label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-text-secondary/60 text-xs">
                      {stats.base[key]}
                      <span className="text-primary"> +{stats.race[key]}</span>
                      <span className="text-accent"> +{stats.class[key]}</span>
                    </span>
                    <span className="font-bold text-text-primary text-base w-8 text-right">{stats.final[key]}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-1 text-[10px] text-text-secondary/70">
              <span>distribuído</span>
              <span className="text-primary">racial</span>
              <span className="text-accent">classe</span>
            </div>

            {/* Atributos derivados */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <h4 className="text-sm font-bold text-text-primary mb-3">Atributos Derivados:</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {derived.map(({ key, label, fixed }) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-text-secondary">{label}:</span>
                    <span className="font-bold text-text-primary">
                      {fixed ? stats.derived[key].toFixed(fixed) : stats.derived[key]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {!characterClass && (
              <p className="mt-4 text-xs text-yellow-400/80">
                Selecione uma classe para incluir os bônus de classe na prévia.
              </p>
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
            <p>Selecione uma raça e distribua pontos para ver a prévia dos atributos.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
