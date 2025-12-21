import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  prompt?: string;
  numImages?: number;
};

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY não configurada no servidor.' },
      { status: 501 }
    );
  }

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const prompt = String(body?.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt obrigatório' }, { status: 400 });
  }

  const numImages = clampInt(body?.numImages, 1, 4, 3);

  const model = (process.env.OPENAI_IMAGE_MODEL || 'dall-e-3').trim();
  const size = (process.env.OPENAI_IMAGE_SIZE || '1024x1024').trim();

  const isDalle3 = model.toLowerCase() === 'dall-e-3';

  try {
    const callOnce = async (): Promise<string> => {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          // DALL·E 3 only supports n=1.
          n: 1,
          size,
          // Avoid time-limited signed URLs (can cause 403 later). We prefer data URLs,
          // then upload to Cloudinary for a permanent HTTPS URL.
          response_format: 'b64_json',
        }),
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
            : `Falha ao gerar imagem (HTTP ${res.status})`;
        throw new Error(`${msg} (model=${model})`);
      }

      const data = Array.isArray(json?.data) ? json.data : [];
      const first = data[0];
      const img =
        (typeof first?.url === 'string' && first.url) ? first.url
        : (typeof first?.b64_json === 'string' && first.b64_json) ? `data:image/png;base64,${first.b64_json}`
        : '';

      if (!img) throw new Error(`Resposta da IA vazia (sem imagem) (model=${model})`);
      return img;
    };

    const images: string[] = [];

    if (isDalle3 && numImages > 1) {
      // Preserve the UI UX (3 options) by doing multiple single-image calls.
      for (let i = 0; i < numImages; i++) {
        images.push(await callOnce());
      }
    } else {
      // For other models, we can request up to numImages in one go.
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: numImages,
          size,
          // Avoid time-limited signed URLs; return base64 data we can persist.
          response_format: 'b64_json',
        }),
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
            : `Falha ao gerar imagem (HTTP ${res.status})`;
        return NextResponse.json({ error: `${msg} (model=${model})` }, { status: 500 });
      }

      const data = Array.isArray(json?.data) ? json.data : [];
      const batch: string[] = data
        .map((d: any) => {
          if (typeof d?.url === 'string' && d.url) return d.url;
          if (typeof d?.b64_json === 'string' && d.b64_json) return `data:image/png;base64,${d.b64_json}`;
          return null;
        })
        .filter(Boolean);

      images.push(...batch);
    }

    if (images.length === 0) {
      return NextResponse.json({ error: `Resposta da IA vazia (sem imagens) (model=${model})` }, { status: 500 });
    }

    return NextResponse.json({ images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar imagem';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
