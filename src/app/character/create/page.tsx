'use client';

import { useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { RaceSelectionStep } from './components/RaceSelectionStep';
import { ClassSelectionStep } from './components/ClassSelectionStep';
import { StatsDistributionStep } from './components/StatsDistributionStep';
import { AppearanceStep } from './components/AppearanceStep';
import { NameConfirmStep } from './components/NameConfirmStep';
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function CharacterCreationPage() {
  const { currentStep, creationSteps, nextStep, prevStep, goToStep, resetCreation } = useCharacterCreationStore();

  // Reset creation state when component mounts
  useEffect(() => {
    resetCreation();
  }, [resetCreation]);

  // Dynamically assign components to steps
  useEffect(() => {
    useCharacterCreationStore.setState((state) => ({
      creationSteps: state.creationSteps.map(step => {
        if (step.id === 'race-selection') return { ...step, component: RaceSelectionStep };
        if (step.id === 'class-selection') return { ...step, component: ClassSelectionStep };
        if (step.id === 'stats-distribution') return { ...step, component: StatsDistributionStep };
        if (step.id === 'appearance') return { ...step, component: AppearanceStep };
        if (step.id === 'name-confirm') return { ...step, component: NameConfirmStep };
        return step;
      })
    }));
  }, []);

  const CurrentStepComponent = useMemo(() => {
    const step = creationSteps[currentStep];
    return step ? step.component : null;
  }, [currentStep, creationSteps]);

  const isNextButtonDisabled = useMemo(() => {
    const step = creationSteps[currentStep];
    if (!step) return true;

    // Disable next button if current step is not complete
    return !step.isComplete;
  }, [currentStep, creationSteps]);

  return (
    <div className="min-h-screen bg-background text-text-primary p-8 relative">
      <div className="max-w-6xl mx-auto py-12">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl font-extrabold text-center mb-12 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark"
        >
          Criação de Personagem
        </motion.h1>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            {creationSteps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center relative">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300",
                    index <= currentStep
                      ? "bg-primary text-white"
                      : "bg-surface text-text-secondary border border-white/20",
                    step.isAccessible && "cursor-pointer hover:scale-110"
                  )}
                  onClick={() => goToStep(index)}
                >
                  {step.isComplete ? <CheckCircle className="w-5 h-5" /> : index + 1}
                </div>
                <span
                  className={cn(
                    "mt-2 text-sm text-center transition-colors duration-300",
                    index <= currentStep ? "text-text-primary" : "text-text-secondary"
                  )}
                >
                  {step.title}
                </span>
                {index < creationSteps.length - 1 && (
                  <div
                    className={cn(
                      "absolute left-[calc(50%+20px)] top-5 h-1 w-[calc(100%-40px)] -translate-y-1/2 transition-colors duration-300",
                      index < currentStep ? "bg-primary" : "bg-white/20"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-surface/30 backdrop-blur-lg rounded-xl p-8 shadow-2xl border border-white/10"
        >
          {CurrentStepComponent && <CurrentStepComponent />}
        </motion.div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-6 py-3 bg-surface border border-white/20 rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Anterior
          </button>

          <button
            onClick={nextStep}
            disabled={isNextButtonDisabled || currentStep === creationSteps.length - 1}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Próximo
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
