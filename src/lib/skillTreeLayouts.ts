/**
 * Geometria da árvore de habilidades por classe.
 * Presentacional puro: recebe tree/paths e devolve coordenadas no viewBox.
 *
 *   mage    → spiral  (nautilo / Child of Light — layout original)
 *   warrior → sword   (montante: lâmina p/ cima, guarda alada, punho zigzag)
 *   rogue   → arrow   (flecha de baixo p/ cima: haste, empenas, ponta em V)
 *   monk    → mandala (4 braços diagonais em trança dupla + anéis)
 *
 * REGRA DE OURO: os nós são dimensionados em cqw sobre um viewBox de LARGURA
 * FIXA 700 — diâmetro em unidades VB = size×7 (stat 42 / especial 56 /
 * capstone 70). Todo par de nós precisa de distância centro-a-centro ≥ ~60.
 * Só a ALTURA varia por layout (canvas comprido rola verticalmente no mobile).
 */

import type { SkillNode, SkillPathInfo } from '@/lib/skillTree'

export const VB = 700
export const HUB_R = 52

export type SkillTreeLayoutKind = 'spiral' | 'sword' | 'arrow' | 'mandala'

export interface LayoutDims {
  w: number
  h: number
  /** Centro do medalhão (origem dos spokes) — nem sempre o centro do canvas. */
  hub: { x: number; y: number }
}

export interface PlacedNode {
  node: SkillNode
  accent: string
  x: number
  y: number
  isSpecial: boolean
  isCapstone: boolean
}

export interface PlacedPath {
  path: SkillPathInfo
  placed: PlacedNode[]
  /** Posição do rótulo do caminho no viewBox. */
  label: { x: number; y: number }
  /** Origem do conector até o 1º nó; null = sem spoke (ex.: ponta da flecha). */
  spokeFrom?: { x: number; y: number } | null
}

const CLASS_LAYOUT: Record<string, SkillTreeLayoutKind> = {
  mage: 'spiral',
  warrior: 'sword',
  rogue: 'arrow',
  monk: 'mandala',
}

const LAYOUT_DIMS: Record<SkillTreeLayoutKind, LayoutDims> = {
  spiral: { w: VB, h: VB, hub: { x: VB / 2, y: VB / 2 } },
  mandala: { w: VB, h: 760, hub: { x: VB / 2, y: 380 } },
  sword: { w: VB, h: 1250, hub: { x: VB / 2, y: 780 } },
  arrow: { w: VB, h: 1060, hub: { x: VB / 2, y: 984 } },
}

export function getLayoutForClass(classId: string | null | undefined): SkillTreeLayoutKind {
  const c = (classId || '').toLowerCase()
  return CLASS_LAYOUT[c] || 'spiral'
}

export function getLayoutDims(kind: SkillTreeLayoutKind): LayoutDims {
  return LAYOUT_DIMS[kind]
}

/** Rótulo radialmente p/ fora do último nó, preso dentro do canvas. */
function outwardLabelPos(
  tip: { x: number; y: number },
  dims: LayoutDims,
  gap = 52,
): { x: number; y: number } {
  const dx = tip.x - dims.hub.x
  const dy = tip.y - dims.hub.y
  const len = Math.hypot(dx, dy) || 1
  const rawX = tip.x + (dx / len) * gap
  const rawY = tip.y + (dy / len) * gap
  const pad = 28
  return {
    x: Math.min(dims.w - pad, Math.max(pad, rawX)),
    y: Math.min(dims.h - pad, Math.max(pad, rawY)),
  }
}

function toPlaced(node: SkillNode, accent: string, x: number, y: number): PlacedNode {
  return {
    node,
    accent,
    x,
    y,
    isSpecial: node.kind !== 'stat',
    isCapstone: node.cost > 1,
  }
}

function nodesForPath(tree: SkillNode[], pathId: string): SkillNode[] {
  return tree.filter(n => n.path === pathId).sort((a, b) => a.tier - b.tier)
}

function findByRole(paths: SkillPathInfo[], role: string): SkillPathInfo | undefined {
  return paths.find(p => p.role === role)
}

/** Reordena o resultado de volta para a ordem original dos paths (estabilidade da UI). */
function inOriginalOrder(paths: SkillPathInfo[], result: PlacedPath[]): PlacedPath[] {
  const byId = new Map(result.map(r => [r.path.id, r]))
  return paths.map(p => byId.get(p.id)!).filter(Boolean)
}

// ————————————————————————————————————————————————————————————————————————
// Spiral (mage) — layout original (corda ≈ 52, sem colisão)
// ————————————————————————————————————————————————————————————————————————

const R0 = 100
const DR = 16
const ARC = 50

function placeSpiral(tree: SkillNode[], paths: SkillPathInfo[], dims: LayoutDims): PlacedPath[] {
  return paths.map((path, armIndex) => {
    const nodes = nodesForPath(tree, path.id)
    let rad = R0
    let ang = ((armIndex * 90 - 90) * Math.PI) / 180
    const placed = nodes.map((node, i) => {
      if (i > 0) {
        ang += ARC / rad
        rad += DR
      }
      return toPlaced(
        node,
        path.accent,
        dims.hub.x + rad * Math.cos(ang),
        dims.hub.y + rad * Math.sin(ang),
      )
    })
    const tip = placed[placed.length - 1] || { x: dims.hub.x, y: dims.hub.y }
    return { path, placed, label: outwardLabelPos(tip, dims) }
  })
}

// ————————————————————————————————————————————————————————————————————————
// Mandala (monk) — 4 braços DIAGONAIS; cada caminho zigzagueia entre 2 trilhas
// paralelas (offset ±MANDALA_OFF do eixo). Corda = √(26² + 54²) ≈ 60.
// ————————————————————————————————————————————————————————————————————————

const MANDALA_R0 = 95
const MANDALA_STEP = 26
const MANDALA_OFF = 27

function placeMandala(tree: SkillNode[], paths: SkillPathInfo[], dims: LayoutDims): PlacedPath[] {
  const armAnglesDeg = [-45, 45, 135, -135] // NE, SE, SW, NO

  return paths.map((path, armIndex) => {
    const nodes = nodesForPath(tree, path.id)
    const ang = (armAnglesDeg[armIndex]! * Math.PI) / 180
    const ux = Math.cos(ang)
    const uy = Math.sin(ang)
    const px = -Math.sin(ang)
    const py = Math.cos(ang)

    const placed = nodes.map((node, i) => {
      const rad = MANDALA_R0 + i * MANDALA_STEP
      const off = (i % 2 === 0 ? -1 : 1) * MANDALA_OFF
      return toPlaced(
        node,
        path.accent,
        dims.hub.x + ux * rad + px * off,
        dims.hub.y + uy * rad + py * off,
      )
    })
    // Rótulo acima (braços de cima) ou abaixo (de baixo) da ponta, com clamp horizontal
    const tip = placed[placed.length - 1] || { x: dims.hub.x, y: dims.hub.y }
    const lx = Math.min(dims.w - 100, Math.max(100, tip.x))
    const ly = uy < 0 ? tip.y - 62 : tip.y + 62
    return { path, placed, label: { x: lx, y: ly } }
  })
}

// ————————————————————————————————————————————————————————————————————————
// Sword (warrior) — montante apontando p/ cima:
//   primary   = lâmina (coluna vertical acima do hub)
//   buff/ctrl = guarda (horizontal p/ fora, pontas dobram p/ CIMA)
//   signature = empunhadura (zigzag de 2 colunas descendo até o pomo)
// ————————————————————————————————————————————————————————————————————————

const SWORD_BLADE_R0 = 90
const SWORD_BLADE_STEP = 56
const SWORD_GUARD_R0 = 88
const SWORD_GUARD_STEP = 52
const SWORD_GUARD_OUT = 5 // nós horizontais antes da dobra p/ cima
const SWORD_HOOK_STEP = 56
const SWORD_GRIP_R0 = 90
const SWORD_GRIP_STEP = 30
const SWORD_GRIP_OFF = 26

function placeSword(tree: SkillNode[], paths: SkillPathInfo[], dims: LayoutDims): PlacedPath[] {
  const primary = findByRole(paths, 'primary')
  const buff = findByRole(paths, 'buff')
  const control = findByRole(paths, 'control')
  const signature = findByRole(paths, 'signature')
  const result: PlacedPath[] = []

  if (primary) {
    const nodes = nodesForPath(tree, primary.id)
    const placed = nodes.map((node, i) =>
      toPlaced(node, primary.accent, dims.hub.x, dims.hub.y - (SWORD_BLADE_R0 + i * SWORD_BLADE_STEP)),
    )
    const tip = placed[placed.length - 1]!
    result.push({ path: primary, placed, label: { x: tip.x, y: tip.y - 58 } })
  }

  const guardArm = (path: SkillPathInfo, side: 1 | -1): PlacedPath => {
    const nodes = nodesForPath(tree, path.id)
    const elbowX = dims.hub.x + side * (SWORD_GUARD_R0 + (SWORD_GUARD_OUT - 1) * SWORD_GUARD_STEP)
    const placed = nodes.map((node, i) => {
      if (i < SWORD_GUARD_OUT) {
        return toPlaced(node, path.accent, dims.hub.x + side * (SWORD_GUARD_R0 + i * SWORD_GUARD_STEP), dims.hub.y)
      }
      const hookI = i - (SWORD_GUARD_OUT - 1)
      return toPlaced(node, path.accent, elbowX, dims.hub.y - hookI * SWORD_HOOK_STEP)
    })
    const tip = placed[placed.length - 1]!
    // Clamp horizontal: o rótulo é largo e a ponta da guarda fica rente à borda
    const lx = Math.min(dims.w - 100, Math.max(100, tip.x))
    return { path, placed, label: { x: lx, y: tip.y - 58 } }
  }
  if (buff) result.push(guardArm(buff, 1))
  if (control) result.push(guardArm(control, -1))

  if (signature) {
    const nodes = nodesForPath(tree, signature.id)
    const placed = nodes.map((node, i) =>
      toPlaced(
        node,
        signature.accent,
        dims.hub.x + (i % 2 === 0 ? -1 : 1) * SWORD_GRIP_OFF,
        dims.hub.y + SWORD_GRIP_R0 + i * SWORD_GRIP_STEP,
      ),
    )
    const tip = placed[placed.length - 1]!
    result.push({ path: signature, placed, label: { x: dims.hub.x, y: Math.min(dims.h - 24, tip.y + 62) } })
  }

  return inOriginalOrder(paths, result)
}

// ————————————————————————————————————————————————————————————————————————
// Arrow (rogue) — flecha de baixo p/ cima (hub na base):
//   primary   = haste (coluna vertical subindo)
//   buff/ctrl = empenas (diagonais íngremes flanqueando a haste)
//   signature = ponta em V acima de tudo (sem spoke: ela "coroa" a haste)
// ————————————————————————————————————————————————————————————————————————

const ARROW_SHAFT_R0 = 90
const ARROW_SHAFT_STEP = 58
const ARROW_WING_X0 = 74
const ARROW_WING_DX = 8
const ARROW_WING_Y0 = 50
const ARROW_WING_DY = 58
const ARROW_TIP_HALF_W = 240
const ARROW_TIP_BASE_DY = 660 // base do V acima do hub (folga p/ capstones das empenas)
const ARROW_TIP_APEX_DY = 850 // ápice do V acima do hub

function placeArrow(tree: SkillNode[], paths: SkillPathInfo[], dims: LayoutDims): PlacedPath[] {
  const primary = findByRole(paths, 'primary')
  const buff = findByRole(paths, 'buff')
  const control = findByRole(paths, 'control')
  const signature = findByRole(paths, 'signature')
  const result: PlacedPath[] = []

  if (primary) {
    const nodes = nodesForPath(tree, primary.id)
    const placed = nodes.map((node, i) =>
      toPlaced(node, primary.accent, dims.hub.x, dims.hub.y - (ARROW_SHAFT_R0 + i * ARROW_SHAFT_STEP)),
    )
    // Rótulo no vão entre a ponta em V e o capstone da haste
    result.push({ path: primary, placed, label: { x: dims.hub.x, y: dims.hub.y - 744 } })
  }

  const wing = (path: SkillPathInfo, side: 1 | -1): PlacedPath => {
    const nodes = nodesForPath(tree, path.id)
    const placed = nodes.map((node, i) =>
      toPlaced(
        node,
        path.accent,
        dims.hub.x + side * (ARROW_WING_X0 + i * ARROW_WING_DX),
        dims.hub.y - (ARROW_WING_Y0 + i * ARROW_WING_DY),
      ),
    )
    const tip = placed[placed.length - 1]!
    return { path, placed, label: { x: tip.x + side * 56, y: tip.y + 50 } }
  }
  if (control) result.push(wing(control, -1))
  if (buff) result.push(wing(buff, 1))

  if (signature) {
    const nodes = nodesForPath(tree, signature.id)
    const n = nodes.length
    const leftCount = Math.ceil(n / 2) // sobe da base esquerda até o ápice
    const rightCount = n - leftCount
    const baseY = dims.hub.y - ARROW_TIP_BASE_DY
    const apexY = dims.hub.y - ARROW_TIP_APEX_DY
    const placed = nodes.map((node, i) => {
      if (i < leftCount) {
        const t = leftCount <= 1 ? 1 : i / (leftCount - 1)
        return toPlaced(node, signature.accent, dims.hub.x - ARROW_TIP_HALF_W * (1 - t), baseY + (apexY - baseY) * t)
      }
      const ri = i - leftCount + 1
      const t = rightCount <= 0 ? 1 : ri / rightCount
      return toPlaced(node, signature.accent, dims.hub.x + ARROW_TIP_HALF_W * t, apexY + (baseY - apexY) * t)
    })
    result.push({
      path: signature,
      placed,
      label: { x: dims.hub.x, y: apexY - 59 },
      spokeFrom: null,
    })
  }

  return inOriginalOrder(paths, result)
}

// ————————————————————————————————————————————————————————————————————————
// API pública
// ————————————————————————————————————————————————————————————————————————

export function placeSkillTree(opts: {
  tree: SkillNode[]
  paths: SkillPathInfo[]
  classId?: string | null
  layout?: SkillTreeLayoutKind
}): PlacedPath[] {
  const layout = opts.layout ?? getLayoutForClass(opts.classId)
  const dims = getLayoutDims(layout)
  switch (layout) {
    case 'sword':
      return placeSword(opts.tree, opts.paths, dims)
    case 'arrow':
      return placeArrow(opts.tree, opts.paths, dims)
    case 'mandala':
      return placeMandala(opts.tree, opts.paths, dims)
    case 'spiral':
    default:
      return placeSpiral(opts.tree, opts.paths, dims)
  }
}
