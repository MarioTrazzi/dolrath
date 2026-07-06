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

  // ---- CAVERNA DE CRISTAL ----
  'Morcego Sombrio':
    'A large cave bat swooping between jagged crystal formations — leathery ' +
    'charcoal-black wings spread wide, oversized pointed ears, milky blind eyes and ' +
    'a snarling fanged snout, faint bluish crystal glow reflecting off its wet, ' +
    'membranous wings as it dives out of the dark.',
  'Goblin Minerador':
    'A wiry, feral mining goblin crouched among broken rock — sickly greenish ' +
    'hide scarred by cave-ins, a crude iron pickaxe gripped in clawed hands, ' +
    'bulging bloodshot eyes adapted to the dark, ragged leather harness hung with ' +
    'stolen ore sacks, coated in pale rock dust and crystal grit.',
  'Slime de Cristal':
    'A translucent amethyst-purple slime pulsing with inner light — a jellied, ' +
    'semi-solid mass studded with jagged crystal shards embedded beneath its ' +
    'gelatinous surface, faint refracted glimmers moving through its body, oozing ' +
    'slowly across a cavern floor littered with cracked geodes.',
  'Golem de Pedra':
    'A hulking golem carved from raw cave stone and veined crystal — massive ' +
    'slab-like limbs bound by glowing cyan fissures running through the rock, a ' +
    'crude blocky head with two burning crystalline eye-sockets, moss and mineral ' +
    'crust clinging to its cracked granite hide, radiating a low ground-shaking ' +
    'presence.',
  'Wyrm Cristalino':
    'A serpentine crystal wyrm coiled through a glittering cavern — long armored ' +
    'body sheathed in translucent, faceted cyan-blue scales that catch and split ' +
    'light like raw gems, a narrow horned draconic head with glowing crystalline ' +
    'eyes and a maw lined with glass-sharp teeth, faint arcane light pulsing ' +
    'along its spine as it rears amid jagged crystal spires.',

  // ---- PÂNTANO MALDITO ----
  'Sapo Venenoso':
    'A bloated poisonous toad crouched on a rotting log — warty mottled skin ' +
    'weeping sickly green toxin from glandular bumps, a wide lipless mouth and ' +
    'bulging yellow eyes, throat sac swollen and pulsing, half-submerged in dark ' +
    'swamp water thick with algae and mist.',
  'Serpente do Lodo':
    'A thick mud-caked serpent surging up from murky swamp water — slick ' +
    'brown-black scales streaked with algae, glowing sickly-yellow slit eyes, ' +
    'jaws unhinged wide to show curved dripping fangs, its coils vanishing into ' +
    'the fog-veiled bog beneath.',
  'Bruxa do Brejo':
    'A gaunt swamp witch wading through the mist — hunched frame wrapped in ' +
    'tattered moss-stained rags, grey-green rotting skin, wild tangled hair ' +
    'strung with dead reeds, hollow glowing eyes and clawed fingers crackling ' +
    'with a sickly witch-light, will-o-wisps flickering faintly around her in the ' +
    'fog.',
  'Crocodilo Ancião':
    'A colossal ancient crocodile half-submerged in black swamp water — ' +
    'thick armored hide scarred and crusted with algae and barnacles, one ' +
    'clouded milky eye from age, rows of broken yellowed teeth jutting from a ' +
    'massive gnarled snout, ripples spreading across the murky water around its ' +
    'bulk.',
  'Hidra do Pântano':
    'A monstrous three-headed swamp hydra rising from the mire — thick ' +
    'serpentine necks sheathed in slick mottled green-black scales, three ' +
    'reptilian heads baring dripping fangs and glowing pale-yellow eyes, murky ' +
    'swamp water and torn reeds cascading off its coiling bulk, faint venomous ' +
    'mist curling from its open jaws.',

  // ---- RUÍNAS ARCANAS ----
  'Esqueleto Guerreiro':
    'An ancient skeletal warrior risen among broken columns — bare bleached ' +
    'bone frame clad in corroded, rune-etched armor plates, a notched ' +
    'ceremonial sword raised in one bony grip, empty eye sockets burning with a ' +
    'faint arcane light, dust and crumbled mortar falling from its joints.',
  'Espectro Errante':
    'A wandering specter drifting through a ruined hall — a translucent, ' +
    'tattered humanoid silhouette of pale spectral light, wisps of ghostly ' +
    'fabric trailing into mist, a hollow shrieking face with deep sunken glowing ' +
    'eyes, faintly illuminating the broken stone and dead runes around it.',
  'Múmia Real':
    'A withered royal mummy shambling from its sarcophagus — desiccated grey ' +
    'skin stretched tight over a regal frame, unraveling jeweled funeral wraps ' +
    'and tarnished golden burial ornaments, sunken glowing eyes beneath a ' +
    'crumbling ceremonial headdress, trailing ancient dust in the torchlit ruin.',
  'Gárgula de Obsidiana':
    'A crouched obsidian gargoyle perched on a broken column — a jagged, ' +
    'glassy black-stone body with sharp bat-like wings folded tight, carved ' +
    'demonic features and glowing amber eyes, cracked volcanic-glass hide ' +
    'catching faint rune-light, poised as if about to lunge from the ruins.',
  'Lich Imperador':
    'An undying lich emperor enthroned in arcane ruin — a skeletal regal ' +
    'figure draped in rotted, rune-embroidered imperial robes, a tarnished ' +
    'golden crown fused to a bare skull, hollow eye sockets blazing with cold ' +
    'violet arcane fire, spectral energy crackling from bony fingers, ancient ' +
    'runes igniting faintly across the shattered floor around him.',
};
