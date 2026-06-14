import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { CharacterClass } from '@/types/game';
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop';
import { getCreationVisual } from '@/lib/creationVisuals';

interface ClassCardProps {
  characterClass: CharacterClass;
  isSelected: boolean;
  onSelect: (characterClass: CharacterClass) => void;
  onHover: (characterClass: CharacterClass | null) => void;
}

export function ClassCard({ characterClass, isSelected, onSelect, onHover }: ClassCardProps) {
  const visual = getCreationVisual(characterClass.id);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onMouseEnter={() => onHover(characterClass)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(characterClass)}
      className="relative overflow-hidden p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 group"
      style={{
        borderColor: isSelected ? visual.accent : `${visual.accent}55`,
        boxShadow: isSelected ? `0 0 24px ${visual.accentSoft}` : undefined,
      }}
    >
      {/* Cenário animado da classe */}
      <div className="absolute inset-0">
        <CreationCardBackdrop theme={visual.theme} />
      </div>
      <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-black/35' : 'bg-black/50 group-hover:bg-black/40'}`} />

      <div className="relative flex items-start gap-4">
        <div
          className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 border drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
          style={{ background: `linear-gradient(135deg, ${visual.accent}55, ${visual.accent}22)`, borderColor: `${visual.accent}66` }}
        >
          {visual.emoji}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-white mb-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {characterClass.name}
          </h3>
          <p className="text-white/70 text-sm mb-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {characterClass.description}
          </p>

          <div className="flex flex-wrap gap-2">
            {characterClass.abilities.map((ability) => (
              <span
                key={ability}
                className={`px-3 py-1 ${visual.chipBg} ${visual.chipText} text-xs rounded-full border`}
                style={{ borderColor: `${visual.accent}55` }}
              >
                {ability}
              </span>
            ))}
          </div>
        </div>

        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="relative w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: visual.accent }}
          >
            <Check className="w-4 h-4 text-white" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
