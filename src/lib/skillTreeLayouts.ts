/**
 * Geometria da árvore de habilidades por classe.
 * Presentacional puro: recebe tree/paths e devolve coordenadas no viewBox (VB).
 *
 *   mage    → spiral   (nautilo / Child of Light — layout original)
 *   warrior → swastika (braços cardeais que dobram 90° — cruz forjada)
 *   rogue   → arrow    (haste + asas + ponta — silhueta de seta)
 *   monk    → ring     (raios retos em arcos concêntricos — círculo limpo)
 */

import type { SkillNode, SkillPathInfo } from '@/lib/skillTree'

export const VB = 700
export const CENTER = VB / 2
export const HUB_R = 52
export const LABEL_GAP = 52

// Spiral / ring shared params
const R0 = 100
const DR = 16
const ARC = 50

export type SkillTreeLayoutKind = 'spiral' | 'swastika' | 'arrow' | 'ring'

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
}

const CLASS_LAYOUT: Record<string, SkillTreeLayoutKind> = {
  mage: 'spiral',
  warrior: 'swastika',
  rogue: 'arrow',
  monk: 'ring',
}

export function getLayoutForClass(classId: string | null | undefined): SkillTreeLayoutKind {
  const c = (classId || '').toLowerCase()
  return CLASS_LAYOUT[c] || 'spiral'
}

export function outwardLabelPos(
  tip: { x: number; y: number },
  center = CENTER,
  gap = LABEL_GAP,
): { x: number; y: number } {
  const dx = tip.x - center
  const dy = tip.y - center
  const len = Math.hypot(dx, dy) || 1
  const rawX = tip.x + (dx / len) * gap
  const rawY = tip.y + (dy / len) * gap
  // Mantém o rótulo dentro do canvas (evita clip nas bordas).
  const pad = 28
  return {
    x: Math.min(VB - pad, Math.max(pad, rawX)),
    y: Math.min(VB - pad, Math.max(pad, rawY)),
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

/** Ordena paths por role para layouts que dependem de papel (arrow / swastika). */
function orderByRole(paths: SkillPathInfo[]): SkillPathInfo[] {
  const roleOrder = ['primary', 'buff', 'signature', 'control'] as const
  return [...paths].sort(
    (a, b) => roleOrder.indexOf(a.role as (typeof roleOrder)[number]) - roleOrder.indexOf(b.role as (typeof roleOrder)[number]),
  )
}

function findByRole(paths: SkillPathInfo[], role: string): SkillPathInfo | undefined {
  return paths.find(p => p.role === role)
}

// ————————————————————————————————————————————————————————————————————————
// Spiral (mage) — layout original
// ————————————————————————————————————————————————————————————————————————

function placeSpiral(tree: SkillNode[], paths: SkillPathInfo[]): PlacedPath[] {
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
        CENTER + rad * Math.cos(ang),
        CENTER + rad * Math.sin(ang),
      )
    })
    return { path, placed }
  })
}

// ————————————————————————————————————————————————————————————————————————
// Ring (monk) — ângulo fixo por braço, raio cresce por tier (sem twist)
// ————————————————————————————————————————————————————————————————————————

// Ring (monk) — ângulo fixo por braço, raio cresce por tier (sem twist)
const RING_R0 = 95
const RING_DR = 22

function placeRing(tree: SkillNode[], paths: SkillPathInfo[]): PlacedPath[] {
  return paths.map((path, armIndex) => {
    const nodes = nodesForPath(tree, path.id)
    const ang = ((armIndex * 90 - 90) * Math.PI) / 180
    const placed = nodes.map((node, i) => {
      const rad = RING_R0 + i * RING_DR
      return toPlaced(
        node,
        path.accent,
        CENTER + rad * Math.cos(ang),
        CENTER + rad * Math.sin(ang),
      )
    })
    return { path, placed }
  })
}

// ————————————————————————————————————————————————————————————————————————
// Swastika (warrior) — sai no eixo cardeal, depois dobra 90° horário
// ————————————————————————————————————————————————————————————————————————

const SWASTIKA_STEP = 26
const SWASTIKA_OUT = 5 // nós no segmento radial (tiers 1–5)
// restante (6–11) no gancho perpendicular

function placeSwastika(tree: SkillNode[], paths: SkillPathInfo[]): PlacedPath[] {
  const ordered = orderByRole(paths)
  // primary=up, buff=right, signature=down, control=left
  const armAnglesDeg = [-90, 0, 90, 180]

  return ordered.map((path, armIndex) => {
    const nodes = nodesForPath(tree, path.id)
    const baseAng = (armAnglesDeg[armIndex]! * Math.PI) / 180
    const hookAng = baseAng + Math.PI / 2 // 90° horário

    const placed = nodes.map((node, i) => {
      let x: number
      let y: number
      if (i < SWASTIKA_OUT) {
        const dist = R0 + i * SWASTIKA_STEP
        x = CENTER + dist * Math.cos(baseAng)
        y = CENTER + dist * Math.sin(baseAng)
      } else {
        const elbowDist = R0 + (SWASTIKA_OUT - 1) * SWASTIKA_STEP
        const elbowX = CENTER + elbowDist * Math.cos(baseAng)
        const elbowY = CENTER + elbowDist * Math.sin(baseAng)
        const hookI = i - (SWASTIKA_OUT - 1)
        x = elbowX + hookI * SWASTIKA_STEP * Math.cos(hookAng)
        y = elbowY + hookI * SWASTIKA_STEP * Math.sin(hookAng)
      }
      return toPlaced(node, path.accent, x, y)
    })
    return { path, placed }
  })
}

// ————————————————————————————————————————————————————————————————————————
// Arrow (rogue) — primary = haste; buff/control = asas; signature = ponta em V
// ————————————————————————————————————————————————————————————————————————

const ARROW_SHAFT_R0 = 90
const ARROW_SHAFT_STEP = 14
const ARROW_WING_STEP = 15
const ARROW_WING_R0 = 75

function placeArrow(tree: SkillNode[], paths: SkillPathInfo[]): PlacedPath[] {
  const primary = findByRole(paths, 'primary')
  const buff = findByRole(paths, 'buff')
  const control = findByRole(paths, 'control')
  const signature = findByRole(paths, 'signature')
  const result: PlacedPath[] = []

  // Haste: sobe do hub no eixo Y (folga no topo p/ a ponta + rótulo)
  if (primary) {
    const nodes = nodesForPath(tree, primary.id)
    const placed = nodes.map((node, i) =>
      toPlaced(node, primary.accent, CENTER, CENTER - (ARROW_SHAFT_R0 + i * ARROW_SHAFT_STEP)),
    )
    result.push({ path: primary, placed })
  }

  // Asa esquerda (control): diagonal up-left
  if (control) {
    const nodes = nodesForPath(tree, control.id)
    const ang = (-135 * Math.PI) / 180
    const placed = nodes.map((node, i) => {
      const rad = ARROW_WING_R0 + i * ARROW_WING_STEP
      return toPlaced(
        node,
        control.accent,
        CENTER + rad * Math.cos(ang),
        CENTER + rad * Math.sin(ang),
      )
    })
    result.push({ path: control, placed })
  }

  // Asa direita (buff): diagonal up-right
  if (buff) {
    const nodes = nodesForPath(tree, buff.id)
    const ang = (-45 * Math.PI) / 180
    const placed = nodes.map((node, i) => {
      const rad = ARROW_WING_R0 + i * ARROW_WING_STEP
      return toPlaced(
        node,
        buff.accent,
        CENTER + rad * Math.cos(ang),
        CENTER + rad * Math.sin(ang),
      )
    })
    result.push({ path: buff, placed })
  }

  // Ponta (signature): polyline em V no topo, acima das asas
  if (signature) {
    const nodes = nodesForPath(tree, signature.id)
    const n = nodes.length
    const leftCount = Math.ceil(n / 2) // inclui ápice
    const rightCount = n - leftCount
    const tipBaseY = 105
    const tipApexY = 42
    const tipHalfW = 125
    const placed = nodes.map((node, i) => {
      if (i < leftCount) {
        const t = leftCount <= 1 ? 1 : i / (leftCount - 1)
        return toPlaced(
          node,
          signature.accent,
          CENTER - tipHalfW * (1 - t),
          tipBaseY + (tipApexY - tipBaseY) * t,
        )
      }
      const ri = i - leftCount + 1
      const t = rightCount <= 0 ? 1 : ri / rightCount
      return toPlaced(
        node,
        signature.accent,
        CENTER + tipHalfW * t,
        tipApexY + (tipBaseY - tipApexY) * t,
      )
    })
    result.push({ path: signature, placed })
  }

  const byId = new Map(result.map(r => [r.path.id, r]))
  return paths.map(p => byId.get(p.id)!).filter(Boolean)
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
  switch (layout) {
    case 'swastika':
      return placeSwastika(opts.tree, opts.paths)
    case 'arrow':
      return placeArrow(opts.tree, opts.paths)
    case 'ring':
      return placeRing(opts.tree, opts.paths)
    case 'spiral':
    default:
      return placeSpiral(opts.tree, opts.paths)
  }
}
