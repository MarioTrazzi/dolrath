'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { CharacterRace } from '@/types/character';
import { CharacterClass } from '@/types/game';

interface CharacterSummaryProps {
  race: CharacterRace | null;
  characterClass?: CharacterClass | null;
  characterName: string;
  imageUrl: string | null;
}

export function CharacterSummary({ race, characterClass, characterName, imageUrl }: CharacterSummaryProps) {
  return (
    <div className="bg-surface/50 backdrop-blur-sm rounded-xl p-6 border border-white/10 h-full flex flex-col items-center text-center">
      <h3 className="text-xl font-bold text-text-primary mb-4">
        Resumo do Personagem
      </h3>

      <AnimatePresence mode="wait">
        {race ? (
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
                className="w-40 h-40 rounded-full object-cover art-bright border-4 border-primary shadow-lg mb-4"
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

            <div className="w-full flex items-start gap-2 text-left text-sm text-[#c9a25f] bg-[#3a3325]/30 border border-[#8a6d3b]/40 rounded-lg px-3 py-2 mb-4">
              <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Os atributos (STR/AGI/INT/DEF) são revelados no momento do mint.</span>
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
