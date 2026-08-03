// 🗺️ Importa o tileset vetorial da CraftPix para a cena explorável.
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
// do motor, aparar a caixa de alpha, redimensionar e GRADUAR a cor para o tom
// do bioma.
//
// A graduação é o que faz um pack servir dois lugares. A Floresta usa o
// `game_background_4` quase como veio (só fecha o tom). A Caverna usa o
// `game_background_2`, que é uma MINA marrom-terra: dessaturar quase a zero e
// tingir de ardósia azulada entrega a rocha; os cristais escapam do banho
// (`grade` própria) porque são justamente a cor que a masmorra tem de ter.
//
// Uso:
//   npm run art:scene:import -- --dry-run
//   npm run art:scene:import -- --biome caverna --force
//   npm run art:scene:import -- --darken 0.82 --force

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

/** Ajuste de cor de uma peça. Aplicado como modulate() e depois tint(). */
interface Grade {
  /** <1 escurece. */
  brightness?: number
  /** <1 desbota, >1 satura. */
  saturation?: number
  /** Rotação de matiz em graus — é o que vira laranja em roxo. */
  hue?: number
  /**
   * Tinge preservando a luminância (LAB): dá a cor da rocha sem achatar o
   * relevo pintado. Só faz sentido depois de dessaturar.
   */
  tint?: string
}

interface Piece {
  /** Nome do arquivo na pasta `layers` do pack, sem extensão. */
  from: string
  /** Nome que o motor procura: `<kind>-<variante>`. */
  to: string
  /**
   * Peças que NÃO podem ser aparadas nem redimensionadas por lado:
   *  - chão (`ground`): textura em ladrilho.
   *  - trilha (`road`): segmento RETO desenhado repetido ao longo do caminho.
   *    Aparar comeria as bordas onduladas que fazem a emenda entre repetições.
   */
  raw?: boolean
  /** Sobrepõe a graduação do bioma nesta peça. */
  grade?: Grade
}

interface BiomeImport {
  /** Subpasta do pack (`PNG/<pack>/layers`). */
  pack: string
  grade: Grade
  pieces: Piece[]
}

const BIOME_IMPORT: Record<string, BiomeImport> = {
  // 🌲 Floresta Sombria — o pack já é uma clareira de mata; só fecha o tom.
  floresta: {
    pack: 'game_background_4',
    grade: { brightness: 0.86, saturation: 0.92 },
    pieces: [
      { from: 'tree_1', to: 'tree-1' },
      { from: 'tree_2', to: 'tree-2' },
      { from: 'tree_3', to: 'tree-3' },
      { from: 'tree_4', to: 'tree-4' },
      { from: 'bush_1', to: 'bush-1' },
      { from: 'bush_2', to: 'bush-2' },
      { from: 'bush_3', to: 'bush-3' },
      { from: 'bush_4', to: 'bush-4' },
      { from: 'bush_5', to: 'bush-5' },
      { from: 'stone_1', to: 'rock-1' },
      { from: 'stone_2', to: 'rock-2' },
      { from: 'stone_3', to: 'rock-3' },
      { from: 'stone_4', to: 'rock-4' },
      { from: 'stone_5', to: 'rock-5' },
      // ⚠️ decor_1 é a CASINHA do mapa original, não um toco. Entra como MARCO:
      // o gerador coloca uma por mapa, encostada na borda de uma clareira, e poda
      // a vegetação em volta — não é espalhada como vegetação.
      { from: 'decor_1', to: 'house-1' },
      { from: 'decor_2', to: 'stump-1' },
      // Poça de água esverdeada espalhada pelas clareiras. Uma peça só: a variação
      // vem do espelhamento e do jitter de escala no motor.
      { from: 'dot', to: 'puddle-1' },
      { from: 'land', to: 'ground', raw: true },
      { from: 'road_5', to: 'road', raw: true },
    ],
  },

  // 💎 Caverna de Cristal — o pack é uma MINA marrom (vagonete, trilhos, arco
  // de entrada, veios de cristal). O papel de cada peça muda junto com a cor:
  // quem fecha o corredor aqui é PAREDÃO DE ROCHA, não árvore.
  caverna: {
    pack: 'game_background_2',
    // Quase sem cor própria + ardósia azulada = a rocha de
    // public/backgrounds/caverna-battle.webp.
    grade: { saturation: 0.12, brightness: 0.72, tint: '#7d93ad' },
    pieces: [
      // `tree` = a massa que fecha a galeria. São as bordas de despenhadeiro do
      // mapa original, que de cima lêem como veio/paredão de rocha.
      { from: 'decor_5', to: 'tree-1' },
      { from: 'decor_1', to: 'tree-2' },
      { from: 'decor_8', to: 'tree-3' },
      { from: 'decor_9', to: 'tree-4' },
      // `bush` = aglomerado de cristal. ESCAPA do banho de ardósia: é o único
      // ponto de cor da masmorra, e o par ciano+roxo é o da arte de batalha.
      // O pack só tem ciano e LARANJA — 250° de matiz levam o laranja ao roxo.
      { from: 'decor_3', to: 'bush-1', grade: { saturation: 1.25, brightness: 1.05, hue: -10 } },
      { from: 'decor_4', to: 'bush-2', grade: { saturation: 1.2, brightness: 1.0, hue: 250 } },
      { from: 'stone_1', to: 'rock-1' },
      { from: 'stone_2', to: 'rock-2' },
      { from: 'stone_3', to: 'rock-3' },
      { from: 'stone_4', to: 'rock-4' },
      { from: 'stone_5', to: 'rock-5' },
      // Marco: o arco de entrada da mina, alvenaria em plena galeria.
      { from: 'decor_7', to: 'house-1' },
      // Solto no meio da câmara: o vagonete de minério abandonado.
      { from: 'decor_2', to: 'stump-1' },
      // Poça: no pack é terra revirada; em ardósia vira água parada escura.
      { from: 'dot', to: 'puddle-1' },
      { from: 'land', to: 'ground', raw: true },
      { from: 'road_5', to: 'road', raw: true },
    ],
  },
}

const DRY = has('--dry-run')
const FORCE = has('--force')
const BIOME = valOf('--biome') || 'floresta'
const MAX_SIDE = Number(valOf('--max') || 512)

const RECIPE = BIOME_IMPORT[BIOME]
if (!RECIPE) {
  console.error(`❌ bioma sem receita de import: ${BIOME}`)
  console.error(`   conhecidos: ${Object.keys(BIOME_IMPORT).join(', ')}`)
  process.exit(1)
}

/** `--darken`/`--saturation` seguem podendo calibrar o bioma pela linha de comando. */
const BASE_GRADE: Grade = {
  ...RECIPE.grade,
  ...(valOf('--darken') ? { brightness: Number(valOf('--darken')) } : {}),
  ...(valOf('--saturation') ? { saturation: Number(valOf('--saturation')) } : {}),
}

const SRC =
  valOf('--src') ||
  join(
    homedir(),
    'Downloads',
    'craftpix-net-305231-free-tower-defense-2d-vector-tileset',
    'PNG',
    RECIPE.pack,
    'layers',
  )

const OUT = join('public', 'scene', BIOME)

async function convert(srcFile: string, outFile: string, piece: Piece) {
  let img = sharp(srcFile).ensureAlpha()

  if (!piece.raw) {
    // Apara a moldura vazia: o motor ancora o sprite pelo "pé", então margem
    // embaixo faria o objeto flutuar acima do chão.
    img = img.trim({ threshold: 1 })
  }

  const grade = piece.grade ?? BASE_GRADE
  // Monta as chaves uma a uma: `modulate` do sharp REJEITA `undefined` explícito
  // ("Expected number for hue but received undefined").
  const mod: Record<string, number> = {}
  if (grade.brightness !== undefined) mod.brightness = grade.brightness
  if (grade.saturation !== undefined) mod.saturation = grade.saturation
  if (grade.hue !== undefined) mod.hue = grade.hue
  img = img.modulate(mod)
  if (grade.tint) img = img.tint(grade.tint)

  const buf = await img
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

  console.log(`🗺️  CraftPix ${RECIPE.pack} → ${OUT}`)
  console.log(
    `   brilho=${BASE_GRADE.brightness ?? 1} saturação=${BASE_GRADE.saturation ?? 1}` +
      `${BASE_GRADE.tint ? ` tint=${BASE_GRADE.tint}` : ''} max=${MAX_SIDE}px dry=${DRY}\n`,
  )

  let done = 0
  for (const piece of RECIPE.pieces) {
    const srcFile = join(SRC, `${piece.from}.png`)
    const outFile = join(OUT, `${piece.to}.webp`)
    if (!existsSync(srcFile)) {
      console.warn(`⚠️  faltando no pack: ${piece.from}.png`)
      continue
    }
    if (existsSync(outFile) && !FORCE) {
      console.log(`⏭️  ${piece.to}.webp já existe (use --force)`)
      continue
    }
    const r = await convert(srcFile, outFile, piece)
    const mark = piece.grade ? ' 🎨' : ''
    console.log(
      `✅ ${piece.from}.png → ${piece.to}.webp  ${r.w}×${r.h}  ${(r.bytes / 1024).toFixed(0)} KB${mark}`,
    )
    done++
  }

  // Guarda a licença junto da arte: quem abrir a pasta daqui a um ano precisa
  // saber de onde veio e o que pode fazer.
  const noteFile = join(OUT, 'SOURCE.txt')
  if (!DRY && !existsSync(noteFile)) {
    writeFileSync(
      noteFile,
      [
        'Arte de cenário: CraftPix "Free Tower Defense 2D Vector Tileset" (#305231),',
        `${RECIPE.pack}/layers — importada por scripts/import-craftpix-scene.ts.`,
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
