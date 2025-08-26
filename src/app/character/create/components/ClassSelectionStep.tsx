'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { CharacterClass } from '@/types/game';
import { ClassCard } from './ClassCard';
import { ClassPreview } from './ClassPreview';
import { CLASSES } from '@/lib/gameData';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';

export function ClassSelectionStep() {
  const { selectedClass, setSelectedClass, markStepComplete } = useCharacterCreationStore();
  const [hoveredClass, setHoveredClass] = useState<CharacterClass | null>(null);
  
  const handleSelectClass = (characterClass: CharacterClass) => {
    setSelectedClass(characterClass);
    markStepComplete('class-selection', true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* Class Selection */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            Escolha sua Classe
          </h2>
          <p className="text-text-secondary">
            Cada classe possui habilidades e equipamentos únicos
          </p>
        </div>
        
        <div className="space-y-4">
          {CLASSES.map((characterClass, index) => (
            <motion.div
              key={characterClass.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <ClassCard
                characterClass={characterClass}
                isSelected={selectedClass?.id === characterClass.id}
                onSelect={handleSelectClass}
                onHover={setHoveredClass}
              />
            </motion.div>
          ))}
        </div>
      </div>
      
      {/* Class Preview */}
      <div className="lg:sticky lg:top-8">
        <ClassPreview 
          characterClass={hoveredClass || selectedClass} 
          showStats={!!selectedClass}
        />
      </div>
    </div>
  );
}