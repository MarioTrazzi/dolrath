// Server-side image-to-image editing via gpt-image-1 (/v1/images/edits).
// Shared by the transformation art generator and the paid re-generation of the
// base NFT portrait: both take an existing image + an edit prompt and must
// return the SAME character, changed only as the prompt asks.
//
// dall-e-3 cannot do this (text→image only), so gpt-image-1 is required.
// Defaults to gpt-image-1; override with OPENAI_EDIT_MODEL.

export class ImageEditError extends Error {}

// Resolve a base image (https URL or data URL) into a Blob suitable for upload.
export async function fetchImageBlob(source: string): Promise<Blob> {
  const src = String(source || '').trim();
  if (!src) throw new ImageEditError('Imagem base ausente');

  if (src.startsWith('data:')) {
    const match = src.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) throw new ImageEditError('Data URL da imagem base inválida');
    const [, mime, b64] = match;
    const bytes = Buffer.from(b64, 'base64');
    return new Blob([bytes], { type: mime || 'image/png' });
  }

  const res = await fetch(src);
  if (!res.ok) {
    throw new ImageEditError(`Falha ao baixar a imagem base (HTTP ${res.status})`);
  }
  const type = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  return new Blob([buf], { type });
}

export type OpenAiImageEditInput = {
  baseImage: string; // https URL or data URL
  prompt: string;
};

// Runs the edit and returns the result as a data URL (or hosted URL if the API
// returns one). Throws ImageEditError on any failure.
export async function openaiImageEdit({ baseImage, prompt }: OpenAiImageEditInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ImageEditError('OPENAI_API_KEY não configurada no servidor.');
  }

  const model = (process.env.OPENAI_EDIT_MODEL || 'gpt-image-1').trim();
  if (!model.toLowerCase().startsWith('gpt-image')) {
    throw new ImageEditError(
      `Edição de imagem requer gpt-image-1 (image-to-image). Modelo atual: ${model}. ` +
        'Defina OPENAI_EDIT_MODEL=gpt-image-1 no servidor.'
    );
  }

  const baseBlob = await fetchImageBlob(baseImage);

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
        : `Falha ao editar imagem (HTTP ${res.status})`;
    throw new ImageEditError(`${msg} (model=${model})`);
  }

  const first = Array.isArray(json?.data) ? json.data[0] : null;
  const b64 = typeof first?.b64_json === 'string' ? first.b64_json : '';
  const url = typeof first?.url === 'string' ? first.url : '';

  const image = b64 ? `data:image/png;base64,${b64}` : url;
  if (!image) {
    throw new ImageEditError(`Resposta da IA vazia (sem imagem) (model=${model})`);
  }
  return image;
}
