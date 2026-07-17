// ============================================================
// Geometria dos dados 3D em CSS
// - Sólidos reais (d4 tetraedro, d6 cubo, d8 octaedro, d10
//   trapezoedro pentagonal, d12 dodecaedro, d20 icosaedro)
// - Por face: matrix3d que posiciona um plano na casca do
//   poliedro, polígono 2D da face e o quaternion de "pouso"
//   (rotação do dado que traz a face para a câmera com o
//   número em pé)
// Tudo em espaço unitário (circunraio = 1); o componente
// multiplica pelo tamanho em px na hora de renderizar.
// Convenção de eixos = CSS: x→direita, y→baixo, z→espectador.
// ============================================================

export type V3 = [number, number, number]
export interface Quat {
  w: number
  x: number
  y: number
  z: number
}

// ---------- vetores ----------
const vAdd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const vSub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const vScale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const vDot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const vCross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const vLen = (a: V3) => Math.sqrt(vDot(a, a))
const vNorm = (a: V3): V3 => vScale(a, 1 / (vLen(a) || 1))
export const v3Dot = vDot
export const v3Normalize = vNorm

// ---------- quaternions ----------
export const QUAT_IDENTITY: Quat = { w: 1, x: 0, y: 0, z: 0 }

export function qMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

export function qNormalize(q: Quat): Quat {
  const n = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z) || 1
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n }
}

export function qFromAxisAngle(axis: V3, angle: number): Quat {
  const a = vNorm(axis)
  const s = Math.sin(angle / 2)
  return { w: Math.cos(angle / 2), x: a[0] * s, y: a[1] * s, z: a[2] * s }
}

export const qDot = (a: Quat, b: Quat) => a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z
export const qNeg = (q: Quat): Quat => ({ w: -q.w, x: -q.x, y: -q.y, z: -q.z })

/** Slerp — aceita t fora de [0,1] (overshoot do pouso extrapola naturalmente). */
export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let d = qDot(a, b)
  let bb = b
  if (d < 0) {
    bb = qNeg(b)
    d = -d
  }
  if (d > 0.9995) {
    return qNormalize({
      w: a.w + (bb.w - a.w) * t,
      x: a.x + (bb.x - a.x) * t,
      y: a.y + (bb.y - a.y) * t,
      z: a.z + (bb.z - a.z) * t,
    })
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, d)))
  const sin = Math.sin(theta)
  const wa = Math.sin((1 - t) * theta) / sin
  const wb = Math.sin(t * theta) / sin
  return qNormalize({
    w: a.w * wa + bb.w * wb,
    x: a.x * wa + bb.x * wb,
    y: a.y * wa + bb.y * wb,
    z: a.z * wa + bb.z * wb,
  })
}

/** Rotaciona um vetor pelo quaternion (v' = q v q⁻¹). */
export function qRotate(q: Quat, v: V3): V3 {
  const u: V3 = [q.x, q.y, q.z]
  const t = vScale(vCross(u, v), 2)
  return vAdd(vAdd(v, vScale(t, q.w)), vCross(u, t))
}

/** matrix3d() CSS (column-major) só com a rotação do quaternion. */
export function qToMatrix3d(q: Quat): string {
  const { w, x, y, z } = q
  const m00 = 1 - 2 * (y * y + z * z)
  const m01 = 2 * (x * y - w * z)
  const m02 = 2 * (x * z + w * y)
  const m10 = 2 * (x * y + w * z)
  const m11 = 1 - 2 * (x * x + z * z)
  const m12 = 2 * (y * z - w * x)
  const m20 = 2 * (x * z - w * y)
  const m21 = 2 * (y * z + w * x)
  const m22 = 1 - 2 * (x * x + y * y)
  return `matrix3d(${m00},${m10},${m20},0,${m01},${m11},${m21},0,${m02},${m12},${m22},0,0,0,0,1)`
}

/** Quaternion a partir de uma matriz de rotação dada pelas LINHAS (X, Y, Z). */
function qFromRows(X: V3, Y: V3, Z: V3): Quat {
  const m00 = X[0], m01 = X[1], m02 = X[2]
  const m10 = Y[0], m11 = Y[1], m12 = Y[2]
  const m20 = Z[0], m21 = Z[1], m22 = Z[2]
  const tr = m00 + m11 + m22
  let q: Quat
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2
    q = { w: s / 4, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s }
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    q = { w: (m21 - m12) / s, x: s / 4, y: (m01 + m10) / s, z: (m02 + m20) / s }
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: s / 4, z: (m12 + m21) / s }
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: s / 4 }
  }
  return qNormalize(q)
}

// ---------- faces ----------
export interface DieFace {
  /** Centro da face (espaço unitário). */
  center: V3
  /** Normal unitária apontando para fora. */
  normal: V3
  /** Base tangente: X = direita do número, Y = baixo do número. */
  basisX: V3
  basisY: V3
  /** Vértices do polígono em coords 2D locais da face (y para baixo). */
  verts2d: [number, number][]
  /** Raio: maior distância centro→vértice (dimensiona o elemento). */
  radius: number
  /** Inraio: menor distância centro→aresta (dimensiona a fonte). */
  inradius: number
  /** Rotação do dado que traz esta face para a câmera, número em pé. */
  settle: Quat
}

export interface DieGeometry {
  sides: number
  faces: DieFace[]
}

const PHI = (1 + Math.sqrt(5)) / 2

interface SolidDef {
  verts: V3[]
  faces: number[][]
}

function tetrahedron(): SolidDef {
  return {
    verts: [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ],
    faces: [
      [0, 1, 2],
      [0, 3, 1],
      [0, 2, 3],
      [1, 3, 2],
    ],
  }
}

function cube(): SolidDef {
  const verts: V3[] = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ]
  return {
    verts,
    faces: [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 3, 7, 4],
      [1, 2, 6, 5],
      [0, 1, 5, 4],
      [3, 2, 6, 7],
    ],
  }
}

function octahedron(): SolidDef {
  return {
    verts: [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    faces: [
      [0, 2, 4],
      [0, 5, 2],
      [0, 4, 3],
      [0, 3, 5],
      [1, 4, 2],
      [1, 2, 5],
      [1, 3, 4],
      [1, 5, 3],
    ],
  }
}

function icosahedron(): SolidDef {
  const verts: V3[] = [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ]
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ]
  return { verts, faces }
}

/** Dodecaedro = dual do icosaedro: vértices são os centros das faces dele. */
function dodecahedron(): SolidDef {
  const ico = icosahedron()
  const centers: V3[] = ico.faces.map(f => {
    const c = f.reduce<V3>((acc, i) => vAdd(acc, ico.verts[i]), [0, 0, 0])
    return vScale(c, 1 / f.length)
  })
  // Para cada vértice do icosaedro, as 5 faces ao redor formam um pentágono —
  // ordenadas por ângulo em torno da direção do vértice para virar um ciclo.
  const faces: number[][] = ico.verts.map((v, vi) => {
    const around = ico.faces
      .map((f, fi) => ({ f, fi }))
      .filter(({ f }) => f.includes(vi))
      .map(({ fi }) => fi)
    const d = vNorm(v)
    const ref = Math.abs(d[1]) < 0.9 ? ([0, 1, 0] as V3) : ([1, 0, 0] as V3)
    const t1 = vNorm(vCross(ref, d))
    const t2 = vCross(d, t1)
    return around
      .map(fi => {
        const c = centers[fi]
        return { fi, ang: Math.atan2(vDot(c, t2), vDot(c, t1)) }
      })
      .sort((a, b) => a.ang - b.ang)
      .map(x => x.fi)
  })
  return { verts: centers, faces }
}

/** Trapezoedro pentagonal (d10): 10 "pipas" entre dois ápices. */
function pentagonalTrapezohedron(): SolidDef {
  const h = 0.12
  const cos36 = Math.cos(Math.PI / 5)
  const c = (h * (1 + cos36)) / (1 - cos36) // condição de planaridade das pipas
  const verts: V3[] = []
  for (let j = 0; j < 10; j++) {
    const a = (j * Math.PI) / 5
    verts.push([Math.cos(a), Math.sin(a), j % 2 === 0 ? h : -h])
  }
  const TOP = 10
  const BOT = 11
  verts.push([0, 0, c], [0, 0, -c])
  const faces: number[][] = []
  for (let i = 0; i < 5; i++) {
    faces.push([TOP, (2 * i) % 10, (2 * i + 1) % 10, (2 * i + 2) % 10])
  }
  for (let i = 0; i < 5; i++) {
    faces.push([BOT, (2 * i + 1) % 10, (2 * i + 2) % 10, (2 * i + 3) % 10])
  }
  return { verts, faces }
}

const SOLIDS: Record<number, () => SolidDef> = {
  4: tetrahedron,
  6: cube,
  8: octahedron,
  10: pentagonalTrapezohedron,
  12: dodecahedron,
  20: icosahedron,
}

/** Menor distância da origem às arestas do polígono 2D (para a fonte). */
function polygonInradius(verts: [number, number][]): number {
  let min = Infinity
  for (let i = 0; i < verts.length; i++) {
    const [ax, ay] = verts[i]
    const [bx, by] = verts[(i + 1) % verts.length]
    const abx = bx - ax
    const aby = by - ay
    const len2 = abx * abx + aby * aby || 1
    const t = Math.max(0, Math.min(1, (-ax * abx - ay * aby) / len2))
    const dx = ax + t * abx
    const dy = ay + t * aby
    min = Math.min(min, Math.sqrt(dx * dx + dy * dy))
  }
  return min
}

function buildGeometry(sides: number): DieGeometry {
  const def = (SOLIDS[sides] || SOLIDS[20])()
  const maxR = Math.max(...def.verts.map(vLen))
  const verts = def.verts.map(v => vScale(v, 1 / maxR))

  const faces: DieFace[] = def.faces.map(idx => {
    const fv = idx.map(i => verts[i])
    const center = vScale(
      fv.reduce<V3>((acc, v) => vAdd(acc, v), [0, 0, 0]),
      1 / fv.length,
    )
    // Normal (Newell) apontando para fora do sólido
    let n: V3 = [0, 0, 0]
    for (let i = 0; i < fv.length; i++) {
      const a = vSub(fv[i], center)
      const b = vSub(fv[(i + 1) % fv.length], center)
      n = vAdd(n, vCross(a, b))
    }
    n = vNorm(n)
    if (vDot(n, center) < 0) n = vScale(n, -1)

    // "Cima" do número: projeção do cima da tela (−y) no plano da face
    const G: V3 = Math.abs(n[1]) < 0.95 ? [0, -1, 0] : [0, 0, 1]
    const up = vNorm(vSub(G, vScale(n, vDot(G, n))))
    const basisY = vScale(up, -1)
    const basisX = vCross(basisY, n)

    const verts2d = fv.map(
      v => [vDot(vSub(v, center), basisX), vDot(vSub(v, center), basisY)] as [number, number],
    )
    const radius = Math.max(...verts2d.map(([x, y]) => Math.sqrt(x * x + y * y)))
    const inradius = polygonInradius(verts2d)
    const settle = qFromRows(basisX, basisY, n)

    return { center, normal: n, basisX, basisY, verts2d, radius, inradius, settle }
  })

  // Normalizar só pelo circunraio deixa sólidos pontudos (d4/d20) com corpo
  // pequeno na caixa — os vértices dominam a silhueta. Mistura com o inraio
  // do sólido p/ todos os dados terem presença visual parecida no mesmo size.
  const solidInradius = Math.min(...faces.map(f => vDot(f.normal, f.center)))
  const s = 1 / (0.55 + 0.45 * solidInradius)
  const scaledFaces: DieFace[] = faces.map(f => ({
    ...f,
    center: vScale(f.center, s),
    verts2d: f.verts2d.map(([x, y]) => [x * s, y * s] as [number, number]),
    radius: f.radius * s,
    inradius: f.inradius * s,
  }))

  return { sides, faces: scaledFaces }
}

const geomCache = new Map<number, DieGeometry>()

/** Geometria do dado (memoizada). Lados sem sólido próprio caem no d20. */
export function getDieGeometry(sides: number): DieGeometry {
  const key = SOLIDS[sides] ? sides : 20
  let g = geomCache.get(key)
  if (!g) {
    g = buildGeometry(key)
    geomCache.set(key, g)
  }
  return g
}
