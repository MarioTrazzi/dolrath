export async function generateCharacterImage(prompt: string, numImages: number): Promise<string[]> {
  const placeholderImages = [
    'https://via.placeholder.com/256x256/FF5733/FFFFFF?text=AI+Image+1',
    'https://via.placeholder.com/256x256/33FF57/FFFFFF?text=AI+Image+2',
    'https://via.placeholder.com/256x256/3357FF/FFFFFF?text=AI+Image+3',
  ];

  try {
    const res = await fetch('/api/ai/character-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, numImages }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(typeof json?.error === 'string' ? json.error : 'Falha ao gerar imagem');
    }

    const images = Array.isArray(json?.images) ? (json.images as string[]) : [];
    if (images.length === 0) return placeholderImages.slice(0, numImages);
    return images.slice(0, numImages);
  } catch {
    return placeholderImages.slice(0, numImages);
  }
}
