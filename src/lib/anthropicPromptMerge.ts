// Server-only. Uses Claude (Anthropic) to merge the locked Dolrath style
// pre-prompt for a race+class combination with the player's free-text request,
// producing one cohesive final prompt for DALL·E 3.
//
// The merge is an LLM step because naive string concatenation can't resolve
// conflicts (e.g. a player asking for a different class or a cartoon style) or
// weave additions in naturally. Claude keeps the locked identity and folds the
// player's request in as additions only.

import Anthropic from '@anthropic-ai/sdk';

const MERGE_SYSTEM =
  'You are a prompt engineer for the dark-fantasy RPG "Dolrath". Given a LOCKED ' +
  'style pre-prompt (the canonical art style for one specific race+class ' +
  'combination) and an optional player request, produce ONE final ' +
  'image-generation prompt for DALL·E 3.\n\n' +
  'Rules:\n' +
  '- The locked style pre-prompt is authoritative. Never change the art style, ' +
  'race identity, or class identity it defines — preserve all of it.\n' +
  '- Treat the player request as ADDITIONS ONLY: pose, mood, hair/clothing ' +
  'colors, scars, accessories, expression, background details, etc. Fold them ' +
  'in naturally.\n' +
  '- If the player request conflicts with the locked style/race/class (asks for ' +
  'a different class, a cartoon style, text/logos, multiple characters, etc.), ' +
  'silently ignore that part and keep the locked identity.\n' +
  '- Use the character build hints to flavor physique and gear, not to add text.\n' +
  '- If the player request is empty, produce a vivid, coherent prompt from the ' +
  'locked pre-prompt alone.\n' +
  '- Output a single cohesive English paragraph under 120 words, one character, ' +
  'with no text/watermark/logo/UI/border in the image.';

const MERGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: {
      type: 'string',
      description: 'The final DALL·E 3 prompt, a single English paragraph.',
    },
  },
  required: ['prompt'],
} as const;

export type MergeInput = {
  preprompt: string;
  userPrompt?: string | null;
  statHints?: string | null;
};

// Deterministic fallback used when ANTHROPIC_API_KEY is absent (e.g. local dev)
// or the API call fails. Keeps the locked style and appends player additions.
export function deterministicMerge({ preprompt, userPrompt, statHints }: MergeInput): string {
  const parts = [preprompt];
  if (statHints && statHints.trim()) {
    parts.push(`Character build hints: ${statHints.trim()}.`);
  }
  const player = (userPrompt || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (player) {
    parts.push(
      'Player additions (follow the locked style above; do not change the art ' +
        `style, race or class): ${player}`
    );
  }
  return parts.join('\n');
}

// ─── Paid re-generation (image EDIT) ─────────────────────────────────────────
// The player's current portrait goes to gpt-image-1's edit endpoint; Claude
// turns their free-text request (any language) into one precise English edit
// instruction that keeps the character identity and the locked style.

const EDIT_SYSTEM =
  'You are a prompt engineer for the dark-fantasy RPG "Dolrath". A player has ' +
  'an AI-generated character portrait and requested changes to it. Produce ONE ' +
  'edit instruction in English for an image-editing model (gpt-image-1) that ' +
  'will receive the current portrait as the reference image.\n\n' +
  'Rules:\n' +
  '- The edit must KEEP the same character: same face and facial structure, ' +
  'same race features, same class outfit and equipment, same framing, same art ' +
  'style. State this explicitly in the instruction.\n' +
  '- Apply ONLY the changes the player asked for, phrased clearly and ' +
  'concretely. Translate to English if needed.\n' +
  '- If part of the request would change the art style, add text/logos, add ' +
  'more characters, or change race/class identity, silently drop that part.\n' +
  '- Output a single cohesive English paragraph under 100 words.';

export async function mergeEditPromptWithClaude(input: {
  modification: string;
  fallbackPrompt: string;
}): Promise<{ prompt: string; mergedByClaude: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const modification = (input.modification || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!apiKey || !modification) {
    return { prompt: input.fallbackPrompt, mergedByClaude: false };
  }

  const model = (process.env.ANTHROPIC_MODEL || 'claude-opus-4-8').trim();

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: EDIT_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: MERGE_SCHEMA } },
      messages: [
        { role: 'user', content: `PLAYER REQUESTED CHANGES: ${modification}` },
      ],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    const parsed = JSON.parse(text) as { prompt?: unknown };
    const finalPrompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : '';

    if (!finalPrompt) {
      return { prompt: input.fallbackPrompt, mergedByClaude: false };
    }
    return { prompt: finalPrompt, mergedByClaude: true };
  } catch {
    return { prompt: input.fallbackPrompt, mergedByClaude: false };
  }
}

export async function mergePromptWithClaude(input: MergeInput): Promise<{
  prompt: string;
  mergedByClaude: boolean;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { prompt: deterministicMerge(input), mergedByClaude: false };
  }

  const model = (process.env.ANTHROPIC_MODEL || 'claude-opus-4-8').trim();
  const player = (input.userPrompt || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  const statHints = (input.statHints || '').trim();

  const userMessage = [
    'LOCKED STYLE PRE-PROMPT (authoritative — keep all of it):',
    input.preprompt,
    '',
    statHints ? `CHARACTER BUILD HINTS: ${statHints}` : 'CHARACTER BUILD HINTS: (none)',
    '',
    player ? `PLAYER REQUEST (additions only): ${player}` : 'PLAYER REQUEST: (none)',
  ].join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: MERGE_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: MERGE_SCHEMA } },
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    const parsed = JSON.parse(text) as { prompt?: unknown };
    const finalPrompt = typeof parsed?.prompt === 'string' ? parsed.prompt.trim() : '';

    if (!finalPrompt) {
      return { prompt: deterministicMerge(input), mergedByClaude: false };
    }
    return { prompt: finalPrompt, mergedByClaude: true };
  } catch {
    // Any failure (bad key, rate limit, parse error) degrades to the
    // deterministic merge so image generation still works.
    return { prompt: deterministicMerge(input), mergedByClaude: false };
  }
}
