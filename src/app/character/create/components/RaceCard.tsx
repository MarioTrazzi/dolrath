import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { CharacterRace } from '@/types/character';
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop';
import { getCreationVisual } from '@/lib/creationVisuals';

interface RaceCardProps {
  race: CharacterRace;
  isSelected: boolean;
  onSelect: (race: CharacterRace) => void;
  onHover: (race: CharacterRace | null) => void;
}

export function RaceCard({ race, isSelected, onSelect, onHover }: RaceCardProps) {
  const visual = getCreationVisual(race.id);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onMouseEnter={() => onHover(race)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(race)}
      className="relative overflow-hidden p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 group"
      style={{
        borderColor: isSelected ? visual.accent : `${visual.accent}55`,
        boxShadow: isSelected ? `0 0 24px ${visual.accentSoft}` : undefined,
      }}
    >
      {/* Cenário animado da raça */}
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
            {race.name}
          </h3>
          <p className="text-white/70 text-sm mb-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {race.description}
          </p>

          <div className="flex flex-wrap gap-2">
            <span
              className={`px-3 py-1 ${visual.chipBg} ${visual.chipText} text-xs rounded-full border`}
              style={{ borderColor: `${visual.accent}55` }}
            >
              {race.specialAbility}
            </span>
            {race.transformation && (
              <span className="px-3 py-1 bg-white/10 text-white/80 text-xs rounded-full border border-white/20">
                Transformação: {race.transformation}
              </span>
            )}
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
