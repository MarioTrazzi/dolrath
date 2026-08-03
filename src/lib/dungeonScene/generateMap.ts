// ============================================================
// Gerador de mapa — cada run, uma masmorra diferente.
//
// FORMA: mata SÓLIDA por toda parte, com corredores estreitos cavados nela e
// um BOLSÃO em cada ponto de encontro. O padrão do mundo é árvore; o vazio é
// que é escavado. (A versão anterior fazia o contrário — clareirões abertos
// com mata só na moldura — e lia como campo, não como floresta sombria.)
//
// UM BOLSÃO POR NÓ: cada ponto da trilha do servidor ganha o próprio vão. Antes
// três nós dividiam uma clareira gigante, o que obrigava discos enormes.
//
// Sai SEMPRE conectado por construção: as pontas de cada corredor nascem DENTRO
// dos bolsões vizinhos. Mesma seed ⇒ mesmo mapa (recarregar não teleporta o
// jogador para outra floresta); a run real usa o runId como seed.
//
// A contagem de nós vem de DUNGEONS[id] (rooms/minorNodes) — a MESMA fonte do
// buildTrail do servidor. Se mudar lá, o mapa acompanha sozinho.
// ============================================================

import { DUNGEONS, type DungeonId } from '@/lib/dungeonAdventures'
import { seedRng } from '@/lib/walkSceneAssets'
import { BIOME_RECIPES } from './recipes'
import type { MapSpot, SceneMapDef, SpotKind, Vec2, WalkArea } from './types'

interface Pocket {
  c: Vec2
  r: number
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

/** Ponto a `d` do centro de um bolsão, na direção `ang`. */
function onDisc(c: Vec2, d: number, ang: number): Vec2 {
  return { x: c.x + Math.cos(ang) * d, y: c.y + Math.sin(ang) * d }
}

function angleTo(a: Vec2, b: Vec2) {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

export function generateSceneMap(dungeonId: DungeonId, seed: string): SceneMapDef {
  const dungeon = DUNGEONS[dungeonId]
  const recipe = BIOME_RECIPES[dungeonId]
  const rng = seedRng(`${dungeonId}:${seed}`)
  const rand = (lo: number, hi: number) => lo + rng() * (hi - lo)

  const roomCount = dungeon.rooms
  const perRoom = dungeon.minorNodes + 1 // menores + 1 principal
  // entrada + (salas × nós) + chefe — idêntico ao buildTrail do servidor
  const nodeCount = 1 + roomCount * perRoom + 1

  // ---- 1. espinha: um bolsão por nó, serpenteando para o norte ----
  const pockets: Pocket[] = []
  let cursor: Vec2 = { x: 0, y: 0 }
  let drift = 0
  for (let i = 0; i < nodeCount; i++) {
    const isEntrance = i === 0
    const isBoss = i === nodeCount - 1
    const r = isEntrance
      ? recipe.radius[0] * 0.85
      : rand(recipe.radius[0], recipe.radius[1]) + (isBoss ? recipe.bossBonus : 0)
    pockets.push({ c: { ...cursor }, r })
    if (isBoss) break
    // Passeio aleatório no X com atrito, para o caminho serpentear de verdade
    // em vez de oscilar em torno do eixo; o Y sempre avança (nunca volta).
    drift = drift * 0.55 + rand(-recipe.sway, recipe.sway)
    cursor = {
      x: cursor.x * 0.82 + drift,
      y: cursor.y - rand(recipe.spacing * 0.8, recipe.spacing * 1.2),
    }
  }

  // ---- 2. corredores: duas cápsulas por ligação, com um cotovelo deslocado ----
  const areas: WalkArea[] = []
  const elbows: Vec2[] = []
  for (const p of pockets) areas.push({ kind: 'disc', c: p.c, r: p.r })

  for (let i = 0; i < pockets.length - 1; i++) {
    const a = pockets[i]
    const b = pockets[i + 1]
    const ang = angleTo(a.c, b.c)
    // Pontas ancoradas DENTRO dos bolsões ⇒ conexão garantida.
    const start = onDisc(a.c, a.r * 0.75, ang)
    const end = onDisc(b.c, b.r * 0.75, ang + Math.PI)
    const mid: Vec2 = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    const perp = ang + Math.PI / 2
    const elbow = add(mid, {
      x: Math.cos(perp) * rand(-recipe.bend, recipe.bend),
      y: Math.sin(perp) * rand(-recipe.bend, recipe.bend),
    })
    elbows.push(elbow)
    areas.push({ kind: 'trail', a: start, b: elbow, r: recipe.trailR })
    areas.push({ kind: 'trail', a: elbow, b: end, r: recipe.trailR })
  }

  // ---- 3. becos sem saída: corredores curtos que não levam a nó nenhum ----
  // É o que faz a mata parecer labirinto em vez de corrente de contas. O
  // explorador automático nunca entra neles (só segue a rota dos nós), então
  // são puro cenário — e de graça, porque a colisão já os trata como caminho.
  for (let k = 0; k < recipe.deadEnds; k++) {
    const from = pockets[1 + Math.floor(rng() * Math.max(1, pockets.length - 2))]
    const ang = rng() * Math.PI * 2
    const len = rand(9, 17)
    const mouth = onDisc(from.c, from.r * 0.8, ang)
    const tip = onDisc(from.c, from.r * 0.8 + len, ang + rand(-0.4, 0.4))
    areas.push({ kind: 'trail', a: mouth, b: tip, r: recipe.trailR * 0.85 })
    areas.push({ kind: 'disc', c: tip, r: recipe.trailR * 1.4 })
  }

  // ---- 4. pontos de encontro: um por bolsão, na ordem do servidor ----
  const spots: MapSpot[] = [
    { nodeIndex: 0, kind: 'start', room: 0, pos: { ...pockets[0].c }, approach: [] },
  ]
  for (let i = 1; i < nodeCount; i++) {
    const isBoss = i === nodeCount - 1
    const idx = i - 1 // posição entre os nós de sala
    const kind: SpotKind = isBoss ? 'boss' : idx % perRoom === perRoom - 1 ? 'main' : 'minor'
    const room = isBoss ? roomCount + 1 : Math.floor(idx / perRoom) + 1
    const prev = pockets[i - 1]
    const cur = pockets[i]
    const ang = angleTo(prev.c, cur.c)
    spots.push({
      nodeIndex: i,
      kind,
      room,
      pos: { ...cur.c },
      // Boca do corredor → cotovelo → boca do outro lado. Sem isto o herói
      // cortaria reto pela mata entre um bolsão e outro.
      approach: [
        onDisc(prev.c, prev.r * 0.75, ang),
        elbows[i - 1],
        onDisc(cur.c, cur.r * 0.75, ang + Math.PI),
      ],
    })
  }

  // ---- 5. marco: a casinha abandonada, encostada na borda de um bolsão ----
  const landmarks: Vec2[] = []
  if ((recipe.variants.house || 0) > 0 && nodeCount > 3) {
    const i = 1 + Math.floor(rng() * (nodeCount - 2))
    const p = pockets[i]
    // Sempre à ESQUERDA do bolsão (π = −X). Marco de cenário com posição
    // previsível vira referência de leitura: o jogador aprende onde olhar.
    landmarks.push(onDisc(p.c, p.r + rand(3, 5), Math.PI + rand(-0.35, 0.35)))
  }

  // ---- 6. limites (moldura estreita de mata: é retrato de celular) ----
  const margin = 13
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const area of areas) {
    const [cx, cy, rr] =
      area.kind === 'disc'
        ? [area.c.x, area.c.y, area.r]
        : [(area.a.x + area.b.x) / 2, (area.a.y + area.b.y) / 2, Math.hypot(area.b.x - area.a.x, area.b.y - area.a.y) / 2 + area.r]
    minX = Math.min(minX, cx - rr)
    maxX = Math.max(maxX, cx + rr)
    minY = Math.min(minY, cy - rr)
    maxY = Math.max(maxY, cy + rr)
  }

  return {
    id: dungeonId,
    seed,
    bounds: {
      minX: minX - margin,
      maxX: maxX + margin,
      minY: minY - margin,
      maxY: maxY + margin,
    },
    areas,
    spots,
    palette: recipe.palette,
    propMix: recipe.propMix,
    propStep: recipe.propStep,
    propDensity: recipe.propDensity,
    variants: recipe.variants,
    spriteH: recipe.spriteH,
    landmarks,
    groundTexture: recipe.groundTexture,
    entrance: { ...pockets[0].c },
  }
}
