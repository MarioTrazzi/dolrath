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
  distributedPoints: BaseStats;
  characterName: string;
  selectedImage: string | null;
  // 🐉 Transformação escolhida na criação
  chosenTransformation: string | null;
  transformationImage: string | null;
  // Metamorfo: arte de TODAS as formas (wolf/bear/eagle) gerada na criação.
  // Mapa forma -> imagem. Demais raças usam apenas transformationImage.
  transformationImages: Record<string, string>;
  creationPaymentTxHash: string | null;
  isSubmitting: boolean;

  // Actions
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (stepIndex: number) => void;
  setSelectedRace: (race: CharacterRace) => void;
  setSelectedClass: (characterClass: any) => void;
  setDistributedPoints: (points: BaseStats) => void;
  setCharacterName: (name: string) => void;
  setSelectedImage: (image: string | null) => void;
  setChosenTransformation: (form: string | null) => void;
  setTransformationImage: (image: string | null) => void;
  // Define/limpa a arte de uma forma específica (metamorfo). image=null remove a entrada.
  setTransformationImageFor: (form: string, image: string | null) => void;
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
          id: 'transformation',
          title: 'Transformação',
          description: 'Revele a forma que seu herói assume em combate',
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
      distributedPoints: { str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 },
      characterName: '',
      selectedImage: null,
      chosenTransformation: null,
      transformationImage: null,
      transformationImages: {},
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
              return { ...step, isComplete: characterClass != null };
            }
            if (step.id === 'stats-distribution') {
              return { ...step, isAccessible: characterClass != null, isComplete: false };
            }
            return step;
          });
          return {
            selectedClass: characterClass,
            distributedPoints: { str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 },
            creationSteps: updatedSteps,
          };
        }),

      setDistributedPoints: (points: BaseStats) =>
        set({ distributedPoints: points }),

      setCharacterName: (name: string) => set({ characterName: name }),

      setSelectedImage: (image: string | null) =>
        set((state) => {
          const hasImage = Boolean(image);
          const updatedSteps = state.creationSteps.map((step) => {
            if (step.id === 'appearance') return { ...step, isComplete: hasImage };
            if (step.id === 'transformation') return { ...step, isAccessible: hasImage, isComplete: false };
            // Trocar a imagem base invalida a transformação previamente gerada.
            if (step.id === 'name-confirm') return { ...step, isAccessible: false };
            return step;
          });
          // Reset da transformação: ela é derivada da imagem base.
          return {
            selectedImage: image,
            chosenTransformation: null,
            transformationImage: null,
            transformationImages: {},
            creationSteps: updatedSteps,
          };
        }),

      setChosenTransformation: (form: string | null) =>
        // Trocar a forma invalida a arte gerada anteriormente.
        set({ chosenTransformation: form, transformationImage: null }),

      setTransformationImageFor: (form: string, image: string | null) =>
        set((state) => {
          const next = { ...state.transformationImages };
          if (image) next[form] = image;
          else delete next[form];
          return { transformationImages: next };
        }),

      setTransformationImage: (image: string | null) =>
        set((state) => {
          const ready = Boolean(image);
          const updatedSteps = state.creationSteps.map((step) => {
            if (step.id === 'transformation') return { ...step, isComplete: ready };
            if (step.id === 'name-confirm') return { ...step, isAccessible: ready };
            return step;
          });
          return { transformationImage: image, creationSteps: updatedSteps };
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
          distributedPoints: { str: 0, agi: 0, int: 0, res: 0, hp: 0, mp: 0, crit: 0, speed: 0 },
          characterName: '',
          selectedImage: null,
          chosenTransformation: null,
          transformationImage: null,
          transformationImages: {},
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
        distributedPoints: state.distributedPoints,
        characterName: state.characterName,
        selectedImage: state.selectedImage,
        chosenTransformation: state.chosenTransformation,
        transformationImage: state.transformationImage,
        transformationImages: state.transformationImages,
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
      version: 3,
      migrate: (persistedState: any) => {
        // Drop removed fields from older persisted versions.
        if (persistedState && typeof persistedState === 'object') {
          const next = { ...(persistedState as any) }
          delete (next as any).selectedSpecialization
          // v3 adiciona a etapa de transformação; descarta o passo persistido
          // para que a nova lista de etapas (com 'transformation') seja usada.
          delete (next as any).creationSteps
          delete (next as any).currentStep
          return next
        }
        return persistedState as any
      },
    }
  )
);