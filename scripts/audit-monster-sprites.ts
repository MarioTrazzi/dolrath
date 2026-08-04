// Auditoria de RESÍDUO DE FUNDO nas tiras de monstro já recortadas.
//
// O recorte (slice-hero-sprite-sheet.ts) tira o fundo CONECTADO à borda. O que
// sobra, e que este script mede, são duas coisas que o flood fill não alcança:
//
//   ILHA   — pedaço de alpha solto, desgrudado do bicho. Vem do corte em grade:
//            a célula pega um naco do quadro vizinho (barra do braço do golem,
//            aba do manto do lich, cabeça da linha de baixo na hidra). Além de
//            aparecer em cena, INFLA o bbox — e como a escala da linha sai de
//            `maxH`, um caco alto encolhe todos os frames da folha.
//
//   CHÃO   — sombra, poeira, lama, poça, pedra ou cristal PINTADOS sob o bicho.
//            Está colado na silhueta, então não é ilha; e não é a cor do fundo,
//            então o flood fill passa longe dele.
//
// A saída é número + máscara. O número escolhe o limiar (não dá pra calibrar
// `killIslands`/`killShadow` no olho: "caco" e "chama do lich" são os dois ilhas);
// a máscara `_audit.png` é a conferência a olho, com ilha em VERMELHO e candidato
// a chão em CIANO.
//
// Uso:
//   npx tsx scripts/audit-monster-sprites.ts                 # as 20, só a tabela
//   npx tsx scripts/audit-monster-sprites.ts --mask          # + _audit.png
//   npx tsx scripts/audit-monster-sprites.ts --monster wyrm-cristalino --mask
//   npx tsx scripts/audit-monster-sprites.ts --frames        # linha por frame
//
// Saída: public/sprites/monsters/<slug>/_audit.png (gitignored, como _contact.png)

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

import sharp from 'sharp'

import { MONSTER_SPRITES } from '../src/lib/monsterSprites'
import { type Raw } from './lib/spriteSheet'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const ONLY = (valOf('--monster') || '').trim().toLowerCase()
const MASK = has('--mask')
const PER_FRAME = has('--frames')

const ROOT = resolve('public', 'sprites', 'monsters')

/**
 * Cor de fundo das folhas do Gemini: cinza NEUTRO ~130. Medido nas 20 folhas
 * cruas (`detectBackground`): 130..133 em todos os canais, nas quatro levas.
 *
 * A tira recortada não guarda essa cor — o fundo já virou alpha 0 —, e reler a
 * folha crua obrigaria `sprite-sources/` (gitignored) a existir só pra auditar.
 * Como o valor é estável, ele entra como constante e o que se mede é a RELAÇÃO
 * com ele (ângulo de cor e razão de luminância), não a distância absoluta.
 */
const BG: [number, number, number] = [131, 131, 131]

/**
 * Candidato a chão pintado: LUMINÂNCIA, não cromaticidade.
 *
 * O `killGroundShadow` (usado nos objetos de nó) separa sombra do objeto por
 * ÂNGULO DE COR contra o fundo — a sombra é o fundo multiplicado. Lá funciona
 * porque o fundo da folha do baú é esverdeado. Aqui NÃO funciona: o fundo é
 * cinza NEUTRO, e ângulo contra cinza neutro é ~0 para qualquer coisa
 * dessaturada — que é metade do bestiário (lobo, espectro, esqueleto, golem).
 * Medido com ângulo ≤12°: a passada marcava 32% do corpo da bruxa e 36% do
 * espectro, dois sprites LIMPOS. O teste não carrega informação nenhuma.
 *
 * O que separa chão de corpo nesta arte é o CONTORNO: o pixel art vem com uma
 * borda escura fechada em volta da silhueta, e o chão pintado não tem contorno.
 * Então o critério é uma janela de luminância — o chão é claro (0.5..1.0 do
 * fundo), o contorno é escuro (abaixo de 0.5) e barra o alastramento.
 */
const AUDIT_MIN_LUM = 0.5
const AUDIT_MAX_LUM = 1.0
/** Faixa de baixo do frame onde chão pintado mora, como fração da altura. */
const AUDIT_BAND = 0.4
/**
 * Ilha menor que isto é POEIRA — respingo de 1-2px, quase sempre partícula
 * pintada em volta do pé ou sujeira do anti-aliasing. Conta separado porque o
 * limiar que a mata é outro (qualquer um serve) e porque misturar as duas
 * contagens esconde o caco de verdade no meio de 2000 pontinhos.
 */
const DUST_MAX_AREA = 16

interface Island {
  area: number
  frac: number
  x0: number
  y0: number
  x1: number
  y1: number
}

interface FrameReport {
  index: number
  bodyArea: number
  islands: Island[]
  groundArea: number
  groundFrac: number
}

/** Componentes 4-conectados de alpha > 0 dentro de um frame. */
function components(raw: Raw, fx0: number, fx1: number): number[][] {
  const { data, width, height } = raw
  const seen = new Uint8Array((fx1 - fx0) * height)
  const w = fx1 - fx0
  const out: number[][] = []
  const idx = (x: number, y: number) => y * w + (x - fx0)

  for (let y = 0; y < height; y++) {
    for (let x = fx0; x < fx1; x++) {
      if (seen[idx(x, y)]) continue
      if (data[(y * width + x) * 4 + 3] === 0) {
        seen[idx(x, y)] = 1
        continue
      }
      const comp: number[] = []
      const stack = [(y << 16) | x]
      seen[idx(x, y)] = 1
      while (stack.length) {
        const p = stack.pop() as number
        const px = p & 0xffff
        const py = p >> 16
        comp.push(py * width + px)
        const push = (nx: number, ny: number) => {
          if (nx < fx0 || nx >= fx1 || ny < 0 || ny >= height) return
          if (seen[idx(nx, ny)]) return
          seen[idx(nx, ny)] = 1
          if (data[(ny * width + nx) * 4 + 3] === 0) return
          stack.push((ny << 16) | nx)
        }
        push(px - 1, py)
        push(px + 1, py)
        push(px, py - 1)
        push(px, py + 1)
      }
      out.push(comp)
    }
  }
  return out.sort((a, b) => b.length - a.length)
}

const bgLen = Math.hypot(BG[0], BG[1], BG[2])

function groundScore(data: Buffer, p: number): boolean {
  const i = p * 4
  if (data[i + 3] === 0) return false
  const len = Math.hypot(data[i], data[i + 1], data[i + 2])
  if (len === 0) return false
  const lum = len / bgLen
  return lum >= AUDIT_MIN_LUM && lum <= AUDIT_MAX_LUM
}

/**
 * Chão pintado alcançável a partir do TRANSPARENTE — mesma semeadura do
 * `killGroundShadow`. É o que separa a sombra sob a pata (encostada no vazio)
 * do cinza interno da armadura (cercado por contorno escuro).
 */
function groundPixels(raw: Raw, fx0: number, fx1: number): number[] {
  const { data, width, height } = raw
  const bandY = Math.floor(height * (1 - AUDIT_BAND))
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const tryPush = (x: number, y: number) => {
    if (x < fx0 || x >= fx1 || y < bandY || y >= height) return
    const p = y * width + x
    if (seen[p]) return
    seen[p] = 1
    if (!groundScore(data, p)) return
    stack.push(p)
  }

  for (let y = bandY; y < height; y++) {
    for (let x = fx0; x < fx1; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) continue
      tryPush(x - 1, y)
      tryPush(x + 1, y)
      tryPush(x, y - 1)
      tryPush(x, y + 1)
    }
  }

  const out: number[] = []
  while (stack.length) {
    const p = stack.pop() as number
    out.push(p)
    const x = p % width
    const y = (p - x) / width
    tryPush(x - 1, y)
    tryPush(x + 1, y)
    tryPush(x, y - 1)
    tryPush(x, y + 1)
  }
  return out
}

async function auditOne(slug: string): Promise<FrameReport[] | null> {
  const dir = join(ROOT, slug)
  const metaPath = join(dir, 'meta.json')
  const stripPath = join(dir, 'walk.webp')
  if (!existsSync(metaPath) || !existsSync(stripPath)) return null
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { frameW: number; frames: number }

  const { data, info } = await sharp(stripPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const raw: Raw = { data, width: info.width, height: info.height }

  const reports: FrameReport[] = []
  const marks: Array<{ p: number; kind: 'island' | 'ground' }> = []

  for (let f = 0; f < meta.frames; f++) {
    const fx0 = f * meta.frameW
    const fx1 = Math.min(fx0 + meta.frameW, raw.width)
    const comps = components(raw, fx0, fx1)
    const bodyArea = comps[0]?.length ?? 0
    const islands: Island[] = comps.slice(1).map((comp) => {
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const p of comp) {
        const x = p % raw.width
        const y = (p - x) / raw.width
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
      return { area: comp.length, frac: bodyArea ? comp.length / bodyArea : 0, x0: x0 - fx0, y0, x1: x1 - fx0, y1 }
    })

    const ground = groundPixels(raw, fx0, fx1)
    reports.push({
      index: f,
      bodyArea,
      islands,
      groundArea: ground.length,
      groundFrac: bodyArea ? ground.length / bodyArea : 0,
    })

    if (MASK) {
      for (const comp of comps.slice(1)) for (const p of comp) marks.push({ p, kind: 'island' })
      for (const p of ground) marks.push({ p, kind: 'ground' })
    }
  }

  if (MASK) {
    // Fundo escuro (o cinza do fundo original leria como resíduo) + marcação.
    const out = Buffer.alloc(raw.width * raw.height * 4)
    for (let p = 0; p < raw.width * raw.height; p++) {
      const i = p * 4
      if (data[i + 3] === 0) {
        out[i] = 26
        out[i + 1] = 20
        out[i + 2] = 16
      } else {
        out[i] = data[i]
        out[i + 1] = data[i + 1]
        out[i + 2] = data[i + 2]
      }
      out[i + 3] = 255
    }
    for (const m of marks) {
      const i = m.p * 4
      if (m.kind === 'island') {
        out[i] = 255
        out[i + 1] = 40
        out[i + 2] = 40
      } else {
        out[i] = 40
        out[i + 1] = 240
        out[i + 2] = 255
      }
    }
    await sharp(out, { raw: { width: raw.width, height: raw.height, channels: 4 } })
      .png()
      .toFile(join(dir, '_audit.png'))
  }

  return reports
}

async function main() {
  const slugs = readdirSync(ROOT)
    .filter((s) => !s.startsWith('.') && !s.startsWith('_'))
    .filter((s) => !ONLY || s === ONLY)
    .sort()

  if (!slugs.length) {
    console.error(`❌ nada em ${ROOT}${ONLY ? ` para --monster ${ONLY}` : ''}`)
    process.exit(1)
  }

  console.log('slug                      frames  cacos  poeira  maior%  chão%   frames sujos')
  console.log('─'.repeat(86))

  for (const slug of slugs) {
    const reports = await auditOne(slug)
    if (!reports) {
      console.log(`${slug.padEnd(25)} — sem walk.webp/meta.json`)
      continue
    }
    const chunks = reports.flatMap((r) => r.islands.filter((i) => i.area > DUST_MAX_AREA))
    const dust = reports.reduce((n, r) => n + r.islands.filter((i) => i.area <= DUST_MAX_AREA).length, 0)
    const biggest = Math.max(0, ...chunks.map((i) => i.frac))
    const groundPct = reports.reduce((n, r) => n + r.groundFrac, 0) / reports.length
    const dirty = reports
      .filter((r) => r.islands.some((i) => i.area > DUST_MAX_AREA) || r.groundFrac > 0.02)
      .map((r) => r.index)
    console.log(
      `${slug.padEnd(25)} ${String(reports.length).padStart(3)}  ${String(chunks.length).padStart(5)}  ` +
        `${String(dust).padStart(6)}  ${(biggest * 100).toFixed(1).padStart(6)}  ` +
        `${(groundPct * 100).toFixed(1).padStart(5)}    ${dirty.join(',') || '—'}`,
    )

    if (PER_FRAME) {
      for (const r of reports) {
        const big = r.islands.filter((i) => i.area > DUST_MAX_AREA)
        if (!big.length && r.groundFrac <= 0.02) continue
        const isl = big
          .map((i) => `${(i.frac * 100).toFixed(1)}%(${i.area}px)@${i.x0},${i.y0}-${i.x1},${i.y1}`)
          .join(' ')
        console.log(
          `    [${String(r.index).padStart(2)}] corpo=${r.bodyArea}  chão=${(r.groundFrac * 100).toFixed(1)}%  ${isl}`,
        )
      }
    }
  }

  if (MASK) console.log('\n🖼️  máscaras em public/sprites/monsters/<slug>/_audit.png (ilha=vermelho, chão=ciano)')

  // Manifesto × disco. Os ciclos `walk`/`front`/`back` são índices escritos na
  // mão, e `frameW`/`frames` têm de bater com o que o recorte gerou: um índice
  // além do fim vira `drawImage` fora da tira (frame em branco) e um `frameW`
  // errado desloca TODOS os frames. Foi exatamente o que aconteceu quando a
  // folha do golem passou de 12 pra 14 quadros.
  const problems: string[] = []
  for (const slug of slugs) {
    const def = MONSTER_SPRITES[slug]
    if (!def) {
      problems.push(`${slug}: tem folha em /public mas NÃO está em MONSTER_SPRITES (a cena cai no vulto)`)
      continue
    }
    const metaPath = join(ROOT, slug, 'meta.json')
    if (!existsSync(metaPath)) continue
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { frameW: number; frames: number }
    if (def.frameW !== meta.frameW) problems.push(`${slug}: frameW ${def.frameW} no manifesto, ${meta.frameW} no disco`)
    if (def.frames !== meta.frames) problems.push(`${slug}: frames ${def.frames} no manifesto, ${meta.frames} no disco`)
    for (const [name, cycle] of [
      ['walk', def.walk],
      ['front', def.front],
      ['back', def.back],
    ] as const) {
      for (const i of cycle ?? []) {
        if (i < 0 || i >= meta.frames) problems.push(`${slug}: ${name} aponta pro frame [${i}], fora de 0..${meta.frames - 1}`)
      }
    }
  }
  console.log(
    problems.length
      ? `\n❌ manifesto fora de sincronia:\n   ${problems.join('\n   ')}`
      : '\n✅ manifesto bate com o disco (frameW, frames e todos os ciclos).',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
