// Recorta a folha de sprites do herói (raça×classe) numa tira horizontal pronta pra WalkScene.
// Determinístico, sem IA: detecta o fundo, recorta por projeção e normaliza os frames.
//
// A folha do Gemini NÃO é pixel art de verdade (milhares de cores, anti-aliasing),
// então o pipeline é: flood fill de fundo -> mata-halo -> bandas -> frames -> célula fixa.
//
// Uso:
//   npx tsx scripts/slice-hero-sprite-sheet.ts --all            # a pasta inteira
//   npx tsx scripts/slice-hero-sprite-sheet.ts --all --force
//   npx tsx scripts/slice-hero-sprite-sheet.ts --race elfo --class rogue --row 2
//   npx tsx scripts/slice-hero-sprite-sheet.ts --race elfo --class rogue --row 2 --dry-run
//   npx tsx scripts/slice-hero-sprite-sheet.ts --in ~/Downloads/folha.png --race elfo --class rogue
//   npx tsx scripts/slice-hero-sprite-sheet.ts --race elfo --class rogue --row 4 --out-name attack
//
// Entrada: sprite-sources/<race>-<class>.png (gitignored — folha crua do Gemini, ~5MB)
// Saída:   public/sprites/<race>-<class>/<out-name>.webp   (tira: N * cellW  x  cellH)
//          public/sprites/<race>-<class>/meta.json
//          public/sprites/<race>-<class>/_contact.png      (gitignored — conferência a olho)

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'

import sharp from 'sharp'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = has('--dry-run')
const FORCE = has('--force')
const ALL = has('--all')
const RACE = (valOf('--race') || '').trim().toLowerCase()
const CLASS = (valOf('--class') || '').trim().toLowerCase()
const ROW = Number(valOf('--row') || 2)
const OUT_NAME = (valOf('--out-name') || 'walk').trim()
/** Tolerância euclidiana (RGB) pro flood fill do fundo. */
const TOL = Number(valOf('--tol') || 26)
/** Célula final. ~2x o tamanho de exibição (a arte não é pixel art, então suaviza bem). */
const CELL = (valOf('--cell') || '128x192').split('x').map(Number)
const CELL_W = CELL[0]
const CELL_H = CELL[1]

/** Altura mínima (px) pra uma banda contar como linha de frames. */
const MIN_BAND_H = 20
/**
 * Algumas folhas vêm com o nome da linha escrito em cima ("IDLE", "WALK", ...).
 * O texto é escuro, então sobrevive ao flood fill e vira uma banda própria —
 * o que empurraria a numeração das linhas. Banda muito mais baixa que a mediana
 * é rótulo, não personagem (na prática ~33px contra ~290px).
 */
const LABEL_BAND_RATIO = 0.4
/** Largura mínima (px) pra um run de colunas contar como frame. */
const MIN_FRAME_W = 10
/** Fração da altura da célula que a silhueta ocupa (respiro em cima). */
const FIT = 0.94

if (!ALL && (!RACE || !CLASS)) {
  console.error('❌ faltou --race e/ou --class (ex.: --race elfo --class rogue), ou use --all')
  process.exit(1)
}
if (!Number.isFinite(ROW) || ROW < 1) {
  console.error('❌ --row precisa ser um inteiro >= 1 (1-based)')
  process.exit(1)
}
if (!Number.isFinite(CELL_W) || !Number.isFinite(CELL_H)) {
  console.error('❌ --cell precisa ser LARGURAxALTURA (ex.: 128x192)')
  process.exit(1)
}

const expandHome = (p: string) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p)
const SOURCE_DIR = resolve('sprite-sources')

/** Ids canônicos (gameData.ts): raças em PT, classes em EN. */
const RACES = ['humano', 'elfo', 'draconiano', 'metamorfo'] as const
const CLASSES = ['warrior', 'rogue', 'mage', 'monk'] as const

interface Job {
  race: string
  cls: string
  inPath: string
}

// ============================================================
// Buffer RGBA
// ============================================================

interface Raw {
  data: Buffer
  width: number
  height: number
}

const at = (raw: Raw, x: number, y: number) => (y * raw.width + x) * 4
const alphaAt = (raw: Raw, x: number, y: number) => raw.data[at(raw, x, y) + 3]

function dist2(data: Buffer, i: number, r: number, g: number, b: number): number {
  const dr = data[i] - r
  const dg = data[i + 1] - g
  const db = data[i + 2] - b
  return dr * dr + dg * dg + db * db
}

/** Cor de fundo = mediana por canal dos pixels da borda. */
function detectBackground(raw: Raw): [number, number, number] {
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const push = (x: number, y: number) => {
    const i = at(raw, x, y)
    rs.push(raw.data[i])
    gs.push(raw.data[i + 1])
    bs.push(raw.data[i + 2])
  }
  for (let x = 0; x < raw.width; x++) {
    push(x, 0)
    push(x, raw.height - 1)
  }
  for (let y = 0; y < raw.height; y++) {
    push(0, y)
    push(raw.width - 1, y)
  }
  const med = (arr: number[]) => {
    arr.sort((a, b) => a - b)
    return arr[Math.floor(arr.length / 2)]
  }
  return [med(rs), med(gs), med(bs)]
}

/**
 * Flood fill a partir das bordas: só o fundo CONECTADO vira transparente.
 * Isso preserva o cinza-marrom do capuz, que é parecido com o fundo.
 * O RGB é preservado (alpha←0 apenas) — zerar pra preto criaria franja escura no downscale.
 */
function removeBackground(raw: Raw, bg: [number, number, number], tol: number): void {
  const { data, width, height } = raw
  const [br, bg_, bb] = bg
  const tol2 = tol * tol
  const seen = new Uint8Array(width * height)
  const stack: number[] = []

  const tryPush = (x: number, y: number) => {
    const p = y * width + x
    if (seen[p]) return
    if (dist2(data, p * 4, br, bg_, bb) > tol2) return
    seen[p] = 1
    stack.push(p)
  }

  for (let x = 0; x < width; x++) {
    tryPush(x, 0)
    tryPush(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y)
    tryPush(width - 1, y)
  }

  while (stack.length) {
    const p = stack.pop() as number
    data[p * 4 + 3] = 0
    const x = p % width
    const y = (p - x) / width
    if (x > 0) tryPush(x - 1, y)
    if (x < width - 1) tryPush(x + 1, y)
    if (y > 0) tryPush(x, y - 1)
    if (y < height - 1) tryPush(x, y + 1)
  }
}

/**
 * Mata-halo: pixel opaco encostado em transparente e ainda parecido com o fundo
 * (tolerância mais larga) também some. Anti-aliasing do Gemini deixa 1-2px de borda cinza.
 */
function killHalo(raw: Raw, bg: [number, number, number], tol: number, passes: number): void {
  const { data, width, height } = raw
  const [br, bg_, bb] = bg
  const tol2 = tol * tol
  for (let pass = 0; pass < passes; pass++) {
    const doomed: number[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (data[p * 4 + 3] === 0) continue
        if (dist2(data, p * 4, br, bg_, bb) > tol2) continue
        const touchesVoid =
          (x > 0 && data[(p - 1) * 4 + 3] === 0) ||
          (x < width - 1 && data[(p + 1) * 4 + 3] === 0) ||
          (y > 0 && data[(p - width) * 4 + 3] === 0) ||
          (y < height - 1 && data[(p + width) * 4 + 3] === 0)
        if (touchesVoid) doomed.push(p)
      }
    }
    if (!doomed.length) break
    for (const p of doomed) data[p * 4 + 3] = 0
  }
}

// ============================================================
// Segmentação (projeções)
// ============================================================

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Runs de índices "cheios" num vetor booleano, ignorando runs curtos demais. */
function runsOf(filled: boolean[], minLen: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let start: number | null = null
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] && start === null) start = i
    if (!filled[i] && start !== null) {
      if (i - start >= minLen) out.push([start, i])
      start = null
    }
  }
  if (start !== null && filled.length - start >= minLen) out.push([start, filled.length])
  return out
}

/** Bandas horizontais (uma por linha de frames da folha). */
function findBands(raw: Raw): Array<[number, number]> {
  const filled: boolean[] = []
  for (let y = 0; y < raw.height; y++) {
    let any = false
    for (let x = 0; x < raw.width; x++) {
      if (alphaAt(raw, x, y) !== 0) {
        any = true
        break
      }
    }
    filled.push(any)
  }
  return runsOf(filled, MIN_BAND_H)
}

/** bbox opaco exato dentro de um retângulo. */
function tightBox(raw: Raw, x0: number, y0: number, x1: number, y1: number): Box | null {
  let minX = x1
  let minY = y1
  let maxX = x0
  let maxY = y0
  let found = false
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (alphaAt(raw, x, y) === 0) continue
      found = true
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return found ? { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 } : null
}

/** Frames de uma banda, por projeção vertical. */
function findFrames(raw: Raw, bandY0: number, bandY1: number): Box[] {
  const filled: boolean[] = []
  for (let x = 0; x < raw.width; x++) {
    let any = false
    for (let y = bandY0; y < bandY1; y++) {
      if (alphaAt(raw, x, y) !== 0) {
        any = true
        break
      }
    }
    filled.push(any)
  }
  const boxes: Box[] = []
  for (const [x0, x1] of runsOf(filled, MIN_FRAME_W)) {
    const box = tightBox(raw, x0, bandY0, x1, bandY1)
    if (box) boxes.push(box)
  }
  return boxes
}

/**
 * Descarta blobs chapados (a outra versão da folha veio com um quadrado preto sólido).
 * Personagem tem centenas de cores; um quadrado sólido tem 1.
 */
function isFlatBlob(raw: Raw, box: Box): boolean {
  const seen = new Set<number>()
  const stepX = Math.max(1, Math.floor((box.x1 - box.x0) / 40))
  const stepY = Math.max(1, Math.floor((box.y1 - box.y0) / 40))
  for (let y = box.y0; y < box.y1; y += stepY) {
    for (let x = box.x0; x < box.x1; x += stepX) {
      const i = at(raw, x, y)
      if (raw.data[i + 3] === 0) continue
      seen.add((raw.data[i] << 16) | (raw.data[i + 1] << 8) | raw.data[i + 2])
      if (seen.size > 8) return false
    }
  }
  return true
}

/**
 * Âncora horizontal do frame: centro de massa dos PÉS (faixa de baixo), não do
 * corpo inteiro. Adereço grande — o cajado do mago na horizontal, um arco, uma
 * capa esvoaçante — puxaria o centro de massa pro lado e o boneco andaria
 * descentralizado, tremendo ao alternar poses com o adereço em posições
 * diferentes. Os pés ficam sempre embaixo do corpo.
 */
const FOOT_BAND = 0.22

function centroidX(raw: Raw, box: Box): number {
  const footY0 = Math.max(box.y0, box.y1 - Math.round((box.y1 - box.y0) * FOOT_BAND))
  const scan = (y0: number) => {
    let sum = 0
    let count = 0
    for (let y = y0; y < box.y1; y++) {
      for (let x = box.x0; x < box.x1; x++) {
        if (alphaAt(raw, x, y) === 0) continue
        sum += x
        count++
      }
    }
    return { sum, count }
  }
  const feet = scan(footY0)
  if (feet.count) return feet.sum / feet.count
  const all = scan(box.y0) // frame deitado (morte) não tem "pé" — usa tudo
  return all.count ? all.sum / all.count : (box.x0 + box.x1) / 2
}

// ============================================================
// Main
// ============================================================

/** Recorta UMA folha. Devolve a linha do manifesto, ou null se pulou/falhou. */
async function sliceOne(job: Job): Promise<string | null> {
  const { race, cls, inPath: IN_PATH } = job
  const SLUG = `${race}-${cls}`
  const OUT_DIR = resolve(join('public', 'sprites', SLUG))
  const OUT_STRIP = join(OUT_DIR, `${OUT_NAME}.webp`)
  const OUT_META = join(OUT_DIR, 'meta.json')
  const OUT_CONTACT = join(OUT_DIR, '_contact.png')

  console.log(`\n🧝 ${SLUG} — linha=${ROW} célula=${CELL_W}x${CELL_H} tol=${TOL}`)

  if (!existsSync(IN_PATH)) {
    console.error(`   ❌ folha não encontrada: ${IN_PATH}`)
    return null
  }
  if (!FORCE && !DRY && existsSync(OUT_STRIP)) {
    console.log(`   ⏭️  já existe (use --force pra regerar)`)
    return null
  }

  const src = sharp(IN_PATH).ensureAlpha()
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true })
  const raw: Raw = { data, width: info.width, height: info.height }
  console.log(`   folha ${raw.width}x${raw.height}`)

  const bg = detectBackground(raw)
  console.log(`   fundo detectado rgb(${bg.join(',')})`)

  removeBackground(raw, bg, TOL)
  killHalo(raw, bg, TOL * 1.6, 2)

  const rawBands = findBands(raw)
  const heights = rawBands.map(([a, b]) => b - a).sort((x, y) => x - y)
  const medianH = heights[Math.floor(heights.length / 2)] || 0
  const bands = rawBands.filter(([a, b]) => b - a >= medianH * LABEL_BAND_RATIO)
  const droppedLabels = rawBands.length - bands.length
  console.log(
    `   ${bands.length} linhas${droppedLabels ? ` (${droppedLabels} rótulo(s) de texto descartado(s))` : ''}: ` +
      bands.map(([a, b], i) => `#${i + 1} h=${b - a}`).join(', ')
  )

  if (ROW > bands.length) {
    console.error(`   ❌ --row ${ROW} não existe (folha tem ${bands.length} bandas) — pulando`)
    return null
  }

  const [bandY0, bandY1] = bands[ROW - 1]
  const allFrames = findFrames(raw, bandY0, bandY1)
  const frames = allFrames.filter((box) => {
    if (isFlatBlob(raw, box)) {
      console.log(`   ⚠️  descartado blob chapado em x=${box.x0}..${box.x1}`)
      return false
    }
    return true
  })

  if (!frames.length) {
    console.error(`   ❌ nenhum frame encontrado na linha ${ROW} — pulando`)
    return null
  }
  console.log(
    `   linha ${ROW}: ${frames.length} frames -> ` +
      frames.map((b, i) => `[${i}] ${b.x1 - b.x0}x${b.y1 - b.y0}`).join(' ')
  )

  // Escala única pra todos os frames: o mais alto da linha define o encaixe.
  // (Escala por frame faria o boneco crescer/encolher durante o ciclo.)
  //
  // A escala vem SÓ da altura, de propósito. Se entrasse a largura, um cajado
  // na horizontal encolheria o mago inteiro e ele ficaria menor que o ladino na
  // tela — mesmo com os dois tendo a mesma altura na folha. A célula é que se
  // alarga pra caber o que sobra pros lados.
  const maxH = Math.max(...frames.map((b) => b.y1 - b.y0))
  const maxW = Math.max(...frames.map((b) => b.x1 - b.x0))
  const scale = (CELL_H * FIT) / maxH
  const cellW = Math.max(CELL_W, Math.ceil(maxW * scale) + 4)
  if (cellW > CELL_W) {
    console.log(`   célula alargada ${CELL_W}→${cellW}px (frame mais largo: ${maxW}px)`)
  }
  console.log(`   escala ${scale.toFixed(4)} (maior frame ${maxW}x${maxH})`)

  if (DRY) {
    console.log('   🌵 dry-run — nada escrito')
    return null
  }

  // Recorta cada frame do buffer já com fundo transparente, redimensiona
  // e compõe na célula: centrado pelo centroide, alinhado pelo pé.
  const cells: Buffer[] = []
  for (const box of frames) {
    const bw = box.x1 - box.x0
    const bh = box.y1 - box.y0
    const cropped = await sharp(raw.data, {
      raw: { width: raw.width, height: raw.height, channels: 4 },
    })
      .extract({ left: box.x0, top: box.y0, width: bw, height: bh })
      .resize({
        width: Math.max(1, Math.round(bw * scale)),
        height: Math.max(1, Math.round(bh * scale)),
        kernel: 'lanczos3',
        fit: 'fill',
      })
      .png()
      .toBuffer()

    const outW = Math.max(1, Math.round(bw * scale))
    const outH = Math.max(1, Math.round(bh * scale))
    // centroide relativo ao bbox, já na escala final
    const cx = (centroidX(raw, box) - box.x0) * scale
    const left = Math.round(cellW / 2 - cx)
    const top = CELL_H - outH // pé colado no chão da célula

    const cell = await sharp({
      create: {
        width: cellW,
        height: CELL_H,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: cropped,
          left: Math.max(Math.min(left, cellW - outW), Math.min(0, cellW - outW)),
          top: Math.max(0, top),
        },
      ])
      .png()
      .toBuffer()
    cells.push(cell)
  }

  mkdirSync(OUT_DIR, { recursive: true })

  const stripW = cellW * cells.length
  const strip = sharp({
    create: { width: stripW, height: CELL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(cells.map((input, i) => ({ input, left: i * cellW, top: 0 })))

  await strip.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(OUT_STRIP)
  console.log(`   ✓ ${OUT_NAME}.webp (${stripW}x${CELL_H}, ${cells.length} frames)`)

  const meta = {
    slug: SLUG,
    race,
    class: cls,
    name: OUT_NAME,
    src: `/sprites/${SLUG}/${OUT_NAME}.webp`,
    frameW: cellW,
    frameH: CELL_H,
    frames: cells.length,
    row: ROW,
    source: IN_PATH.replace(homedir(), '~'),
    generatedAt: new Date().toISOString(),
  }
  writeFileSync(OUT_META, JSON.stringify(meta, null, 2) + '\n')

  // Folha de contato: xadrez claro + numeração, pra achar o índice do frame de costas.
  const CONTACT_LABEL_H = 18
  const labels = cells.map((_, i) =>
    Buffer.from(
      `<svg width="${cellW}" height="${CONTACT_LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" fill="#1a1410"/>` +
        `<text x="${cellW / 2}" y="13" font-family="monospace" font-size="12" fill="#e8c37a" text-anchor="middle">[${i}]</text>` +
        `</svg>`
    )
  )
  await sharp({
    create: {
      width: stripW,
      height: CELL_H + CONTACT_LABEL_H,
      channels: 4,
      background: { r: 60, g: 60, b: 64, alpha: 255 },
    },
  })
    .composite([
      ...cells.map((input, i) => ({ input, left: i * cellW, top: 0 })),
      ...labels.map((input, i) => ({ input, left: i * cellW, top: CELL_H })),
    ])
    .png()
    .toFile(OUT_CONTACT)
  console.log(`   ✓ _contact.png (conferência a olho — gitignored)`)

  // Palpite do ciclo: o frame mais ESTREITO da linha costuma ser a pose de
  // pernas juntas (passagem), e alterná-la com as passadas já lê como caminhada.
  // A ordem final sai da bancada — isto é só um ponto de partida decente.
  const widths = frames.map(b => b.x1 - b.x0)
  const narrowest = widths.indexOf(Math.min(...widths))
  const strides = cells.map((_, i) => i).filter(i => i !== narrowest)
  const guess = strides.flatMap(i => [i, narrowest])

  return (
    `  '${SLUG}': {\n` +
    `    src: '${meta.src}',\n` +
    `    frameW: ${cellW},\n` +
    `    frameH: ${CELL_H},\n` +
    `    frames: ${cells.length},\n` +
    `    facing: 'right',\n` +
    `    walk: [${guess.join(', ')}],\n` +
    `    idle: ${narrowest},\n` +
    `    fps: 8,\n` +
    `  },`
  )
}

// ============================================================
// Main
// ============================================================

/** Descobre as folhas em sprite-sources/ cujo nome é `<race>-<class>.png`. */
function discoverJobs(): Job[] {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`❌ pasta não encontrada: ${SOURCE_DIR}`)
    console.error('   Crie-a e jogue as folhas do Gemini como <race>-<class>.png')
    return []
  }
  const jobs: Job[] = []
  const ignored: string[] = []
  for (const file of readdirSync(SOURCE_DIR).sort()) {
    if (!/\.(png|webp|jpg|jpeg)$/i.test(file)) continue
    const slug = basename(file).replace(/\.[^.]+$/, '').toLowerCase()
    const [race, cls] = slug.split('-')
    if (!RACES.includes(race as never) || !CLASSES.includes(cls as never)) {
      ignored.push(file)
      continue
    }
    jobs.push({ race, cls, inPath: join(SOURCE_DIR, file) })
  }
  if (ignored.length) {
    console.log(`⚠️  ignorados (nome fora do padrão <race>-<class>): ${ignored.join(', ')}`)
    console.log(`   raças: ${RACES.join(' | ')}   classes: ${CLASSES.join(' | ')}`)
  }
  return jobs
}

async function main() {
  const jobs: Job[] = ALL
    ? discoverJobs()
    : [
        {
          race: RACE,
          cls: CLASS,
          inPath: resolve(
            expandHome(valOf('--in') || join('sprite-sources', `${RACE}-${CLASS}.png`))
          ),
        },
      ]

  if (!jobs.length) {
    console.log('nada a fazer.')
    return
  }
  console.log(`🎬 ${jobs.length} folha(s) — linha ${ROW}, célula ${CELL_W}x${CELL_H}, force=${FORCE}`)

  const snippets: string[] = []
  let failed = 0
  for (const job of jobs) {
    try {
      const snippet = await sliceOne(job)
      if (snippet) snippets.push(snippet)
      else failed++
    } catch (err) {
      console.error(`   ❌ ${job.race}-${job.cls} falhou:`, err instanceof Error ? err.message : err)
      failed++
    }
  }

  // Checklist das 16 — o que já tem tira e o que ainda falta.
  console.log(`\n📊 cobertura das 16 combinações:`)
  const missing: string[] = []
  for (const race of RACES) {
    const cells = CLASSES.map(cls => {
      const ok = existsSync(resolve(join('public', 'sprites', `${race}-${cls}`, `${OUT_NAME}.webp`)))
      if (!ok) missing.push(`${race}-${cls}`)
      return `${ok ? '✅' : '⬜'} ${cls.padEnd(7)}`
    })
    console.log(`   ${race.padEnd(11)} ${cells.join(' ')}`)
  }
  console.log(`   ${16 - missing.length}/16 prontas${missing.length ? ` — faltam: ${missing.join(', ')}` : ' 🎉'}`)

  if (snippets.length) {
    console.log(`\n📋 cole em src/lib/heroSprites.ts (ajuste walk/back/fps em /dev/sprite-lab):\n`)
    console.log(snippets.join('\n'))
  }
  if (failed) console.log(`\n⚠️  ${failed} folha(s) puladas ou com erro.`)
}

main().catch((err) => {
  console.error('❌ falhou:', err)
  process.exit(1)
})
