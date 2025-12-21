export async function generateCharacterImage(prompt: string, numImages: number): Promise<string[]> {
  const makeSvg = (label: string, bg: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${bg}"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="32" fill="#ffffff">${label}</text>
</svg>`;
    const b64 = typeof window !== 'undefined' ? btoa(unescape(encodeURIComponent(svg))) : Buffer.from(svg, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${b64}`;
  };

  const placeholderImages = [
    makeSvg('AI Image 1', '#b91c1c'),
    makeSvg('AI Image 2', '#15803d'),
    makeSvg('AI Image 3', '#1d4ed8'),
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
