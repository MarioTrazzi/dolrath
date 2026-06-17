'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Wand2, RefreshCw, Check } from 'lucide-react';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import {
  getRaceTransformations,
  TRANSFORMATION_CONFIG,
  getTransformationGlow,
  TransformationType,
} from '@/lib/transformationSystem';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export function TransformationStep() {
  const {
    selectedRace,
    selectedImage,
    chosenTransformation,
    transformationImage,
    setChosenTransformation,
    setTransformationImage,
    markStepComplete,
  } = useCharacterCreationStore();

  const [isGenerating, setIsGenerating] = useState(false);

  const forms = getRaceTransformations(selectedRace?.id) as TransformationType[];
  const isMultiForm = forms.length > 1; // metamorfo
  const singleForm = forms.length === 1 ? forms[0] : null;

  // Raça sem transformação: nada a fazer aqui.
  useEffect(() => {
    if (forms.length === 0) {
      markStepComplete('transformation', true);
    }
  }, [forms.length, markStepComplete]);

  const generate = useCallback(
    async (form: TransformationType) => {
      if (!selectedImage) {
        toast.error('Escolha a imagem do personagem primeiro.');
        return;
      }
      setIsGenerating(true);
      setChosenTransformation(form);
      try {
        const res = await fetch('/api/ai/transformation-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseImage: selectedImage, transformationType: form }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.image) {
          throw new Error(json?.error || 'Falha ao gerar a transformação');
        }
        setTransformationImage(json.image);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao gerar transformação');
        setTransformationImage(null);
      } finally {
        setIsGenerating(false);
      }
    },
    [selectedImage, setChosenTransformation, setTransformationImage]
  );

  // Raças de forma única: gera automaticamente ao entrar na etapa.
  useEffect(() => {
    if (singleForm && selectedImage && !transformationImage && !isGenerating) {
      void generate(singleForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleForm, selectedImage]);

  if (forms.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-text-primary">Transformação</h2>
        <p className="text-text-secondary">
          Esta raça não possui uma transformação de combate. Você pode seguir para a confirmação.
        </p>
      </div>
    );
  }

  const activeForm = (chosenTransformation || singleForm) as TransformationType | null;
  const glow = activeForm ? getTransformationGlow(activeForm) : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Transformação</h2>
        <p className="text-text-secondary">
          {isMultiForm
            ? 'Como metamorfo, escolha UMA forma — ela será a sua única transformação. A IA usa sua imagem para criar a arte da forma transformada.'
            : 'A IA usa sua imagem para revelar a forma que seu herói assume em combate.'}
        </p>
      </div>

      {/* Seleção de forma (apenas metamorfo) */}
      {isMultiForm && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {forms.map((form) => {
            const cfg = TRANSFORMATION_CONFIG[form];
            const selected = chosenTransformation === form;
            return (
              <button
                key={form}
                onClick={() => generate(form)}
                disabled={isGenerating}
                className={cn(
                  'text-left bg-surface/50 border-2 rounded-lg p-4 transition-all disabled:opacity-50',
                  selected ? 'border-primary shadow-lg shadow-primary/25' : 'border-white/10 hover:border-white/30'
                )}
              >
                <div className="font-bold text-text-primary mb-1">{cfg.name}</div>
                <div className="text-xs text-text-secondary">{cfg.description}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Resultado / preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Imagem base */}
        <div className="bg-surface/50 border border-white/10 rounded-lg p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3">Forma base (NFT)</h3>
          {selectedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedImage} alt="Forma base" className="w-full aspect-square object-cover rounded-lg" />
          ) : (
            <div className="w-full aspect-square rounded-lg bg-background/40 flex items-center justify-center text-text-secondary text-sm">
              Sem imagem
            </div>
          )}
        </div>

        {/* Imagem transformada */}
        <div className="bg-surface/50 border border-white/10 rounded-lg p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            {activeForm ? TRANSFORMATION_CONFIG[activeForm]?.name : 'Transformação'}
          </h3>
          <div
            className="relative w-full aspect-square rounded-lg overflow-hidden bg-background/40 flex items-center justify-center"
            style={transformationImage && glow ? { boxShadow: `0 0 24px 4px ${glow.hex}` } : undefined}
          >
            {isGenerating ? (
              <div className="flex flex-col items-center gap-2 text-text-secondary">
                <RefreshCw className="w-6 h-6 animate-spin" />
                <span className="text-sm">Gerando transformação...</span>
              </div>
            ) : transformationImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={transformationImage} alt="Forma transformada" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 w-7 h-7 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              </>
            ) : (
              <span className="text-sm text-text-secondary px-4 text-center">
                {isMultiForm ? 'Escolha uma forma acima para gerar' : 'Aguardando geração...'}
              </span>
            )}
          </div>

          {transformationImage && activeForm && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-text-secondary">
                Brilho em combate: <span style={{ color: glow?.hex }}>{glow?.label}</span>
              </span>
              <button
                onClick={() => generate(activeForm)}
                disabled={isGenerating}
                className="text-xs flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" /> Gerar de novo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
