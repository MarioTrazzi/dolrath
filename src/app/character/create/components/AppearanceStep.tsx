'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, RefreshCw, Download, Upload, Check } from 'lucide-react';
import { generateCharacterImage } from '@/lib/openai';
import { ImageUpload } from './ImageUpload';
import { GenerationProgress } from './GenerationProgress';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { cn } from '@/lib/utils';
import { isCloudinaryUploadConfigured, uploadImageToCloudinary } from '@/lib/cloudinaryUpload';
import toast from 'react-hot-toast';

export function AppearanceStep() {
  const { selectedRace, selectedClass, distributedPoints, selectedImage, setSelectedImage, markStepComplete } = useCharacterCreationStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  
  useEffect(() => {
    // Mark step complete if an image is selected
    markStepComplete('appearance', !!selectedImage);
  }, [selectedImage, markStepComplete]);

  const statDescriptors = () => {
    const pts = {
      str: Number((distributedPoints as any)?.str || 0),
      agi: Number((distributedPoints as any)?.agi || 0),
      int: Number((distributedPoints as any)?.int || 0),
      res: Number((distributedPoints as any)?.res || 0),
    };

    const pick = (v: number, low: string, mid: string, high: string) => {
      if (v >= 7) return high;
      if (v >= 4) return mid;
      return low;
    };

    const physical = pick(
      pts.str,
      'lean build, not bulky',
      'athletic build',
      'powerful muscular build, imposing presence'
    );

    const agility = pick(
      pts.agi,
      'grounded stance, minimal acrobatics',
      'quick, ready posture',
      'nimble, agile stance, dynamic pose'
    );

    const intellect = pick(
      pts.int,
      'subtle magical cues',
      'arcane symbols and faint magical glow',
      'strong arcane aura, runes, vivid magical effects'
    );

    const defense = pick(
      pts.res,
      'light protection, minimal armor',
      'balanced armor and practical gear',
      'heavy protective gear, durable look'
    );

    return { pts, physical, agility, intellect, defense };
  };

  // Stat-derived hints passed to the server as supplementary context. The locked
  // race+class style pre-prompt and the Claude merge now live server-side (single
  // source of truth) — see src/lib/characterImagePrompt.ts.
  const buildStatHints = () => {
    const { pts, physical, agility, intellect, defense } = statDescriptors();
    return [
      `STR ${pts.str}, AGI ${pts.agi}, INT ${pts.int}, DEF ${pts.res}`,
      physical,
      agility,
      intellect,
      defense,
    ].join('; ');
  };

  const generateImages = async () => {
    if (!selectedRace) return;

    setIsGenerating(true);
    setGeneratedImages([]);
    setSelectedImage(null);

    try {
      // Send race/class + the player's request; the server builds the locked
      // combination pre-prompt and merges the request with Claude.
      const result = await generateCharacterImage({
        numImages: 3,
        raceId: selectedRace?.id,
        classId: (selectedClass as any)?.id,
        raceName: selectedRace?.name,
        className: (selectedClass as any)?.name,
        userPrompt: customPrompt,
        statHints: buildStatHints(),
      });
      const images = result.images;

      if (result.error) {
        toast.error(result.error);
      }

      // Prefer HTTPS URLs: upload AI results to Cloudinary when configured.
      let finalImages = images;
      if (images.length > 0 && isCloudinaryUploadConfigured()) {
        try {
          const uploaded = await Promise.all(
            images.map(async (img) => {
              // Only upload data URLs returned by the generator.
              if (!String(img).startsWith('data:image/')) return img;
              const { secureUrl } = await uploadImageToCloudinary({
                dataUrl: img,
                folder: 'dolrath/characters/avatars',
                tags: ['dolrath', 'character-avatar', 'ai-generated'],
              });
              return secureUrl;
            })
          );
          finalImages = uploaded;
        } catch {
          // If Cloudinary fails, keep data URLs.
          finalImages = images;
        }
      }

      setGeneratedImages(finalImages);
      if (finalImages.length > 0) {
        setSelectedImage(finalImages[0]); // Auto-select the first generated image
      }
    } catch (error) {
      console.error('Erro ao gerar imagens:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar imagens');
    } finally {
      setIsGenerating(false);
    }
  };
  
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Aparência do Personagem
        </h2>
        <p className="text-text-secondary">
          Gere uma imagem única com IA ou faça upload da sua própria
        </p>
      </div>
      
      {/* Generation Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AI Generation */}
        <div className="bg-surface/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Gerar com IA
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Prompt personalizado (opcional)
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Opcional: descreva a imagem que você quer. Se vazio, a IA gera usando a lore + raça/classe + seus atributos."
                className="w-full h-24 px-3 py-2 bg-background border border-white/20 rounded-lg text-text-primary placeholder:text-text-secondary resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            
            <button
              onClick={generateImages}
              disabled={isGenerating || !selectedRace}
              className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Gerar Imagens
                </>
              )}
            </button>
            {!selectedRace && (
              <p className="text-sm text-red-400">Selecione uma raça primeiro para gerar imagens.</p>
            )}
          </div>
        </div>
        
        {/* Upload */}
        <div className="bg-surface/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-accent" />
            Upload Manual
          </h3>
          
          <ImageUpload
            onImageSelect={setSelectedImage}
            selectedImage={selectedImage}
          />
        </div>
      </div>

      {/* Loading com etapas enquanto a IA gera as 3 imagens */}
      <GenerationProgress
        active={isGenerating}
        steps={[
          'Coletando e ajustando o prompt para a lore de Dolrath…',
          'Criando a 1ª de 3 imagens para você escolher…',
          'Criando a 2ª de 3 imagens…',
          'Criando a 3ª e última imagem…',
          'Finalizando…',
        ]}
      />

      {/* Generated Images Gallery */}
      <AnimatePresence>
        {generatedImages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <h3 className="text-lg font-medium text-text-primary">
              Escolha uma imagem
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {generatedImages.map((image, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                    selectedImage === image 
                      ? "border-primary shadow-lg shadow-primary/25" 
                      : "border-white/20 hover:border-white/40"
                  )}
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image}
                    alt={`Opção ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  
                  {selectedImage === image && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-primary/20 flex items-center justify-center"
                    >
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
