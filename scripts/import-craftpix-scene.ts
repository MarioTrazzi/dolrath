// 🌲 Importa o tileset vetorial da CraftPix para a cena explorável.
//
// LICENÇA (https://craftpix.net/file-licenses/ — assets grátis):
//   ✅ uso comercial, inclusive em projeto de cliente
//   ✅ modificar (recolorir/redimensionar é exatamente o previsto)
//   ✅ sem atribuição obrigatória
//   ✅ NADA proibindo blockchain / NFT / Web3 (ao contrário da licença padrão
//      do itch.io, que proíbe explicitamente)
//   ❌ revender os arquivos de arte, ou redistribuí-los de forma que outro
//      usuário final possa reaproveitá-los → NUNCA colocar esta arte DENTRO da
//      imagem de uma NFT; ela é cenário do jogo, não item negociável
//   ❌ usar para treinar/testar IA → por isso este import é 100% determinístico
//      (sharp), sem passar nada disso por modelo de imagem
//
// O pack traz as peças já recortadas, então aqui é só: renomear para o padrão
// do motor, aparar a caixa de alpha, redimensionar e escurecer para o tom da
// Floresta Sombria.
//
// Uso:
//   npm run art:scene:import -- --dry-run
//   npm run art:scene:import -- --darken 0.82 --force

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

const DRY = has('--dry-run')
const FORCE = has('--force')
const BIOME = valOf('--biome') || 'floresta'
/** <1 escurece. O pack é oliva médio; a Floresta Sombria pede tom mais fechado. */
const DARKEN = Number(valOf('--darken') || 0.86)
const SATURATION = Number(valOf('--saturation') || 0.92)
const MAX_SIDE = Number(valOf('--max') || 512)

const SRC =
  valOf('--src') ||
  join(
    homedir(),
    'Downloads',
    'craftpix-net-305231-free-tower-defense-2d-vector-tileset',
    'PNG',
    'game_background_4',
    'layers',
  )

const OUT = join('public', 'scene', BIOME)

/** origem no pack → nome que o motor procura (kind-variante). */
const MAP: Array<[string, string]> = [
  ['tree_1', 'tree-1'],
  ['tree_2', 'tree-2'],
  ['tree_3', 'tree-3'],
  ['tree_4', 'tree-4'],
  ['bush_1', 'bush-1'],
  ['bush_2', 'bush-2'],
  ['bush_3', 'bush-3'],
  ['bush_4', 'bush-4'],
  ['bush_5', 'bush-5'],
  ['stone_1', 'rock-1'],
  ['stone_2', 'rock-2'],
  ['stone_3', 'rock-3'],
  ['stone_4', 'rock-4'],
  ['stone_5', 'rock-5'],
  // ⚠️ decor_1 é a CASINHA do mapa original, não um toco. Entra como MARCO:
  // o gerador coloca uma por mapa, encostada na borda de uma clareira, e poda
  // a vegetação em volta — não é espalhada como vegetação.
  ['decor_1', 'house-1'],
  ['decor_2', 'stump-1'],
  // Poça de água esverdeada espalhada pelas clareiras. Uma peça só: a variação
  // vem do espelhamento e do jitter de escala no motor.
  ['dot', 'puddle-1'],
]

/**
 * Peças que NÃO podem ser aparadas nem redimensionadas por lado:
 *  - `land`: textura de chão em ladrilho.
 *  - `road_5`: segmento RETO de trilha, desenhado repetido ao longo do caminho.
 *    Aparar comeria as bordas onduladas que fazem a emenda entre repetições.
 */
const RAW: Array<[string, string]> = [
  ['land', 'ground'],
  ['road_5', 'road'],
]

async function convert(srcFile: string, outFile: string, trim: boolean) {
  let img = sharp(srcFile).ensureAlpha()

  if (trim) {
    // Apara a moldura vazia: o motor ancora o sprite pelo "pé", então margem
    // embaixo faria o objeto flutuar acima do chão.
    img = img.trim({ threshold: 1 })
  }

  const buf = await img
    .modulate({ brightness: DARKEN, saturation: SATURATION })
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 95, effort: 6 })
    .toBuffer()

  if (!DRY) await sharp(buf).toFile(outFile)
  const meta = await sharp(buf).metadata()
  return { bytes: buf.length, w: meta.width, h: meta.height }
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`❌ pack não encontrado em:\n   ${SRC}\n   use --src <pasta layers>`)
    process.exit(1)
  }
  if (!DRY) mkdirSync(OUT, { recursive: true })

  console.log(`🌲 CraftPix → ${OUT}`)
  console.log(`   brilho=${DARKEN} saturação=${SATURATION} max=${MAX_SIDE}px dry=${DRY}\n`)

  let done = 0
  for (const [from, to] of [...MAP, ...RAW]) {
    const srcFile = join(SRC, `${from}.png`)
    const outFile = join(OUT, `${to}.webp`)
    if (!existsSync(srcFile)) {
      console.warn(`⚠️  faltando no pack: ${from}.png`)
      continue
    }
    if (existsSync(outFile) && !FORCE) {
      console.log(`⏭️  ${to}.webp já existe (use --force)`)
      continue
    }
    const trim = !RAW.some(([, name]) => name === to)
    const r = await convert(srcFile, outFile, trim)
    console.log(`✅ ${from}.png → ${to}.webp  ${r.w}×${r.h}  ${(r.bytes / 1024).toFixed(0)} KB`)
    done++
  }

  // Guarda a licença junto da arte: quem abrir a pasta daqui a um ano precisa
  // saber de onde veio e o que pode fazer.
  const noteFile = join(OUT, 'SOURCE.txt')
  if (!DRY && !existsSync(noteFile)) {
    const { writeFileSync } = require('fs') as typeof import('fs')
    writeFileSync(
      noteFile,
      [
        'Arte de cenário: CraftPix "Free Tower Defense 2D Vector Tileset" (#305231),',
        'game_background_4/layers — importada por scripts/import-craftpix-scene.ts.',
        '',
        'Licença: https://craftpix.net/file-licenses/ (assets grátis)',
        '  PERMITE uso comercial, modificação, sem atribuição obrigatória.',
        '  NÃO restringe blockchain/NFT/Web3.',
        '  PROÍBE revender/redistribuir os arquivos de arte — logo esta arte',
        '  NUNCA pode compor a imagem de uma NFT; é cenário do jogo.',
        '  PROÍBE uso para treinar/testar IA — não alimentar modelo de imagem.',
        '',
      ].join('\n'),
    )
  }

  console.log(`\nDone. ${done} arquivo(s).`)
  if (!DRY) console.log(`Procedência e licença anotadas em ${noteFile}`)
}

main().catch(err => {
  console.error('❌', err)
  process.exit(1)
})
