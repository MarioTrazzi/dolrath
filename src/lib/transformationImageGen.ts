// Server-side generation of a character's transformation art.
//
// Takes the player's already-chosen NFT portrait as a reference and asks
// gpt-image-1's *edit* endpoint (via openaiImageEdit) to reveal the SAME
// character in their transformed combat form (see buildTransformationPrompt).
// The result is uploaded to Cloudinary when configured; otherwise the base64
// data URL is returned so the feature still works without Cloudinary.

import { buildTransformationPrompt } from '@/lib/characterImagePrompt';
import { openaiImageEdit, ImageEditError } from '@/lib/openaiImageEdit';
import { isCloudinaryUploadConfigured, uploadImageToCloudinary } from '@/lib/cloudinaryUpload';

export { ImageEditError as TransformationGenError };

export type GenerateTransformationInput = {
  baseImage: string; // chosen NFT portrait (https URL or data URL)
  transformationType: string; // 'celestial' | 'dragon' | ...
  // Class identity, reasserted in the prompt so the transformed art keeps the
  // character's outfit (a robed mage must not come back wearing plate armor).
  classId?: string | null;
  className?: string | null;
  // Player-requested adjustments for a paid re-generation.
  modification?: string | null;
};

export type GenerateTransformationResult = {
  image: string; // hosted URL (preferred) or data URL fallback
  prompt: string;
};

export async function generateTransformationImage(
  input: GenerateTransformationInput
): Promise<GenerateTransformationResult> {
  const prompt = buildTransformationPrompt(input.transformationType, {
    classId: input.classId,
    className: input.className,
    modification: input.modification,
  });

  let image = await openaiImageEdit({ baseImage: input.baseImage, prompt });

  // Prefer a stable HTTPS URL. Upload data URLs to Cloudinary when configured.
  if (image.startsWith('data:') && isCloudinaryUploadConfigured()) {
    try {
      const { secureUrl } = await uploadImageToCloudinary({
        dataUrl: image,
        folder: 'dolrath/characters/transformations',
        tags: ['dolrath', 'transformation', 'ai-generated'],
      });
      image = secureUrl;
    } catch {
      // Keep the data URL if Cloudinary fails.
    }
  }

  return { image, prompt };
}
