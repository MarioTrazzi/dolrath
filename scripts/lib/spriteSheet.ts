// ============================================================
// Recorte de folha de sprite — operações puras sobre buffer RGBA.
//
// Nasceu dentro de scripts/slice-hero-sprite-sheet.ts e saiu daqui quando o
// recorte dos OBJETOS DE NÓ (baú, erva, fonte) passou a precisar da mesma
// maquinaria: as folhas vêm do mesmo lugar (Gemini, fundo chapado, sem alpha) e
// o problema é o mesmo — separar o objeto do fundo e achar os quadros.
//
// Nada aqui lê `process.argv` nem escreve arquivo: é só buffer entrando e
// buffer saindo. Quem decide política (tolerância, tamanho de célula, quais
// quadros guardar) é o script que chama.
// ============================================================

export interface Raw {
  data: Buffer
  width: number
  height: number
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type Rgb = [number, number, number]

export const at = (raw: Raw, x: number, y: number) => (y * raw.width + x) * 4
export const alphaAt = (raw: Raw, x: number, y: number) => raw.data[at(raw, x, y) + 3]

export function dist2(data: Buffer, i: number, r: number, g: number, b: number): number {
  const dr = data[i] - r
  const dg = data[i + 1] - g
  const db = data[i + 2] - b
  return dr * dr + dg * dg + db * db
}

/** Recorta um retângulo para um buffer novo — o original não é tocado. */
export function subRaw(raw: Raw, box: Box): Raw {
  const width = box.x1 - box.x0
  const height = box.y1 - box.y0
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const src = ((box.y0 + y) * raw.width + box.x0) * 4
    raw.data.copy(data, y * width * 4, src, src + width * 4)
  }
  return { data, width, height }
}

// ============================================================
// Fundo
// ============================================================

/** Cor de fundo = mediana por canal dos pixels da borda. */
export function detectBackground(raw: Raw): Rgb {
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
 * Quão CHAPADO é o fundo da moldura: fração dos pixels da borda que estão dentro
 * de `tol` da cor de fundo detectada.
 *
 * Existe porque uma folha com CENA PINTADA por baixo do objeto não é recortável
 * por flood fill — e o sintoma, sem esta medida, é um sprite feio sem explicação.
 *
 * A pergunta é exatamente a que o `removeBackground` vai fazer, então a medida
 * usa a MESMA tolerância, e não um histograma quantizado: fundo quase uniforme
 * (o da folha do baú varia rgb(104..112)) cai em dois baldes na quantização e
 * marcava 39% num fundo perfeitamente chapado.
 */
export function borderFlatness(raw: Raw, bg: Rgb, tol: number): number {
  const tol2 = tol * tol
  let hits = 0
  let total = 0
  const push = (x: number, y: number) => {
    if (dist2(raw.data, at(raw, x, y), bg[0], bg[1], bg[2]) <= tol2) hits++
    total++
  }
  for (let x = 0; x < raw.width; x++) {
    push(x, 0)
    push(x, raw.height - 1)
  }
  for (let y = 0; y < raw.height; y++) {
    push(0, y)
    push(raw.width - 1, y)
  }
  return total ? hits / total : 0
}

/**
 * Flood fill a partir das bordas: só o fundo CONECTADO vira transparente.
 * Isso preserva o cinza-marrom do capuz, que é parecido com o fundo.
 * O RGB é preservado (alpha←0 apenas) — zerar pra preto criaria franja escura no downscale.
 */
export function removeBackground(raw: Raw, bg: Rgb, tol: number): void {
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
 * Fundo PRESO: poça da cor do fundo que o flood fill da borda não alcança
 * porque a arte fecha um anel em volta dela.
 *
 * O lobo é o caso: ele vem pintado em cima de um risco de terra, e o vão entre
 * as patas fica cercado por corpo em cima, pernas dos lados e o risco embaixo.
 * O recorte saía com uma mancha clara chapada no meio do bicho.
 *
 * Só remove COMPONENTE GRANDE (>= minArea). Pixel solto da cor do fundo dentro
 * da arte é pelagem legítima, e furar isso seria pior que a poça. Por isso
 * também é opt-in por folha (`killTrappedBg` na receita): o herói não precisa,
 * e o capuz cinza-marrom dele é exatamente o tipo de coisa que não quero mexer.
 */
export function killTrappedBackground(raw: Raw, bg: Rgb, tol: number, minArea: number): number {
  const { data, width, height } = raw
  const [br, bg_, bb] = bg
  const tol2 = tol * tol
  const seen = new Uint8Array(width * height)
  let removed = 0

  const isBgColored = (p: number) => data[p * 4 + 3] !== 0 && dist2(data, p * 4, br, bg_, bb) <= tol2

  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !isBgColored(start)) continue
    // Componente 4-conectado de pixels da cor do fundo que sobreviveram.
    const comp: number[] = []
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop() as number
      comp.push(p)
      const x = p % width
      const y = (p - x) / width
      const push = (nx: number, ny: number) => {
        const q = ny * width + nx
        if (seen[q] || !isBgColored(q)) return
        seen[q] = 1
        stack.push(q)
      }
      if (x > 0) push(x - 1, y)
      if (x < width - 1) push(x + 1, y)
      if (y > 0) push(x, y - 1)
      if (y < height - 1) push(x, y + 1)
    }
    if (comp.length < minArea) continue
    for (const p of comp) data[p * 4 + 3] = 0
    removed += comp.length
  }
  return removed
}

/**
 * SOMBRA PINTADA no fundo — a elipse escura sob o baú.
 *
 * O flood fill do `removeBackground` usa distância euclidiana e não a alcança:
 * medida na folha do baú, a sombra rgb(63,60,41) está a 69 do fundo
 * rgb(109,110,68), muito além do tol de 26. Ela sobrevive colada embaixo do
 * objeto — e isso estraga duas coisas de uma vez: a cena desenha a PRÓPRIA
 * sombra elíptica (que bate com a luz do lugar), e o recorte no bbox do alpha
 * ancora o sprite pelo pé, então sombra presa faz o objeto flutuar.
 *
 * A sombra é o fundo MULTIPLICADO: mesma cromaticidade, luminância menor. Então
 * o teste certo é ângulo de cor + razão de luminância, não distância. Medido:
 *
 *   sombra rgb(63,60,41)            2.1°   lum 0.57   ← remove
 *   sombra rgb(65,63,50)            5.3°   lum 0.61   ← remove
 *   contorno escuro rgb(56,38,36)  10.9°   lum 0.45   ← barra o flood
 *   ferragem rgb(30,18,18)         13.4°   lum 0.23   ← barra o flood
 *   madeira clara rgb(209,181,141)  5.2°   lum 1.84   ← cai pela luminância
 *
 * É FLOOD a partir do que já está transparente, não teste global: a madeira
 * clara do interior do baú passa no ângulo, mas é inalcançável porque o contorno
 * preto do pixel art fecha o caminho.
 */
export function killGroundShadow(
  raw: Raw,
  bg: Rgb,
  opts: { maxAngleDeg?: number; minLum?: number; maxLum?: number } = {},
): number {
  const maxAngle = opts.maxAngleDeg ?? 7
  const minLum = opts.minLum ?? 0.2
  const maxLum = opts.maxLum ?? 0.9
  const { data, width, height } = raw
  const bgLen = Math.hypot(bg[0], bg[1], bg[2])
  if (bgLen === 0) return 0
  const minCos = Math.cos((maxAngle * Math.PI) / 180)

  const isShadow = (p: number) => {
    const i = p * 4
    if (data[i + 3] === 0) return false
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const len = Math.hypot(r, g, b)
    if (len === 0) return false
    const lum = len / bgLen
    if (lum < minLum || lum > maxLum) return false
    const cos = (r * bg[0] + g * bg[1] + b * bg[2]) / (len * bgLen)
    return cos >= minCos
  }

  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const tryPush = (x: number, y: number) => {
    const p = y * width + x
    if (seen[p]) return
    seen[p] = 1
    if (!isShadow(p)) return
    stack.push(p)
  }

  // Semeia em todo pixel transparente encostado num opaco: é a fronteira que o
  // removeBackground deixou, e é de lá que a sombra se espalha para dentro.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) continue
      if (x > 0) tryPush(x - 1, y)
      if (x < width - 1) tryPush(x + 1, y)
      if (y > 0) tryPush(x, y - 1)
      if (y < height - 1) tryPush(x, y + 1)
    }
  }

  let removed = 0
  while (stack.length) {
    const p = stack.pop() as number
    data[p * 4 + 3] = 0
    removed++
    const x = p % width
    const y = (p - x) / width
    if (x > 0) tryPush(x - 1, y)
    if (x < width - 1) tryPush(x + 1, y)
    if (y > 0) tryPush(x, y - 1)
    if (y < height - 1) tryPush(x, y + 1)
  }
  return removed
}

/**
 * CHÃO PINTADO sob o bicho — a laje cinza do wyrm, a elipse de sombra do
 * esqueleto, a lama da hidra, o risco de terra do lobo, a poça do sapo.
 *
 * Irmão do `killGroundShadow`, com OUTRO critério, e a diferença não é gosto:
 * lá o teste é ângulo de cor contra o fundo (a sombra é o fundo multiplicado),
 * o que funciona na folha do baú porque aquele fundo é esverdeado. As folhas de
 * monstro têm fundo cinza NEUTRO (medido: 130..133 nos três canais nas 20), e
 * ângulo contra cinza neutro é ~0 para qualquer coisa dessaturada — que é meio
 * bestiário. Medido com o teste de ângulo: marcava 32% do corpo da bruxa e 36%
 * do espectro, dois sprites limpos.
 *
 * O que sobra como sinal é LUMINÂNCIA + o contorno do pixel art: o chão é claro
 * (0.5..1.05 do fundo) e a silhueta vem cercada por uma borda escura que barra o
 * alastramento. Semeia no transparente e entra pelo que for claro; a borda
 * escura segura. `maxChroma` é a trava extra pra folha onde o chão é neutro e a
 * arte é quente (o osso e a espada do esqueleto).
 *
 * Não é seguro em toda folha e por isso é opt-in por receita: no espectro a
 * cauda inteira cai na janela (é um fantasma cinza-claro pairando), e ali a
 * passada fica desligada — aquela folha já estava limpa.
 *
 * `maxFrac` é o freio de mão: se a passada comeu mais que isso da área opaca da
 * moldura, ela desfaz tudo e devolve 0. É a diferença entre "tirei a sombra" e
 * "comi o bicho", e sem ela um ajuste ruim de janela some com a pose.
 *
 * Retorna quantos pixels apagou.
 */
export function killGroundPaint(
  raw: Raw,
  box: Box,
  bg: Rgb,
  opts: { minLum?: number; maxLum?: number; maxChroma?: number; band?: number; maxFrac?: number } = {},
): number {
  const minLum = opts.minLum ?? 0.5
  const maxLum = opts.maxLum ?? 1.05
  const maxChroma = opts.maxChroma ?? 255
  const band = opts.band ?? 0.25
  const maxFrac = opts.maxFrac ?? 0.25
  const { data, width } = raw
  const bgLen = Math.hypot(bg[0], bg[1], bg[2])
  if (bgLen === 0) return 0

  const h = box.y1 - box.y0
  const bandY = box.y1 - Math.round(h * band)

  const isGround = (p: number) => {
    const i = p * 4
    if (data[i + 3] === 0) return false
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > maxChroma) return false
    const lum = Math.hypot(r, g, b) / bgLen
    return lum >= minLum && lum <= maxLum
  }

  const seen = new Set<number>()
  const stack: number[] = []
  const tryPush = (x: number, y: number) => {
    if (x < box.x0 || x >= box.x1 || y < bandY || y >= box.y1) return
    const p = y * width + x
    if (seen.has(p)) return
    seen.add(p)
    if (!isGround(p)) return
    stack.push(p)
  }

  // Semeia em todo transparente da faixa: é a fronteira que o flood fill de
  // borda deixou, e é de lá que o chão entra.
  for (let y = bandY; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) continue
      tryPush(x - 1, y)
      tryPush(x + 1, y)
      tryPush(x, y - 1)
      tryPush(x, y + 1)
    }
  }

  const doomed: number[] = []
  while (stack.length) {
    const p = stack.pop() as number
    doomed.push(p)
    const x = p % width
    const y = (p - x) / width
    tryPush(x - 1, y)
    tryPush(x + 1, y)
    tryPush(x, y - 1)
    tryPush(x, y + 1)
  }
  if (!doomed.length) return 0

  let opaque = 0
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) opaque++
    }
  }
  if (opaque && doomed.length > opaque * maxFrac) return 0

  for (const p of doomed) data[p * 4 + 3] = 0
  return doomed.length
}

/**
 * Mata-halo: pixel opaco encostado em transparente e ainda parecido com o fundo
 * (tolerância mais larga) também some. Anti-aliasing do Gemini deixa 1-2px de borda cinza.
 */
export function killHalo(raw: Raw, bg: Rgb, tol: number, passes: number): void {
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

/** Altura mínima (px) pra uma banda contar como linha de frames. */
export const MIN_BAND_H = 20
/** Largura mínima (px) pra um run de colunas contar como frame. */
export const MIN_FRAME_W = 10
/**
 * Algumas folhas vêm com o nome da linha escrito em cima ("IDLE", "WALK", ...).
 * O texto é escuro, então sobrevive ao flood fill e vira uma banda própria —
 * o que empurraria a numeração das linhas. Banda muito mais baixa que a mediana
 * é rótulo, não personagem (na prática ~33px contra ~290px).
 */
export const LABEL_BAND_RATIO = 0.4

/** Runs de índices "cheios" num vetor booleano, ignorando runs curtos demais. */
export function runsOf(filled: boolean[], minLen: number): Array<[number, number]> {
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
export function findBands(raw: Raw, minBandH = MIN_BAND_H): Array<[number, number]> {
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
  return runsOf(filled, minBandH)
}

/**
 * Descarta as bandas curtas demais para serem arte — são rótulo de texto.
 * Devolve as bandas que ficaram e quantas caíram, para o log poder dizer.
 */
export function dropLabelBands(
  bands: Array<[number, number]>,
  ratio = LABEL_BAND_RATIO,
): { bands: Array<[number, number]>; dropped: number } {
  const heights = bands.map(([a, b]) => b - a).sort((x, y) => x - y)
  const medianH = heights[Math.floor(heights.length / 2)] || 0
  const kept = bands.filter(([a, b]) => b - a >= medianH * ratio)
  return { bands: kept, dropped: bands.length - kept.length }
}

/** bbox opaco exato dentro de um retângulo. */
export function tightBox(raw: Raw, x0: number, y0: number, x1: number, y1: number): Box | null {
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
export function findFrames(
  raw: Raw,
  bandY0: number,
  bandY1: number,
  minFrameW = MIN_FRAME_W,
): Box[] {
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
  for (const [x0, x1] of runsOf(filled, minFrameW)) {
    const box = tightBox(raw, x0, bandY0, x1, bandY1)
    if (box) boxes.push(box)
  }
  return boxes
}

/**
 * Frames de uma linha da GRADE forçada: divide a largura em `cols` fatias iguais
 * e pega o bbox real dentro de cada uma. Célula vazia é pulada (folha com a
 * última posição em branco não quebra a numeração das anteriores).
 */
export function gridFrames(raw: Raw, y0: number, y1: number, cols: number): Box[] {
  const out: Box[] = []
  for (let c = 0; c < cols; c++) {
    const x0 = Math.round((c * raw.width) / cols)
    const x1 = Math.round(((c + 1) * raw.width) / cols)
    const box = tightBox(raw, x0, y0, x1, y1)
    if (box) out.push(box)
  }
  return out
}

/**
 * ILHAS: pedaços de alpha soltos dentro da célula de um frame.
 *
 * Vêm de dois lugares, e os dois estragam o recorte:
 *
 *   VIZINHO — a grade forçada corta em fatias iguais e a fatia pega um naco do
 *     quadro ao lado ou de cima. Medido: no golem-de-pedra o caco do frame [4]
 *     tem 20467px, 97.5% da área do próprio golem — é meio golem vizinho dentro
 *     da célula. No lich e na múmia são abas de manto da linha de cima; na hidra,
 *     cabeças da linha de baixo.
 *   POEIRA — partícula pintada em volta do pé, respingo, caco de cenário. São
 *     centenas por folha (2547 no ent), cada uma de 1-2px.
 *
 * Além de aparecerem em cena, os dois INFLAM O BBOX, e como a escala da linha
 * sai de `maxH` (altura do frame mais alto), um caco alto encolhe TODOS os
 * frames da folha de uma vez.
 *
 * A regra que separa caco de arte destacada não é tamanho — o caco do golem é
 * maior que o corpo, e a chama do lich é minúscula. É POSIÇÃO: a folha em grade
 * desenha a pose CENTRADA na célula, então o fragmento do vizinho entra sempre
 * encostado numa borda e sem alcançar o miolo. Some quem encosta na borda E não
 * chega na banda central; some poeira; o resto fica.
 *
 * Encostar na borda sozinho NÃO basta, e a primeira versão que usou só isso
 * apagou bicho inteiro: a aranha e a hidra têm perna atravessando a linha da
 * grade, o corpo delas encosta na borda por direito, e a folha voltou com 9 de
 * 12 frames (a hidra perdeu uma linha inteira). Por isso o corpo é escolhido
 * pela banda central, não por "não encostar".
 *
 * Retorna quantos pixels apagou.
 */
export function killIslands(
  raw: Raw,
  rect: Box,
  opts: { minFrac?: number; minArea?: number; dropEdge?: boolean } = {},
): number {
  const minFrac = opts.minFrac ?? 0.01
  const minArea = opts.minArea ?? 24
  const dropEdge = opts.dropEdge ?? true
  const { data, width } = raw
  const w = rect.x1 - rect.x0
  const h = rect.y1 - rect.y0
  if (w <= 0 || h <= 0) return 0

  // Banda central da célula: onde a pose desenhada mora. Fragmento do vizinho
  // entra pela beirada e não chega aqui.
  const CENTER = 0.3
  const cx0 = rect.x0 + w * CENTER
  const cx1 = rect.x1 - w * CENTER
  const cy0 = rect.y0 + h * CENTER
  const cy1 = rect.y1 - h * CENTER

  const seen = new Uint8Array(w * h)
  const comps: Array<{ px: number[]; edge: boolean; central: boolean }> = []

  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const local = (y - rect.y0) * w + (x - rect.x0)
      if (seen[local]) continue
      seen[local] = 1
      if (data[(y * width + x) * 4 + 3] === 0) continue
      const px: number[] = []
      let edge = false
      let central = false
      const stack = [y * width + x]
      while (stack.length) {
        const p = stack.pop() as number
        px.push(p)
        const cx = p % width
        const cy = (p - cx) / width
        if (cx === rect.x0 || cx === rect.x1 - 1 || cy === rect.y0 || cy === rect.y1 - 1) edge = true
        if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) central = true
        const push = (nx: number, ny: number) => {
          if (nx < rect.x0 || nx >= rect.x1 || ny < rect.y0 || ny >= rect.y1) return
          const l = (ny - rect.y0) * w + (nx - rect.x0)
          if (seen[l]) return
          seen[l] = 1
          if (data[(ny * width + nx) * 4 + 3] === 0) return
          stack.push(ny * width + nx)
        }
        push(cx - 1, cy)
        push(cx + 1, cy)
        push(cx, cy - 1)
        push(cx, cy + 1)
      }
      comps.push({ px, edge, central })
    }
  }
  if (comps.length < 2) return 0

  // O corpo é o maior componente que alcança o miolo da célula.
  const byArea = [...comps].sort((a, b) => b.px.length - a.px.length)
  const body = byArea.find((c) => c.central) ?? byArea[0]
  const bodyArea = body.px.length

  let removed = 0
  for (const comp of comps) {
    if (comp === body) continue
    const doomed =
      (dropEdge && comp.edge && !comp.central) ||
      comp.px.length <= minArea ||
      comp.px.length < bodyArea * minFrac
    if (!doomed) continue
    for (const p of comp.px) data[p * 4 + 3] = 0
    removed += comp.px.length
  }
  return removed
}

/** Descarta blobs chapados (a outra versão da folha veio com um quadrado preto sólido). */
export function isFlatBlob(raw: Raw, box: Box): boolean {
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
