import type { ComponentType } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { CharacterRace, BaseStats } from '@/types/character';

const noopStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => {},
  removeItem: (_name: string) => {},
};

interface CreationStep {
  id: string;
  title: string;
  description: string;
  component: ComponentType;
  isComplete: boolean;
  isAccessible: boolean;
}

interface CharacterCreationState {
  currentStep: number;
  creationSteps: CreationStep[];
  selectedRace: CharacterRace | null;
  selectedClass: any | null;
  selectedSpecialization: 'str' | 'agi' | 'int' | 'res' | null;
  distributedPoints: BaseStats;
  characterName: string;
  selectedImage: string | null;
  creationPaymentTxHash: string | null;
  isSubmitting: boolean;
  
  // Actions
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (stepIndex: number) => void;
  setSelectedRace: (race: CharacterRace) => void;
  setSelectedClass: (characterClass: any) => void;
  setSelectedSpecialization: (spec: 'str' | 'agi' | 'int' | 'res' | null) => void;
  setDistributedPoints: (points: BaseStats) => void;
  setCharacterName: (name: string) => void;
  setSelectedImage: (image: string | null) => void;
  setCreationPaymentTxHash: (txHash: string | null) => void;
  markStepComplete: (stepId: string, isComplete: boolean) => void;
  createCharacter: () => Promise<void>;
  resetCreation: () => void;
}

export const useCharacterCreationStore = create<CharacterCreationState>()(
  persist(
    (set, get) => ({
      currentStep: 0,
      creationSteps: [
        {
          id: 'race-selection',
          title: 'Escolha sua Raça',
          description: 'Cada raça possui habilidades únicas',
          component: () => null, // Placeholder, will be replaced in page.tsx
          isComplete: false,
          isAccessible: true,
        },
        {
          id: 'class-selection',
          title: 'Escolha sua Classe',
          description: 'Cada classe possui habilidades e equipamentos únicos',
          component: () => null, // Placeholder
          isComplete: false,
          isAccessible: false,
        },
        {
          id: 'stats-distribution',
          title: 'Distribuir Atributos',
          description: 'Customize seus pontos de atributo',
          component: () => null, // Placeholder
          isComplete: false,
          isAccessible: false,
        },
        {
          id: 'appearance',
          title: 'Aparência',
          description: 'Personalize a aparência do seu personagem',
          component: () => null, // Placeholder
          isComplete: false,
          isAccessible: false,
        },
        {
          id: 'name-confirm',
          title: 'Nome e Confirmação',
          description: 'Finalize a criação do seu personagem',
          component: () => null, // Placeholder
          isComplete: false,
          isAccessible: false,
        },
      ],
      selectedRace: null,
      selectedClass: null,
      selectedSpecialization: null,
      distributedPoints: { str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 },
      characterName: '',
      selectedImage: null,
      creationPaymentTxHash: null,
      isSubmitting: false,

      nextStep: () =>
        set((state) => {
          const next = state.currentStep + 1;
          if (next < state.creationSteps.length) {
            const updatedSteps = state.creationSteps.map((step, index) =>
              index === next ? { ...step, isAccessible: true } : step
            );
            return { currentStep: next, creationSteps: updatedSteps };
          }
          return {};
        }),

      prevStep: () =>
        set((state) => ({
          currentStep: Math.max(0, state.currentStep - 1),
        })),

      goToStep: (stepIndex: number) =>
        set((state) => {
          if (state.creationSteps[stepIndex]?.isAccessible) {
            return { currentStep: stepIndex };
          }
          return {};
        }),

      setSelectedRace: (race: CharacterRace) =>
        set((state) => {
          const updatedSteps = state.creationSteps.map((step) => {
            if (step.id === 'race-selection') return { ...step, isComplete: true };
            if (step.id === 'class-selection') return { ...step, isAccessible: true };
            return step;
          });
          return { selectedRace: race, creationSteps: updatedSteps };
        }),

      setSelectedClass: (characterClass: any) =>
        set((state) => {
          const updatedSteps = state.creationSteps.map((step) => {
            if (step.id === 'class-selection') {
              return { ...step, isComplete: state.selectedSpecialization != null };
            }
            if (step.id === 'stats-distribution') {
              return { ...step, isAccessible: state.selectedSpecialization != null };
            }
            return step;
          });
          return { selectedClass: characterClass, creationSteps: updatedSteps };
        }),

      setSelectedSpecialization: (spec) =>
        set((state) => {
          const updatedSteps = state.creationSteps.map((step) => {
            if (step.id === 'class-selection') {
              return { ...step, isComplete: spec != null && state.selectedClass != null };
            }
            if (step.id === 'stats-distribution') {
              return { ...step, isAccessible: spec != null && state.selectedClass != null };
            }
            return step;
          });
          return { selectedSpecialization: spec, creationSteps: updatedSteps };
        }),

      setDistributedPoints: (points: BaseStats) =>
        set((state) => {
          const updatedSteps = state.creationSteps.map((step) => {
            if (step.id === 'stats-distribution') return { ...step, isComplete: true };
            if (step.id === 'appearance') return { ...step, isAccessible: true };
            return step;
          });
          return { distributedPoints: points, creationSteps: updatedSteps };
        }),

      setCharacterName: (name: string) => set({ characterName: name }),

      setSelectedImage: (image: string | null) =>
        set((state) => {
          const updatedSteps = state.creationSteps.map((step) => {
            if (step.id === 'appearance') return { ...step, isComplete: true };
            if (step.id === 'name-confirm') return { ...step, isAccessible: true };
            return step;
          });
          return { selectedImage: image, creationSteps: updatedSteps };
        }),

      setCreationPaymentTxHash: (txHash: string | null) => set({ creationPaymentTxHash: txHash }),

      markStepComplete: (stepId: string, isComplete: boolean) =>
        set((state) => ({
          creationSteps: state.creationSteps.map((step) => (step.id === stepId ? { ...step, isComplete } : step)),
        })),

      createCharacter: async () => {
        const { characterName, selectedRace, selectedClass } = get();
        if (!characterName || !selectedRace || !selectedClass) {
          console.error('Missing character creation data.');
          return;
        }
        set({ isSubmitting: true });
        try {
          const response = await fetch('/api/character', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: characterName,
              race: selectedRace.name, // Sending name, ensure backend expects this
              characterClass: selectedClass.name, // Sending name
            }),
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create character');
          }
          console.log('Character created successfully!');
        } catch (error) {
          console.error('Error creating character:', error);
        } finally {
          set({ isSubmitting: false });
        }
      },

      resetCreation: () =>
        set((state) => ({
          currentStep: 0,
          selectedRace: null,
          selectedClass: null,
          selectedSpecialization: null,
          distributedPoints: { str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 },
          characterName: '',
          selectedImage: null,
          creationPaymentTxHash: null,
          isSubmitting: false,
          creationSteps: state.creationSteps.map((step, index) => ({
            ...step,
            isComplete: false,
            isAccessible: index === 0,
          })),
        })),
    }),
    {
      name: 'dolrath.characterCreation.v1',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? localStorage : (noopStorage as any))),
      partialize: (state) => ({
        currentStep: state.currentStep,
        creationSteps: state.creationSteps.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          isComplete: s.isComplete,
          isAccessible: s.isAccessible,
        })),
        selectedRace: state.selectedRace,
        selectedClass: state.selectedClass,
        selectedSpecialization: state.selectedSpecialization,
        distributedPoints: state.distributedPoints,
        characterName: state.characterName,
        selectedImage: state.selectedImage,
        creationPaymentTxHash: state.creationPaymentTxHash,
      }),
      merge: (persistedState: any, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<CharacterCreationState>;
        const { creationSteps: persistedSteps, currentStep: persistedCurrentStep, ...rest } = persisted;

        const stepById = new Map(
          Array.isArray(persistedSteps)
            ? persistedSteps.map((s: any) => [s.id, s])
            : []
        );

        const mergedSteps = currentState.creationSteps.map((step) => {
          const p = stepById.get(step.id);
          if (!p) return step;
          return {
            ...step,
            isComplete: Boolean(p.isComplete),
            isAccessible: Boolean(p.isAccessible),
          };
        });

        const nextCurrentStep =
          typeof persistedCurrentStep === 'number'
            ? Math.min(Math.max(0, persistedCurrentStep), mergedSteps.length - 1)
            : currentState.currentStep;

        return {
          ...currentState,
          ...rest,
          currentStep: nextCurrentStep,
          creationSteps: mergedSteps,
        };
      },
      version: 1,
      migrate: (persistedState) => persistedState as any,
    }
  )
);