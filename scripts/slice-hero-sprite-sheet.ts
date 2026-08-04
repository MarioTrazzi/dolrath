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
//   npx tsx scripts/slice-hero-sprite-sheet.ts --monster ancia-da-mata --in ~/Downloads/folha.png --rows 1,2
//
// Entrada: sprite-sources/<race>-<class>.png (gitignored — folha crua do Gemini, ~5MB)
//          sprite-sources/monsters/<slug>.png   no modo --monster
// Saída:   public/sprites/<race>-<class>/<out-name>.webp   (tira: N * cellW  x  cellH)
//          public/sprites/<race>-<class>/meta.json
//          public/sprites/<race>-<class>/_contact.png      (gitignored — conferência a olho)
//          public/sprites/monsters/<slug>/...              no modo --monster
//
// Monstro usa o MESMO recorte do herói — só muda de onde lê e onde escreve. A
// diferença de verdade está na folha: a do monstro tem PERFIL, FRENTE e COSTAS
// (o bicho ronda em 360°), enquanto a do herói só precisa de perfil e costas.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'

import sharp from 'sharp'

import { DUNGEONS, monsterImageSlug } from '../src/lib/dungeonAdventures'
// O recorte em si mora na lib desde que os OBJETOS DE NÓ (baú, erva, fonte)
// passaram a precisar da mesma maquinaria — ver scripts/slice-node-sprites.ts.
import {
  alphaAt,
  detectBackground,
  dropLabelBands,
  findBands,
  findFrames,
  gridFrames,
  isFlatBlob,
  killHalo,
  killTrappedBackground,
  removeBackground,
  tightBox,
  type Box,
  type Raw,
} from './lib/spriteSheet'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = has('--dry-run')
const FORCE = has('--force')
const ALL = has('--all')
/** Lote de MONSTRO: varre sprite-sources/monsters (com ou sem subpasta de bioma). */
const ALL_MONSTERS = has('--all-monsters')
const RACE = (valOf('--race') || '').trim().toLowerCase()
const CLASS = (valOf('--class') || '').trim().toLowerCase()
/**
 * Modo MONSTRO: a folha é de UMA criatura, e o slug é o mesmo da arte pintada
 * (`monsterImageSlug` de dungeonAdventures.ts — ex.: 'ancia-da-mata'). Muda só
 * a entrada e a saída; o recorte em si é o mesmo do herói.
 */
const MONSTER = (valOf('--monster') || '').trim().toLowerCase()
/** Estamos recortando bicho (uma folha ou o lote inteiro)? */
const MONSTER_MODE = !!MONSTER || ALL_MONSTERS
/**
 * Linhas a juntar numa tira só, em ordem. As folhas variam: às vezes o andar de
 * costas está na mesma linha do perfil, às vezes numa linha própria lá embaixo.
 * `--rows 2,4` = perfil da linha 2 + costas da linha 4, com UMA escala comum
 * (escalas diferentes por linha fariam o boneco mudar de tamanho ao virar).
 */
const ROWS = (valOf('--rows') || valOf('--row') || '2')
  .split(',')
  .map(s => Number(s.trim()))
  .filter(n => Number.isFinite(n) && n >= 1)
const ROW = ROWS[0]
const OUT_NAME = (valOf('--out-name') || 'walk').trim()
/**
 * Grade FORÇADA `COLUNASxLINHAS`, em vez de descobrir as bandas por projeção.
 *
 * A projeção só separa o que tem uma faixa vazia entre um frame e outro, e nem
 * toda folha tem: a aranha tem perna de cima encostando na de baixo (as duas
 * linhas viram UMA banda de 1035px), e o lobo vem com sombra de chão pintada
 * que faz ponte entre dois bichos vizinhos (um "frame" de 1067px = dois lobos).
 * Nesses casos a grade é a informação que falta, e ela é trivial de ler a olho
 * na folha. Dentro de cada célula o recorte continua sendo o bbox real.
 */
const GRID = (() => {
  const v = valOf('--grid')
  if (!v) return null
  const [cols, rows] = v.split('x').map(Number)
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) {
    console.error('❌ --grid precisa ser COLUNASxLINHAS (ex.: --grid 3x4)')
    process.exit(1)
  }
  return { cols, rows }
})()
/** Tolerância euclidiana (RGB) pro flood fill do fundo. */
const TOL = Number(valOf('--tol') || 26)
/** Célula final. ~2x o tamanho de exibição (a arte não é pixel art, então suaviza bem). */
const CELL = (valOf('--cell') || '128x192').split('x').map(Number)
const CELL_W = CELL[0]
const CELL_H = CELL[1]

/** Fração da altura da célula que a silhueta ocupa (respiro em cima). */
const FIT = 0.94

/**
 * Piso de altura de um frame, como fração da MEDIANA da linha. Abaixo disso é
 * caco de cenário (poeira, gota), não pose. As folhas reais ficam em 0.9-1.1 da
 * mediana e os cacos em 0.05-0.10 — 0.4 passa longe dos dois lados.
 */
const DEBRIS_H = Number(valOf('--debris-h') || 0.4)

if (!ALL && !ALL_MONSTERS && !MONSTER && (!RACE || !CLASS)) {
  console.error('❌ faltou --race e/ou --class (ex.: --race elfo --class rogue), ou --monster <slug>, ou --all')
  process.exit(1)
}
if (MONSTER && (RACE || CLASS)) {
  console.error('❌ --monster não combina com --race/--class — é uma folha OU de herói OU de monstro')
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

/** O que o usuário pediu na mão — tem prioridade sobre a receita da folha. */
const EXPLICIT = {
  rows: !!(valOf('--rows') || valOf('--row')),
  grid: !!valOf('--grid'),
  cell: !!valOf('--cell'),
}

const expandHome = (p: string) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p)
const SOURCE_DIR = resolve('sprite-sources')

/** Ids canônicos (gameData.ts): raças em PT, classes em EN. */
const RACES = ['humano', 'elfo', 'draconiano', 'metamorfo'] as const
const CLASSES = ['warrior', 'rogue', 'mage', 'monk'] as const

interface Job {
  kind: 'hero' | 'monster'
  /** 'elfo-rogue' (herói) | 'ancia-da-mata' (monstro). */
  slug: string
  /** Pasta de saída, já resolvida — é a única coisa que difere no recorte. */
  outDir: string
  race?: string
  cls?: string
  inPath: string
}

const heroJob = (race: string, cls: string, inPath: string): Job => ({
  kind: 'hero',
  slug: `${race}-${cls}`,
  outDir: resolve(join('public', 'sprites', `${race}-${cls}`)),
  race,
  cls,
  inPath,
})

const monsterJob = (slug: string, inPath: string): Job => ({
  kind: 'monster',
  slug,
  outDir: resolve(join('public', 'sprites', 'monsters', slug)),
  inPath,
})

/**
 * Como ler CADA folha de monstro. Isto é DADO da folha, não gosto: cada bicho
 * veio do Gemini com uma diagramação, e sem registrar aqui o `--all-monsters`
 * só funcionaria para o subconjunto que casa com o default.
 *
 * `grid` só entra quando a projeção não separa sozinha (frames encostados).
 * Ausente = descoberta automática, que é o caso mais limpo.
 */
interface SheetRecipe {
  rows: number[]
  grid?: { cols: number; rows: number }
  cell?: [number, number]
  /** Folha com sombra/chão pintado que prende fundo dentro da silhueta. */
  killTrappedBg?: boolean
  /** Por que essa receita — para não virar número mágico. */
  note: string
}

/** Poça menor que isto é pelagem da cor do fundo, não fundo preso. */
const TRAPPED_MIN_AREA = 400

/**
 * Célula do bicho: mesma proporção 2:3 da do herói (128x192), 1.5x maior porque
 * monstro desenha mais alto em unidades de mundo — mantém a densidade de texel.
 * A largura é MÍNIMO: alarga sozinha pro que o bicho tiver de largo.
 */
const MONSTER_CELL: [number, number] = [192, 288]

const DEFAULT_RECIPE: SheetRecipe = { rows: [1, 2], note: '2 linhas: perfil / frente+costas' }

const SHEET_RECIPES: Record<string, SheetRecipe> = {
  'ancia-da-mata': { rows: [1, 2], note: '6 de perfil (3 + 3 espelhados), 3 de frente, 3 de costas' },
  'ent-corrompido': { rows: [1, 2], note: 'mesma diagramação da Anciã' },
  'javali-furioso': { rows: [1, 2], note: 'mesma diagramação da Anciã, bicho mais largo' },
  // Perna de cima encosta na de baixo: a projeção funde as duas linhas numa
  // banda de 1035px. A grade é o que falta.
  'aranha-gigante': { rows: [1, 2], grid: { cols: 6, rows: 2 }, note: 'pernas encostam entre as linhas' },
  // 4 linhas de 3, e a sombra de chão PINTADA faz ponte entre bichos vizinhos
  // (a projeção devolve um "frame" de 1067px = dois lobos). Linha 2 é a 1
  // espelhada — não entra, o espelho sai de graça em runtime.
  'lobo-faminto': {
    rows: [1, 3, 4],
    grid: { cols: 3, rows: 4 },
    killTrappedBg: true,
    note: 'grade 3x4; linha 2 = espelho da 1; risco de terra prende fundo entre as patas',
  },

  // ---- Caverna de Cristal ----
  // Duas diagramações vieram na mesma leva, e a diferença muda o comando:
  //
  //   RETRATO 1686x2528 (goblin, golem, morcego): 3 colunas x 4 linhas, certinho.
  //     A projeção sozinha erra porque a POEIRA sob os pés é um blob solto na
  //     faixa entre duas poses — vira "frame" de 20x62. A grade resolve.
  //
  //   PAISAGEM 3836x1120 (slime, wyrm): 2 linhas com contagem DIFERENTE (8 e 6,
  //     ou 6 e 6). Grade uniforme não serve; aqui é a projeção que acerta, com o
  //     filtro de caco tirando as gotas de gosma.
  //
  // Em ambas: linhas 1-2 de perfil, 3 de frente, 4 de costas (retrato); na
  // paisagem, linha 1 de perfil e linha 2 = frente + costas na mesma banda.
  'goblin-minerador': {
    rows: [1, 2, 3, 4],
    grid: { cols: 3, rows: 4 },
    note: 'grade 3x4: perfil, perfil, frente, costas; poeira dos pés some pelo filtro de caco',
  },
  'golem-de-pedra': {
    rows: [1, 2, 3, 4],
    grid: { cols: 3, rows: 4 },
    note: 'grade 3x4, mesma diagramação do goblin',
  },
  'morcego-sombrio': {
    rows: [1, 2, 3, 4],
    grid: { cols: 3, rows: 4 },
    note: 'grade 3x4, mesma diagramação do goblin (bicho voando, sem pé no chão)',
  },
  'slime-de-cristal': {
    rows: [1, 2],
    note: 'paisagem: 8 de perfil na linha 1, 3 de frente + 3 de costas na linha 2; gotas caem no filtro de caco',
  },
  'wyrm-cristalino': {
    rows: [1, 2],
    note: 'paisagem: 6 de perfil na linha 1, 3 de frente + 3 de costas na linha 2',
  },

  // ---- Pântano Maldito ----
  // A leva veio nos MESMOS dois tamanhos da Caverna (retrato 1686x2528, paisagem
  // 3836x1120), e isso engana: o tamanho do arquivo NÃO determina a diagramação.
  // O crocodilo tem CINCO linhas e bate 12 frames por coincidência — a grade 3x4
  // passa batido na contagem e corta tudo no lugar errado.
  'sapo-venenoso': {
    rows: [1, 2],
    note: 'paisagem 6x2, mas a projeção acerta sozinha (os saltos não se encostam)',
  },
  // ⚠️ 6x2 certinho e a projeção acerta sozinha — o susto de que ela teria
  // fundido as duas colunas do meio é ilusão da tira de conferência: a última
  // pose virada à direita fica LADO A LADO com a primeira virada à esquerda, e
  // as duas de frente uma pra outra parecem um frame só. Conferir pelas larguras
  // no log (6 frames de ~436px), não pelo olho na tira.
  'bruxa-do-brejo': {
    rows: [1, 2],
    note: 'paisagem 6x2; projeção basta (3 de perfil + 3 espelhadas, depois frente e costas)',
  },
  // 3,2,3,3: a linha 2 tem só DUAS poses, e o que sobra no meio é o rabo das
  // vizinhas invadindo a coluna (a projeção devolve uma tira de 562x134 que o
  // filtro de caco descarta — corretamente). Grade uniforme aqui mentiria.
  'serpente-do-lodo': {
    rows: [1, 2, 3, 4],
    grid: { cols: 3, rows: 4 },
    note: 'retrato, grade 3x4; linha 2 só tem 2 poses → 11 frames, não 12',
  },
  // O único com CINCO linhas (2,2,2,3,3). Bate 12 frames por coincidência, então
  // a grade 3x4 passa batido na contagem e corta tudo no lugar errado.
  'crocodilo-anciao': {
    rows: [1, 2, 3, 4, 5],
    note: 'retrato 5 linhas 2/2/2/3/3 — projeção, NÃO grade 3x4',
  },
  'hidra-do-pantano': {
    rows: [1, 2, 3, 4],
    grid: { cols: 3, rows: 4 },
    note: 'CHEFE; retrato 1686x2528, grade 3x4 igual ao goblin',
  },
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
  const { race, cls, slug: SLUG, outDir: OUT_DIR, inPath: IN_PATH } = job
  const OUT_STRIP = join(OUT_DIR, `${OUT_NAME}.webp`)
  const OUT_META = join(OUT_DIR, 'meta.json')
  const OUT_CONTACT = join(OUT_DIR, '_contact.png')

  // Receita da folha quando é bicho; a flag na linha de comando SEMPRE ganha,
  // pra dar pra experimentar sem editar o script.
  const recipe = job.kind === 'monster' ? (SHEET_RECIPES[SLUG] ?? DEFAULT_RECIPE) : null
  const rows = !recipe || EXPLICIT.rows ? ROWS : recipe.rows
  const grid = !recipe || EXPLICIT.grid ? GRID : (recipe.grid ?? null)
  const [cellWMin, cellH] =
    !recipe || EXPLICIT.cell ? [CELL_W, CELL_H] : (recipe.cell ?? MONSTER_CELL)
  const killTrapped = has('--kill-trapped-bg') || !!recipe?.killTrappedBg

  console.log(
    `\n${job.kind === 'monster' ? '👹' : '🧝'} ${SLUG} — linhas=${rows.join(',')} célula=${cellWMin}x${cellH} tol=${TOL}` +
      (grid ? ` grade=${grid.cols}x${grid.rows}` : '') +
      (recipe && !EXPLICIT.rows ? `\n   receita: ${recipe.note}` : '')
  )

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
  if (killTrapped) {
    // Tolerância maior que a do flood fill: o risco de terra do lobo desbota o
    // fundo preso em volta dele, e no tol de contorno a poça ficava pela metade.
    const n = killTrappedBackground(raw, bg, TOL * 1.6, TRAPPED_MIN_AREA)
    console.log(`   fundo preso removido: ${n}px${n === 0 ? ' (nenhuma poça)' : ''}`)
  }
  killHalo(raw, bg, TOL * 1.6, 2)

  let bands: Array<[number, number]>
  if (grid) {
    bands = Array.from({ length: grid.rows }, (_, r): [number, number] => [
      Math.round((r * raw.height) / grid.rows),
      Math.round(((r + 1) * raw.height) / grid.rows),
    ])
    console.log(`   grade forçada ${grid.cols}x${grid.rows} (linhas de ${bands[0][1] - bands[0][0]}px)`)
  } else {
    const kept = dropLabelBands(findBands(raw))
    bands = kept.bands
    const droppedLabels = kept.dropped
    console.log(
      `   ${bands.length} linhas${droppedLabels ? ` (${droppedLabels} rótulo(s) de texto descartado(s))` : ''}: ` +
        bands.map(([a, b], i) => `#${i + 1} h=${b - a}`).join(', ')
    )
  }

  const missingRow = rows.find(r => r > bands.length)
  if (missingRow !== undefined) {
    console.error(`   ❌ linha ${missingRow} não existe (folha tem ${bands.length}) — pulando`)
    return null
  }

  // Junta as linhas pedidas numa lista só, guardando onde cada uma começa —
  // é esse offset que vira o índice de `back` no manifesto.
  const frames: Box[] = []
  const rowStarts: Array<{ row: number; start: number; count: number }> = []
  for (const row of rows) {
    const [bandY0, bandY1] = bands[row - 1]
    const found = grid
      ? gridFrames(raw, bandY0, bandY1, grid.cols)
      : findFrames(raw, bandY0, bandY1)
    // Cacos de cenário que a projeção conta como frame: a poeira sob os pés do
    // goblin, as gotas que caem do slime. São blobs soltos na faixa vazia ENTRE
    // duas poses, então `findFrames` os separa como se fossem quadros — e um
    // "frame" de 33x23 no meio do ciclo faz o bicho sumir por um instante.
    // Altura relativa à MEDIANA da linha resolve sem número mágico por folha:
    // pose é pose, caco é caco, e a distância entre os dois é enorme.
    const heights = found.map(b => b.y1 - b.y0).sort((a, b) => a - b)
    const medianH = heights[Math.floor(heights.length / 2)] || 0
    const rowFrames = found.filter((box) => {
      if (isFlatBlob(raw, box)) {
        console.log(`   ⚠️  descartado blob chapado em x=${box.x0}..${box.x1}`)
        return false
      }
      if (medianH > 0 && box.y1 - box.y0 < medianH * DEBRIS_H) {
        console.log(
          `   ⚠️  descartado caco ${box.x1 - box.x0}x${box.y1 - box.y0} em x=${box.x0} ` +
            `(< ${Math.round(medianH * DEBRIS_H)}px)`,
        )
        return false
      }
      return true
    })
    rowStarts.push({ row, start: frames.length, count: rowFrames.length })
    frames.push(...rowFrames)
  }

  if (!frames.length) {
    console.error(`   ❌ nenhum frame encontrado em ${rows.join(',')} — pulando`)
    return null
  }
  for (const r of rowStarts) {
    console.log(
      `   linha ${r.row}: ${r.count} frames -> índices [${r.start}..${r.start + r.count - 1}] ` +
        frames
          .slice(r.start, r.start + r.count)
          .map((b, i) => `[${r.start + i}] ${b.x1 - b.x0}x${b.y1 - b.y0}`)
          .join(' ')
    )
  }

  // Escala única pra todos os frames: o mais alto da linha define o encaixe.
  // (Escala por frame faria o boneco crescer/encolher durante o ciclo.)
  //
  // A escala vem SÓ da altura, de propósito. Se entrasse a largura, um cajado
  // na horizontal encolheria o mago inteiro e ele ficaria menor que o ladino na
  // tela — mesmo com os dois tendo a mesma altura na folha. A célula é que se
  // alarga pra caber o que sobra pros lados.
  const maxH = Math.max(...frames.map((b) => b.y1 - b.y0))
  const maxW = Math.max(...frames.map((b) => b.x1 - b.x0))
  const scale = (cellH * FIT) / maxH
  const cellW = Math.max(cellWMin, Math.ceil(maxW * scale) + 4)
  if (cellW > cellWMin) {
    console.log(`   célula alargada ${cellWMin}→${cellW}px (frame mais largo: ${maxW}px)`)
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
    const top = cellH - outH // pé colado no chão da célula

    const cell = await sharp({
      create: {
        width: cellW,
        height: cellH,
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
    create: { width: stripW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(cells.map((input, i) => ({ input, left: i * cellW, top: 0 })))

  await strip.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(OUT_STRIP)
  console.log(`   ✓ ${OUT_NAME}.webp (${stripW}x${cellH}, ${cells.length} frames)`)

  // URL pública = a pasta de saída sem o prefixo `public/` (monstro mora um
  // nível mais fundo, em sprites/monsters/<slug>).
  const publicSrc = `/${OUT_DIR.slice(resolve('public').length + 1)}/${OUT_NAME}.webp`

  const meta = {
    slug: SLUG,
    kind: job.kind,
    race,
    class: cls,
    name: OUT_NAME,
    src: publicSrc,
    frameW: cellW,
    frameH: cellH,
    frames: cells.length,
    rows,
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
      height: cellH + CONTACT_LABEL_H,
      channels: 4,
      background: { r: 60, g: 60, b: 64, alpha: 255 },
    },
  })
    .composite([
      ...cells.map((input, i) => ({ input, left: i * cellW, top: 0 })),
      ...labels.map((input, i) => ({ input, left: i * cellW, top: cellH })),
    ])
    .png()
    .toFile(OUT_CONTACT)
  console.log(`   ✓ _contact.png (conferência a olho — gitignored)`)

  // Palpite do ciclo: todos os frames, na ordem. A escolha real (quais são de
  // perfil, quais são de costas, quais são espelhos) sai da folha de contato +
  // bancada — chutar aqui já deu errado uma vez: o frame mais estreito costuma
  // ser o FRONTAL, e frontal não serve pra nada na masmorra (o herói nunca vem
  // na direção da câmera). Por isso também não chuto mais `idle`.
  const guess = cells.map((_, i) => i)

  if (job.kind === 'monster') {
    // Folha de monstro tem 3 direções: a 1ª linha é o PERFIL e a 2ª costuma vir
    // metade de frente, metade de costas (é o caso da Anciã da Mata). Chuto essa
    // divisão só pra dar um ponto de partida colável — quem decide de verdade é
    // a folha de contato + a bancada, porque a ordem varia de folha pra folha.
    const first = rowStarts[0]
    const second = rowStarts[1]
    const sideGuess = first ? guess.slice(first.start, first.start + first.count) : guess
    const half = second ? Math.floor(second.count / 2) : 0
    const frontGuess = second ? guess.slice(second.start, second.start + half) : []
    const backGuess = second ? guess.slice(second.start + half, second.start + second.count) : []
    return (
      `  '${SLUG}': {\n` +
      `    src: '${meta.src}',\n` +
      `    frameW: ${cellW},\n` +
      `    frameH: ${cellH},\n` +
      `    frames: ${cells.length},\n` +
      `    facing: 'right',\n` +
      `    walk: [${sideGuess.join(', ')}],\n` +
      (frontGuess.length ? `    front: [${frontGuess.join(', ')}],\n` : '') +
      (backGuess.length ? `    back: [${backGuess.join(', ')}],\n` : '') +
      `    fps: 6,\n` +
      `    worldH: 3.6,\n` +
      `  },`
    )
  }

  return (
    `  '${SLUG}': {\n` +
    `    src: '${meta.src}',\n` +
    `    frameW: ${cellW},\n` +
    `    frameH: ${cellH},\n` +
    `    frames: ${cells.length},\n` +
    `    facing: 'right',\n` +
    `    walk: [${guess.join(', ')}],\n` +
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
    jobs.push(heroJob(race, cls, join(SOURCE_DIR, file)))
  }
  if (ignored.length) {
    console.log(`⚠️  ignorados (nome fora do padrão <race>-<class>): ${ignored.join(', ')}`)
    console.log(`   raças: ${RACES.join(' | ')}   classes: ${CLASSES.join(' | ')}`)
  }
  return jobs
}

/** Todo slug de bicho do catálogo — mob e chefe de todas as masmorras. */
function catalogSlugs(): Map<string, string> {
  const out = new Map<string, string>()
  for (const d of Object.values(DUNGEONS)) {
    for (const m of [...d.monsters, d.boss]) out.set(monsterImageSlug(m.name), m.name)
  }
  return out
}

/**
 * Varre `sprite-sources/monsters`, com ou sem subpasta de bioma
 * (`monsters/floresta-sombria/lobo-faminto.png` funciona igual a
 * `monsters/lobo-faminto.png` — a subpasta é organização sua, o slug é o nome
 * do arquivo).
 *
 * O nome é conferido contra o catálogo: um typo aqui produziria um slug que
 * nenhuma entrada de MONSTER_SPRITES casa, e o bicho apareceria como vulto sem
 * ninguém entender por quê. Melhor reclamar na hora do recorte.
 */
function discoverMonsterJobs(quiet = false): Job[] {
  const root = join(SOURCE_DIR, 'monsters')
  if (!existsSync(root)) {
    if (!quiet) {
      console.error(`❌ pasta não encontrada: ${root}`)
      console.error('   Crie-a e jogue as folhas como <slug>.png (ex.: lobo-faminto.png)')
    }
    return []
  }
  const known = catalogSlugs()
  const jobs: Job[] = []
  const unknown: string[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(png|webp|jpg|jpeg)$/i.test(entry)) continue
      const slug = basename(entry).replace(/\.[^.]+$/, '').toLowerCase()
      if (!known.has(slug)) {
        unknown.push(entry)
        continue
      }
      jobs.push(monsterJob(slug, full))
    }
  }
  walk(root)

  if (unknown.length && !quiet) {
    console.log(`⚠️  ignorados (slug fora do catálogo): ${unknown.join(', ')}`)
    console.log(`   renomeie para um destes: ${Array.from(known.keys()).sort().join(', ')}`)
  }
  return jobs
}

/**
 * Folha de UM bicho. Sem `--in`, procura o slug em qualquer subpasta de
 * `sprite-sources/monsters` — organizar por bioma não pode custar um caminho
 * mais comprido na linha de comando.
 */
function monsterJobFor(slug: string): Job {
  const explicit = valOf('--in')
  if (explicit) return monsterJob(slug, resolve(expandHome(explicit)))
  const found = discoverMonsterJobs(true).find(j => j.slug === slug)
  return found ?? monsterJob(slug, resolve(join('sprite-sources', 'monsters', `${slug}.png`)))
}

async function main() {
  const jobs: Job[] = ALL
    ? discoverJobs()
    : ALL_MONSTERS
      ? discoverMonsterJobs()
      : MONSTER
        ? [monsterJobFor(MONSTER)]
        : [
          heroJob(
            RACE,
            CLASS,
            resolve(expandHome(valOf('--in') || join('sprite-sources', `${RACE}-${CLASS}.png`)))
          ),
        ]

  if (!jobs.length) {
    console.log('nada a fazer.')
    return
  }
  console.log(`🎬 ${jobs.length} folha(s) — linhas ${ROWS.join(",")}, célula ${CELL_W}x${CELL_H}, force=${FORCE}`)

  const snippets: string[] = []
  let failed = 0
  for (const job of jobs) {
    try {
      const snippet = await sliceOne(job)
      if (snippet) snippets.push(snippet)
      else failed++
    } catch (err) {
      console.error(`   ❌ ${job.slug} falhou:`, err instanceof Error ? err.message : err)
      failed++
    }
  }

  // Checklist das 16 — o que já tem tira e o que ainda falta. Só faz sentido no
  // modo herói: monstro não tem grade raça×classe.
  if (!MONSTER_MODE) {
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
  }

  if (snippets.length) {
    const target = MONSTER_MODE ? 'src/lib/monsterSprites.ts' : 'src/lib/heroSprites.ts'
    const knobs = MONSTER_MODE ? 'walk/front/back/fps/worldH' : 'walk/back/fps'
    console.log(`\n📋 cole em ${target} (ajuste ${knobs} em /dev/sprite-lab):\n`)
    console.log(snippets.join('\n'))
  }
  if (failed) console.log(`\n⚠️  ${failed} folha(s) puladas ou com erro.`)
}

main().catch((err) => {
  console.error('❌ falhou:', err)
  process.exit(1)
})
