'use client';

// ⚔️ Indicador de etapas da criação — mesma linguagem visual do EnhancementDialog:
// moldura em losango (chumbo + ouro) por etapa, ligadas por um circuito que acende
// e dispara um "cometa de luz" ao avançar de etapa.

import { Fragment, useEffect, useRef, useState, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const GOLD = '#c9a25f';
const GOLD_BRIGHT = '#e7c682';

interface StepMeta {
  id: string;
  title: string;
  isComplete: boolean;
  isAccessible: boolean;
}

interface CreationStepIndicatorProps {
  steps: StepMeta[];
  currentStep: number;
  onStepClick: (index: number) => void;
  icons?: Record<string, ComponentType<{ className?: string }>>;
}

export function CreationStepIndicator({ steps, currentStep, onStepClick, icons }: CreationStepIndicatorProps) {
  const prevStepRef = useRef(currentStep);
  const [travelSegment, setTravelSegment] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevStepRef.current;
    // Só dispara o cometa quando avança exatamente uma etapa (botão "Próximo").
    if (currentStep === prev + 1) {
      setTravelSegment(prev);
      const t = setTimeout(() => setTravelSegment(null), 650);
      prevStepRef.current = currentStep;
      return () => clearTimeout(t);
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

  return (
    <div className="mb-12 rounded-[4px] border border-[#46464c] bg-[#1e1e21]/95 px-6 py-6 shadow-2xl shadow-black/60">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const Icon = icons?.[step.id];
          const isActive = index === currentStep;
          const isDone = step.isComplete && index !== currentStep;
          const isFuture = index > currentStep && !step.isComplete;

          return (
            <Fragment key={step.id}>
              <div className="flex shrink-0 flex-col items-center">
                <motion.button
                  type="button"
                  onClick={() => onStepClick(index)}
                  disabled={!step.isAccessible}
                  className="relative grid h-14 w-14 shrink-0 place-items-center disabled:cursor-not-allowed"
                  whileHover={step.isAccessible ? { scale: 1.06 } : undefined}
                >
                  {/* Moldura externa */}
                  <motion.div
                    className="absolute inset-[8px] rotate-45 rounded-[3px] border bg-gradient-to-br from-[#2c2620] to-[#141210]"
                    animate={
                      isActive
                        ? {
                            borderColor: GOLD_BRIGHT,
                            boxShadow: [
                              '0 0 14px rgba(201,162,95,0.35)',
                              '0 0 22px rgba(231,198,130,0.55)',
                              '0 0 14px rgba(201,162,95,0.35)',
                            ],
                          }
                        : isDone
                          ? { borderColor: GOLD, boxShadow: '0 0 8px rgba(201,162,95,0.18)' }
                          : { borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 0 0 rgba(0,0,0,0)' }
                    }
                    transition={
                      isActive
                        ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                        : { duration: 0.5 }
                    }
                  />
                  {/* Janela interna */}
                  <div
                    className="absolute inset-[13px] rotate-45 overflow-hidden rounded-[2px] border bg-black"
                    style={{ borderColor: isFuture ? 'rgba(255,255,255,0.1)' : 'rgba(201,162,95,0.55)' }}
                  >
                    <span
                      className={cn(
                        'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45',
                        isFuture ? 'text-white/30' : 'text-[#e7c682]'
                      )}
                    >
                      {isDone ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : Icon ? (
                        <Icon className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-bold">{index + 1}</span>
                      )}
                    </span>
                  </div>
                  {/* Cravos nos 4 vértices */}
                  {[
                    'left-1/2 top-0 -translate-x-1/2',
                    'left-1/2 bottom-0 -translate-x-1/2',
                    'top-1/2 left-0 -translate-y-1/2',
                    'top-1/2 right-0 -translate-y-1/2',
                  ].map((pos) => (
                    <span
                      key={pos}
                      className={cn(
                        'absolute h-[5px] w-[5px] rotate-45 border bg-[#1e1e21]',
                        pos,
                        isFuture ? 'border-white/10' : 'border-[#8a6d3b]'
                      )}
                    />
                  ))}
                </motion.button>
                <span
                  className={cn(
                    'mt-2 max-w-[92px] text-center text-xs transition-colors duration-300',
                    index <= currentStep ? 'text-text-primary' : 'text-text-secondary'
                  )}
                >
                  {step.title}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div className="relative mx-1 h-[2px] flex-1 -translate-y-3 overflow-visible rounded-full bg-white/10">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      width: index < currentStep ? '100%' : '0%',
                      background: 'linear-gradient(to right, rgba(201,162,95,0.4), rgba(231,198,130,0.9))',
                      boxShadow: index < currentStep ? '0 0 8px rgba(201,162,95,0.5)' : 'none',
                    }}
                  />
                  <AnimatePresence>
                    {travelSegment === index && (
                      <motion.div
                        key={`comet-${index}-${currentStep}`}
                        initial={{ left: '-8%', opacity: 0 }}
                        animate={{ left: ['-8%', '104%'], opacity: [0, 1, 1, 0] }}
                        transition={{ duration: 0.6, ease: 'easeIn' }}
                        className="absolute top-1/2 z-10 flex -translate-y-1/2 items-center"
                      >
                        <span
                          className="h-[2px] w-6"
                          style={{ background: 'linear-gradient(to right, transparent, rgba(231,198,130,0.9))' }}
                        />
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            background: GOLD_BRIGHT,
                            boxShadow: '0 0 10px 4px rgba(231,198,130,0.85), 0 0 22px 8px rgba(201,162,95,0.35)',
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
