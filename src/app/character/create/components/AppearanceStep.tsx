'use client';

import { useState, useEffect } from 'react';
import { useT } from '@/lib/i18n/I18nProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, RefreshCw, Download, Upload, Check, Coins } from 'lucide-react';
import { generateCharacterImage, editCharacterImage } from '@/lib/openai';
import { payDolToTreasury, getImageRegenCostDol } from '@/lib/payDol';
import { ImageUpload } from './ImageUpload';
import { GenerationProgress } from './GenerationProgress';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { cn } from '@/lib/utils';
import { isCloudinaryUploadConfigured, uploadImageToCloudinary } from '@/lib/cloudinaryUpload';
import { getRaceStatBonuses, getClassStatBonuses } from '@/lib/characterStats';
import toast from 'react-hot-toast';

export function AppearanceStep() {
  const t = useT();
  const { selectedRace, selectedClass, selectedImage, setSelectedImage, markStepComplete } = useCharacterCreationStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  // Ajuste pago da imagem (regeração via edição image-to-image).
  const [adjustPrompt, setAdjustPrompt] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  // Pagamento já feito cuja geração falhou: reaproveita o txHash na próxima
  // tentativa em vez de cobrar de novo (o servidor libera o tx ao falhar).
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  // Falha na geração inclusa: libera tentar de novo sem pagar.
  const [genFailed, setGenFailed] = useState(false);
  const regenCostDol = getImageRegenCostDol();
  
  useEffect(() => {
    // Mark step complete if an image is selected
    markStepComplete('appearance', !!selectedImage);
  }, [selectedImage, markStepComplete]);

  const statDescriptors = () => {
    // Os 18 pontos de criação agora são rolados pelo servidor (só após o mint),
    // então ainda não existem neste passo. Usamos os bônus fixos de raça+classe
    // (conhecidos aqui) como proxy da "identidade" do personagem para a imagem.
    const raceBonus = selectedRace ? getRaceStatBonuses(selectedRace.id) : null;
    const classBonus = selectedClass ? getClassStatBonuses(selectedClass.id) : null;
    const pts = {
      str: (raceBonus?.str || 0) + (classBonus?.str || 0),
      agi: (raceBonus?.agi || 0) + (classBonus?.agi || 0),
      int: (raceBonus?.int || 0) + (classBonus?.int || 0),
      res: (raceBonus?.def || 0) + (classBonus?.def || 0),
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
        numImages: 1,
        raceId: selectedRace?.id,
        classId: (selectedClass as any)?.id,
        raceName: selectedRace?.name,
        className: (selectedClass as any)?.name,
        userPrompt: customPrompt,
        statHints: buildStatHints(),
      });
      const images = result.images;

      setGenFailed(Boolean(result.error));
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
      console.error('Failed to generate images:', error);
      setGenFailed(true);
      toast.error(error instanceof Error ? error.message : t('Failed to generate images'));
    } finally {
      setIsGenerating(false);
    }
  };

  // Regeração paga: paga USDC, edita a imagem selecionada aplicando só os
  // ajustes pedidos e adiciona o resultado à galeria para comparação.
  const adjustImage = async () => {
    if (!selectedImage) {
      toast.error('Gere ou selecione uma imagem primeiro.');
      return;
    }
    setIsAdjusting(true);
    try {
      // Se um pagamento anterior não gerou imagem, reaproveita o txHash em vez
      // de cobrar de novo — o USDC já está na tesouraria.
      const txHash = pendingTxHash ?? (await payDolToTreasury(regenCostDol));
      setPendingTxHash(txHash);

      const result = await editCharacterImage({
        baseImage: selectedImage,
        modification: adjustPrompt,
        paymentTxHash: txHash,
        raceId: selectedRace?.id,
        classId: (selectedClass as any)?.id,
        raceName: selectedRace?.name,
        className: (selectedClass as any)?.name,
      });
      if (result.error || !result.image) {
        // Tx consumida por uma geração que deu certo: não dá para reusar.
        if ((result.error || '').includes('já foi usada')) setPendingTxHash(null);
        throw new Error(result.error || t('Failed to regenerate the image'));
      }
      setPendingTxHash(null);

      let finalImage = result.image;
      if (finalImage.startsWith('data:image/') && isCloudinaryUploadConfigured()) {
        try {
          const { secureUrl } = await uploadImageToCloudinary({
            dataUrl: finalImage,
            folder: 'dolrath/characters/avatars',
            tags: ['dolrath', 'character-avatar', 'ai-generated'],
          });
          finalImage = secureUrl;
        } catch {
          // Se o Cloudinary falhar, mantém a data URL.
        }
      }

      setGeneratedImages((imgs) => [...imgs, finalImage]);
      setSelectedImage(finalImage);
      setAdjustPrompt('');
      toast.success(t('New version generated! Compare and pick the one you prefer.'));
    } catch (error) {
      console.error('Failed to adjust image:', error);
      toast.error(error instanceof Error ? error.message : t('Failed to adjust the image'));
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          {t('Character Appearance')}
        </h2>
        <p className="text-text-secondary">
          {t('The AI generates the unique image of your NFT (included in the creation fee). Afterwards, if you want to change something, you can request adjustments paying {cost} USDC per version — or upload your own image.', { cost: regenCostDol })}
        </p>
      </div>
      
      {/* Generation Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AI Generation */}
        <div className="bg-surface/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            {t('Generate with AI')}
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">
                {t('Custom prompt (optional)')}
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={t('Optional: describe the image you want. If empty, the AI generates using the lore + race/class + your attributes.')}
                className="w-full h-24 px-3 py-2 bg-background border border-white/20 rounded-lg text-text-primary placeholder:text-text-secondary resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            
            <button
              onClick={generateImages}
              disabled={isGenerating || !selectedRace || (generatedImages.length > 0 && !genFailed)}
              className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('Generating...')}
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  {t('Generate Image')}
                </>
              )}
            </button>
            {!selectedRace && (
              <p className="text-sm text-red-400">{t('Select a race first to generate images.')}</p>
            )}
            {generatedImages.length > 0 && !genFailed && (
              <p className="text-xs text-text-secondary">
                {t('Your included image has already been generated. Want to change something? Use the adjustments panel below ({cost} USDC per version).', { cost: regenCostDol })}
              </p>
            )}
          </div>
        </div>
        
        {/* Upload */}
        <div className="bg-surface/50 border border-white/10 rounded-lg p-6">
          <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-accent" />
            {t('Manual Upload')}
          </h3>
          
          <ImageUpload
            onImageSelect={setSelectedImage}
            selectedImage={selectedImage}
          />
        </div>
      </div>

      {/* Loading com etapas enquanto a IA gera a imagem */}
      <GenerationProgress
        active={isGenerating}
        steps={[
          t('Collecting and tuning the prompt for the lore of Dolrath…'),
          t('Creating the unique image of your hero…'),
          t('Finishing…'),
        ]}
        stepDurationMs={6000}
      />
      <GenerationProgress
        active={isAdjusting}
        steps={[
          t('Confirming the payment…'),
          t('Applying your adjustments to the image…'),
          t('Finishing…'),
        ]}
        stepDurationMs={8000}
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
              {generatedImages.length > 1 ? t('Choose the version that becomes your NFT') : t('Your image')}
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
                    alt={t('Option {n}', { n: index + 1 })}
                    className="w-full h-full object-cover art-bright"
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

            {/* Ajuste pago: edita a imagem selecionada mantendo o personagem */}
            <div className="bg-surface/50 border border-white/10 rounded-lg p-6 space-y-3">
              <h4 className="text-base font-medium text-text-primary flex items-center gap-2">
                <Coins className="w-4 h-4 text-accent" />
                {t('Want to change something? ({cost} USDC)', { cost: regenCostDol })}
              </h4>
              <p className="text-xs text-text-secondary">
                {t('Describe what you want to change in the selected image — the AI keeps the same character and applies only your adjustments (the cost covers generating the image and refining the prompt). The previous version stays available to compare.')}
              </p>
              <textarea
                value={adjustPrompt}
                onChange={(e) => setAdjustPrompt(e.target.value)}
                placeholder={t('e.g. longer white hair, hood down, scar on the left eye, background with ruins…')}
                className="w-full h-20 px-3 py-2 bg-background border border-white/20 rounded-lg text-text-primary placeholder:text-text-secondary resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={adjustImage}
                disabled={isAdjusting || isGenerating || !selectedImage || !adjustPrompt.trim()}
                className="w-full bg-gradient-to-r from-accent to-primary text-white py-3 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAdjusting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t('Generating new version...')}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    {t('Pay {cost} USDC and adjust', { cost: regenCostDol })}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
