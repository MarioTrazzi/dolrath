// 🧹 Pós-processa os sprites de cena gerados por IA — automático, sem retoque manual.
//
// O que gpt-image-1 entrega e o jogo não quer:
//   1. RUÍDO NO ALPHA — riscos coloridos soltos fora da silhueta (os traços azuis
//      do baú). São ilhas desconectadas do objeto, então dá para removê-las por
//      componentes conexos: fica o objeto, some o lixo.
//   2. FRANJA DE HALO — pixels quase transparentes na borda, que cintilam.
//      Resolvido zerando tudo abaixo do limiar de alpha.
//   3. MARGEM VAZIA — o objeto raramente ocupa o quadro inteiro. Recortar na
//      caixa do alpha conserta de quebra a ANCORAGEM: a cena desenha o sprite
//      com a base na posição do mundo, então margem embaixo faz o objeto flutuar.
//   4. PESO — 1024×1024 (~700 KB) para algo que renderiza com ~70px de altura.
//      Reduz para 512 e recomprime.
//
// O que ele NÃO conserta: chão/grama PINTADO por baixo do objeto — isso está
// colado na silhueta, não é ilha. Esse caso se resolve na geração (editar a
// partir de uma referência limpa), não aqui.
//
// Idempotente: pula o que já está processado. O original vai para art-src/
// (fora de public/, gitignored) antes da primeira escrita — regerar custa
// dinheiro, então nada é perdido.
//
// Uso:
//   npm run art:scene:clean -- --dry-run
//   npm run art:scene:clean -- --only floresta
//   npm run art:scene:clean -- --max 384 --quality 78 --force

import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = has('--dry-run')
const FORCE = has('--force')
const ONLY = valOf('--only')
const MAX_SIDE = Number(valOf('--max') || 512)
const QUALITY = Number(valOf('--quality') || 82)

/** Alpha abaixo disto vira 0 (mata franja e riscos fracos). */
const ALPHA_FLOOR = 32
/** Abaixo deste alpha a divisão do desmatte amplifica ruído — não mexe. */
const UNMATTE_MIN_ALPHA = 40
/** Casca de alpha comida para matar o rim light PINTADO (px a 1024). */
const ERODE_PX = Number(valOf('--erode') || 2)
// Ilha menor que isto é lixo. Conservador de propósito: o ruído do modelo são
// riscos finos (~200px); peça legítima destacada (pétala, folha solta, faísca)
// costuma ser bem maior. Fração baixa para não comer detalhe de objeto grande.
const MIN_ISLAND_PX = 600
const MIN_ISLAND_FRAC = 0.004

const SCENE_DIR = join('public', 'scene')
const BACKUP_DIR = join('art-src', 'scene')

interface CleanResult {
  removedIslands: number
  unmatted: number
  trimmed: { left: number; top: number; width: number; height: number }
}

/**
 * "Choke": come `r` pixels da casca do alpha.
 *
 * O gerador PINTA um rim light claro no contorno — medido na Floresta: borda
 * opaca com brilho 92 contra miolo 42 na tree-1, 59 contra 39 na bush-1. Isso
 * não é transparência, então desmatte não resolve: vira contorno branco sobre o
 * chão escuro. Comer a casca é a correção clássica de composição.
 */
function erodeAlpha(px: Buffer, w: number, h: number, r: number) {
  if (r <= 0) return 0
  const n = w * h
  const kill = new Uint8Array(n)
  let count = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (px[i * 4 + 3] === 0) continue
      let touchesVoid = false
      for (let dy = -r; dy <= r && !touchesVoid; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) { touchesVoid = true; break }
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) { touchesVoid = true; break }
          if (px[(yy * w + xx) * 4 + 3] === 0) { touchesVoid = true; break }
        }
      }
      if (touchesVoid) { kill[i] = 1; count++ }
    }
  }
  for (let i = 0; i < n; i++) if (kill[i]) px[i * 4 + 3] = 0
  return count
}

/**
 * Desfaz o MATTE BRANCO da borda.
 *
 * O gerador entrega a borda já composta contra branco:
 *     armazenado = cor_real·a + 255·(1 − a)
 * então a franja clara não é transparência, é cor errada — e aparece como
 * contorno branco em cima do chão escuro da masmorra. Invertendo:
 *     cor_real = (armazenado − 255·(1 − a)) / a
 * Medido na Floresta: borda da tree-1 com brilho 188 contra corpo opaco 43.
 */
function unmatteWhite(px: Buffer, n: number): number {
  let touched = 0
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3]
    if (a < UNMATTE_MIN_ALPHA || a >= 250) continue
    const af = a / 255
    const bg = 255 * (1 - af)
    for (let c = 0; c < 3; c++) {
      const v = (px[i * 4 + c] - bg) / af
      px[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v
    }
    touched++
  }
  return touched
}

/**
 * Zera o alpha da franja e das ilhas desconectadas. Rotulagem por componentes
 * conexos (4-vizinhos) com pilha explícita — 1M de pixels roda em ms.
 */
function cleanAlpha(px: Buffer, w: number, h: number): CleanResult {
  const n = w * h
  const labels = new Int32Array(n) // 0 = não visitado
  const stack = new Int32Array(n)
  const areas: number[] = [0] // índice 0 não usado
  let next = 1

  // limiar primeiro: a franja não deve conectar ilhas ao objeto
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] < ALPHA_FLOOR) px[i * 4 + 3] = 0
  }

  for (let start = 0; start < n; start++) {
    if (labels[start] !== 0 || px[start * 4 + 3] === 0) continue
    const label = next++
    let area = 0
    let sp = 0
    stack[sp++] = start
    labels[start] = label
    while (sp > 0) {
      const p = stack[--sp]
      area++
      const x = p % w
      const y = (p / w) | 0
      if (x > 0) {
        const q = p - 1
        if (labels[q] === 0 && px[q * 4 + 3] > 0) { labels[q] = label; stack[sp++] = q }
      }
      if (x < w - 1) {
        const q = p + 1
        if (labels[q] === 0 && px[q * 4 + 3] > 0) { labels[q] = label; stack[sp++] = q }
      }
      if (y > 0) {
        const q = p - w
        if (labels[q] === 0 && px[q * 4 + 3] > 0) { labels[q] = label; stack[sp++] = q }
      }
      if (y < h - 1) {
        const q = p + w
        if (labels[q] === 0 && px[q * 4 + 3] > 0) { labels[q] = label; stack[sp++] = q }
      }
    }
    areas[label] = area
  }

  const largest = areas.reduce((m, a) => (a > m ? a : m), 0)
  const keepFloor = Math.max(MIN_ISLAND_PX, largest * MIN_ISLAND_FRAC)
  const keep = new Uint8Array(areas.length)
  let removedIslands = 0
  for (let l = 1; l < areas.length; l++) {
    if (areas[l] >= keepFloor) keep[l] = 1
    else removedIslands++
  }

  for (let i = 0; i < n; i++) {
    const l = labels[i]
    if (l !== 0 && !keep[l]) px[i * 4 + 3] = 0
  }

  // Ordem importa: ilhas → choke (mata o rim pintado) → desmatte do que sobrou.
  // A borda dura que o choke deixa é suavizada pelo lanczos da redução.
  erodeAlpha(px, w, h, ERODE_PX)
  const unmatted = unmatteWhite(px, n)

  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] === 0) continue
    const x = i % w
    const y = (i / w) | 0
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  if (maxX < 0) {
    // nada sobrou (não deve acontecer) — devolve o quadro inteiro
    return { removedIslands, unmatted, trimmed: { left: 0, top: 0, width: w, height: h } }
  }
  return {
    removedIslands,
    unmatted,
    trimmed: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  }
}

async function processFile(file: string) {
  const backup = join(BACKUP_DIR, file.replace(`${SCENE_DIR}/`, ''))
  const hasBackup = existsSync(backup)
  // SEMPRE reprocessa a partir do original: reduzir o que já foi reduzido
  // acumula perda. Com o backup em mãos, mudar de ideia sai de graça.
  const source = hasBackup ? backup : file

  const outMeta = await sharp(file).metadata()
  if (!FORCE && Math.max(outMeta.width || 0, outMeta.height || 0) <= MAX_SIDE) {
    console.log(`⏭️  ${file} já processado (${outMeta.width}×${outMeta.height})`)
    return
  }

  const img = sharp(source)
  const meta = await img.metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (!w || !h) throw new Error(`sem dimensões: ${source}`)

  const before = statSync(file).size
  const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { removedIslands, unmatted, trimmed } = cleanAlpha(data, w, h)

  const scale = Math.min(1, MAX_SIDE / Math.max(trimmed.width, trimmed.height))
  const outW = Math.max(1, Math.round(trimmed.width * scale))
  const outH = Math.max(1, Math.round(trimmed.height * scale))

  console.log(
    `🧹 ${file}\n` +
      `   ${w}×${h} → recorte ${trimmed.width}×${trimmed.height} → ${outW}×${outH}` +
      `  ·  ilhas: ${removedIslands}  ·  borda desmatteada: ${unmatted}px`,
  )
  if (DRY) return

  if (!hasBackup) {
    mkdirSync(dirname(backup), { recursive: true })
    copyFileSync(file, backup)
  }

  const out = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract(trimmed)
    .resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' })
    .webp({ quality: QUALITY, alphaQuality: 92, effort: 6 })
    .toBuffer()

  await sharp(out).toFile(file)
  const after = statSync(file).size
  const pct = Math.round((1 - after / before) * 100)
  console.log(`   ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB (−${pct}%)`)
}

async function main() {
  if (!existsSync(SCENE_DIR)) {
    console.error(`❌ ${SCENE_DIR} não existe — gere os sprites primeiro (npm run art:scene).`)
    process.exit(1)
  }

  const biomes = readdirSync(SCENE_DIR).filter(d => !ONLY || d === ONLY)
  let count = 0
  let totalBefore = 0
  let totalAfter = 0

  for (const biome of biomes) {
    const dir = join(SCENE_DIR, biome)
    if (!statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir).filter(f => f.endsWith('.webp'))) {
      const file = join(dir, name)
      totalBefore += statSync(file).size
      await processFile(file)
      totalAfter += statSync(file).size
      count++
    }
  }

  console.log(
    `\nDone. ${count} arquivo(s)  ${(totalBefore / 1024 / 1024).toFixed(1)} MB → ` +
      `${(totalAfter / 1024 / 1024).toFixed(1)} MB`,
  )
  if (!DRY) console.log(`Originais preservados em ${BACKUP_DIR}/ (gitignored).`)
}

main().catch(err => {
  console.error('❌', err)
  process.exit(1)
})
