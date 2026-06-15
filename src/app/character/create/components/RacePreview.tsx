'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CharacterRace } from '@/types/character';
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop';
import { getCreationVisual } from '@/lib/creationVisuals';
import { getRaceStatBonuses } from '@/lib/characterStats';
import { getRaceTransformations, TRANSFORMATION_CONFIG } from '@/lib/transformationSystem';

interface RacePreviewProps {
  race: CharacterRace | null;
  showStats: boolean;
}

const STAT_LABELS: Record<keyof ReturnType<typeof getRaceStatBonuses>, string> = {
  str: 'Força',
  agi: 'Agilidade',
  int: 'Inteligência',
  def: 'Defesa',
};

export function RacePreview({ race, showStats }: RacePreviewProps) {
  const visual = race ? getCreationVisual(race.id) : null;
  const raceBonuses = race ? getRaceStatBonuses(race.id) : null;
  const transformForms = race ? getRaceTransformations(race.id).map((t) => TRANSFORMATION_CONFIG[t]) : [];

  return (
    <div
      className="relative overflow-hidden rounded-xl p-6 border-2 h-full flex flex-col transition-all duration-300"
      style={{ borderColor: visual ? `${visual.accent}66` : 'rgba(255,255,255,0.1)' }}
    >
      {/* Cenário animado segue a raça em foco */}
      {visual && (
        <div className="absolute inset-0">
          <CreationCardBackdrop theme={visual.theme} />
        </div>
      )}
      <div className={`absolute inset-0 ${visual ? 'bg-black/55' : 'bg-black/40'}`} />

      <div className="relative flex flex-col flex-1">
        <h3 className="text-xl font-bold text-white mb-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          Prévia da Raça
        </h3>

        <AnimatePresence mode="wait">
          {race && visual ? (
            <motion.div
              key={race.id}
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
                  <h4 className="text-2xl font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{race.name}</h4>
                  <p className="text-white/70 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{race.description}</p>
                </div>
              </div>

              <p className="text-white/70 mb-4 text-sm leading-relaxed drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                {race.lore}
              </p>

              <div className="bg-black/40 rounded-md p-3 border border-white/10 mb-4">
                <p className="text-xs text-white/60">Habilidade Especial</p>
                <p className="font-medium text-sm" style={{ color: visual.accent }}>{race.specialAbility}</p>
              </div>

              {/* Transformação — explicação do que faz em combate */}
              {transformForms.length > 0 && (
                <div className="mb-4 rounded-xl border p-3" style={{ borderColor: `${visual.accent}55`, background: `${visual.accent}11` }}>
                  <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: visual.accent }}>
                    🌀 Transformação {transformForms.length > 1 ? `(${transformForms.length} formas)` : ''}
                  </p>
                  <div className="space-y-2.5">
                    {transformForms.map((cfg) => (
                      <div key={cfg.name} className="bg-black/40 rounded-lg p-2.5 border border-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white text-sm">{cfg.name}</span>
                          <span className="text-[10px] text-white/60 whitespace-nowrap">
                            🔮{cfg.cost.mp} ⚡{cfg.cost.stamina} • {cfg.duration} turnos
                          </span>
                        </div>
                        <p className="text-xs text-white/70 mt-1">{cfg.description}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {cfg.specialAbilities.map((ab) => (
                            <span
                              key={ab.id}
                              title={ab.description}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80 border border-white/10"
                            >
                              {ab.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-white/45 mt-2">
                    Ativável em combate gastando MP e stamina; dura alguns turnos e entra em recarga depois.
                  </p>
                </div>
              )}

              {race.restrictions && race.restrictions.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-red-400 mb-2">Restrições:</p>
                  <ul className="list-disc list-inside text-sm text-red-300">
                    {race.restrictions.map((restriction, index) => (
                      <li key={index}>{restriction}</li>
                    ))}
                  </ul>
                </div>
              )}

              {showStats && raceBonuses && (
                <div className="mt-auto pt-4 border-t border-white/15">
                  <h5 className="text-lg font-bold text-white mb-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Bônus Raciais Aplicados:</h5>
                  <p className="text-xs text-white/50 mb-3">Somados aos bônus de classe e aos pontos distribuídos.</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {(Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map((key) => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-white/60">{STAT_LABELS[key]}:</span>
                        <span className="font-bold" style={{ color: raceBonuses[key] > 0 ? visual.accent : 'rgba(255,255,255,0.4)' }}>
                          {raceBonuses[key] > 0 ? `+${raceBonuses[key]}` : '—'}
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
              <p>Selecione uma raça para ver os detalhes e bônus raciais. Os atributos finais do personagem serão rolados automaticamente mais adiante.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
