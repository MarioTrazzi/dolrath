'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CharacterRace, BaseStats } from '@/types/character';
import { CharacterClass } from '@/types/game';
import { computeCreationStats, type StatFour, type DerivedStats } from '@/lib/characterStats';

interface CharacterSummaryProps {
  race: CharacterRace | null;
  characterClass?: CharacterClass | null;
  distributedPoints: BaseStats;
  characterName: string;
  imageUrl: string | null;
}

export function CharacterSummary({ race, characterClass, distributedPoints, characterName, imageUrl }: CharacterSummaryProps) {
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

  const derived: { key: keyof DerivedStats; label: string }[] = [
    { key: 'hp', label: '❤️ HP' },
    { key: 'mp', label: '🔮 MP' },
    { key: 'stamina', label: '⚡ Stamina' },
    { key: 'attack', label: '⚔️ Ataque' },
  ];

  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full flex flex-col items-center text-center">
      <h3 className="text-xl font-bold text-text-primary mb-4">
        Resumo do Personagem
      </h3>

      <AnimatePresence mode="wait">
        {race && stats ? (
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
            <p className="text-lg text-primary mb-4">
              {race.name}{characterClass ? ` · ${characterClass.name}` : ''}
            </p>

            <div className="w-full grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
              {primary.map(({ key, label }) => (
                <div key={key} className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-text-secondary">{label}:</span>
                  <span className="font-bold text-text-primary text-base">{stats.final[key]}</span>
                </div>
              ))}
              {derived.map(({ key, label }) => (
                <div key={key} className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-text-secondary">{label}:</span>
                  <span className="font-bold text-text-primary text-base">{stats.derived[key]}</span>
                </div>
              ))}
            </div>

            <div className="w-full text-left">
              <h5 className="text-lg font-bold text-text-primary mb-2">Habilidades:</h5>
              <ul className="list-disc list-inside text-text-secondary text-sm space-y-1">
                <li><span className="font-medium text-primary">Raça:</span> {race.specialAbility}</li>
                {race.transformation && (
                  <li><span className="font-medium text-accent">Transformação:</span> {race.transformation}</li>
                )}
                {characterClass && characterClass.abilities?.length > 0 && (
                  <li><span className="font-medium text-primary">Classe:</span> {characterClass.abilities.join(', ')}</li>
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
