'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

/**
 * Loading com mensagens que avançam enquanto a IA trabalha.
 *
 * A geração é uma única chamada ao servidor (merge do prompt com Claude +
 * geração das imagens), então não há progresso "real" por etapa: as mensagens
 * avançam em intervalo (`stepDurationMs`) e a última ("Finalizando…") fica
 * segurando até a chamada terminar e `active` virar false.
 */
export function GenerationProgress({
  active,
  steps,
  stepDurationMs = 7000,
  className,
}: {
  active: boolean;
  steps: string[];
  stepDurationMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    setIndex(0);
    timerRef.current = setInterval(() => {
      // Avança até a penúltima etapa; segura a última ("Finalizando…").
      setIndex((i) => (i < steps.length - 1 ? i + 1 : i));
    }, stepDurationMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, steps.length, stepDurationMs]);

  if (!active) return null;

  const total = steps.length;
  const progress = total > 1 ? (index / (total - 1)) * 100 : 100;

  return (
    <div
      className={
        'rounded-lg border border-primary/30 bg-surface/60 p-6 text-center ' +
        (className ?? '')
      }
    >
      <div className="flex items-center justify-center mb-4">
        <span className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <Sparkles className="h-7 w-7 text-primary animate-pulse" />
        </span>
      </div>

      <div className="min-h-[1.5rem]">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="text-text-primary font-medium"
          >
            {steps[index]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Barra de progresso (estimativa) */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-primary-dark"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />
      </div>

      <p className="mt-2 text-xs text-text-secondary">
        A IA leva alguns segundos — não feche esta janela.
      </p>
    </div>
  );
}
