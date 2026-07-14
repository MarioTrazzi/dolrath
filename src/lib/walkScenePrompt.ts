// Art direction travada para segmentos verticais da WalkScene (estilo Anterra / Dolrath).
// Path entra embaixo e sai em cima na MESMA posição X (~centro) para emendarem.

export const DOLRATH_WALK_SEGMENT_STYLE_BASE =
  'Top-down slightly isometric pixel-art RPG map segment for the dark-fantasy world of Dolrath, ' +
  'matching World of Anterra exploration vibe: vertical rectangular tile of a forest or dungeon path, ' +
  'the walkable dirt/grass path enters at the BOTTOM center and exits at the TOP center in the SAME ' +
  'horizontal position so segments can stack seamlessly. Dense foliage or scenery on both sides, ' +
  'moody atmosphere, no characters, no UI, no text, no watermark, no logo, no HUD. Soft volumetric ' +
  'darkness at the edges; readable path in the middle. Consistent pixel scale across the whole image.'

export interface WalkSegmentPromptInput {
  dungeonName: string
  segmentLabel: string
  art: string
}

export function buildWalkSegmentPrompt(input: WalkSegmentPromptInput): string {
  return [
    DOLRATH_WALK_SEGMENT_STYLE_BASE,
    `Dungeon: "${input.dungeonName}". Segment: "${input.segmentLabel}". ${input.art.trim()}`,
  ].join('\n')
}

/** Descrições por kind × masmorra (usadas pelo gerador gpt-image). */
export const WALK_SEGMENT_ART: Record<string, Record<string, string>> = {
  floresta: {
    clearing:
      'A small moonlit forest clearing with mossy grass, yellow wildflowers, and a narrow dirt path through the center.',
    pines:
      'Dense dark pine trees crowding both sides of a narrow dirt trail; needles and roots along the path edges.',
    rocks:
      'Mossy boulders and cracked earth beside a forest path; reddish dry soil patches near the trail.',
    brook:
      'A shallow forest brook crossing the path with stepping stones; wet stones and ferns.',
    'cave-mouth':
      'A rocky cave mouth half-hidden by trees and purple flowers beside the upward path; ominous dark opening.',
    path:
      'A winding forest footpath through undergrowth, mushrooms and tall grass, still entering bottom and exiting top center.',
  },
  caverna: {
    crystals:
      'Crystal cavern corridor with amethyst and cyan crystals flanking a stone walkway that runs bottom to top center.',
    rocks:
      'Jagged cave rock walls and rubble beside a narrow stone path through a dark crystal cave.',
    tunnel:
      'A tight cave tunnel with dripping stalactites; the floor path stays centered vertically.',
    path:
      'A mine-cart style cave gallery floor with scattered ore and crystal dust along a central walkway.',
    bones:
      'Ancient bones and broken mining tools littering the sides of a cavern path.',
    chamber:
      'A wider crystal chamber with a clear stone path still aligned bottom-center to top-center.',
  },
  pantano: {
    mire:
      'Murky swamp mud and sickly green water flanking a precarious wooden/dirt path going straight up the segment.',
    water:
      'Stagnant swamp pools with lily pads beside a raised muddy trail centered vertically.',
    path:
      'A crooked swamp boardwalk path through reeds and hanging moss, entrance bottom center exit top center.',
    roots:
      'Tangled mangrove-like roots and twisted trees framing a muddy swamp path.',
    bones:
      'Half-sunken animal bones and broken spears along a swamp trail.',
    clearing:
      'A slightly dryer swamp clearing with fireflies and a muddy path still centered.',
  },
  ruinas: {
    arch:
      'Crumbling stone archway ruins with purple arcane glow; a stone path runs bottom to top center under the arch.',
    path:
      'A ruined corridor floor of broken tiles with columns on both sides; path centered vertically.',
    crypt:
      'An open crypt chamber with sarcophagus fragments beside a stone walkway.',
    rubble:
      'Collapsed masonry rubble piles flanking a cleared path through arcane ruins.',
    plaza:
      'A ruined plaza with cracked mosaics and a clear central path bottom to top.',
    gate:
      'A broken ancient gate frame at mid-segment; the path still enters bottom center and exits top center.',
  },
}

// ---- Floresta Sombria: battle BG + walk strip (edit from landing celestial art) ----

export const FLORESTA_SCENE_REF = 'public/hero-masmorra-floresta-celestial.webp'

export const FLORESTA_BATTLE_PROMPT =
  'EDIT the provided Dolrath Floresta Sombria cinematic image. Keep the EXACT same dark fantasy forest environment, ' +
  'color grade, twin moons / moonlight, twisted ancient trees, volumetric mist, mossy ground and dramatic lighting. ' +
  'REMOVE all characters, heroes, elves, bosses, creatures, auras and UI entirely — leave an empty atmospheric ' +
  'clearing / battle arena in the forest suitable as a full-bleed RPG combat background. No people, no monsters, ' +
  'no text, no watermark, no logo, no HUD. Widescreen landscape composition, cinematic empty scene.'

export const FLORESTA_WALK_MAP_PROMPT =
  'EDIT the provided Dolrath Floresta Sombria image into a TALL VERTICAL exploration map strip for a top-down / ' +
  'slightly isometric RPG walk scene. Keep the same dark forest world, moons, mist, twisted trees, moss and color ' +
  'palette. Transform the framing into a continuous vertical path: a narrow dirt trail enters at the BOTTOM center ' +
  'and exits at the TOP center in the SAME horizontal position so the image can scroll as a treadmill. Dense forest ' +
  'on both sides. REMOVE all characters, heroes, bosses, creatures and UI. No text, no watermark, no logo. Portrait ' +
  'vertical composition, seamless-feel path for scrolling exploration.'

