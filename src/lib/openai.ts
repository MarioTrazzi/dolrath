export type GenerateCharacterImageOptions = {
  numImages?: number;
  // Legacy: a fully-built prompt.
  prompt?: string;
  // Structured (NFT) mode: the server builds the locked race+class style
  // pre-prompt and merges the player's request with Claude.
  raceId?: string;
  classId?: string;
  raceName?: string;
  className?: string;
  userPrompt?: string;
  statHints?: string;
};

// Regeração paga: edita o retrato ATUAL (image-to-image) aplicando só os
// ajustes pedidos pelo jogador. Exige o txHash do pagamento em DOL.
export async function editCharacterImage(options: {
  baseImage: string;
  modification: string;
  paymentTxHash: string;
  // Raça/classe permitem ao servidor reconstruir o pré-prompt original e
  // reformulá-lo (via Claude) com o pedido do jogador antes de editar.
  raceId?: string;
  classId?: string;
  raceName?: string;
  className?: string;
}): Promise<{ image?: string; finalPrompt?: string; error?: string }> {
  try {
    const res = await fetch('/api/ai/character-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        edit: true,
        baseImage: options.baseImage,
        modification: options.modification,
        paymentTxHash: options.paymentTxHash,
        raceId: options.raceId,
        classId: options.classId,
        raceName: options.raceName,
        className: options.className,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = typeof json?.error === 'string' ? json.error : 'Falha ao regerar imagem';
      return { error: msg };
    }
    const image = Array.isArray(json?.images) ? String(json.images[0] || '') : '';
    if (!image) return { error: 'Resposta da IA vazia (sem imagem)' };
    return {
      image,
      finalPrompt: typeof json?.finalPrompt === 'string' ? json.finalPrompt : undefined,
    };
  } catch {
    return { error: 'Erro ao chamar o gerador de imagens' };
  }
}

export async function generateCharacterImage(
  options: GenerateCharacterImageOptions
): Promise<{ images: string[]; finalPrompt?: string; mergedByClaude?: boolean; error?: string }> {
  const numImages = options.numImages ?? 1;

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
      body: JSON.stringify({
        numImages,
        prompt: options.prompt,
        raceId: options.raceId,
        classId: options.classId,
        raceName: options.raceName,
        className: options.className,
        userPrompt: options.userPrompt,
        statHints: options.statHints,
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = typeof json?.error === 'string' ? json.error : 'Falha ao gerar imagem';
      return { images: placeholderImages.slice(0, numImages), error: msg };
    }

    const images = Array.isArray(json?.images) ? (json.images as string[]) : [];
    if (images.length === 0) {
      return { images: placeholderImages.slice(0, numImages), error: 'Resposta da IA vazia (sem imagens)' };
    }
    return {
      images: images.slice(0, numImages),
      finalPrompt: typeof json?.finalPrompt === 'string' ? json.finalPrompt : undefined,
      mergedByClaude: Boolean(json?.mergedByClaude),
    };
  } catch {
    return { images: placeholderImages.slice(0, numImages), error: 'Erro ao chamar o gerador de imagens' };
  }
}
