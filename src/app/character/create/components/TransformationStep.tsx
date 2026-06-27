'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { GenerationProgress } from './GenerationProgress';

// Mensagens de loading enquanto a IA gera a arte da transformação.
const TRANSFORMATION_STEPS = [
  'Coletando e ajustando o prompt para a lore de Dolrath…',
  'Revelando a forma de combate do seu herói…',
  'Finalizando…',
];

export function TransformationStep() {
  const {
    selectedRace,
    selectedImage,
    chosenTransformation,
    transformationImage,
    transformationImages,
    setChosenTransformation,
    setTransformationImage,
    setTransformationImageFor,
    markStepComplete,
  } = useCharacterCreationStore();

  // Formas sendo geradas no momento (uma ou várias em paralelo).
  const [generating, setGenerating] = useState<Record<string, boolean>>({});

  const forms = getRaceTransformations(selectedRace?.id) as TransformationType[];
  const isMultiForm = forms.length > 1; // metamorfo
  const singleForm = forms.length === 1 ? forms[0] : null;

  // Raça sem transformação: nada a fazer aqui.
  useEffect(() => {
    if (forms.length === 0) {
      markStepComplete('transformation', true);
    }
  }, [forms.length, markStepComplete]);

  // Gera a arte de uma forma específica a partir da imagem base.
  const generate = useCallback(
    async (form: TransformationType) => {
      if (!selectedImage) {
        toast.error('Escolha a imagem do personagem primeiro.');
        return;
      }
      setGenerating((g) => ({ ...g, [form]: true }));
      // Single-form: também registra a forma escolhida.
      if (!isMultiForm) setChosenTransformation(form);
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
        if (isMultiForm) {
          setTransformationImageFor(form, json.image);
        } else {
          setTransformationImage(json.image);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao gerar transformação');
        if (isMultiForm) setTransformationImageFor(form, null);
        else setTransformationImage(null);
      } finally {
        setGenerating((g) => ({ ...g, [form]: false }));
      }
    },
    [selectedImage, isMultiForm, setChosenTransformation, setTransformationImage, setTransformationImageFor]
  );

  // Single-form: gera automaticamente ao entrar na etapa.
  useEffect(() => {
    if (singleForm && selectedImage && !transformationImage && !generating[singleForm]) {
      void generate(singleForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleForm, selectedImage]);

  // Multi-form (metamorfo): a etapa só conclui quando TODAS as formas têm arte.
  useEffect(() => {
    if (!isMultiForm) return;
    const allDone = forms.every((f) => Boolean(transformationImages[f]));
    markStepComplete('transformation', allDone);
  }, [isMultiForm, forms, transformationImages, markStepComplete]);

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

  // ───────────────────────── Metamorfo: gera as 3 formas ─────────────────────────
  if (isMultiForm) {
    const doneCount = forms.filter((f) => Boolean(transformationImages[f])).length;
    const anyGenerating = forms.some((f) => generating[f]);

    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Transformações</h2>
          <p className="text-text-secondary">
            Como metamorfo, você domina <strong>todas</strong> as formas. A IA usa sua imagem
            humana para criar a arte de cada uma — em combate (masmorra e PvP) você escolhe na
            hora qual assumir. Gere as {forms.length} formas para concluir.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">
            {doneCount}/{forms.length} formas geradas
          </span>
          <button
            onClick={() => forms.forEach((f) => !transformationImages[f] && !generating[f] && generate(f))}
            disabled={anyGenerating || doneCount === forms.length || !selectedImage}
            className="text-xs flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
          >
            <Wand2 className="w-3 h-3" /> Gerar todas as faltantes
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {forms.map((form) => {
            const cfg = TRANSFORMATION_CONFIG[form];
            const glow = getTransformationGlow(form);
            const img = transformationImages[form];
            const busy = Boolean(generating[form]);
            return (
              <div key={form} className="bg-surface/50 border border-white/10 rounded-lg p-4 space-y-3">
                <div>
                  <div className="font-bold text-text-primary">{cfg.name}</div>
                  <div className="text-xs text-text-secondary">{cfg.description}</div>
                </div>

                <div
                  className="relative w-full aspect-square rounded-lg overflow-hidden bg-background/40 flex items-center justify-center"
                  style={img ? { boxShadow: `0 0 18px 2px ${glow.hex}` } : undefined}
                >
                  {busy ? (
                    <div className="flex flex-col items-center gap-2 text-text-secondary">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <span className="text-xs">Gerando...</span>
                    </div>
                  ) : img ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={cfg.name} className="w-full h-full object-cover" />
                      <div className="absolute top-2 right-2 w-7 h-7 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-text-secondary px-3 text-center">Ainda não gerada</span>
                  )}
                </div>

                <button
                  onClick={() => generate(form)}
                  disabled={busy || !selectedImage}
                  className={cn(
                    'w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50',
                    img
                      ? 'bg-surface border border-white/20 text-text-secondary hover:text-text-primary'
                      : 'bg-gradient-to-r from-primary to-primary-dark text-white'
                  )}
                >
                  {busy ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : img ? (
                    <>
                      <RefreshCw className="w-4 h-4" /> Gerar de novo
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" /> Gerar
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ───────────────────────── Forma única (demais raças) ─────────────────────────
  const activeForm = (chosenTransformation || singleForm) as TransformationType | null;
  const glow = activeForm ? getTransformationGlow(activeForm) : null;
  const isGenerating = Boolean(singleForm && generating[singleForm]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Transformação</h2>
        <p className="text-text-secondary">
          A IA usa sua imagem para revelar a forma que seu herói assume em combate.
        </p>
      </div>

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
              <span className="text-sm text-text-secondary px-4 text-center">Aguardando geração...</span>
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

      {/* Loading com etapas enquanto a IA gera a transformação */}
      <GenerationProgress active={isGenerating} steps={TRANSFORMATION_STEPS} stepDurationMs={6000} />
    </div>
  );
}
