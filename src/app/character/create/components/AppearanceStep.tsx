'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, RefreshCw, Download, Upload, Check } from 'lucide-react';
import { generateCharacterImage } from '@/lib/openai';
import { ImageUpload } from './ImageUpload';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { cn } from '@/lib/utils';
import { isCloudinaryUploadConfigured, uploadImageToCloudinary } from '@/lib/cloudinaryUpload';
import toast from 'react-hot-toast';

export function AppearanceStep() {
  const { selectedRace, selectedClass, distributedPoints, characterName, selectedImage, setSelectedImage, markStepComplete } = useCharacterCreationStore();
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

  const getDefaultPrompt = () => {
    const namePart = characterName ? `, name: ${characterName}` : '';
    const raceName = selectedRace?.name ? selectedRace.name : 'Unknown Race';
    const className = (selectedClass as any)?.name ? String((selectedClass as any).name) : 'Adventurer';
    const raceLore = selectedRace?.lore ? String(selectedRace.lore) : '';

    const { pts, physical, agility, intellect, defense } = statDescriptors();
    const statsLine = `Stats focus (creation points): STR ${pts.str}, AGI ${pts.agi}, INT ${pts.int}, RES ${pts.res}.`;

    const raceFlavorById: Record<string, string> = {
      draconiano:
        'draconic lineage, subtle scales on arms/face, fierce eyes, ember glow, hints of transformation power',
      metamorfo:
        'shapeshifter vibe, wolf-like hints, predatory eyes, wilderness aura, hints of transformation power',
      elfo:
        'elegant elven features, pointed ears, ethereal beauty, arcane elegance',
      humano:
        'human adventurer, determined expression, versatile and resilient',
    };

    const raceFlavor = selectedRace?.id ? raceFlavorById[selectedRace.id] : '';

    // Keep it short but specific; let the generator fill details.
    return [
      // Base template: always consistent style.
      `Fantasy RPG character portrait in the world of Dolrath${namePart}.`,
      `Race: ${raceName}. Class: ${className}.`,
      raceLore ? `Lore: ${raceLore}` : null,
      raceFlavor ? `Visual identity: ${raceFlavor}.` : null,
      statsLine,
      `Visual cues based on stats: ${physical}; ${agility}; ${intellect}; ${defense}.`,
      'Style constraints: cinematic fantasy, highly detailed, coherent anatomy, grounded design (not goofy), dramatic lighting, sharp focus, 1 character, portrait, no text, no watermark, no logo.',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const normalizePlayerPrompt = (value: string) => {
    const s = String(value || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    return s.slice(0, 400);
  };

  const buildFinalPrompt = () => {
    const base = getDefaultPrompt();
    const player = normalizePlayerPrompt(customPrompt);
    if (!player) return base;

    // Player prompt should only add preferences, never override the base lore/style.
    return [
      base,
      'Player preferences (must follow the style constraints above; do not change art style):',
      `- ${player}`,
    ].join('\n');
  };

  const generateImages = async () => {
    if (!selectedRace) return;

    setIsGenerating(true);
    setGeneratedImages([]);
    setSelectedImage(null);

    try {
      const prompt = buildFinalPrompt();
      
      const result = await generateCharacterImage(prompt, 3); // Gerar 3 opções
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
