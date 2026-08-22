// Importa um pack DIRECIONAL de pixel art (Seven Sprites e afins) para a tira
// horizontal única que `heroSprites.ts` sabe ler.
//
// É o irmão do `slice-hero-sprite-sheet.ts`, e existe porque a entrada é outra:
//   - folha do Gemini: um PNG grande, arte "quase pixel art" com fundo pintado,
//     precisa de flood fill, mata-halo, bandas e escala comum.
//   - pack direcional: já vem recortado, com fundo transparente e um PNG POR
//     DIREÇÃO (walk_east/west/south/north) descrito num `atlas.json`.
//     Aqui não há nada a adivinhar — só concatenar e apertar a moldura.
//
// A cena só usa DUAS direções: o perfil (o herói andando de lado) e as costas
// (subindo a trilha pro fundo). O outro lado é o perfil ESPELHADO em runtime, e
// a pose de frente não entra — o herói nunca vem na direção da câmera. Por isso
// a tira sai `east` + `north`, nessa ordem, e o `south`/`west` do pack ficam de
// fora de propósito.
//
// A moldura é apertada com UMA janela comum a todos os frames (nunca por frame):
// recorte individual faria o boneco pular de tamanho a cada passo. A janela vem
// do bbox da união + margem, e é o que devolve ao herói a proporção ~2:3 das
// outras folhas — a célula 128x128 crua deixaria o mago 12% mais baixo que os
// vizinhos, porque a cena ancora pela ALTURA do frame.
//
// Uso:
//   npx tsx scripts/slice-hero-pack.ts --in ~/Downloads/mago --race draconiano --class mage
//   npx tsx scripts/slice-hero-pack.ts --in ~/Downloads/mago --race draconiano --class mage --dry-run
//
// Entrada: <dir>/atlas.json + os PNGs que ele aponta.
// Saída:   public/sprites/<race>-<class>/walk.webp   (tira: 2N * cellW x cellH)
//          public/sprites/<race>-<class>/meta.json

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

import sharp from 'sharp'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = has('--dry-run')
const RACE = (valOf('--race') || '').trim().toLowerCase()
const CLASS = (valOf('--class') || '').trim().toLowerCase()
const OUT_NAME = (valOf('--out-name') || 'walk').trim()
/** Folga em px ao redor do bbox da união, para nenhum contorno encostar na borda. */
const MARGIN = Number(valOf('--margin') ?? 2)

const IN = (valOf('--in') || '').replace(/^~(?=$|\/)/, homedir())

if (!IN || !RACE || !CLASS) {
  console.error('uso: --in <pasta do pack> --race <raca> --class <classe> [--out-name walk] [--margin 2] [--dry-run]')
  process.exit(1)
}

interface AtlasAnim {
  file: string
  frames: number
  fps: number
  loop?: boolean
  flipX?: boolean
}
interface Atlas {
  name?: string
  frameSize: { width: number; height: number }
  layout?: string
  animations: Record<string, AtlasAnim>
}

/** Ordem da tira: perfil primeiro, costas depois — é o que o def espera indexar. */
const WANTED = ['walk_east', 'walk_north'] as const

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** bbox do que tem alpha, em coordenadas DE CÉLULA (0..cell), unindo todos os frames. */
async function unionBox(file: string, frames: number, cell: { width: number; height: number }): Promise<Box> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, channels } = info
  const box: Box = { x0: cell.width, y0: cell.height, x1: -1, y1: -1 }
  for (let i = 0; i < frames; i++) {
    const ox = i * cell.width
    for (let y = 0; y < cell.height; y++) {
      for (let x = 0; x < cell.width; x++) {
        if (data[(y * width + ox + x) * channels + 3] <= 16) continue
        if (x < box.x0) box.x0 = x
        if (x > box.x1) box.x1 = x
        if (y < box.y0) box.y0 = y
        if (y > box.y1) box.y1 = y
      }
    }
  }
  if (box.x1 < 0) throw new Error(`folha vazia: ${file}`)
  return box
}

async function main() {
  const dir = resolve(IN)
  const atlasPath = join(dir, 'atlas.json')
  if (!existsSync(atlasPath)) throw new Error(`sem atlas.json em ${dir}`)
  const atlas: Atlas = JSON.parse(readFileSync(atlasPath, 'utf8'))
  if (atlas.layout && atlas.layout !== 'horizontal') {
    throw new Error(`layout "${atlas.layout}" não suportado — só folha horizontal`)
  }
  const cell = atlas.frameSize

  const anims = WANTED.map((key) => {
    const a = atlas.animations[key]
    if (!a) throw new Error(`atlas sem "${key}" — a cena precisa de perfil e costas`)
    if (a.flipX) throw new Error(`"${key}" pede flipX; este importador não espelha na folha`)
    return { key, ...a, path: join(dir, a.file) }
  })
  for (const a of anims) if (!existsSync(a.path)) throw new Error(`arquivo do atlas não existe: ${a.path}`)

  // Janela ÚNICA pra todas as direções: cada uma tem seu bbox (as costas são
  // mais largas que o perfil), e usar a maior mantém a escala e o chão iguais.
  const boxes = await Promise.all(anims.map((a) => unionBox(a.path, a.frames, cell)))
  const win: Box = {
    x0: Math.max(0, Math.min(...boxes.map((b) => b.x0)) - MARGIN),
    y0: Math.max(0, Math.min(...boxes.map((b) => b.y0)) - MARGIN),
    x1: Math.min(cell.width - 1, Math.max(...boxes.map((b) => b.x1)) + MARGIN),
    y1: Math.min(cell.height - 1, Math.max(...boxes.map((b) => b.y1)) + MARGIN),
  }
  const cellW = win.x1 - win.x0 + 1
  const cellH = win.y1 - win.y0 + 1
  const total = anims.reduce((n, a) => n + a.frames, 0)

  console.log(`pack ${atlas.name || dir}: célula ${cell.width}x${cell.height} -> ${cellW}x${cellH}`)
  for (let i = 0; i < anims.length; i++) {
    console.log(`  ${anims[i].key}: ${anims[i].frames} frames @ ${anims[i].fps}fps  bbox ${JSON.stringify(boxes[i])}`)
  }

  const composites: { input: Buffer; left: number; top: number }[] = []
  let cursor = 0
  const ranges: Record<string, number[]> = {}
  for (let i = 0; i < anims.length; i++) {
    const a = anims[i]
    const strip = await sharp(a.path)
      .ensureAlpha()
      .extract({ left: 0, top: win.y0, width: a.frames * cell.width, height: cellH })
      .toBuffer()
    // Um extract por frame: a janela em X é interna à célula, então não dá pra
    // recortar a folha inteira de uma vez sem arrastar o vizinho junto.
    ranges[a.key] = []
    for (let f = 0; f < a.frames; f++) {
      const buf = await sharp(strip)
        .extract({ left: f * cell.width + win.x0, top: 0, width: cellW, height: cellH })
        .toBuffer()
      composites.push({ input: buf, left: cursor * cellW, top: 0 })
      ranges[a.key].push(cursor)
      cursor++
    }
  }

  const outDir = join(process.cwd(), 'public', 'sprites', `${RACE}-${CLASS}`)
  const outFile = join(outDir, `${OUT_NAME}.webp`)
  const meta = {
    slug: `${RACE}-${CLASS}`,
    race: RACE,
    class: CLASS,
    name: OUT_NAME,
    src: `/sprites/${RACE}-${CLASS}/${OUT_NAME}.webp`,
    frameW: cellW,
    frameH: cellH,
    frames: total,
    fps: anims[0].fps,
    /** Índices na tira, por direção — é daqui que saem `walk`/`back` no heroSprites.ts. */
    ranges,
    source: `${IN} (pack direcional, atlas.json)`,
    generatedAt: new Date().toISOString(),
  }

  if (DRY) {
    console.log('--dry-run: nada escrito\n', JSON.stringify(meta, null, 2))
    return
  }

  mkdirSync(outDir, { recursive: true })
  await sharp({
    create: { width: total * cellW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .webp({ lossless: true })
    .toFile(outFile)
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')

  console.log(`\nescrito ${outFile}  (${total} frames de ${cellW}x${cellH})`)
  console.log(JSON.stringify(ranges))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
