// 🎁 Recorta os OBJETOS DE NÓ da cena explorável (baú, erva, fonte, entulho)
// a partir das folhas do Gemini. Determinístico, sem IA: sharp + a maquinaria
// de recorte compartilhada em scripts/lib/spriteSheet.ts.
//
// Por que um script separado do slice-hero-sprite-sheet.ts: a saída é outra.
// Herói e monstro viram uma TIRA de animação (walk.webp + meta.json); objeto de
// nó vira DUAS IMAGENS SOLTAS — o estado cheio e o gasto — que a cena desenha
// paradas, ancoradas pelo pé. O recorte em si é o mesmo, e é por isso que ele
// mora na lib.
//
// As folhas não são sprites soltos: são SEQUÊNCIAS DE ESTADO (baú fechado →
// aberto, fonte cheia → vazia, erva intacta → colhida). Ficamos com 2 quadros
// de cada; os do meio esperam uma passada futura que anime a coleta.
//
// Uso:
//   npx tsx scripts/slice-node-sprites.ts --dry-run          # só mede e imprime
//   npm run art:scene:nodes
//   npm run art:scene:nodes -- --only chest --force
//   npm run art:scene:nodes -- --max 320 --tol 30
//
// Entrada: sprite-sources/<arquivo>.png   (gitignored — folha crua, vários MB)
// Saída:   public/scene/common/<flavor>-1.webp         estado cheio
//          public/scene/common/<flavor>-used-1.webp    estado gasto
//          sprite-sources/_contact-<flavor>.png        conferência a olho

import { existsSync, mkdirSync } from 'fs'
import { dirname, join, resolve } from 'path'

import sharp from 'sharp'

import {
  borderFlatness,
  detectBackground,
  dropLabelBands,
  findBands,
  findFrames,
  killGroundShadow,
  killHalo,
  removeBackground,
  runsOf,
  subRaw,
  tightBox,
  type Box,
  type Raw,
  type Rgb,
} from './lib/spriteSheet'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = has('--dry-run')
const FORCE = has('--force')
const ONLY = (valOf('--only') || '').trim().toLowerCase()
const NO_FLAT_CHECK = has('--no-flat-check')
/** Tolerância euclidiana (RGB) pro flood fill do fundo. Mesmo default do herói. */
const TOL = Number(valOf('--tol') || 26)
/**
 * Maior lado do webp final. O SPRITE_H da cena põe estes objetos entre 0.85 e
 * 1.8 unidades de mundo — na prática 60-90px na tela —, então 256 já dá folga
 * de sobra pra zoom e telas densas.
 */
const MAX_SIDE = Number(valOf('--max') || 256)
const QUALITY = Number(valOf('--quality') || 82)

/**
 * Piso de "fundo chapado" na moldura de uma célula.
 *
 * Existe por causa de uma folha real: a do entulho veio com CHÃO DE FLORESTA
 * PINTADO atrás do objeto (raízes, musgo, troncos), na mesma paleta dele. Flood
 * fill não tem o que morder e o recorte sai lixo — sem esta guarda, em silêncio.
 * Medido: fonte 95%, weed 93%, chest 78%; a folha ruim do entulho, 23%.
 */
const FLAT_FLOOR = 0.6

const SOURCE_DIR = resolve('sprite-sources')

// ============================================================
// Receitas — a diagramação é DADO da folha, não gosto
// ============================================================

/** Índice do quadro numa folha em linha, ou par [linha, coluna] numa folha em grade. */
type FrameRef = number | [number, number]

interface NodeSheet {
  /** Arquivo em sprite-sources/. */
  file: string
  /** NodeFlavor da cena (dungeonScene/icons.ts). Vira o nome do arquivo. */
  flavor: string
  /** Estado cheio — o que o jogador vê antes de coletar. */
  idle: FrameRef
  /** Estado gasto — depois de resolver o nó. Ausente = só o cheio. */
  used?: FrameRef
  /** Folha com BORDAS desenhadas em volta de cada célula (contact sheet). */
  bordered?: boolean
  /** Folha com sombra elíptica PINTADA no fundo, sob o objeto. */
  killShadow?: boolean
  /** Por que essa receita — para não virar número mágico. */
  note: string
}

const NODE_SHEETS: NodeSheet[] = [
  {
    file: 'chest.png',
    flavor: 'chest',
    idle: 1,
    used: 4,
    killShadow: true,
    note: '4 quadros numa linha: fechado → aberto; sombra elíptica pintada no fundo',
  },
  {
    file: 'fonte.png',
    flavor: 'fountain',
    idle: 1,
    used: 6,
    note: '6 quadros numa linha, (1) CHEIO → (6) VAZIO; legenda de texto embaixo cai pela banda curta',
  },
  {
    file: 'weed.png',
    flavor: 'herb',
    bordered: true,
    idle: [1, 1],
    used: [2, 1],
    // Não é sombra: é um montinho de grama PINTADO sob o arbusto. Mesma
    // assinatura da sombra do baú (0.2-1.3° do fundo, luminância 0.61), então
    // o mesmo flood resolve — e tem de sair, senão a moita vem com um tapete.
    killShadow: true,
    note: 'grade com bordas: (1,1) arbusto intacto, (2,1) arbusto colhido; montinho de grama pintado na base',
  },
  // ⚠️ O entulho NÃO entra ainda. A folha que existe hoje tem chão de floresta
  // pintado em cada célula (23% de fundo chapado contra 78-95% das outras três),
  // então a guarda de fundo a reprova — corretamente. Quando ela for refeita com
  // fundo chapado (ver scripts/node-sheet-prompt.md), é só descomentar:
  // {
  //   file: 'rubble.png', flavor: 'rubble',
  //   idle: 1, used: <último quadro>, killShadow: true,
  //   note: 'acampamento de monstro: intacto → revirado',
  // },
]

// ============================================================
// Grade por BORDAS desenhadas
// ============================================================

/**
 * Linhas de separação de uma folha em contact sheet.
 *
 * A folha da erva vem com o quadriculado desenhado por cima do fundo, então a
 * projeção da COR DA BORDA acha a grade sem chute: uma linha inteira (ou coluna
 * inteira) da cor da borda é separador. `within` restringe a varredura a uma
 * faixa — necessário porque a linha 2 da folha da erva tem uma célula LARGA, e a
 * vertical que existe só na linha 1 desapareceria numa projeção de altura cheia.
 */
function borderRuns(
  raw: Raw,
  border: Rgb,
  tol: number,
  axis: 'row' | 'col',
  within: [number, number],
): Array<[number, number]> {
  const tol2 = tol * tol
  const [lo, hi] = within
  const isBorder = (x: number, y: number) => {
    const i = (y * raw.width + x) * 4
    const dr = raw.data[i] - border[0]
    const dg = raw.data[i + 1] - border[1]
    const db = raw.data[i + 2] - border[2]
    return dr * dr + dg * dg + db * db <= tol2
  }
  const n = axis === 'row' ? raw.height : raw.width
  const filled: boolean[] = []
  for (let k = 0; k < n; k++) {
    let hits = 0
    let seen = 0
    for (let j = lo; j < hi; j += 2) {
      seen++
      if (axis === 'row' ? isBorder(j, k) : isBorder(k, j)) hits++
    }
    filled.push(seen > 0 && hits / seen >= 0.85)
  }
  return runsOf(filled, 1)
}

/** Vãos entre os separadores — as células de verdade. */
function gapsBetween(runs: Array<[number, number]>, end: number): Array<[number, number]> {
  const gaps: Array<[number, number]> = []
  let cursor = 0
  for (const [a, b] of runs) {
    if (a - cursor > 0) gaps.push([cursor, a])
    cursor = b
  }
  if (end - cursor > 0) gaps.push([cursor, end])
  return gaps
}

/** Descarta vãos curtos demais pra ser célula (barra de título, rodapé). */
function keepRealCells(gaps: Array<[number, number]>): Array<[number, number]> {
  if (!gaps.length) return gaps
  const sizes = gaps.map(([a, b]) => b - a).sort((x, y) => x - y)
  const median = sizes[Math.floor(sizes.length / 2)] || 0
  return gaps.filter(([a, b]) => b - a >= median * 0.4)
}

/** Células de uma folha com bordas, indexadas [linha][coluna]. */
function borderedCells(raw: Raw, border: Rgb, tol: number): Box[][] {
  const rowGaps = keepRealCells(gapsBetween(borderRuns(raw, border, tol, 'row', [0, raw.width]), raw.height))
  return rowGaps.map(([y0, y1]) => {
    const colGaps = keepRealCells(
      gapsBetween(borderRuns(raw, border, tol, 'col', [y0, y1]), raw.width),
    )
    return colGaps.map(([x0, x1]) => ({ x0, y0, x1, y1 }))
  })
}

// ============================================================
// Recorte de um quadro
// ============================================================

interface Frame {
  /** Rótulo pro log e pra folha de contato: "3" ou "2,1". */
  label: string
  raw: Raw
  box: Box
}

/** Maior caixa por área — num objeto de nó, o resto é seta, legenda ou faísca. */
function biggest(boxes: Box[]): Box | null {
  let best: Box | null = null
  let bestArea = 0
  for (const b of boxes) {
    const area = (b.x1 - b.x0) * (b.y1 - b.y0)
    if (area > bestArea) {
      bestArea = area
      best = b
    }
  }
  return best
}

/**
 * Limpa uma região (folha inteira ou célula) e devolve o objeto isolado.
 * Devolve `null` quando a região reprova na guarda de fundo chapado.
 */
function cutout(
  region: Raw,
  sheet: NodeSheet,
  label: string,
  log: (msg: string) => void,
): Frame | null {
  const bg = detectBackground(region)
  const flat = borderFlatness(region, bg, TOL)
  if (flat < FLAT_FLOOR && !NO_FLAT_CHECK) {
    log(
      `   ❌ ${label}: fundo não é chapado (${(flat * 100).toFixed(0)}% < ${FLAT_FLOOR * 100}%) — ` +
        `esta célula tem cena pintada atrás do objeto e não dá pra recortar.\n` +
        `      Regere com fundo de cor única (scripts/node-sheet-prompt.md) ou force com --no-flat-check.`,
    )
    return null
  }
  log(`   ${label}: fundo rgb(${bg.join(',')}) · chapado ${(flat * 100).toFixed(0)}%`)

  removeBackground(region, bg, TOL)
  if (sheet.killShadow) {
    const n = killGroundShadow(region, bg)
    log(`   ${label}: sombra pintada removida ${n}px${n === 0 ? ' (nenhuma)' : ''}`)
  }
  killHalo(region, bg, TOL * 1.6, 2)

  // Rótulo de texto dentro da célula vira banda curta e cai aqui.
  const { bands } = dropLabelBands(findBands(region))
  if (!bands.length) {
    log(`   ❌ ${label}: nada sobrou depois de tirar o fundo`)
    return null
  }
  const boxes: Box[] = []
  for (const [y0, y1] of bands) boxes.push(...findFrames(region, y0, y1))
  const box = biggest(boxes)
  if (!box) {
    log(`   ❌ ${label}: nenhum objeto encontrado`)
    return null
  }
  return { label, raw: region, box }
}

/** Quadros de uma folha SEM bordas: uma linha de quadros lado a lado. */
function lineFrames(raw: Raw, sheet: NodeSheet, log: (m: string) => void): Frame[] {
  const bg = detectBackground(raw)
  const flat = borderFlatness(raw, bg, TOL)
  if (flat < FLAT_FLOOR && !NO_FLAT_CHECK) {
    log(
      `   ❌ fundo não é chapado (${(flat * 100).toFixed(0)}% < ${FLAT_FLOOR * 100}%) — ` +
        `folha com cena pintada não dá pra recortar.\n` +
        `      Regere com fundo de cor única (scripts/node-sheet-prompt.md) ou force com --no-flat-check.`,
    )
    return []
  }
  log(`   fundo detectado rgb(${bg.join(',')}) · chapado ${(flat * 100).toFixed(0)}%`)
  removeBackground(raw, bg, TOL)
  if (sheet.killShadow) {
    const n = killGroundShadow(raw, bg)
    log(`   sombra pintada removida: ${n}px${n === 0 ? ' (nenhuma)' : ''}`)
  }
  killHalo(raw, bg, TOL * 1.6, 2)

  const all = findBands(raw)
  const { bands, dropped } = dropLabelBands(all)
  log(
    `   ${bands.length} banda(s)${dropped ? ` (${dropped} de texto descartada(s))` : ''}: ` +
      bands.map(([a, b], i) => `#${i + 1} h=${b - a}`).join(', '),
  )
  // A banda mais ALTA é a dos objetos; as outras que sobreviveram são legenda
  // grande ou peça solta, e não entram na numeração dos quadros.
  let main = bands[0]
  for (const b of bands) if (b[1] - b[0] > main[1] - main[0]) main = b
  return findFrames(raw, main[0], main[1]).map((box, i) => ({
    label: String(i + 1),
    raw,
    box,
  }))
}

/** Quadros de uma folha COM bordas: uma célula por posição da grade. */
function cellFrames(raw: Raw, sheet: NodeSheet, log: (m: string) => void): Frame[] {
  const border = detectBackground(raw)
  log(`   cor da borda rgb(${border.join(',')})`)
  const grid = borderedCells(raw, border, TOL)
  log(`   grade: ${grid.map((r, i) => `linha ${i + 1} com ${r.length} célula(s)`).join(', ')}`)

  const out: Frame[] = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const label = `${r + 1},${c + 1}`
      // Uma casca de 2px pra dentro: a borda desenhada tem anti-aliasing e sem
      // isso ela entra na célula e o flood fill começa preso.
      const cell = grid[r][c]
      const region = subRaw(raw, {
        x0: cell.x0 + 2,
        y0: cell.y0 + 2,
        x1: cell.x1 - 2,
        y1: cell.y1 - 2,
      })
      const frame = cutout(region, sheet, label, log)
      if (frame) out.push(frame)
    }
  }
  return out
}

// ============================================================
// Saída
// ============================================================

/**
 * Grava os estados de um objeto numa ESCALA E NUMA TELA COMUNS.
 *
 * A cena desenha objeto de nó com ALTURA DE MUNDO FIXA (`SPRITE_H[flavor]`),
 * então cada arquivo é esticado até essa altura. Se os dois estados saíssem
 * recortados justos, o baú ABERTO (794px de arte, por causa da tampa levantada)
 * e o FECHADO (547px) seriam desenhados com a mesma altura na tela — e o baú
 * ENCOLHERIA ao abrir.
 *
 * A correção é a mesma que a tira do herói já usa contra o boneco pulsar no
 * ciclo: uma escala só para o par, e as duas imagens padded na mesma tela,
 * ancoradas embaixo e no centro (que é como a cena ancora). Assim a tampa cresce
 * pra cima e o corpo do baú fica parado; a erva colhida, que é genuinamente mais
 * baixa, continua mais baixa.
 */
async function writePair(frames: Array<{ frame: Frame; outPath: string }>): Promise<void> {
  const dims = frames.map(({ frame }) => ({
    w: frame.box.x1 - frame.box.x0,
    h: frame.box.y1 - frame.box.y0,
  }))
  const maxW = Math.max(...dims.map(d => d.w))
  const maxH = Math.max(...dims.map(d => d.h))
  const scale = Math.min(1, MAX_SIDE / Math.max(maxW, maxH))
  const canvasW = Math.max(1, Math.round(maxW * scale))
  const canvasH = Math.max(1, Math.round(maxH * scale))

  for (let i = 0; i < frames.length; i++) {
    const { frame, outPath } = frames[i]
    const { w, h } = dims[i]
    const outW = Math.max(1, Math.round(w * scale))
    const outH = Math.max(1, Math.round(h * scale))
    const piece = await sharp(frame.raw.data, {
      raw: { width: frame.raw.width, height: frame.raw.height, channels: 4 },
    })
      .extract({ left: frame.box.x0, top: frame.box.y0, width: w, height: h })
      .resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' })
      .png()
      .toBuffer()

    mkdirSync(dirname(outPath), { recursive: true })
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: piece,
          left: Math.round((canvasW - outW) / 2), // centro: a cena ancora em x pelo meio
          top: canvasH - outH, // pé no chão: a cena ancora em y pela base
        },
      ])
      .webp({ quality: QUALITY, alphaQuality: 92, effort: 6 })
      .toFile(outPath)
  }
}

/** Folha de contato: todos os quadros achados, numerados, pra conferir a olho. */
async function writeContact(frames: Frame[], outPath: string): Promise<void> {
  const CELL = 200
  const LABEL_H = 18
  const tiles = await Promise.all(
    frames.map(async f => {
      const w = f.box.x1 - f.box.x0
      const h = f.box.y1 - f.box.y0
      return sharp(f.raw.data, {
        raw: { width: f.raw.width, height: f.raw.height, channels: 4 },
      })
        .extract({ left: f.box.x0, top: f.box.y0, width: w, height: h })
        .resize(CELL, CELL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    }),
  )
  const labels = frames.map(f =>
    Buffer.from(
      `<svg width="${CELL}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" fill="#1a1410"/>` +
        `<text x="${CELL / 2}" y="13" font-family="monospace" font-size="12" fill="#e8c37a" text-anchor="middle">[${f.label}]</text>` +
        `</svg>`,
    ),
  )
  await sharp({
    create: {
      width: CELL * frames.length,
      height: CELL + LABEL_H,
      channels: 4,
      background: { r: 60, g: 60, b: 64, alpha: 255 },
    },
  })
    .composite([
      ...tiles.map((input, i) => ({ input, left: i * CELL, top: 0 })),
      ...labels.map((input, i) => ({ input, left: i * CELL, top: CELL })),
    ])
    .png()
    .toFile(outPath)
}

// ============================================================
// Main
// ============================================================

const refLabel = (ref: FrameRef) => (Array.isArray(ref) ? ref.join(',') : String(ref))

async function processSheet(sheet: NodeSheet): Promise<boolean> {
  const inPath = join(SOURCE_DIR, sheet.file)
  // `common` e não o bioma: baú/erva/fonte/entulho são os MESMOS em toda
  // masmorra (ver FIND_OBJECT_FLAVORS em dungeonScene/icons.ts).
  const outDir = join('public', 'scene', 'common')
  const outIdle = join(outDir, `${sheet.flavor}-1.webp`)
  const outUsed = join(outDir, `${sheet.flavor}-used-1.webp`)

  const lines: string[] = []
  const log = (m: string) => lines.push(m)

  console.log(`\n🎁 ${sheet.flavor} — ${sheet.file}`)
  console.log(`   receita: ${sheet.note}`)

  if (!existsSync(inPath)) {
    console.error(`   ❌ folha não encontrada: ${inPath}`)
    return false
  }
  if (!FORCE && !DRY && existsSync(outIdle)) {
    console.log(`   ⏭️  ${outIdle} já existe (use --force pra regerar)`)
    return false
  }

  const { data, info } = await sharp(inPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const raw: Raw = { data, width: info.width, height: info.height }
  console.log(`   folha ${raw.width}x${raw.height}`)

  const frames = sheet.bordered ? cellFrames(raw, sheet, log) : lineFrames(raw, sheet, log)
  lines.forEach(l => console.log(l))

  if (!frames.length) {
    console.error(`   ❌ nenhum quadro aproveitável — pulando`)
    return false
  }
  console.log(
    `   ${frames.length} quadro(s): ` +
      frames.map(f => `[${f.label}] ${f.box.x1 - f.box.x0}x${f.box.y1 - f.box.y0}`).join(' '),
  )

  const pick = (ref: FrameRef) => frames.find(f => f.label === refLabel(ref)) ?? null
  const idle = pick(sheet.idle)
  const used = sheet.used ? pick(sheet.used) : null
  if (!idle) {
    console.error(`   ❌ quadro [${refLabel(sheet.idle)}] (estado cheio) não foi encontrado — pulando`)
    return false
  }
  if (sheet.used && !used) {
    console.warn(`   ⚠️  quadro [${refLabel(sheet.used)}] (estado gasto) não foi encontrado — só o cheio sai`)
  }

  if (DRY) {
    console.log(`   🌵 dry-run — nada escrito (sairiam ${outIdle}${used ? ` e ${outUsed}` : ''})`)
    return true
  }

  await writePair([
    { frame: idle, outPath: outIdle },
    ...(used ? [{ frame: used, outPath: outUsed }] : []),
  ])
  console.log(`   ✓ ${outIdle}`)
  if (used) console.log(`   ✓ ${outUsed}`)
  const contact = join(SOURCE_DIR, `_contact-${sheet.flavor}.png`)
  await writeContact(frames, contact)
  console.log(`   ✓ ${contact} (conferência a olho — gitignored)`)
  return true
}

async function main() {
  const sheets = NODE_SHEETS.filter(s => !ONLY || s.flavor === ONLY)
  if (!sheets.length) {
    console.error(`❌ nenhuma folha casa com --only ${ONLY}`)
    console.error(`   disponíveis: ${NODE_SHEETS.map(s => s.flavor).join(', ')}`)
    process.exit(1)
  }
  console.log(`🎁 Objetos de nó — ${sheets.length} folha(s)  tol=${TOL} max=${MAX_SIDE}px dry=${DRY}`)

  let ok = 0
  for (const sheet of sheets) {
    try {
      if (await processSheet(sheet)) ok++
    } catch (err) {
      console.error(`   ❌ ${sheet.flavor}: ${(err as Error).message}`)
    }
  }

  console.log(`\nDone. ${ok}/${sheets.length} folha(s) processada(s).`)
  if (!DRY && ok > 0) {
    console.log('👉 confira as folhas de contato e depois a cena em /dev/dungeon-scene.')
  }
}

main().catch(err => {
  console.error('❌', err)
  process.exit(1)
})
