'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, RefreshCw, Download, Upload, Check } from 'lucide-react';
import { generateCharacterImage } from '@/lib/openai';
import { ImageUpload } from './ImageUpload';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { cn } from '@/lib/utils';

export function AppearanceStep() {
  const { selectedRace, characterName, selectedImage, setSelectedImage, markStepComplete } = useCharacterCreationStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  
  useEffect(() => {
    // Mark step complete if an image is selected
    markStepComplete('appearance', !!selectedImage);
  }, [selectedImage, markStepComplete]);

  const getDefaultPrompt = () => {
    if (!selectedRace) return 'Fantasy RPG character portrait';
    const namePart = characterName ? ` of ${characterName}` : '';
    const basePrompts = {
      draconiano: `Fantasy RPG character portrait${namePart}, a powerful draconian warrior with dragon-like features, scales on arms and face, fierce golden eyes, wearing medieval armor, heroic pose, digital art style, detailed, high quality`,
      metamorfo: `Fantasy RPG character portrait${namePart}, a shapeshifter with wolf-like features, sharp eyes, agile build, wearing leather armor, mysterious aura, digital art style, detailed, high quality`,
      humano: `Fantasy RPG character portrait${namePart}, a skilled human warrior with determined expression, wearing battle gear, confident pose, digital art style, detailed, high quality`
    };
    return basePrompts[selectedRace.id as keyof typeof basePrompts] || basePrompts.humano;
  };

  const generateImages = async () => {
    if (!selectedRace) return;

    setIsGenerating(true);
    setGeneratedImages([]);
    setSelectedImage(null);

    try {
      const prompt = customPrompt || getDefaultPrompt();
      
      const images = await generateCharacterImage(prompt, 3); // Gerar 3 opções
      setGeneratedImages(images);
      if (images.length > 0) {
        setSelectedImage(images[0]); // Auto-select the first generated image
      }
    } catch (error) {
      console.error('Erro ao gerar imagens:', error);
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
                placeholder="Descreva como você quer que seu personagem pareça..."
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
