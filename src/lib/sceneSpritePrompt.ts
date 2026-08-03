// Fonte única do estilo dos SPRITES DE CENA (vegetação, cenário e objetos dos nós).
//
// Espelha monsterImagePrompt.ts / itemImagePrompt.ts: SCENE_SPRITE_STYLE_BASE é
// IDÊNTICO para todo sprite — é isso que faz 48 objetos gerados em chamadas
// separadas parecerem do mesmo jogo. A descrição por objeto entra por cima.
//
// Três travas que importam mais que a beleza do prompt:
//   1. FUNDO TRANSPARENTE e SEM sombra assada — a sombra é desenhada no canvas,
//      então bate com a luz da cena e some quando o objeto é pego.
//   2. MESMA CÂMERA em todos (3/4 levemente elevado) — se cada sprite vier de um
//      ângulo, o mapa vira colagem.
//   3. ANCORADO na base central do quadro — o motor desenha o objeto com o "pé"
//      na posição do mundo; sem isso, cada sprite flutua numa altura diferente.
//
// Modelos de imagem NÃO fazem sprite sheet coerente (quadro a quadro muda o
// personagem). Por isso geramos UMA imagem estática por objeto e a animação
// (balanço, respiração, squash, recuo) é feita em código.

import type { DungeonId } from '@/lib/dungeonAdventures'

// ⚠️ Aprendido na 1ª rodada da Floresta (12 imagens):
//   • Objeto PEQUENO puxa "foto de produto": o baú veio visto de cima ~45° e com
//     um tapete de grama por baixo. Por isso a câmera agora é BAIXA (~20°) e
//     descrita como IDÊNTICA para árvore de 10m e para baú.
//   • "no shadow" não basta: o modelo pinta um chão. Agora o pedido é RECORTE —
//     o alpha começa no contorno.
export const SCENE_SPRITE_STYLE_BASE =
  'Single isolated game asset sprite for a 2.5D action RPG set in the ' +
  'dark-fantasy world of Dolrath. Painterly semi-realistic digital painting, ' +
  'rich moody color, strong readable silhouette that still reads clearly when ' +
  'scaled down small. ONE object only, centered, complete and fully inside the ' +
  'frame, standing upright with its base resting at the bottom edge of the frame. ' +
  'CAMERA: eye-level with the object, tilted down only slightly, about 20 degrees ' +
  'above the horizon — the SAME camera for a ten-metre tree and for a small chest. ' +
  'Never a top-down view, never looking down onto the object, never a product ' +
  'render on a surface. ' +
  'LIGHTING: a single soft key light from the upper left, front-lit, with the ' +
  'object evenly readable. NO rim light, NO backlight, NO halo, NO bright outline ' +
  'tracing the silhouette, NO glowing mist, haze, fog or atmosphere behind or ' +
  'between the parts of the object, NO bloom. The outer edge of the object must ' +
  'be the SAME value and darkness as its interior — never lighter than the body. ' +
  'CUTOUT: the object is cleanly cut out — fully transparent alpha begins ' +
  'immediately at its outline. Absolutely no ground, no floor, no terrain, no ' +
  'grass, no soil, no dirt patch, no snow, no stone slab, no base, no platform, ' +
  'no pedestal, no circular disc and no painted surface beneath or around the ' +
  'object. No cast shadow and no glow or light spill bleeding outside the ' +
  'silhouette. ' +
  'No scene, no background elements, no second object, no character, no creature, ' +
  'no text, no watermark, no logo, no UI, no border and no frame.'

export type SpriteKind = 'tree' | 'bush' | 'rock' | 'stump' | 'chest' | 'rubble' | 'herb' | 'fountain'

export interface SpriteJob {
  biome: DungeonId
  kind: SpriteKind
  /** 1..n — variação do mesmo tipo, para o mapa não repetir. */
  variant: number
  subject: string
}

export function spriteFileName(job: Pick<SpriteJob, 'kind' | 'variant'>) {
  return `${job.kind}-${job.variant}.webp`
}

export function spritePublicPath(job: Pick<SpriteJob, 'biome' | 'kind' | 'variant'>) {
  return `/scene/${job.biome}/${spriteFileName(job)}`
}

export function buildSceneSpritePrompt(job: SpriteJob): string {
  return [SCENE_SPRITE_STYLE_BASE, `Subject: ${job.subject.trim()}`].join('\n')
}

// ------------------------------------------------------------
// Manifesto. `kind` é ESTRUTURAL (o motor espalha 'tree'/'bush'/'rock'/'stump'
// pela mata segundo o propMix do bioma); o `subject` é que dá o bioma. Por isso
// a caverna tem 'tree' — é a espiral de cristal que ocupa esse papel lá.
// ------------------------------------------------------------

// ⚠️ NA FLORESTA, este manifesto NÃO é mais a fonte da arte.
// O cenário (tree/bush/rock/stump, mais ground/road/house/puddle) veio do
// CraftPix — ver public/scene/floresta/SOURCE.txt — e os objetos de nó
// (chest/herb/fountain/rubble) saem das folhas do Gemini recortadas por
// scripts/slice-node-sprites.ts. Rodar `npm run art:scene --only floresta
// --force` SOBRESCREVERIA tudo isso com imagem gerada. Sem --force o script
// pula o que já existe, que é o comportamento seguro. Os textos abaixo seguem
// aqui como referência de estilo e para os outros três biomas.
const FLORESTA: SpriteJob[] = [
  { biome: 'floresta', kind: 'tree', variant: 1, subject: 'A tall gnarled black pine with dense dark blue-green needles and a crooked trunk, deep forest gloom clinging to its branches.' },
  { biome: 'floresta', kind: 'tree', variant: 2, subject: 'A broad ancient oak with a thick mossy trunk and a heavy dark canopy, pale lichen patches and twisted low branches.' },
  { biome: 'floresta', kind: 'tree', variant: 3, subject: 'A dead leafless birch, pale bone-white bark peeling in strips, bare clawing branches, one broken limb hanging.' },
  { biome: 'floresta', kind: 'bush', variant: 1, subject: 'A dense fern shrub with layered dark green fronds, a few dried brown leaves at the base.' },
  { biome: 'floresta', kind: 'bush', variant: 2, subject: 'A tangled thorny bramble with sharp black thorns and small dark red berries.' },
  { biome: 'floresta', kind: 'rock', variant: 1, subject: 'A rounded grey granite boulder half covered in wet green moss, damp and weathered.' },
  { biome: 'floresta', kind: 'rock', variant: 2, subject: 'A cluster of three angular grey stones of different sizes leaning against each other, dead leaves caught between them.' },
  { biome: 'floresta', kind: 'stump', variant: 1, subject: 'A rotting tree stump with a splintered top, orange shelf fungus growing on one side and roots crawling outward.' },
  { biome: 'floresta', kind: 'chest', variant: 1, subject: 'A weathered wooden treasure chest bound in rusted iron bands with a heavy dark lock, lid closed, moss creeping along the bottom edge.' },
  { biome: 'floresta', kind: 'rubble', variant: 1, subject: 'A heap of fallen branches, broken bark and dead leaves piled over a half-buried rotting crate — something worth searching.' },
  { biome: 'floresta', kind: 'herb', variant: 1, subject: 'A low patch of medicinal herbs with broad silver-green leaves and small pale glowing flowers, faint magical shimmer on the leaf edges.' },
  { biome: 'floresta', kind: 'fountain', variant: 1, subject: 'A small weathered stone fountain overgrown with moss and vine, clear water welling from a cracked basin with a faint blue glow.' },
]

const CAVERNA: SpriteJob[] = [
  { biome: 'caverna', kind: 'tree', variant: 1, subject: 'A tall jagged amethyst crystal spire rising from a rocky base, faint violet inner glow refracting through its facets.' },
  { biome: 'caverna', kind: 'tree', variant: 2, subject: 'A cluster of tall pale blue crystal shards of uneven height fused at the base, cold luminous glow.' },
  { biome: 'caverna', kind: 'tree', variant: 3, subject: 'A thick limestone stalagmite streaked with mineral deposits, wet and glistening.' },
  { biome: 'caverna', kind: 'bush', variant: 1, subject: 'A low cluster of pale cave mushrooms with fat bioluminescent caps glowing soft cyan.' },
  { biome: 'caverna', kind: 'bush', variant: 2, subject: 'A patch of small sharp crystal shards sprouting from cracked rock like a mineral thicket.' },
  { biome: 'caverna', kind: 'rock', variant: 1, subject: 'A jagged dark grey rock chunk with sharp fracture planes and glinting mineral flecks.' },
  { biome: 'caverna', kind: 'rock', variant: 2, subject: 'A broken geode split open, dull grey outside and glittering purple crystal inside.' },
  { biome: 'caverna', kind: 'stump', variant: 1, subject: 'A shattered stalagmite stump snapped near the base, sharp broken crown and rubble around it.' },
  { biome: 'caverna', kind: 'chest', variant: 1, subject: 'An iron-bound miner strongbox crusted with pale crystal growth, heavy riveted corners, lid closed.' },
  { biome: 'caverna', kind: 'rubble', variant: 1, subject: 'A cave-in pile of broken rock and splintered mine timbers with a bent pickaxe half buried in it.' },
  { biome: 'caverna', kind: 'herb', variant: 1, subject: 'A cluster of glowing blue cave lichen and pale moonlit mushrooms growing on a small wet rock.' },
  { biome: 'caverna', kind: 'fountain', variant: 1, subject: 'A still pool of luminous mineral water held in a natural crystal basin, soft blue light rising from within.' },
]

const PANTANO: SpriteJob[] = [
  { biome: 'pantano', kind: 'tree', variant: 1, subject: 'A twisted mangrove with tangled stilt roots rising out of dark water, sparse sickly-green foliage and hanging moss.' },
  { biome: 'pantano', kind: 'tree', variant: 2, subject: 'A dead drowned tree, black waterlogged trunk with bare branches draped in grey hanging moss.' },
  { biome: 'pantano', kind: 'tree', variant: 3, subject: 'A leaning bald cypress with a swollen buttressed base, thin drooping needles and rot creeping up the bark.' },
  { biome: 'pantano', kind: 'bush', variant: 1, subject: 'A dense clump of tall marsh reeds and cattails, some broken and bent over.' },
  { biome: 'pantano', kind: 'bush', variant: 2, subject: 'A low swollen bush of dark waxy leaves dripping with swamp slime and pale fungal growth.' },
  { biome: 'pantano', kind: 'rock', variant: 1, subject: 'A slime-covered boulder half sunk in mud, algae streaking its slick surface.' },
  { biome: 'pantano', kind: 'rock', variant: 2, subject: 'A mound of wet grey mud and stones with bubbling dark water pooling at its base.' },
  { biome: 'pantano', kind: 'stump', variant: 1, subject: 'A waterlogged rotting stump crawling with dark fungus and pale worms, half collapsed.' },
  { biome: 'pantano', kind: 'chest', variant: 1, subject: 'A swollen waterlogged wooden chest with warped planks and green corroded brass fittings, lid closed, algae streaking the sides.' },
  { biome: 'pantano', kind: 'rubble', variant: 1, subject: 'A pile of driftwood, tangled weed and a broken rowboat hull sunk in mud.' },
  { biome: 'pantano', kind: 'herb', variant: 1, subject: 'A patch of swamp herbs with dark purple leaves and drooping poisonous-looking blossoms, faint green glow.' },
  { biome: 'pantano', kind: 'fountain', variant: 1, subject: 'A clear spring bubbling up through the murk into a ring of pale stones, unnaturally clean water with a soft glow.' },
]

const RUINAS: SpriteJob[] = [
  { biome: 'ruinas', kind: 'tree', variant: 1, subject: 'A broken stone column snapped at mid height, carved arcane glyphs faintly glowing violet along its shaft.' },
  { biome: 'ruinas', kind: 'tree', variant: 2, subject: 'A tall weathered obelisk leaning at an angle, cracked and chipped, faded engravings on its faces.' },
  { biome: 'ruinas', kind: 'tree', variant: 3, subject: 'A crumbling archway fragment standing alone, half its arc collapsed, purple arcane residue seeping from the cracks.' },
  { biome: 'ruinas', kind: 'bush', variant: 1, subject: 'A clump of dry dead weeds and creeping vine growing out of a cracked flagstone.' },
  { biome: 'ruinas', kind: 'bush', variant: 2, subject: 'A low pile of shattered ceramic urn shards with a wisp of violet magical dust hanging over it.' },
  { biome: 'ruinas', kind: 'rock', variant: 1, subject: 'A carved masonry block fallen from a wall, one face still bearing part of a relief.' },
  { biome: 'ruinas', kind: 'rock', variant: 2, subject: 'A cracked statue head lying on its side, features worn smooth by centuries, dark stone.' },
  { biome: 'ruinas', kind: 'stump', variant: 1, subject: 'The stump of a shattered pillar, jagged broken top with reinforcing iron rods bent outward.' },
  { biome: 'ruinas', kind: 'chest', variant: 1, subject: 'An ornate stone reliquary coffer inlaid with tarnished silver arcane sigils, lid closed, faint violet light in the seams.' },
  { biome: 'ruinas', kind: 'rubble', variant: 1, subject: 'A heap of collapsed masonry, broken tiles and snapped columns with dust still settling over it.' },
  { biome: 'ruinas', kind: 'herb', variant: 1, subject: 'A patch of pale arcane moss and ghostly white flowers growing in a crack between flagstones, faint violet luminescence.' },
  { biome: 'ruinas', kind: 'fountain', variant: 1, subject: 'A ruined marble fountain with a cracked basin, enchanted water still flowing upward against gravity in a faint violet ribbon.' },
]

export const SCENE_SPRITES: SpriteJob[] = [...FLORESTA, ...CAVERNA, ...PANTANO, ...RUINAS]

/** Quantas variantes existem de cada tipo, por bioma (o motor sorteia entre elas). */
export function spriteVariantCount(biome: DungeonId, kind: SpriteKind): number {
  return SCENE_SPRITES.filter(s => s.biome === biome && s.kind === kind).length
}
