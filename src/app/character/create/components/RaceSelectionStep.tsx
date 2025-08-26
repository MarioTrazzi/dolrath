'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { CharacterRace } from '@/types/character';
import { RaceCard } from './RaceCard';
import { RacePreview } from './RacePreview';
import { races } from '@/lib/characterCreationData';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';

export function RaceSelectionStep() {
  const { selectedRace, setSelectedRace, markStepComplete } = useCharacterCreationStore();
  const [hoveredRace, setHoveredRace] = useState<CharacterRace | null>(null);
  
  const handleSelectRace = (race: CharacterRace) => {
    setSelectedRace(race);
    markStepComplete('race-selection', true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* Race Selection */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            Escolha sua Raça
          </h2>
          <p className="text-text-secondary">
            Cada raça possui atributos únicos e habilidades especiais
          </p>
        </div>
        
        <div className="space-y-4">
          {races.map((race, index) => (
            <motion.div
              key={race.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <RaceCard
                race={race}
                isSelected={selectedRace?.id === race.id}
                onSelect={handleSelectRace}
                onHover={setHoveredRace}
              />
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* Race Preview */}
      <div className="lg:sticky lg:top-8">
        <RacePreview 
          race={hoveredRace || selectedRace} 
          showStats={!!selectedRace}
        />
      </div>
    </div>
  );
}
