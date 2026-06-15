import { NextResponse } from 'next/server';
import { buildCombinationPreprompt } from '@/lib/characterImagePrompt';
import { mergePromptWithClaude } from '@/lib/anthropicPromptMerge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  // Legacy: a fully-built prompt.
  prompt?: string;
  numImages?: number;
  // Structured (NFT) mode: server builds the locked race+class style pre-prompt
  // and merges the player's request with Claude.
  raceId?: string;
  classId?: string;
  raceName?: string;
  className?: string;
  userPrompt?: string;
  statHints?: string;
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

  // Structured NFT mode: race/class drive a locked style pre-prompt, then Claude
  // merges the player's request into the final DALL·E prompt (server-side).
  const hasStructured = Boolean(body?.raceId || body?.classId);

  let prompt = '';
  let mergedByClaude = false;

  if (hasStructured) {
    const preprompt = buildCombinationPreprompt({
      raceId: body?.raceId,
      classId: body?.classId,
      raceName: body?.raceName,
      className: body?.className,
    });
    const merged = await mergePromptWithClaude({
      preprompt,
      userPrompt: body?.userPrompt,
      statHints: body?.statHints,
    });
    prompt = merged.prompt;
    mergedByClaude = merged.mergedByClaude;
  } else {
    prompt = String(body?.prompt || '').trim();
  }

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt obrigatório' }, { status: 400 });
  }

  const numImages = clampInt(body?.numImages, 1, 4, 3);

  const model = (process.env.OPENAI_IMAGE_MODEL || 'dall-e-3').trim();
  const size = (process.env.OPENAI_IMAGE_SIZE || '1024x1024').trim();

  const modelLc = model.toLowerCase();
  const isDalle3 = modelLc === 'dall-e-3';
  // The newer gpt-image-* models always return base64 and REJECT the
  // `response_format` parameter; the dall-e-* models accept it.
  const isGptImage = modelLc.startsWith('gpt-image');

  try {
    // Requests `n` images in a single call and returns them as data URLs.
    const generateBatch = async (n: number): Promise<string[]> => {
      const payload: Record<string, unknown> = { model, prompt, n, size };
      if (!isGptImage) {
        // Avoid time-limited signed URLs (can 403 later); persist base64 instead.
        payload.response_format = 'b64_json';
      }

      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
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
      return data
        .map((d: any) => {
          if (typeof d?.url === 'string' && d.url) return d.url;
          if (typeof d?.b64_json === 'string' && d.b64_json) return `data:image/png;base64,${d.b64_json}`;
          return null;
        })
        .filter((v: string | null): v is string => Boolean(v));
    };

    const images: string[] = [];

    if (isDalle3 && numImages > 1) {
      // DALL·E 3 only supports n=1, so fan out into multiple single-image calls.
      for (let i = 0; i < numImages; i++) {
        images.push(...(await generateBatch(1)));
      }
    } else {
      // dall-e-2 and gpt-image-* accept n > 1 in a single call.
      images.push(...(await generateBatch(numImages)));
    }

    if (images.length === 0) {
      return NextResponse.json({ error: `Resposta da IA vazia (sem imagens) (model=${model})` }, { status: 500 });
    }

    return NextResponse.json({ images, finalPrompt: prompt, mergedByClaude });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar imagem';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
