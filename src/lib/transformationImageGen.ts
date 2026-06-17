// Server-side generation of a character's transformation art.
//
// Takes the player's already-chosen NFT portrait as a reference and asks
// gpt-image-1's *edit* endpoint to reveal the SAME character in their transformed
// combat form (see buildTransformationPrompt). The result is uploaded to
// Cloudinary when configured; otherwise the base64 data URL is returned so the
// feature still works without Cloudinary.
//
// gpt-image-1 is required: dall-e-3 is text→image only and cannot accept a
// reference image. Defaults to gpt-image-1; override with OPENAI_EDIT_MODEL.
// The OpenAI org must have gpt-image-1 access enabled.

import { buildTransformationPrompt } from '@/lib/characterImagePrompt';
import { isCloudinaryUploadConfigured, uploadImageToCloudinary } from '@/lib/cloudinaryUpload';

export class TransformationGenError extends Error {}

// Resolve a base image (https URL or data URL) into a Blob suitable for upload.
async function fetchImageBlob(source: string): Promise<Blob> {
  const src = String(source || '').trim();
  if (!src) throw new TransformationGenError('Imagem base ausente para a transformação');

  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) throw new TransformationGenError('Data URL da imagem base inválida');
    const [, mime, b64] = match;
    const bytes = Buffer.from(b64, 'base64');
    return new Blob([bytes], { type: mime || 'image/png' });
  }

  const res = await fetch(src);
  if (!res.ok) {
    throw new TransformationGenError(`Falha ao baixar a imagem base (HTTP ${res.status})`);
  }
  const type = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return new Blob([buf], { type });
}

export type GenerateTransformationInput = {
  baseImage: string; // chosen NFT portrait (https URL or data URL)
  transformationType: string; // 'celestial' | 'dragon' | ...
};

export type GenerateTransformationResult = {
  image: string; // hosted URL (preferred) or data URL fallback
  prompt: string;
};

export async function generateTransformationImage(
  input: GenerateTransformationInput
): Promise<GenerateTransformationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new TransformationGenError('OPENAI_API_KEY não configurada no servidor.');
  }

  // Modelo de EDIÇÃO dedicado (independente do OPENAI_IMAGE_MODEL usado na geração
  // da imagem base, que pode seguir em dall-e-3). Edição image-to-image exige
  // gpt-image-1.
  const model = (process.env.OPENAI_EDIT_MODEL || 'gpt-image-1').trim();
  if (!model.toLowerCase().startsWith('gpt-image')) {
    throw new TransformationGenError(
      `Geração da transformação requer gpt-image-1 (image-to-image). Modelo atual: ${model}. ` +
        'Defina OPENAI_EDIT_MODEL=gpt-image-1 no servidor.'
    );
  }

  const prompt = buildTransformationPrompt(input.transformationType);
  const baseBlob = await fetchImageBlob(input.baseImage);

  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('size', (process.env.OPENAI_IMAGE_SIZE || '1024x1024').trim());
  // Filename + type help OpenAI accept the upload.
  form.append('image', baseBlob, 'base.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      typeof json?.error?.message === 'string'
        ? json.error.message
        : `Falha ao gerar transformação (HTTP ${res.status})`;
    throw new TransformationGenError(`${msg} (model=${model})`);
  }

  const first = Array.isArray(json?.data) ? json.data[0] : null;
  const b64 = typeof first?.b64_json === 'string' ? first.b64_json : '';
  const url = typeof first?.url === 'string' ? first.url : '';

  let image = b64 ? `data:image/png;base64,${b64}` : url;
  if (!image) {
    throw new TransformationGenError(`Resposta da IA vazia (sem imagem) (model=${model})`);
  }

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
