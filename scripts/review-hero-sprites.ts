// 🔍 Confere o boneco de caminhada COMO ELE APARECE NA CENA, não como ele está na tira.
//
// A `_contact.png` do slice mostra os frames crus, na ordem da folha. Não é o que
// o jogador vê: a cena escolhe um subconjunto (`walk`/`back`/`idle`) e ESPELHA
// quando o herói anda para o lado oposto ao da folha. Um frame de costas parado
// no meio do ciclo de perfil passa batido no contato e só aparece em movimento —
// foi assim que o draconiano/guerreiro chegou em produção alternando perfil e
// costas ("quando ele vira para a direita ele some").
//
// Este script lê o MANIFESTO (src/lib/heroSprites.ts) e monta, por combinação,
// uma folha com as três leituras da cena:
//
//   ANDANDO →   os frames de `walk` já espelhados para a direita
//   ANDANDO ←   os mesmos frames virados para a esquerda
//   DE COSTAS   o ciclo de `back` (o herói subindo a trilha)
//   PARADO      o frame `idle` (ou walk[0])
//
// Uso:
//   npx tsx scripts/review-hero-sprites.ts                 # todas as combinações do manifesto
//   npx tsx scripts/review-hero-sprites.ts --slug draconiano-warrior
//   npx tsx scripts/review-hero-sprites.ts --zoom 4        # 4x o tamanho de tela
//
// Saída: public/sprites/<slug>/_review.png (gitignored, como a _contact.png)
//
// O que procurar em cada folha:
//   1. Todo frame da linha ANDANDO → é PERFIL? (costas ou frente no meio do ciclo
//      = folha ruim, peça de novo — ver scripts/hero-sprite-sheet-prompt.md)
//   2. Os frames do ciclo são poses DIFERENTES? (dois iguais = ciclo parado)
//   3. O boneco fica do mesmo tamanho frame a frame? (escala furada na folha)
//   4. Os pés ficam na mesma altura? (frame flutuando afunda na cena)

import { existsSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

import sharp, { type OverlayOptions } from 'sharp'

import { HERO_SPRITES, HERO_SPRITE_SCREEN_H, type HeroSpriteDef } from '../src/lib/heroSprites'

const argv = process.argv.slice(2)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const ONLY = (valOf('--slug') || '').trim().toLowerCase()
/** Ampliação sobre o tamanho real de tela — 56px é pequeno demais pra conferir a olho. */
const ZOOM = Number(valOf('--zoom') || 3)

const PAD = 10
/** Faixa do nome da linha (em cima) + faixa dos índices (embaixo do boneco). */
const TITLE_H = 22
const INDEX_H = 20
const BG = { r: 18, g: 20, b: 24, alpha: 1 }

interface Row {
  label: string
  frames: number[]
  /** Espelhar horizontalmente, como a cena faz pro lado oposto ao da folha. */
  flip: boolean
}

/** As mesmas contas de flip da WalkScene/DungeonScene, para a folha bater com o jogo. */
function rowsOf(def: HeroSpriteDef): Row[] {
  const cycle = def.walk.length ? def.walk : [0]
  const backCycle =
    def.back === undefined ? [] : Array.isArray(def.back) ? def.back : [def.back]
  // facing='right' já olha pra direita; facing='left' precisa espelhar pra ir pra direita.
  const flipToRight = def.facing === 'left'
  const rows: Row[] = [
    { label: 'ANDANDO P/ DIREITA', frames: cycle, flip: flipToRight },
    { label: 'ANDANDO P/ ESQUERDA', frames: cycle, flip: !flipToRight },
  ]
  if (backCycle.length) {
    // Uma pose de costas só: a cena alterna o espelho pra dar o 2º tempo do passo.
    rows.push({ label: 'DE COSTAS', frames: backCycle, flip: false })
    if (backCycle.length === 1) {
      rows.push({ label: 'COSTAS (espelho)', frames: backCycle, flip: true })
    }
  }
  rows.push({ label: 'PARADO', frames: [def.idle ?? cycle[0]], flip: flipToRight })
  return rows
}

/**
 * Altura do CORPO dentro da célula, em px — o que determina o tamanho aparente
 * do boneco, já que a cena desenha toda célula com a mesma altura de tela.
 *
 * Mede só o terço central pra ignorar adereço fino que sobe pro lado: a lança
 * do elfo/guerreiro estica a bbox nos frames frontais, o recorte escala a linha
 * inteira por ela, e o boneco acaba ~10% menor que os das outras folhas mesmo
 * com a arte "do mesmo tamanho". É o tipo de coisa que só aparece comparando
 * duas combinações lado a lado no jogo.
 */
async function bodyHeights(stripPath: string, def: HeroSpriteDef): Promise<number[]> {
  const { data, info } = await sharp(stripPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, channels: C } = info
  const out: number[] = []
  for (let f = 0; f < def.frames; f++) {
    const x0 = f * def.frameW + Math.round(def.frameW * 0.34)
    const x1 = f * def.frameW + Math.round(def.frameW * 0.66)
    let topY = def.frameH
    for (let y = 0; y < def.frameH; y++) {
      let n = 0
      for (let x = x0; x < x1; x++) if (data[(y * W + x) * C + 3] > 16) n++
      if (n >= 6) { topY = y; break } // ≥6px de largura = corpo, não haste
    }
    out.push(def.frameH - topY)
  }
  return out
}

async function reviewOne(slug: string, def: HeroSpriteDef): Promise<boolean> {
  const stripPath = resolve(join('public', def.src.replace(/^\//, '')))
  if (!existsSync(stripPath)) {
    console.error(`   ❌ tira não encontrada: ${stripPath}`)
    return false
  }

  const h = Math.round(HERO_SPRITE_SCREEN_H * ZOOM)
  const w = Math.round(h * (def.frameW / def.frameH))
  const rows = rowsOf(def)
  const cols = Math.max(...rows.map(r => r.frames.length))
  const bandH = TITLE_H + h + INDEX_H
  const totalW = Math.max(PAD + cols * (w + PAD), 260)
  const totalH = PAD + rows.length * bandH

  const composites: OverlayOptions[] = []
  const labels: string[] = []

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const bandTop = PAD + r * bandH
    const top = bandTop + TITLE_H
    labels.push(
      `<text x="4" y="${bandTop + 15}" font-family="monospace" font-size="13" fill="#e8c37a">${row.label}</text>`
    )
    for (let c = 0; c < row.frames.length; c++) {
      const idx = row.frames[c]
      if (idx < 0 || idx >= def.frames) {
        console.error(`   ❌ índice ${idx} fora da tira (${def.frames} frames)`)
        return false
      }
      let cell = sharp(stripPath)
        .extract({ left: idx * def.frameW, top: 0, width: def.frameW, height: def.frameH })
        .resize(w, h)
      if (row.flip) cell = cell.flop()
      composites.push({ input: await cell.png().toBuffer(), left: PAD + c * (w + PAD), top })
      labels.push(
        `<text x="${PAD + c * (w + PAD) + w / 2}" y="${top + h + 15}" font-family="monospace" ` +
          `font-size="12" fill="#7c8899" text-anchor="middle">[${idx}]</text>`
      )
    }
  }

  composites.push({
    input: Buffer.from(
      `<svg width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">${labels.join('')}</svg>`
    ),
    left: 0,
    top: 0,
  })

  const outDir = resolve(join('public', 'sprites', slug))
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, '_review.png')
  await sharp({ create: { width: totalW, height: totalH, channels: 4, background: BG } })
    .composite(composites)
    .png()
    .toFile(out)

  const backCount = def.back === undefined ? 0 : Array.isArray(def.back) ? def.back.length : 1
  console.log(
    `   ✓ _review.png — ciclo ${def.walk.length} frame(s), costas ${backCount}, ` +
      `${def.fps} fps, folha olhando pra ${def.facing === 'right' ? 'direita' : 'esquerda'}`
  )
  if (def.walk.length < 2) {
    console.log(`   ⚠️  ciclo de UM frame só: o boneco anda sem mexer as pernas`)
  }

  // Altura só dos frames que a cena realmente usa — frame morto na tira não
  // conta pro tamanho aparente.
  const heights = await bodyHeights(stripPath, def)
  const used = [...def.walk, ...(def.back === undefined ? [] : Array.isArray(def.back) ? def.back : [def.back])]
  const usedH = used.map(i => heights[i])
  const lo = Math.min(...usedH)
  const hi = Math.max(...usedH)
  if ((hi - lo) / hi > 0.08) {
    console.log(`   ⚠️  o boneco muda de tamanho dentro da própria folha (${lo}–${hi}px de ${def.frameH})`)
  }
  bodySizes.set(slug, Math.round(usedH.reduce((a, b) => a + b, 0) / usedH.length))
  return true
}

/** Altura média do corpo por combinação — comparada entre todas no fim. */
const bodySizes = new Map<string, number>()

async function main() {
  const entries = Object.entries(HERO_SPRITES).filter(([slug]) => !ONLY || slug === ONLY)
  if (!entries.length) {
    console.error(ONLY ? `❌ '${ONLY}' não está em HERO_SPRITES` : '❌ HERO_SPRITES vazio')
    process.exit(1)
  }

  console.log(`🔍 ${entries.length} combinação(ões) — zoom ${ZOOM}x (tela real: ${HERO_SPRITE_SCREEN_H}px)`)
  let failed = 0
  for (const [slug, def] of entries) {
    console.log(`\n🧝 ${slug}`)
    if (!(await reviewOne(slug, def))) failed++
  }

  // A cena desenha toda célula com HERO_SPRITE_SCREEN_H, então quem preenche
  // menos a célula aparece menor que os outros — e isso só se nota comparando
  // duas combinações. Aqui a comparação é explícita.
  if (bodySizes.size > 1) {
    const entries = Array.from(bodySizes)
    const vals = entries.map(([, v]) => v).sort((a, b) => a - b)
    const median = vals[Math.floor(vals.length / 2)]
    const off = entries
      .filter(([, v]) => Math.abs(v - median) / median > 0.06)
      .sort((a, b) => a[1] - b[1])
    if (off.length) {
      console.log(`\n📏 tamanho aparente fora do conjunto (mediana ${median}px):`)
      for (const [slug, v] of off) {
        const pct = Math.round(((v - median) / median) * 100)
        console.log(`   ${slug.padEnd(20)} ${v}px  ${pct > 0 ? '+' : ''}${pct}% — ` +
          `adereço alto (cajado/lança) esticou a bbox e encolheu o boneco no recorte`)
      }
    }
  }

  console.log(`\n📁 abra public/sprites/<slug>/_review.png`)
  console.log(`   Todo frame de "ANDANDO" tem que ser PERFIL. Costas ou frente no meio`)
  console.log(`   do ciclo = folha pra refazer (scripts/hero-sprite-sheet-prompt.md).`)
  if (failed) {
    console.log(`\n⚠️  ${failed} combinação(ões) com erro.`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ falhou:', err)
  process.exit(1)
})
