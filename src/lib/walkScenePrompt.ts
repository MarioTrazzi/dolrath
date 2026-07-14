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

/** Referência de CÂMERA / luz / fog-of-war (World of Anterra style) para o walk map. */
export const FLORESTA_WALK_CAMERA_REF = 'public/backgrounds/anterra-camera-ref.png'

export const FLORESTA_BATTLE_PROMPT =
  'EDIT the provided Dolrath Floresta Sombria cinematic image. Keep the EXACT same dark fantasy forest environment, ' +
  'color grade, twin moons / moonlight, twisted ancient trees, volumetric mist, mossy ground and dramatic lighting. ' +
  'REMOVE all characters, heroes, elves, bosses, creatures, auras and UI entirely — leave an empty atmospheric ' +
  'clearing / battle arena in the forest suitable as a full-bleed RPG combat background. No people, no monsters, ' +
  'no text, no watermark, no logo, no HUD. Widescreen landscape composition, cinematic empty scene.'

/**
 * Walk map: a imagem de entrada DEVE ser a ref Anterra (câmera).
 * O prompt trava perspectiva + halo; remove personagem; alonga em strip vertical Dolrath.
 */
// ---- Floresta Sombria: MAPA DA RUN (top-down, mapa grande de RPG) ----

/** Referência de FLORESTA (mood/paleta/folhagem) escolhida pelo Mario — câmera errada, corrigida via prompt. */
export const FLORESTA_RUN_MAP_REF = 'public/backgrounds/floresta-run-ref.png'

export const FLORESTA_RUN_MAP_PROMPT =
  'CRITICAL CAMERA OVERRIDE — the reference image shows the RIGHT forest from the WRONG angle. ' +
  'Repaint this EXACT forest as seen STRAIGHT FROM ABOVE: a classic top-down dark-fantasy RPG dungeon map, ' +
  "bird's-eye view looking down at the forest canopy and floor. ABSOLUTELY NO horizon, NO sky, NO vanishing " +
  'point, NO eye-level tree trunks receding into the distance — if any part of the image reads as "standing ' +
  'on the path looking forward", it is WRONG. Tree canopies must be seen as round/irregular tops from above, ' +
  'the trail must be a flat ribbon drawn on the ground plane, like a hand-painted world map in Diablo or ' +
  'a tabletop RPG campaign map.\n' +
  'KEEP FROM THE REFERENCE (identity lock): the exact same haunted ancient forest — deep green-teal palette, ' +
  'cold moonlight, dense mossy gnarled trees, olive-gold moss and undergrowth catching the light, oppressive ' +
  'darkness at the edges, subtle mist. Same painterly, finely textured dark-fantasy rendering.\n' +
  'MAP CONTENT — the full run of the "Floresta Sombria" dungeon on one tall map: a single winding dirt trail ' +
  'enters at the BOTTOM EDGE of the map and climbs, meandering left and right, to the TOP where it ends in a ' +
  'large sinister boss grove dominated by one COLOSSAL corrupted ancient tree with a faint eerie green glow ' +
  '(the lair of the Anciã da Mata). Along the trail, from bottom to top, place THREE distinct moonlit ' +
  'clearings (small round encounter arenas where moonbeams break through the canopy), and between them small ' +
  'landmarks: a shallow brook crossing the trail with stepping stones, clusters of mossy boulders, patches of ' +
  'mushrooms and tiny yellow wildflowers, and one small glowing elven spring pool with silvery-blue water. ' +
  'Everything far from the trail dissolves into near-black forest darkness, so the lit trail and clearings ' +
  'read clearly as the playable route (fog-of-war feeling).\n' +
  'STYLE: rich painted texture, high detail, moody and legible; the trail must be clearly readable from ' +
  'bottom to top at a glance.\n' +
  'STRICTLY FORBIDDEN: characters, monsters, animals, text, letters, labels, numbers, icons, markers, pins, ' +
  'compass rose, legend, border frame, parchment edges, UI, HUD, watermark, logo.'

// ---- Caverna/Pântano/Ruínas: mapa da run + battle BG (biome-swap a partir das artes da Floresta) ----
//
// A referência anexada é a ARTE APROVADA da Floresta (run map ou battle):
// o prompt trava câmera/estilo/composição e troca só o bioma.

/** Âncoras de estilo (artes aprovadas da Floresta). */
export const RUN_MAP_STYLE_REF = 'public/backgrounds/floresta-run-map.webp'
export const BATTLE_STYLE_REF = 'public/backgrounds/floresta-battle.webp'

const RUN_MAP_CAMERA_LOCK =
  'STYLE & CAMERA LOCK — keep EXACTLY the same visual language as the reference image: top-down ' +
  "bird's-eye classic dark-fantasy RPG dungeon map, painterly finely-textured rendering, a single " +
  'clearly readable winding route that ENTERS AT THE BOTTOM EDGE and climbs, meandering, to a large ' +
  'boss lair at the TOP, everything far from the route dissolving into near-black darkness ' +
  '(fog-of-war feel). ABSOLUTELY NO horizon, NO sky, NO vanishing point, NO eye-level view — the ' +
  'whole frame is ground plane seen from above.\n'

const RUN_MAP_FORBIDDEN =
  '\nSTRICTLY FORBIDDEN: characters, monsters, animals, text, letters, labels, numbers, icons, ' +
  'markers, pins, compass rose, legend, border frame, parchment edges, UI, HUD, watermark, logo.'

const BATTLE_CAMERA_LOCK =
  'STYLE & CAMERA LOCK — keep EXACTLY the same visual language as the reference image: cinematic ' +
  'eye-level widescreen dark-fantasy combat backdrop, dramatic framing elements on BOTH side edges, ' +
  'an EMPTY open ground in the foreground center suitable as a battle arena, volumetric mist, deep ' +
  'darkness in the far background, painterly finely-textured rendering, high contrast single ' +
  'dominant light source.\n'

const BATTLE_FORBIDDEN =
  '\nNo people, no heroes, no monsters, no creatures, no animals, no text, no watermark, no logo, ' +
  'no UI, no HUD. Widescreen landscape composition, cinematic EMPTY scene.'

export const DUNGEON_RUN_MAP_PROMPTS: Record<string, string> = {
  caverna:
    RUN_MAP_CAMERA_LOCK +
    'BIOME SWAP — replace the forest ENTIRELY with the "Caverna de Cristal": a deep underground ' +
    'crystal cavern seen from above. Dark slate and indigo stone floor; the route is a carved mine ' +
    'gallery / stone walkway. Clusters of glowing amethyst-purple and cyan crystals grow along the ' +
    'route and light it with their own cold radiance (dominant accent: cyan-turquoise) — the crystals ' +
    'ARE the light source, no moonlight. Along the route, from bottom to top, place FOUR wider cavern ' +
    'chambers (round encounter arenas bathed in crystal light), and between them small landmarks: a ' +
    'mirror-black underground pool, a glinting vein of raw gold in the rock, scattered ancient bones ' +
    'with broken mining picks and an abandoned ore cart, piles of rubble and stalagmites casting ' +
    'sharp shadows. The route ends at the TOP in a colossal boss chamber: a huge cavern dome ringed ' +
    'by GIANT cyan crystal shards around a dark hoard of raw gold — the den of the crystal wyrm ' +
    '(do NOT draw the creature itself).' +
    RUN_MAP_FORBIDDEN,
  pantano:
    RUN_MAP_CAMERA_LOCK +
    'BIOME SWAP — replace the forest ENTIRELY with the "Pântano Maldito": a cursed mist-veiled swamp ' +
    'seen from above. Black-green stagnant water with oily sheen, islands of dark mud, reeds and ' +
    'lily pads; twisted leafless trees draped in hanging moss seen as gnarled crowns from above. The ' +
    'route is a crooked raised muddy trail patched with rotten wooden boardwalk planks. Drifting ' +
    'patches of pale mist cross the map; small blue-white will-o\'-wisp lights float NEAR the route, ' +
    'a few luring AWAY from it into the dark water (lights that lie). Dominant accent: sickly ' +
    'moss-lime green with cold blue wisp glow. Along the route, from bottom to top, place FOUR ' +
    'slightly dryer clearings (round encounter arenas), and between them small landmarks: a huge ' +
    'half-sunken ribcage of some ancient beast, a faint golden glint of sunken treasure under the ' +
    'water, a broken spear in the mud, fireflies. The route ends at the TOP in the boss lair: a wide ' +
    'ominous black lagoon ringed by dead trees, its surface disturbed by ripples of something huge ' +
    'beneath (do NOT draw the creature itself).' +
    RUN_MAP_FORBIDDEN,
  ruinas:
    RUN_MAP_CAMERA_LOCK +
    'BIOME SWAP — replace the forest ENTIRELY with the "Ruínas Arcanas": the ruins of a dead arcane ' +
    'empire seen from above. Cracked pale-stone floors and shattered mosaics, broken columns and ' +
    'collapsed walls casting long moonlit shadows, dust and faint amber haze. The route is a paved ' +
    'processional way of broken tiles running through the ruins. Dead runes carved along the way ' +
    'glow violet-purple as if waking (dominant accent: arcane violet), with a few cold candle flames ' +
    'in crypt niches. Along the route, from bottom to top, place FIVE ruined plazas / roofless halls ' +
    '(encounter arenas), and between them small landmarks: a shattered triumphal arch, an open crypt ' +
    'with stone sarcophagi, a rune-covered altar, a toppled colossal statue head, piles of masonry ' +
    'rubble. The route ends at the TOP in the boss sanctum: a grand roofless throne hall where a ' +
    'HUGE violet arcane sigil glows on the floor before an empty black throne (do NOT draw the ' +
    'creature itself).' +
    RUN_MAP_FORBIDDEN,
}

export const DUNGEON_BATTLE_PROMPTS: Record<string, string> = {
  caverna:
    BATTLE_CAMERA_LOCK +
    'BIOME SWAP — replace the forest ENTIRELY with the "Caverna de Cristal": an underground crystal ' +
    'cavern battle arena. Jagged dark rock walls frame both sides; giant glowing amethyst-purple and ' +
    'cyan crystal formations replace the trees and the moons as the ONLY light sources, casting cold ' +
    'turquoise light across a smooth cavern floor of dark stone with scattered crystal shards and ' +
    'faint gold dust. Dripping stalactites overhead, thin mist hugging the ground, deep black tunnel ' +
    'darkness in the far background.' +
    BATTLE_FORBIDDEN,
  pantano:
    BATTLE_CAMERA_LOCK +
    'BIOME SWAP — replace the forest ENTIRELY with the "Pântano Maldito": a cursed swamp battle ' +
    'arena. Twisted leafless trees draped in long hanging moss frame both sides; the arena floor is ' +
    'firm dark mud and shallow black water with faint reflections. Thick layered fog drifts between ' +
    'the dead trees; blue-white will-o\'-wisp lights hover in the mist as eerie accents, and a ' +
    'sickly green-lime glow bleeds through the fog as the dominant light. Reeds, half-sunken roots ' +
    'and old bones at the edges.' +
    BATTLE_FORBIDDEN,
  ruinas:
    BATTLE_CAMERA_LOCK +
    'BIOME SWAP — replace the forest ENTIRELY with the "Ruínas Arcanas": a ruined arcane throne hall ' +
    'battle arena. Broken colossal columns and crumbling rune-carved walls frame both sides; the ' +
    'arena floor is cracked stone tiles with a faint shattered mosaic. Violet arcane runes glow ' +
    'along the columns and floor cracks as the dominant light, with one pale moonbeam falling ' +
    'through the collapsed roof; dust motes and thin haze in the air, endless dark colonnade in the ' +
    'far background.' +
    BATTLE_FORBIDDEN,
}

export const FLORESTA_WALK_MAP_PROMPT =
  'CRITICAL CAMERA LOCK — keep the EXACT same camera as the reference image: ' +
  'high-angle isometric / top-down oblique RPG view (like classic Diablo / World of Anterra exploration), ' +
  'looking down at the forest floor from above at a fixed oblique angle. NOT eye-level, NOT side-view, ' +
  'NOT cinematic landscape portrait of trees — it must read as a PLAYABLE MAP from above.\n' +
  'LIGHTING LOCK — keep the circular spotlight / lantern halo on the ground with hard fog-of-war: ' +
  'bright readable grass and path in the center circle, everything outside fades to near-black darkness. ' +
  'Light rain streaks catching in the light. High contrast.\n' +
  'EDIT goals: (1) REMOVE the rider, horse, and any characters completely — empty path only. ' +
  '(2) Extend into a TALL VERTICAL map strip (portrait): a continuous dirt/grass trail that enters at the ' +
  'BOTTOM CENTER and exits at the TOP CENTER in the SAME X position so it can scroll as a treadmill. ' +
  '(3) Keep dense dark forest (pines, bushes, yellow wildflowers, mossy ground, reddish soil patches) ' +
  'on both sides of the path, same mood as the reference. Optional faint twin moons in the dark sky ' +
  'above the canopy for Dolrath Floresta Sombria identity — but do NOT change the camera to look up at moons.\n' +
  'No UI, no text, no watermark, no logo, no HUD, no characters, no animals. ' +
  'Output must look like an empty exploration tilemap corridor seen from above, not a key-art poster.'

