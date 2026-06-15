// Single source of truth for the Dolrath NFT character art style.
//
// DOLRATH_STYLE_BASE is identical for every race/class combination — this is what
// keeps all character NFTs visually coherent (the "mesmo estilo"). RACE_STYLE and
// CLASS_STYLE add the combination-specific identity on top, so every one of the
// 16 race × class combinations gets its own pre-prompt while sharing the locked
// base style. The player's own request is merged in afterwards (server-side, by
// Claude) as additions only — it never overrides the locked style/race/class.

export type RaceId = 'draconiano' | 'metamorfo' | 'humano' | 'elfo';
export type ClassId = 'warrior' | 'rogue' | 'mage' | 'monk';

// The locked art style — keep edits here so every NFT stays consistent.
export const DOLRATH_STYLE_BASE =
  'Fantasy RPG character portrait set in the dark-fantasy world of Dolrath. ' +
  'Cinematic, highly detailed digital painting; semi-realistic proportions with ' +
  'coherent anatomy; dramatic volumetric lighting and rich, moody color; sharp ' +
  'focus on a single character in three-quarter or portrait framing. Grounded, ' +
  'serious tone — never goofy or cartoonish. No text, no watermark, no logo, no ' +
  'UI and no border.';

// Race-specific visual identity. Mirrors the lore in characterCreationData.ts.
export const RACE_STYLE: Record<RaceId, string> = {
  draconiano:
    'Draconian heritage: subtle dragon scales along the arms, jaw and brow, ' +
    'slit reptilian eyes, a faint ember glow under the skin, and an imposing, ' +
    'powerful build that hints at the dragon transformation within.',
  metamorfo:
    'Shapeshifter heritage: a lean, predatory frame, feral amber eyes, ' +
    'wolf-like or beast-like features bleeding through, and an untamed ' +
    'wilderness aura hinting at animal transformation.',
  humano:
    'Human heritage: a determined, adaptable adventurer with expressive human ' +
    'features and a versatile, resilient bearing, carrying a faint inner spark ' +
    'that hints at the awakening of the 7th Sense.',
  elfo:
    'Elven heritage: elegant, ethereal features, long pointed ears, luminous ' +
    'eyes and graceful arcane beauty, with a faint celestial astral glow that ' +
    'hints at the Celestial Form.',
};

// Class-specific visual identity. Mirrors the classes in gameData.ts.
export const CLASS_STYLE: Record<ClassId, string> = {
  warrior:
    'Warrior class: heavy, battle-worn plate or scale armor, a large melee ' +
    'weapon (greatsword, mace or spear), a broad and powerful stance, scars ' +
    'and a hardened expression.',
  rogue:
    'Rogue class: light leather armor and a hooded cloak, daggers or a bow, an ' +
    'agile crouched stance, a shadowed face and quick, dangerous body language.',
  mage:
    'Mage class: arcane robes with runic detailing, a glowing staff, vivid ' +
    'magical energy and floating runes swirling around the hands, and an ' +
    'intelligent, piercing gaze.',
  monk:
    'Monk class: minimal monastic garb with wrapped fists and sashes, a ' +
    'disciplined and balanced martial stance, a focused serene expression and ' +
    'faint chi energy around the body.',
};

const RACE_FALLBACK =
  'A distinctive Dolrath adventurer with a strong, memorable silhouette.';
const CLASS_FALLBACK =
  'A capable Dolrath adventurer equipped for their calling.';

export type CombinationInput = {
  raceId?: string | null;
  classId?: string | null;
  raceName?: string | null;
  className?: string | null;
};

const isRaceId = (id: string): id is RaceId => id in RACE_STYLE;
const isClassId = (id: string): id is ClassId => id in CLASS_STYLE;

// Builds the locked, combination-specific style pre-prompt for a given
// race + class. Covers all combinations via composition (base + race + class).
export function buildCombinationPreprompt(input: CombinationInput): string {
  const raceId = String(input.raceId || '').toLowerCase();
  const classId = String(input.classId || '').toLowerCase();

  const raceStyle = isRaceId(raceId) ? RACE_STYLE[raceId] : RACE_FALLBACK;
  const classStyle = isClassId(classId) ? CLASS_STYLE[classId] : CLASS_FALLBACK;

  const raceName = input.raceName || input.raceId || 'Unknown race';
  const className = input.className || input.classId || 'Adventurer';

  return [
    DOLRATH_STYLE_BASE,
    `Race: ${raceName}. ${raceStyle}`,
    `Class: ${className}. ${classStyle}`,
  ].join('\n');
}
