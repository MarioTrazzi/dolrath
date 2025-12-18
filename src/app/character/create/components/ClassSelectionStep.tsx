'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { CharacterClass } from '@/types/game';
import { ClassCard } from './ClassCard';
import { ClassPreview } from './ClassPreview';
import { CLASSES } from '@/lib/gameData';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';

export function ClassSelectionStep() {
  const {
    selectedClass,
    selectedSpecialization,
    setSelectedClass,
    setSelectedSpecialization,
    markStepComplete,
  } = useCharacterCreationStore();
  const [hoveredClass, setHoveredClass] = useState<CharacterClass | null>(null);
  
  const handleSelectClass = (characterClass: CharacterClass) => {
    setSelectedClass(characterClass);
    markStepComplete('class-selection', !!selectedSpecialization);
  };

  const specializations: Array<{ id: 'str' | 'agi' | 'int' | 'res'; title: string; description: string }> = [
    { id: 'str', title: 'Ofensivo (STR)', description: 'Foco em dano físico e impacto' },
    { id: 'agi', title: 'Ágil (AGI)', description: 'Foco em velocidade, crítico e esquiva' },
    { id: 'int', title: 'Arcano (INT)', description: 'Foco em dano mágico e mana' },
    { id: 'res', title: 'Defensivo (DEF)', description: 'Foco em durabilidade e resistência' },
  ];

  const handleSelectSpecialization = (spec: 'str' | 'agi' | 'int' | 'res') => {
    setSelectedSpecialization(spec);
    markStepComplete('class-selection', !!selectedClass);
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

        <div className="pt-6 border-t border-white/10">
          <h3 className="text-lg font-bold text-text-primary mb-2">Escolha sua Especialização</h3>
          <p className="text-text-secondary mb-4">
            Você escolhe a especialização e os atributos serão rolados automaticamente.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {specializations.map((spec) => {
              const isSelected = selectedSpecialization === spec.id;
              const isDisabled = !selectedClass;

              return (
                <button
                  key={spec.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectSpecialization(spec.id)}
                  className={
                    isSelected
                      ? 'text-left px-4 py-3 rounded-lg bg-primary text-white font-medium disabled:opacity-50'
                      : 'text-left px-4 py-3 rounded-lg bg-surface border border-white/20 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                  }
                >
                  <div className="font-semibold">{spec.title}</div>
                  <div className={isSelected ? 'text-white/80 text-sm mt-1' : 'text-text-secondary text-sm mt-1'}>
                    {spec.description}
                  </div>
                </button>
              );
            })}
          </div>
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