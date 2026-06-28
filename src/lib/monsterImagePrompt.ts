// Single source of truth for the Dolrath MONSTER art style.
//
// Mirrors characterImagePrompt.ts / itemImagePrompt.ts: DOLRATH_MONSTER_STYLE_BASE
// is identical for every creature — this is what keeps all monster art visually
// coherent and consistent with the character NFTs and the existing boss art
// (/boss-ancia-da-mata.webp). Per-monster descriptions add the creature-specific
// identity on top. The locked base mirrors DOLRATH_STYLE_BASE, adapted to render a
// single full-body creature instead of a humanoid hero portrait.

// The locked art style — keep edits here so every monster stays consistent with the
// character portraits AND with the already-shipped Anciã da Mata boss art. Same dark
// dungeon-painting direction: one creature, full body, dark atmospheric backdrop,
// dramatic volumetric light, moody color, grounded and menacing (never cute).
export const DOLRATH_MONSTER_STYLE_BASE =
  'Fantasy RPG monster illustration set in the dark-fantasy world of Dolrath. ' +
  'Cinematic, highly detailed digital painting; semi-realistic creature anatomy ' +
  'with believable fur, scale, chitin, bark and flesh; dramatic volumetric ' +
  'lighting and rich, moody color; a SINGLE full-body creature centered and ' +
  'isolated on a dark atmospheric gradient backdrop with subtle dust and mist and ' +
  'a soft rim light, three-quarter or front framing. Grounded, serious, menacing ' +
  'tone — a real dangerous beast, never cute, goofy or cartoonish. No character, ' +
  'no humans, no text, no watermark, no logo, no UI and no border.';

export interface MonsterArtInput {
  name: string;
  /** Creature-specific visual description (the subject prompt). */
  art: string;
}

// Builds the full gpt-image prompt for a single monster, sharing the locked Dolrath
// style with every other monster, the character portraits and the boss art.
export function buildMonsterImagePrompt(monster: MonsterArtInput): string {
  return [
    DOLRATH_MONSTER_STYLE_BASE,
    `Subject: "${monster.name}". ${monster.art.trim()}`,
  ].join('\n');
}

// Per-monster art direction for the FOREST dungeon (Floresta Sombria). Keyed by the
// monster name in dungeonAdventures.ts so the generator and any wiring share it.
// The boss (Anciã da Mata) is intentionally absent — its art already exists at
// /boss-ancia-da-mata.webp and is reused as-is.
export const MONSTER_ART: Record<string, string> = {
  'Lobo Faminto':
    'A gaunt, starving dire wolf prowling the moonlit forest floor — matted ' +
    'grey-black fur stretched over visible ribs, hackles raised, lips peeled back ' +
    'over yellowed fangs, hungry pale-yellow eyes catching the moonlight, a low ' +
    'predatory stalking stance amid ferns and gnarled roots.',
  'Aranha Gigante':
    'A monstrous giant forest spider the size of a horse — a bulbous bristled ' +
    'abdomen, eight long barbed legs braced wide, dripping venomous fangs and a ' +
    'cluster of glinting black eyes, perched over torn silk webbing strung between ' +
    'dark trees, faint sickly-green venom sheen.',
  'Javali Furioso':
    'A massive enraged wild boar charging — thick bristled brown-black hide, ' +
    'heavy muscular shoulders, curved yellowed tusks, small furious red eyes, ' +
    'flared snorting snout and churned mud kicked up beneath cloven hooves in the ' +
    'gloomy undergrowth.',
  'Ent Corrompido':
    'A corrupted tree-ent looming in the dark wood — a towering humanoid figure of ' +
    'twisted blackened bark and dead wood, gnarled root-like limbs and clawed ' +
    'branch fingers, hollow eye-sockets burning with a faint sickly-green glow, ' +
    'creeping rot and dripping sap, moss and dead leaves clinging to its bark.',
};
