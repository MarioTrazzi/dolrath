import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { CharacterRace } from '@/types/character';

interface RaceCardProps {
  race: CharacterRace;
  isSelected: boolean;
  onSelect: (race: CharacterRace) => void;
  onHover: (race: CharacterRace | null) => void;
}

export function RaceCard({ race, isSelected, onSelect, onHover }: RaceCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onMouseEnter={() => onHover(race)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(race)}
      className={cn(
        "p-6 rounded-xl border-2 cursor-pointer transition-all duration-300",
        "bg-surface/50 backdrop-blur-sm",
        isSelected 
          ? "border-primary shadow-lg shadow-primary/25" 
          : "border-white/20 hover:border-white/40"
      )}
    >
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-dark rounded-lg flex items-center justify-center text-2xl">
          {race.id === 'draconiano' && '🐉'}
          {race.id === 'metamorfo' && '🐺'}
          {race.id === 'humano' && '⚔️'}
          {race.id === 'elfo' && '🧝'}
        </div>
        
        <div className="flex-1">
          <h3 className="text-xl font-bold text-text-primary mb-1">
            {race.name}
          </h3>
          <p className="text-text-secondary text-sm mb-3">
            {race.description}
          </p>
          
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-primary/20 text-primary text-xs rounded-full">
              {race.specialAbility}
            </span>
            {race.transformation && (
              <span className="px-3 py-1 bg-accent/20 text-accent text-xs rounded-full">
                Transformação: {race.transformation}
              </span>
            )}
          </div>
        </div>
        
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-6 h-6 bg-primary rounded-full flex items-center justify-center"
          >
            <Check className="w-4 h-4 text-white" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
