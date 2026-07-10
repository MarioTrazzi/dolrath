// Single source of truth for the Dolrath ITEM art style.
//
// Mirrors characterImagePrompt.ts: DOLRATH_ITEM_STYLE_BASE is identical for every
// item — this is what keeps all item art visually coherent and consistent with the
// character NFTs (same dark-fantasy world, same cinematic painted look, same square
// framing). TYPE_STYLE / RARITY_STYLE / RACE_FLAVOR add the item-specific identity
// on top. The item's own name + description are merged in as the subject.

import type { ItemTypeStr, Rarity, RaceId } from '@/lib/itemCatalog';

// The locked art style — keep edits here so every item stays consistent with the
// character portraits. Same art direction as DOLRATH_STYLE_BASE, adapted to render
// a single hero OBJECT (no character, no hands) centered for use as item art.
export const DOLRATH_ITEM_STYLE_BASE =
  'Fantasy RPG equipment render set in the dark-fantasy world of Dolrath. ' +
  'Cinematic, highly detailed digital painting; semi-realistic materials with ' +
  'believable metal, leather, wood, gem and cloth; dramatic volumetric lighting ' +
  'and rich, moody color; a SINGLE hero object centered and isolated, shown at a ' +
  'flattering three-quarter studio angle on a dark atmospheric gradient backdrop ' +
  'with subtle dust particles and a soft rim light. Grounded, serious tone — never ' +
  'goofy or cartoonish. No character, no hands, no text, no watermark, no logo, no ' +
  'UI and no border.';

// Per-type identity. Keyed by Prisma ItemType (string) + CONSUMABLE.
export const TYPE_STYLE: Record<string, string> = {
  SWORD: 'A one-handed sword: clean blade with a fuller, a guarded crossguard and a wrapped grip.',
  AXE: 'A battle axe: heavy bearded head with a forged edge on a sturdy hafted handle.',
  DAGGER: 'A dagger: short, wickedly sharp blade with a slim ornate hilt; or paired beast claws when feral.',
  STAFF: 'A wizard staff: tall carved shaft topped with a glowing focus crystal or rune.',
  BOW: 'A bow: elegant recurve limbs with a taut string and decorative tips.',
  SHIELD: 'A shield: front-facing, with a reinforced rim, boss and an emblazoned face.',
  LIGHT_ARMOR: 'A light body armor: layered leather or enchanted cloth chest piece on an invisible stand.',
  MEDIUM_ARMOR: 'A medium body armor: studded brigantine or scale chest piece on an invisible stand.',
  HEAVY_ARMOR: 'A heavy body armor: full plate cuirass with pauldrons on an invisible stand.',
  LIGHT_HELMET: 'A light helmet/hood: leather cap or hood, three-quarter view.',
  MEDIUM_HELMET: 'A medium helmet: mail coif or open-face helm, three-quarter view.',
  HEAVY_HELMET: 'A heavy helmet: full visored steel helm, three-quarter view.',
  LIGHT_GLOVES: 'Light gloves: a pair of leather or mail gloves.',
  MEDIUM_GLOVES: 'Medium gloves: a pair of studded gauntlets.',
  HEAVY_GLOVES: 'Heavy gauntlets: a pair of articulated plate gauntlets.',
  LIGHT_BOOTS: 'Light boots: a pair of supple leather travel boots.',
  MEDIUM_BOOTS: 'Medium boots: a pair of reinforced boots.',
  HEAVY_BOOTS: 'Heavy boots: a pair of plated sabatons.',
  RING: 'A ring: a single ornate band with a set gemstone, shown large and detailed.',
  NECKLACE: 'A necklace/amulet: a pendant on a fine chain, the pendant prominent and detailed.',
  GAUNTLET: 'A martial fist weapon (monk): reinforced metal knuckle gauntlets / a spiked cestus with hardened plating over the knuckles — a WEAPON for unarmed strikes, not simple gloves.',
  ORB: 'A mage offhand orb: a floating polished crystal sphere cradled in an ornate metal holder, swirling arcane energy and runic glyphs glowing inside the glass.',
  BELT: 'A belt/girdle: a wide waist belt with a prominent engraved metal buckle and hanging straps or pouches, laid out horizontally.',
  PARRY_DAGGER: 'A parrying dagger / main-gauche (rogue offhand): a short left-hand blade with an ornate swept guard or side-ring built to catch and deflect enemy blades — slimmer and more defensive than a primary dagger.',
  TALISMAN: 'A monk offhand talisman: a string of polished prayer beads or a jade charm / warded seal-tag bound with cord and hanging tassels, humming with a calm spiritual ki aura — a martial-spiritual focus, not a weapon.',
  CONSUMABLE: 'A consumable: a glass potion vial or alchemical flask with a glowing liquid and a corked or sealed top.',
  ENHANCEMENT_STONE: 'An enhancement stone (Black Desert "black stone" vibe): a single dark, polished obsidian-black stone fragment, faceted and floating, with glowing runic cracks of arcane energy running through it. A runic sigil is etched on its face. NO vial, NO bottle, NO liquid.',
  // Espólios de alquimia: matéria-prima crua, NÃO a poção pronta.
  INGREDIENT: 'A raw alchemy reagent shown as a loose apothecary component (herb, root, mushroom, flower, crystal, bone dust, vial of raw essence, monster blood, feather...) resting on the dark backdrop — a natural crafting ingredient, NOT a finished labeled potion.',
  // Materiais de forja: insumo bruto de ferreiro, NÃO a arma/armadura pronta.
  MATERIAL: 'A raw blacksmith crafting material shown as a loose forge resource (tanned leather hide, iron ingot, heavy metal block, light metal billet, flexible bow-wood, living tree sap, raw uncut crystal, hardened gem shards...) on the dark backdrop — a smithing reagent, NOT a finished weapon or armor.',
  // Estilhaço de pedra negra: lasca pequena da black stone, claramente um FRAGMENTO.
  STONE_SHARD: 'A shard of black enhancement stone: a small, sharp broken sliver of polished obsidian-black stone with glowing runic cracks and a tiny etched sigil, faceted and floating — clearly a FRAGMENT/CHIP, not a whole stone. NO vial, NO bottle, NO liquid.',
  // Estilhaço de memória: fragmento de cristal translúcido com uma forma fantasma dentro.
  MEMORY_SHARD: 'A glowing translucent memory fragment: a faceted crystal-glass shard holding a faint ghostly after-image of an ancient weapon and armor swirling inside, pale ethereal blue-white light and drifting motes — a relic of remembered forms. NO vial, NO bottle, NO liquid.',
  // Insumo PROCESSADO (Bancada de Processamento): produto beneficiado, não o cru.
  PROCESSED: 'A refined crafting good produced at a processing bench (a cast metal ingot, a polished blade blank, a planed wooden board, tanned finished leather, a woven bolt of linen cloth, a cut and faceted gem, a sack of milled flour, a stoppered clay jar of herbal extract...) neatly presented on the dark backdrop — clearly a PROCESSED/refined material, more finished than raw ore or hide, but NOT a finished weapon, armor or labeled potion.',
  // Prato de CULINÁRIA: comida rústica de taverna, não poção.
  FOOD: 'A hearty rustic tavern dish of a fantasy realm (fresh baked bread, a roasted meat platter, a herb salad in a wooden bowl, a savory pie, a steaming stew pot, a lavish feast spread...) served on rustic wood or pewter tableware, appetizing steam and warm light — cooked FOOD, NOT a potion, NO glass vial.',
};

// Per-rarity treatment — escalates ornamentation and magical aura.
export const RARITY_STYLE: Record<Rarity, string> = {
  COMMON: 'Common quality: plain, sturdy, lightly worn; muted neutral materials, no magical glow.',
  UNCOMMON: 'Superior quality: well-crafted with modest trim and a faint colored sheen.',
  RARE: 'Rare quality: fine engraving, inset gems and a soft magical glow in a cool blue hue.',
  EPIC: 'Epic quality: ornate craftsmanship, radiant runes and a vivid magical aura in violet/magenta.',
  LEGENDARY: 'Legendary quality: masterwork artifact, intricate filigree, blazing energy, floating embers and a golden mythic aura.',
};

// Optional race flavor for race-restricted gear (mirrors the character race styles).
export const RACE_FLAVOR: Record<RaceId, string> = {
  draconiano: 'Draconian make: overlapping dragon scales, ember cracks glowing with inner fire, bone and obsidian accents.',
  elfo: 'Elven make: graceful moonwood and silver filigree, leaf and astral motifs, a luminous celestial shimmer.',
  metamorfo: 'Beastkin make: raw bone, fang, fur and sinew, primal and feral, claw-like forms.',
  humano: 'Human make: practical, balanced craftsmanship with heraldic touches and tempered steel.',
};

export type ItemArtInput = {
  name: string;
  description?: string | null;
  type: ItemTypeStr | 'CONSUMABLE' | string;
  rarity: Rarity;
  raceRestriction?: RaceId | null;
  /** weekly-boss-named gear gets an extra "signature artifact" cue */
  adventureBoss?: string | null;
};

const isRaceId = (id: unknown): id is RaceId =>
  id === 'draconiano' || id === 'elfo' || id === 'metamorfo' || id === 'humano';

// Builds the full DALL·E / gpt-image prompt for a single item, sharing the locked
// Dolrath style with every other item and the character portraits.
export function buildItemImagePrompt(item: ItemArtInput): string {
  const typeStyle = TYPE_STYLE[item.type] ?? 'A distinctive piece of Dolrath equipment with a strong silhouette.';
  const rarityStyle = RARITY_STYLE[item.rarity] ?? RARITY_STYLE.COMMON;

  const lines = [
    DOLRATH_ITEM_STYLE_BASE,
    `Subject: "${item.name}". ${item.description ? item.description.trim() : ''}`.trim(),
    `Item type: ${typeStyle}`,
    `Quality: ${rarityStyle}`,
  ];

  if (isRaceId(item.raceRestriction)) {
    lines.push(`Cultural make: ${RACE_FLAVOR[item.raceRestriction]}`);
  }
  if (item.adventureBoss) {
    lines.push(`This is a unique named artifact dropped by the world boss "${item.adventureBoss}" — make it iconic and instantly recognizable.`);
  }

  return lines.join('\n');
}
