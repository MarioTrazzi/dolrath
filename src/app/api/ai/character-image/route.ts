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

  try {
    // Note: OpenAI image endpoints/models can evolve. This uses the standard Images API
    // and requests base64 so we can render directly without extra storage.
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
    const images: string[] = data
      .map((d: any) => {
        if (typeof d?.url === 'string' && d.url) return d.url;
        if (typeof d?.b64_json === 'string' && d.b64_json) return `data:image/png;base64,${d.b64_json}`;
        return null;
      })
      .filter(Boolean);

    if (images.length === 0) {
      return NextResponse.json({ error: 'Resposta da IA vazia (sem imagens)' }, { status: 500 });
    }

    return NextResponse.json({ images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar imagem';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
