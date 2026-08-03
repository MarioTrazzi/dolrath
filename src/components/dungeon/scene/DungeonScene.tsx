'use client'

// ============================================================
// DungeonScene — a masmorra como LUGAR.
//
// Top-down 2D em canvas, RETRATO (mobile-first) e SEMPRE automática: o herói
// explora sozinho, estilo idle, e ao chegar num ponto de encontro avisa o pai
// via `onReachSpot` — é ali que a run real vai chamar /api/dungeon/run/step e
// abrir o combate por turnos. Não existe controle manual, de propósito.
//
// Padrão de loop copiado de WalkScene.tsx: DPR limitado a 2, ResizeObserver,
// rAF com dt clampado, e TODAS as deps por ref para o loop nunca reiniciar.
// ============================================================

import React, { useEffect, useRef } from 'react'
import type { MapSpot, SceneMapDef, SceneProp, Vec2 } from '@/lib/dungeonScene/types'
import { clamp, clampToWalkable, dist, lerp, sceneProps, pathToSpot } from '@/lib/dungeonScene/geometry'
import type { NodeFlavor, SpotContent } from '@/lib/dungeonScene/nodeContents'
import { drawNodeIcon, nodeIconColor, FIND_OBJECT_FLAVORS } from '@/lib/dungeonScene/icons'
import { HERO_WORLD_H, resolveHeroSprite, type HeroSpriteDef } from '@/lib/heroSprites'
import { bossSpriteSlug, getMonsterSpriteBySlug } from '@/lib/monsterSprites'
import {
  monsterFacing,
  monsterPos,
  monsterPose,
  monsterVel,
  planMonsters,
  type MonsterPose,
  type SceneMonster,
} from '@/lib/dungeonScene/monsters'

export interface DungeonSceneProps {
  map: SceneMapDef
  /**
   * Retrato do herói (NFT). É o 2º elo da cadeia: quando a combinação
   * raça×classe tem boneco de caminhada, ele ganha. Sem nenhum dos dois,
   * desenha um boneco procedural.
   */
  heroSprite?: string | null
  /** Raça e classe do herói — escolhem o boneco de caminhada (heroSprites.ts). */
  race?: string | null
  heroClass?: string | null
  /** O que há em cada nó (planNodeContents). Sem isto, o nó vira só um "?". */
  contents?: Map<number, SpotContent>
  /** Nó que o herói procura agora. */
  targetNode: number
  /** Nós já resolvidos (marcador apagado). */
  visitedNodes: number[]
  /** Congela o mundo (combate aberto por cima). */
  paused?: boolean
  /**
   * 🎥 Zoom cinematográfico de aproximação (1 = enquadramento normal). O valor é
   * um ALVO: o loop interpola até ele, então trocar de 1 para 2.4 vira uma
   * investida suave, nunca um corte. Usado na entrada em combate.
   */
  cinematicZoom?: number
  /**
   * Nó cujo monstro a câmera deve enquadrar junto do herói (null = segue só o
   * herói). Com ele a câmera mira o meio do caminho entre os dois, para o vulto
   * não ficar fora de quadro justo quando o zoom fecha.
   */
  focusNode?: number | null
  onReachSpot?: (spot: MapSpot) => void
  /**
   * Dispara UMA vez quando o MAPA INTEIRO terminou de carregar: chão, sprites do
   * bioma (que incluem os objetos de achado), boneco/retrato do herói e as
   * FOLHAS DOS MONSTROS da run. O pai usa para segurar um loading (o d20) e não
   * exibir o quadro meio-desenhado da primeira entrada.
   *
   * Com `contents` vazio ele espera: sem a planta da run não há monstro para
   * carregar, e abrir ali entregaria um mapa sem bicho nenhum.
   */
  onReady?: () => void
  className?: string
}

const WALK_SPEED = 6.2 // unidades/s
const ARRIVE_EPS = 0.55

/** |dirX| acima disto = passo lateral → frame de perfil. */
const HERO_SIDE_DX = 0.45
/** dirY abaixo disto = subindo a trilha (para o fundo) → frame de costas. */
const HERO_BACK_DY = -0.45
/** u/s abaixo disto o herói está perambulando no bolsão, não caminhando. */
const HERO_IDLE_SPEED = 3.0
/**
 * |dirX| mínimo para VIRAR o boneco. Tem que ficar acima da amplitude da
 * perambulação (0.25), senão o herói fica trocando de lado várias vezes por
 * segundo parado esperando o próximo passo.
 */
const TURN_DX = 0.35
/** Achatamento vertical — dá o ar de 3/4 sem sair do top-down. */
const Y_SQUASH = 0.82
const CAM_FOLLOW = 5.5
/** Velocidade da interpolação do zoom cinematográfico (maior = mais seco). */
const CAM_ZOOM_SPEED = 3.2
/**
 * Unidades de mundo atravessadas na LARGURA da tela EM RETRATO 9:16 — é o dial
 * de zoom BASE (antes do multiplicador cinematográfico). Menor = câmera mais
 * perto = sprite maior (valoriza o boneco raça×classe). Com menos mundo à
 * vista, a câmera passa a seguir o herói em vez de travar centralizada no
 * bolsão. 15 = mais perto, 18 = mais afastado.
 */
const WORLD_UNITS_ACROSS = 16
/**
 * Altura de mundo EQUIVALENTE, pela mesma proporção 9:16 — a NOVA base do
 * zoom (ver `resize`). Em retrato normal (celular, ou o desktop na caixa
 * 9:16) dá o MESMO ppu de sempre: LARGURA continua sendo quem decide. Só
 * quando a moldura fica mais larga que 9:16 (RunFrame `wideExplore` no
 * desktop) é que ALTURA passa a mandar — aí alargar a caixa MOSTRA MAIS MATA
 * pros lados em vez de só dar zoom (o mapa é gerado estreito de propósito;
 * esticar a largura sem isto só aumentava o sprite, sem revelar cenário novo).
 */
const WORLD_UNITS_TALL_REF = (WORLD_UNITS_ACROSS * 16) / 9
/**
 * Teto do gate de carga. Nenhuma rede é garantida: se uma folha nunca assenta, é
 * melhor entrar na masmorra com o mapa incompleto do que deixar o d20 girando
 * para sempre. Generoso de propósito — em conexão normal o gate abre MUITO antes.
 */
const READY_TIMEOUT_MS = 8000

/**
 * Altura no MUNDO (unidades) da MAIOR variante de cada tipo — é o que dá a
 * escala do lugar. As variantes menores encolhem na mesma proporção da arte
 * (um broto de 54px não vira árvore adulta), calculado na carga.
 */
const SPRITE_H: Record<string, number> = {
  tree: 6.5,
  bush: 1.3,
  rock: 1.0,
  stump: 0.95,
  puddle: 3.2,
  house: 4.6,
  chest: 1.25,
  rubble: 1.15,
  herb: 0.85,
  fountain: 1.8,
}

interface NodeObject {
  pos: Vec2
  flavor: NodeFlavor
  nodeIndex: number
}

type Sprite = HTMLImageElement | HTMLCanvasElement

const spriteW = (s: Sprite) => ('naturalWidth' in s ? s.naturalWidth : s.width) || 1
const spriteH = (s: Sprite) => ('naturalHeight' in s ? s.naturalHeight : s.height) || 1

/**
 * `optional` cala o aviso de dev para arte cuja AUSÊNCIA é esperada — hoje só o
 * estado gasto dos objetos de nó, que nem todo flavor tem. O aviso continua para
 * todo o resto: uma folha 404 em silêncio vira "o bicho não aparece" sem pista.
 */
function loadImage(src: string, optional = false): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => {
      // Resolve null (nunca rejeita) para o Promise.all do gate sempre assentar —
      // mas em dev grita, senão uma folha 404 vira "o bicho não aparece" mudo.
      if (!optional && process.env.NODE_ENV !== 'production') {
        console.warn('[DungeonScene] falhou ao carregar', src)
      }
      resolve(null)
    }
    img.src = src
  })
}

/**
 * Arte dos objetos de achado do bioma: o estado CHEIO e o GASTO de cada flavor.
 *
 * Fica fora de `map.variants` de propósito — aquilo é `PropKind` e alimenta o
 * espalhamento de vegetação (`variantOf` em geometry.ts), então um baú ali
 * viraria mato brotando pela mata. Aqui é uma lista à parte, com a mesma
 * convenção de chave (`<tipo>-<variante>`) para o `spriteOf` do desenho achar.
 */
function nodeObjectSprites(biome: string) {
  return FIND_OBJECT_FLAVORS.flatMap(flavor => [
    { key: `${flavor}-1`, src: `/scene/${biome}/${flavor}-1.webp`, optional: false },
    { key: `${flavor}-used-1`, src: `/scene/${biome}/${flavor}-used-1.webp`, optional: true },
  ])
}

/**
 * gpt-image-1 com fundo transparente deixa lixo: riscos coloridos semi-opacos
 * espalhados fora da silhueta e uma franja de halo na borda. Zera tudo abaixo
 * do limiar de alpha uma vez, na carga — na tela some o cintilar, e não custa
 * dependência nenhuma.
 */
const ALPHA_FLOOR = 26

function cleanSprite(img: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return img
  try {
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const c = cv.getContext('2d', { willReadFrequently: false })
    if (!c) return img
    c.drawImage(img, 0, 0)
    const data = c.getImageData(0, 0, w, h)
    const px = data.data
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] < ALPHA_FLOOR) px[i] = 0
    }
    c.putImageData(data, 0, 0)
    return cv
  } catch {
    return img // canvas "sujo" (não deve acontecer: asset é same-origin)
  }
}

/** Mistura simples entre duas cores hex — variação de tom da vegetação. */
function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t))
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t))
  const bl = Math.round(lerp(pa & 255, pb & 255, t))
  return `rgb(${r},${g},${bl})`
}

export default function DungeonScene({
  map,
  heroSprite = null,
  race = null,
  heroClass = null,
  contents,
  targetNode,
  visitedNodes,
  paused = false,
  cinematicZoom = 1,
  focusNode = null,
  onReachSpot,
  onReady,
  className = '',
}: DungeonSceneProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heroImgRef = useRef<HTMLImageElement | null>(null)
  const spriteDefRef = useRef<HeroSpriteDef | null>(null)
  const spriteImgRef = useRef<HTMLImageElement | null>(null)
  /** Relógio do ciclo de passos — só corre andando (senão o ciclo congela torto). */
  const spriteClockRef = useRef(0)
  const moveSpeedRef = useRef(0)
  const moveDirRef = useRef<Vec2>({ x: 0, y: 0 })
  const spritesRef = useRef(new Map<string, Sprite | null>())
  /** Altura em px da MAIOR variante de cada tipo — base da escala relativa. */
  const kindScaleRef = useRef(new Map<string, number>())
  const groundRef = useRef<HTMLImageElement | null>(null)
  const nodeObjsRef = useRef<NodeObject[]>([])
  const monstersRef = useRef<SceneMonster[]>([])
  /** Tiras de monstro por espécie — quem não tem entrada aqui vira vulto. */
  const monsterStripsRef = useRef(new Map<string, HTMLImageElement>())
  /** Pose anterior de cada monstro (índice em monstersRef) = o `prev` da histerese. */
  const monsterPoseRef = useRef(new Map<number, MonsterPose>())
  const animRef = useRef(0)

  // ---- estado do mundo (tudo em ref: o loop não reinicia) ----
  const heroRef = useRef<Vec2>({ ...map.entrance })
  const camRef = useRef<Vec2>({ ...map.entrance })
  const camReadyRef = useRef(false)
  const facingRef = useRef(1)
  const walkPhaseRef = useRef(0)
  const timeRef = useRef(0)
  /**
   * Relógio da RONDA dos monstros — congela junto com o mundo.
   *
   * O `timeRef` corre sempre (o zoom cinematográfico é interpolado mesmo
   * pausado). Com silhueta ninguém notava o vulto andando atrás do modal; com a
   * arte pintada o chefe sairia do enquadramento da aproximação enquanto o
   * jogador lê o card. Usado nos TRÊS pontos que consultam a posição do monstro
   * (desenho, colisão e câmera) — separar faria ele teleportar entre eles.
   */
  const monsterClockRef = useRef(0)
  const queueRef = useRef<Vec2[]>([])
  const queuedNodeRef = useRef(-1)
  const reachedRef = useRef(new Set<number>())

  /** Zoom VIVO (interpolado); `zoomTargetRef` é para onde ele está indo. */
  const zoomRef = useRef(1)

  // ---- props espelhadas ----
  const contentsRef = useRef(contents)
  const targetRef = useRef(targetNode)
  const visitedRef = useRef(visitedNodes)
  const pausedRef = useRef(paused)
  const zoomTargetRef = useRef(cinematicZoom)
  const focusRef = useRef(focusNode)
  const onReachRef = useRef(onReachSpot)
  const mapRef = useRef(map)

  contentsRef.current = contents
  targetRef.current = targetNode
  visitedRef.current = visitedNodes
  pausedRef.current = paused
  zoomTargetRef.current = cinematicZoom
  focusRef.current = focusNode
  onReachRef.current = onReachSpot
  mapRef.current = map

  useEffect(() => {
    let cancelled = false
    if (!heroSprite) {
      heroImgRef.current = null
      return
    }
    ;(async () => {
      const img = await loadImage(heroSprite)
      if (!cancelled) heroImgRef.current = img
    })()
    return () => {
      cancelled = true
    }
  }, [heroSprite])

  // Boneco de caminhada raça×classe (tira horizontal recortada por
  // scripts/slice-hero-sprite-sheet.ts). Combinação sem arte deixa os refs em
  // null e o herói cai no retrato — sem regressão.
  // Nada de cleanSprite() aqui: a tira é recorte determinístico, não saída do
  // gpt-image-1, então não tem franja de halo para varrer.
  useEffect(() => {
    let cancelled = false
    const def = resolveHeroSprite(race, heroClass)
    if (!def) {
      spriteDefRef.current = null
      spriteImgRef.current = null
      return
    }
    ;(async () => {
      const img = await loadImage(def.src)
      if (cancelled) return
      spriteDefRef.current = img ? def : null
      spriteImgRef.current = img
    })()
    return () => {
      cancelled = true
    }
  }, [race, heroClass])

  // Sprites do bioma (importados por scripts/import-craftpix-scene.ts).
  // Ausentes = null, e a cena cai no desenho procedural sem quebrar.
  useEffect(() => {
    let cancelled = false
    spritesRef.current = new Map()
    kindScaleRef.current = new Map()
    groundRef.current = null

    const pending: Array<Promise<void>> = []
    for (const [kind, count] of Object.entries(map.variants)) {
      for (let v = 1; v <= count; v++) {
        pending.push(
          loadImage(`/scene/${map.id}/${kind}-${v}.webp`).then(img => {
            if (cancelled || !img) return
            spritesRef.current.set(`${kind}-${v}`, cleanSprite(img))
          }),
        )
      }
    }

    // Objetos de achado (baú, erva, fonte, entulho). Sem `cleanSprite()`: estes
    // saem do recorte determinístico do sharp, e não do gpt-image-1 — não têm a
    // franja de halo que aquela varredura existe para limpar.
    for (const { key, src, optional } of nodeObjectSprites(map.id)) {
      pending.push(
        loadImage(src, optional).then(img => {
          if (cancelled || !img) return
          spritesRef.current.set(key, img)
        }),
      )
    }

    // Escala relativa DENTRO de cada tipo: a maior variante fica com a altura
    // de SPRITE_H, as outras encolhem na proporção da própria arte.
    Promise.all(pending).then(() => {
      if (cancelled) return
      for (const kind of Object.keys(map.variants)) {
        let maxH = 0
        for (let v = 1; v <= (map.variants[kind as keyof typeof map.variants] || 0); v++) {
          const s = spritesRef.current.get(`${kind}-${v}`)
          if (s) maxH = Math.max(maxH, spriteH(s))
        }
        if (maxH > 0) kindScaleRef.current.set(kind, maxH)
      }
    })

    if (map.groundTexture) {
      loadImage(map.groundTexture).then(img => {
        if (!cancelled) groundRef.current = img
      })
    }

    return () => {
      cancelled = true
    }
  }, [map.id, map.variants, map.groundTexture])

  // Sinaliza "cena pronta" quando os assets críticos terminam de carregar. Passe
  // SEPARADO da carga que popula os refs acima (as URLs são as mesmas — o cache
  // HTTP do navegador deduplica), só para ter UM ponto claro de "acabou". Como
  // loadImage resolve null no erro (nunca rejeita), este Promise.all sempre
  // assenta. O pai segura o d20-loading até este onReady disparar.
  //
  // O que entra na lista é o MAPA INTEIRO, e não só o cenário: chão, vegetação,
  // objetos de achado (que saem de `map.variants`, então já vêm juntos), boneco
  // do herói E as folhas dos monstros da run. Sem as folhas o gate abria cedo e
  // cada bicho nascia como vulto antes de virar sprite — o "monstro antigo"
  // piscando no mapa.
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  /** O gate abre UMA vez por montagem: nó seguinte não traz o d20 de volta. */
  const readyFiredRef = useRef(false)
  useEffect(() => {
    if (readyFiredRef.current) return

    let cancelled = false
    const fire = () => {
      if (cancelled || readyFiredRef.current) return
      readyFiredRef.current = true
      onReadyRef.current?.()
    }

    // Escotilha, armada ANTES de qualquer espera: nada aqui pode deixar o d20
    // girando para sempre. Cobre os dois jeitos de travar — um /start que nunca
    // responde (contents fica vazio) e uma imagem que nunca assenta.
    const escape = setTimeout(fire, READY_TIMEOUT_MS)
    const bail = () => {
      cancelled = true
      clearTimeout(escape)
    }

    // `contents` vazio = a planta da run ainda não chegou (o runId está viajando
    // no /start). Abrir agora entregaria um mapa SEM monstro nenhum, que é
    // metade do bug — então espera, mas com a escotilha correndo. `undefined` é
    // outro caso: a bancada /dev não passa contents e não deve ficar esperando.
    //
    // Não chama bail(): o timeout tem que sobreviver a este `return`. Quem o
    // limpa é o cleanup do efeito, que roda quando o runId chega e re-planeja.
    if (contents && contents.size === 0) return bail

    const urls: Array<[string, boolean]> = []
    if (map.groundTexture) urls.push([map.groundTexture, false])
    for (const [kind, count] of Object.entries(map.variants)) {
      for (let v = 1; v <= (count || 0); v++) urls.push([`/scene/${map.id}/${kind}-${v}.webp`, false])
    }
    // Os objetos de achado entram no gate junto: sem isso o baú nasce como ícone
    // SVG e PISCA pra sprite quando a imagem assenta — o mesmo defeito que as
    // folhas de monstro logo abaixo existem pra evitar.
    for (const { src, optional } of nodeObjectSprites(map.id)) urls.push([src, optional])
    const def = resolveHeroSprite(race, heroClass)
    if (def) urls.push([def.src, false])
    else if (heroSprite) urls.push([heroSprite, false])

    // Folhas dos monstros: as espécies da planta + o chefe (que é dedutível da
    // masmorra e por isso não depende do servidor). Carrega DIRETO pro
    // `monsterStripsRef` (mesmo cache que drawMonster lê) em vez de só medir o
    // tempo e descartar — o efeito de baixo (que povoa o ref de verdade) é uma
    // corrida independente contra este `Promise.all`, e não tinha garantia
    // nenhuma de terminar primeiro. Sem a folha no ref a tempo, `drawMonster`
    // some com o bicho (linha `if (def && !strip) return`) até a OUTRA corrida
    // terminar — o "bicho não aparece andando" que isto aqui existe pra evitar.
    const slugs = new Set<string>([bossSpriteSlug(map.id)])
    contents?.forEach(c => c.speciesSlugs?.forEach(s => slugs.add(s)))
    const spritePromises: Promise<void>[] = []
    for (const slug of Array.from(slugs)) {
      const sheet = getMonsterSpriteBySlug(slug)
      if (!sheet) continue
      if (monsterStripsRef.current.has(slug)) continue
      spritePromises.push(
        loadImage(sheet.src).then(img => {
          if (!cancelled && img) monsterStripsRef.current.set(slug, img)
        }),
      )
    }

    Promise.all([...urls.map(([src, optional]) => loadImage(src, optional)), ...spritePromises]).then(fire)
    return bail
  }, [map.id, map.variants, map.groundTexture, race, heroClass, heroSprite, contents])

  // Objetos de achado (baú, entulho, erva, fonte) existem NO MUNDO, ordenados
  // por profundidade junto com a vegetação — não são crachá flutuante.
  useEffect(() => {
    let cancelled = false
    const list: NodeObject[] = []
    if (contents) {
      for (const spot of map.spots) {
        const c = contents.get(spot.nodeIndex)
        if (c && c.category === 'find') {
          list.push({ pos: spot.pos, flavor: c.flavor, nodeIndex: spot.nodeIndex })
        }
      }
    }
    list.sort((a, b) => a.pos.y - b.pos.y)
    nodeObjsRef.current = list
    const mobs = contents ? planMonsters(map, contents, map.seed) : []
    monstersRef.current = mobs
    // Os índices mudaram: a pose anterior de cada um não vale mais nada.
    monsterPoseRef.current.clear()

    // Tira de quem tem folha (hoje só o chefe). Sem cleanSprite(), igual ao
    // herói: é recorte determinístico do sharp, não saída do gpt-image-1.
    const slugs = Array.from(
      new Set(mobs.map(m => m.speciesSlug).filter((s): s is string => !!getMonsterSpriteBySlug(s))),
    )
    for (const slug of slugs) {
      if (monsterStripsRef.current.has(slug)) continue
      const def = getMonsterSpriteBySlug(slug)
      if (!def) continue
      loadImage(def.src).then(img => {
        if (!cancelled && img) monsterStripsRef.current.set(slug, img)
      })
    }
    return () => {
      cancelled = true
    }
  }, [contents, map])

  // Trocar de alvo cancela a rota antiga (o pai mandou procurar outro nó).
  useEffect(() => {
    if (queuedNodeRef.current !== targetNode) {
      queueRef.current = []
      queuedNodeRef.current = -1
    }
  }, [targetNode])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const props = sceneProps(mapRef.current)
    let running = true
    let last = performance.now()
    // `ppu` é o zoom EFETIVO (o que todo o desenho lê); `basePpu` é o
    // enquadramento normal, que só o resize recalcula. O frame reescreve
    // ppu = basePpu × zoom antes de desenhar — assim a aproximação
    // cinematográfica passa por todas as projeções sem tocá-las uma a uma.
    let view = { w: 0, h: 0, ppu: 16, basePpu: 16 }

    // ---- chuva ----
    // Gotas PERSISTENTES com velocidade. A versão anterior sorteava 26 posições
    // novas a cada frame: elas teleportavam em vez de cair (lia como chuvisco
    // estático) e, com contagem fixa numa tela larga, sumiam.
    interface Drop {
      x: number
      y: number
      vy: number
      len: number
      near: boolean
    }
    const drops: Drop[] = []
    /** Gotas por megapixel CSS — densidade por ÁREA, igual em qualquer tamanho. */
    const RAIN_DENSITY = 210
    /** Vento constante: vx = vy × isto. */
    const RAIN_SLANT = 0.16

    const seedDrop = (d: Drop, y?: number) => {
      d.x = Math.random() * (view.w + 60) - 30
      d.y = y ?? Math.random() * view.h
      d.near = Math.random() < 0.35
      d.vy = d.near ? 780 + Math.random() * 320 : 460 + Math.random() * 260 // px/s
      d.len = d.vy * 0.021 // rastro ~10-23px
    }

    const fitDrops = () => {
      const want = clamp(Math.round(((view.w * view.h) / 1e6) * RAIN_DENSITY), 40, 320)
      while (drops.length > want) drops.pop()
      while (drops.length < want) {
        const d: Drop = { x: 0, y: 0, vy: 0, len: 0, near: false }
        seedDrop(d)
        drops.push(d)
      }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // basePpu = zoom de repouso; ppu aplica por cima o multiplicador
      // cinematográfico da entrada em combate.
      //
      // MÍNIMO das duas leituras (largura÷ACROSS, altura÷TALL_REF) em vez de
      // só largura: as duas concordam exatamente em 9:16 (é assim que
      // TALL_REF foi derivado), então retrato — celular OU a caixa 9:16 do
      // desktop — continua 100% como antes (largura sempre vence ali, é a
      // dimensão mais apertada). Só numa moldura MAIS LARGA que 9:16 a altura
      // passa a vencer, e aí a largura extra deixa de zoomar: ela só aparece
      // como mais mata visível nas laterais, porque o ppu já está fixado pela
      // altura.
      const basePpu = clamp(Math.min(w / WORLD_UNITS_ACROSS, h / WORLD_UNITS_TALL_REF), 10, 34)
      view = { w, h, basePpu, ppu: basePpu * zoomRef.current }
      fitDrops()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // ---- projeção ----
    const sx = (wx: number) => (wx - camRef.current.x) * view.ppu + view.w / 2
    const sy = (wy: number) => (wy - camRef.current.y) * view.ppu * Y_SQUASH + view.h / 2
    const toWorld = (px: number, py: number): Vec2 => ({
      x: (px - view.w / 2) / view.ppu + camRef.current.x,
      y: (py - view.h / 2) / (view.ppu * Y_SQUASH) + camRef.current.y,
    })

    // Sem entrada do jogador: a run é SEMPRE automática.
    // Decisão de design (não preguiça): sem controle manual não há como
    // contornar nós para correr até o chefe, o cursor do servidor nunca sai de
    // sincronia com a posição do herói, e some toda uma classe de bug de
    // colisão/travamento. O jogador assiste e decide no combate.

    // ---- desenho ----
    const drawGround = () => {
      const m = mapRef.current
      const pal = m.palette

      // Base: textura de chão em ladrilho (ancorada no MUNDO, não na tela, senão
      // "escorrega" com a câmera). Sem textura, cor chapada.
      const tex = groundRef.current
      if (tex && tex.naturalWidth) {
        const tile = ctx.createPattern(tex, 'repeat')
        if (tile) {
          // Deslocamento ARREDONDADO: em posição fracionária o canvas
          // interpola a borda do ladrilho e aparece uma grade de linhas finas.
          const tileW = tex.naturalWidth
          const offX = Math.round(
            ((-camRef.current.x * view.ppu + view.w / 2) % tileW + tileW) % tileW,
          )
          const offY = Math.round(
            ((-camRef.current.y * view.ppu * Y_SQUASH + view.h / 2) % tileW + tileW) % tileW,
          )
          ctx.save()
          ctx.translate(offX, offY)
          ctx.fillStyle = tile
          ctx.fillRect(-offX, -offY, view.w, view.h)
          ctx.restore()
          // Escurecida de leve. Era 0.55 quando havia clareira clara pintada
          // por cima; sem ela, aquilo deixava o mapa inteiro num breu chapado.
          ctx.fillStyle = 'rgba(6,10,4,0.3)'
          ctx.fillRect(0, 0, view.w, view.h)
        } else {
          ctx.fillStyle = pal.deep
          ctx.fillRect(0, 0, view.w, view.h)
        }
      } else {
        ctx.fillStyle = pal.deep
        ctx.fillRect(0, 0, view.w, view.h)
      }

      // Clareira NÃO é pintada. O gradiente radial que ficava aqui virava uma
      // mancha de luz no meio da mata (o "círculo estranho"): sem borda, cor
      // clara chapada, lendo como holofote. Quem define o espaço é a densidade
      // de árvores — a vegetação só nasce FORA da área caminhável. Mesmo motivo
      // para a trilha ladrilhada ter saído: a peça reta do pack não fecha em
      // ângulo qualquer. A arte (road.webp) segue importada para quando houver
      // um traçado que feche direito.

      drawPuddles()
    }

    /** Poças: decalque DEITADO no chão, desenhado junto do piso e FORA da
     *  ordenação por profundidade (senão a poça tapa o tronco atrás dela). */
    const drawPuddles = () => {
          for (const p of props) {
          if (p.kind !== 'puddle') continue
          const px = sx(p.pos.x)
          const py = sy(p.pos.y)
          if (px < -80 || px > view.w + 80 || py < -80 || py > view.h + 80) continue
          const img = spriteOf('puddle', p.variant)
          if (!img) continue
          const w = (SPRITE_H.puddle ?? 3.2) * p.scale * view.ppu
          const hh = w * (spriteH(img) / spriteW(img)) * Y_SQUASH
          ctx.save()
          ctx.globalAlpha = 0.94
          ctx.translate(px, py)
          if (p.tone > 0.5) ctx.scale(-1, 1) // espelha: uma peça só, sem repetir cara
          ctx.drawImage(img, -w / 2, -hh / 2, w, hh)
          ctx.restore()
        }
        ctx.globalAlpha = 1
    }

    const drawSpotMark = (spot: MapSpot) => {
      if (spot.kind === 'start') return
      const done = visitedRef.current.includes(spot.nodeIndex)
      const isTarget = spot.nodeIndex === targetRef.current
      const x = sx(spot.pos.x)
      const y = sy(spot.pos.y)
      if (x < -60 || x > view.w + 60 || y < -60 || y > view.h + 60) return

      const pal = mapRef.current.palette
      const content = contentsRef.current?.get(spot.nodeIndex)
      const color = content ? nodeIconColor(content.flavor) : spot.kind === 'boss' ? '#f3a712' : pal.accent
      const pulse = 0.85 + Math.sin(timeRef.current * 3) * 0.15
      // Raio só para POSICIONAR o ícone flutuante — o anel de chão foi removido.
      // Aquele círculo (vermelho no monstro, âmbar no chefe) desenhava por cima do
      // sprite e roubava a atenção do bicho; quem marca o nó agora é o próprio
      // vulto/sprite (combate) ou o objeto no mundo (achado).
      const r = (spot.kind === 'boss' ? 2.6 : 1.8) * view.ppu * (isTarget ? pulse : 1)

      // Achado tem OBJETO no mundo (passe de profundidade) e combate tem o
      // sprite/vulto — em ambos o marcador é o próprio sprite, sem crachá por cima.
      if (content?.category === 'find' || content?.category === 'combat') return

      const iconY = y - r * 0.85 - view.ppu * 0.75
      const float = isTarget && !done ? Math.sin(timeRef.current * 2.4) * view.ppu * 0.12 : 0

      // Sem conteúdo = bancada sem planta. Na run isso não acontece mais: a
      // planta chega junto com o runId, então todo nó já nasce sabido — foi o
      // fim do "?" que ficava pairando sobre o ponto.
      if (!content) {
        ctx.beginPath()
        ctx.arc(x, iconY, view.ppu * 0.16, 0, Math.PI * 2)
        ctx.fillStyle = done ? 'rgba(160,160,160,0.5)' : color
        ctx.fill()
        return
      }

      // Nó de combate com bicho VIVO não precisa de crachá: o próprio monstro
      // rondando o bolsão é o aviso. O ícone volta só depois de limpo, como
      // marca de "já passei por aqui".
      if (!done) return

      const size = view.ppu * (content.flavor === 'boss' ? 2.4 : 1.7)
      drawNodeIcon(ctx, content.flavor, x, iconY + float, size, {
        color: 'rgba(150,150,150,0.55)',
        alpha: 0.5,
      })
    }

    const spriteOf = (kind: string, variant: number) =>
      spritesRef.current.get(`${kind}-${variant}`) || null

    /** Sombra elíptica no chão — desenhada aqui, nunca assada no sprite. */
    const groundShadow = (x: number, y: number, rx: number, alpha = 0.22) => {
      ctx.fillStyle = `rgba(0,0,0,${alpha})`
      ctx.beginPath()
      ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    /** Sprite ancorado pelo "pé" na posição do mundo. */
    const drawSprite = (img: Sprite, x: number, y: number, worldH: number, scale = 1) => {
      const h = worldH * scale * view.ppu
      const w = h * (spriteW(img) / spriteH(img))
      groundShadow(x, y, w * 0.3)
      ctx.drawImage(img, x - w / 2, y - h, w, h)
    }

    const drawNodeObject = (obj: NodeObject) => {
      const x = sx(obj.pos.x)
      const y = sy(obj.pos.y)
      if (x < -80 || x > view.w + 80) return
      // Nó já resolvido mostra o estado GASTO — baú aberto, erva colhida, fonte
      // vazia. Quem não tem a arte do gasto fica no cheio, sem regressão.
      // Os dois estados saem do slice em ESCALA COMUM, então a troca não muda
      // o tamanho do objeto na tela.
      const used = visitedRef.current.includes(obj.nodeIndex)
      const img = (used ? spriteOf(`${obj.flavor}-used`, 1) : null) ?? spriteOf(obj.flavor, 1)
      if (img) {
        drawSprite(img, x, y, SPRITE_H[obj.flavor] ?? 1.2)
        return
      }
      // Sem arte ainda: o ícone SVG fica de pé no chão.
      const size = view.ppu * 1.9
      groundShadow(x, y, size * 0.3, 0.3)
      drawNodeIcon(ctx, obj.flavor, x, y - size * 0.5, size)
    }

    const drawProp = (p: SceneProp) => {
      const pal = mapRef.current.palette
      const x = sx(p.pos.x)
      const y = sy(p.pos.y)
      const u = view.ppu * p.scale

      const img = spriteOf(p.kind, p.variant)
      if (img) {
        // Altura do tipo × proporção desta variante × jitter do prop.
        const ref = kindScaleRef.current.get(p.kind) || spriteH(img)
        const rel = spriteH(img) / ref
        drawSprite(img, x, y, (SPRITE_H[p.kind] ?? 1.2) * rel, p.scale)
        return
      }

      if (p.kind === 'tree') {
        ctx.fillStyle = 'rgba(0,0,0,0.32)'
        ctx.beginPath()
        ctx.ellipse(x, y + u * 0.12, u * 0.72, u * 0.24, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = pal.bark
        ctx.fillRect(x - u * 0.11, y - u * 0.9, u * 0.22, u * 0.95)
        const c = mixHex(pal.canopy, '#0d1c10', p.tone * 0.55)
        ctx.fillStyle = c
        ctx.beginPath()
        ctx.ellipse(x, y - u * 1.5, u * 0.92, u * 0.72, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(x - u * 0.5, y - u * 1.05, u * 0.6, u * 0.48, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(x + u * 0.5, y - u * 1.12, u * 0.58, u * 0.46, 0, 0, Math.PI * 2)
        ctx.fill()
        // luz de topo
        ctx.fillStyle = mixHex(c, '#9fd48f', 0.22)
        ctx.beginPath()
        ctx.ellipse(x - u * 0.18, y - u * 1.82, u * 0.44, u * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'bush') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.beginPath()
        ctx.ellipse(x, y + u * 0.1, u * 0.5, u * 0.16, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = mixHex(pal.canopy, '#0a160c', 0.35 + p.tone * 0.3)
        ctx.beginPath()
        ctx.ellipse(x, y - u * 0.22, u * 0.55, u * 0.38, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(x + u * 0.3, y - u * 0.1, u * 0.34, u * 0.26, 0, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'rock') {
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.beginPath()
        ctx.ellipse(x, y + u * 0.08, u * 0.44, u * 0.14, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = mixHex('#4a4f4a', '#23281f', p.tone)
        ctx.beginPath()
        ctx.moveTo(x - u * 0.42, y)
        ctx.lineTo(x - u * 0.24, y - u * 0.42)
        ctx.lineTo(x + u * 0.16, y - u * 0.48)
        ctx.lineTo(x + u * 0.42, y - u * 0.08)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillStyle = mixHex(pal.bark, '#3a2f22', p.tone)
        ctx.beginPath()
        ctx.ellipse(x, y - u * 0.2, u * 0.34, u * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(x - u * 0.32, y - u * 0.2, u * 0.64, u * 0.2)
      }
    }

    const drawHero = () => {
      const hp = heroRef.current
      const x = sx(hp.x)
      const y = sy(hp.y)
      const u = view.ppu
      const bob = Math.sin(walkPhaseRef.current) * u * 0.09

      ctx.fillStyle = 'rgba(0,0,0,0.42)'
      ctx.beginPath()
      ctx.ellipse(x, y, u * 0.44, u * 0.16, 0, 0, Math.PI * 2)
      ctx.fill()

      // 1º elo: boneco de caminhada da combinação raça×classe.
      const def = spriteDefRef.current
      const strip = spriteImgRef.current
      if (def && strip) {
        const d = moveDirRef.current
        // `paused` congela o stepWorld mas não zera a velocidade — sem este
        // teste o herói ficaria "andando parado" atrás do modal de combate.
        const walking = !pausedRef.current && moveSpeedRef.current > HERO_IDLE_SPEED
        const cycle = def.walk.length ? def.walk : [0]
        const step = Math.floor(spriteClockRef.current * def.fps)

        // A folha só tem PERFIL e COSTAS — não existe frente. Subindo para o
        // fundo (-y no mundo) e sem componente lateral, vai de costas. Vindo em
        // direção à câmera (+y) roda o perfil mesmo: sem arte de frente, o
        // perfil lê como caminhada, enquanto as costas leriam como andar de ré.
        //
        // `back` pode ser um número (folha com UMA pose de costas) ou um ciclo.
        // Tratar o array como número dava `frame * frameW = NaN`, e drawImage com
        // NaN não desenha nada — era isso que fazia o herói SUMIR ao subir a
        // trilha em toda combinação com ciclo de costas (todas menos elfo/ladino).
        const backCycle =
          def.back === undefined ? [] : Array.isArray(def.back) ? def.back : [def.back]
        const useBack =
          walking && backCycle.length > 0 && d.y < HERO_BACK_DY && Math.abs(d.x) < HERO_SIDE_DX
        const pick = (list: number[]) => list[((step % list.length) + list.length) % list.length]

        const frame = !walking
          ? def.idle ?? cycle[0]
          : useBack
            ? pick(backCycle)
            : pick(cycle)

        // Com UMA pose de costas só, alternar o espelho dá o 2º tempo do passo.
        // Com um ciclo de verdade isso atrapalharia — o boneco pularia de lado
        // enquanto anda. (Mesma regra da WalkScene.)
        const flip = useBack
          ? backCycle.length > 1
            ? 1
            : step % 2 === 0
              ? 1
              : -1
          : def.facing === 'right'
            ? facingRef.current
            : -facingRef.current

        const dh = HERO_WORLD_H * view.ppu
        const dw = dh * (def.frameW / def.frameH)
        ctx.save()
        // Bob reduzido: o ciclo do sprite já tem o balanço do passo desenhado.
        ctx.translate(x, y + bob * 0.45)
        ctx.scale(flip, 1)
        // Ancorado em -dh: o PÉ fica no ponto do mundo, casando com a sombra
        // acima e com a ordenação por profundidade.
        ctx.drawImage(strip, frame * def.frameW, 0, def.frameW, def.frameH, -dw / 2, -dh, dw, dh)
        ctx.restore()
        return
      }

      // 2º elo: retrato do NFT.
      const img = heroImgRef.current
      if (img) {
        const h = u * 2.5
        const w = h * ((img.naturalWidth || 1) / (img.naturalHeight || 1))
        ctx.save()
        ctx.translate(x, y + bob)
        ctx.scale(facingRef.current, 1)
        ctx.drawImage(img, -w / 2, -h, w, h)
        ctx.restore()
      } else {
        // 3º elo: boneco procedural (nem sprite da combinação, nem retrato).
        ctx.save()
        ctx.translate(x, y + bob)
        ctx.fillStyle = '#3b4d7a'
        ctx.beginPath()
        ctx.ellipse(0, -u * 0.85, u * 0.3, u * 0.52, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#e8c39e'
        ctx.beginPath()
        ctx.arc(0, -u * 1.6, u * 0.28, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#2a3557'
        ctx.fillRect(-u * 0.26, -u * 0.4, u * 0.2, u * 0.42)
        ctx.fillRect(u * 0.06, -u * 0.4, u * 0.2, u * 0.42)
        ctx.restore()
      }
    }

    /**
     * Vinheta de BORDA DE TELA, não lanterna no herói.
     *
     * A versão anterior era um gradiente radial forte centrado no personagem:
     * com a arte vetorial clara por baixo, virava um holofote com borda dura
     * seguindo o herói pelo mapa. Agora escurece só os cantos, ancorado no
     * centro da tela, e de leve — a mata já é escura por conta própria.
     */
    /**
     * Monstro: BONECO de 4 direções para quem tem folha, vulto procedural com
     * olhos acesos para quem não tem (Caverna, Pântano, Ruínas) — ver o porquê de
     * cada um em lib/dungeonScene/monsters.ts.
     */
    const drawMonster = (mo: SceneMonster, index: number) => {
      const t = monsterClockRef.current
      const wp = monsterPos(mo, t)
      const x = sx(wp.x)
      const y = sy(wp.y)

      // ---- boneco recortado (perfil / frente / costas) ----
      const def = getMonsterSpriteBySlug(mo.speciesSlug)
      const strip = mo.speciesSlug ? monsterStripsRef.current.get(mo.speciesSlug) : undefined

      // Corte de tela pela ALTURA DA ARTE, não por uma margem fixa: `y` ancora no
      // PÉ, e a chefe tem 3.6 unidades de mundo acima dele — com os 60px de antes
      // ela sumia com o corpo ainda dentro do quadro.
      const margin = Math.max(60, (def?.worldH ?? mo.size) * view.ppu)
      if (x < -margin || x > view.w + margin || y < -margin || y > view.h + margin) return

      const u = mo.size * view.ppu
      const face = monsterFacing(mo, t)
      const bob = Math.sin(t * mo.speed * 3.2 + mo.phase) * u * 0.04

      // Espécie COM folha que ainda não carregou não vira vulto: o vulto é outro
      // bicho, e vê-lo trocar de forma no meio do mapa é o "monstro antigo" que
      // aparecia. Some por um frame (na prática nenhum — o gate do onReady já
      // esperou esta folha) em vez de desenhar a criatura errada.
      if (def && !strip) return

      if (def && strip) {
        const v = monsterVel(mo, t)
        const pose = monsterPose(v, monsterPoseRef.current.get(index))
        monsterPoseRef.current.set(index, pose)

        const cycle =
          pose === 'front'
            ? def.front?.length
              ? def.front
              : def.walk
            : pose === 'back'
              ? def.back?.length
                ? def.back
                : def.walk
              : def.walk
        const list = cycle.length ? cycle : [0]
        const step = Math.floor(t * def.fps)
        const frame = list[((step % list.length) + list.length) % list.length]

        // Perfil espelha conforme o lado desenhado na folha. Frente e costas não
        // espelham — a não ser que o ciclo tenha UM frame só, e aí alternar o
        // espelho dá o 2º tempo do passo (mesma regra do drawHero).
        const flip =
          pose === 'side'
            ? def.facing === 'right'
              ? v.x >= 0
                ? 1
                : -1
              : v.x >= 0
                ? -1
                : 1
            : list.length > 1
              ? 1
              : step % 2 === 0
                ? 1
                : -1

        const dh = def.worldH * view.ppu
        const dw = dh * (def.frameW / def.frameH)
        // Sombra pela largura da ARTE, não pelo `size` do vulto (que descreve
        // outro desenho). Estreita porque a célula inclui a chama, que não pisa.
        groundShadow(x, y, dw * 0.22, 0.4)
        ctx.save()
        // Bob reduzido: o ciclo do boneco já tem o balanço do passo desenhado.
        ctx.translate(x, y + bob * 0.45)
        ctx.scale(flip, 1)
        // Ancorado em -dh: o PÉ fica no ponto do mundo, casando com a sombra
        // acima e com a ordenação por profundidade.
        ctx.drawImage(strip, frame * def.frameW, 0, def.frameW, def.frameH, -dw / 2, -dh, dw, dh)
        ctx.restore()
        return
      }

      // ---- vulto procedural ----
      groundShadow(x, y, u * 0.42, 0.4)

      ctx.save()
      ctx.translate(x, y + bob)
      ctx.scale(face, 1)

      // corpo: massa baixa e alongada (quadrúpede); chefe é mais alto
      ctx.fillStyle = mo.isBoss ? '#100b14' : '#0d1109'
      ctx.beginPath()
      ctx.ellipse(0, -u * 0.34, u * 0.46, u * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(u * 0.3, -u * 0.52, u * 0.24, u * 0.21, 0, 0, Math.PI * 2)
      ctx.fill()
      // orelhas/chifres
      ctx.beginPath()
      ctx.moveTo(u * 0.2, -u * 0.66)
      ctx.lineTo(u * 0.26, -u * 0.92)
      ctx.lineTo(u * 0.34, -u * 0.66)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(u * 0.36, -u * 0.66)
      ctx.lineTo(u * 0.44, -u * 0.88)
      ctx.lineTo(u * 0.48, -u * 0.62)
      ctx.closePath()
      ctx.fill()

      // olhos acesos — é o que faz o vulto ler como criatura
      const glow = mo.isBoss ? '#ff5a3c' : '#ffbf3c'
      const pulse = 0.75 + Math.sin(t * 3 + mo.phase) * 0.25
      ctx.globalAlpha = pulse
      ctx.shadowColor = glow
      ctx.shadowBlur = u * 0.5
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(u * 0.26, -u * 0.56, u * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(u * 0.4, -u * 0.55, u * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
      ctx.restore()
    }

    const drawFog = () => {
      const cx = view.w / 2
      const cy = view.h / 2
      const r = Math.hypot(cx, cy)
      const fog = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r)
      fog.addColorStop(0, 'rgba(0,0,0,0)')
      fog.addColorStop(1, 'rgba(3,7,4,0.5)')
      ctx.fillStyle = fog
      ctx.fillRect(0, 0, view.w, view.h)
    }

    /**
     * Chuva. Duas passadas = duas camadas de parallax (perto/longe) com UM
     * `stroke()` cada, para ~140 gotas — mais barato que os 26 pares
     * beginPath/stroke de antes.
     *
     * Cai mesmo com `paused`: pausa serve para congelar o stepWorld (posição do
     * herói e o gatilho do /step, que sincronizam com o servidor). Ambiência não
     * é estado de jogo — `timeRef` já corre pausado movendo o bob dos monstros —
     * e chuva parada atrás do combate leria como canvas travado.
     */
    const drawRain = (dt: number) => {
      const wrapW = view.w + 60
      for (let pass = 0; pass < 2; pass++) {
        const near = pass === 1
        ctx.beginPath()
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i]
          if (pass === 0) {
            // Integra uma vez só (a 2ª passada só desenha).
            d.y += d.vy * dt
            d.x += d.vy * RAIN_SLANT * dt
            if (d.y - d.len > view.h) seedDrop(d, -d.len - Math.random() * 60)
            if (d.x - 30 > view.w) d.x -= wrapW
            else if (d.x < -30) d.x += wrapW
          }
          if (d.near !== near) continue
          ctx.moveTo(d.x, d.y) // cabeça
          ctx.lineTo(d.x - d.len * RAIN_SLANT, d.y - d.len) // rastro ATRÁS
        }
        ctx.strokeStyle = near ? 'rgba(198,222,255,0.30)' : 'rgba(186,210,246,0.15)'
        ctx.lineWidth = near ? 1.5 : 1
        ctx.stroke()
      }
    }

    // ---- passo de mundo ----
    const stepWorld = (dt: number) => {
      const m = mapRef.current
      const hero = heroRef.current
      let dir: Vec2 | null = null
      // Nó do alvo atual — computado cedo pra saber se já foi ALCANÇADO (o
      // /step está em voo). Reusado embaixo pro gatilho de chegada.
      const targetSpot = m.spots.find(s => s.nodeIndex === targetRef.current)
      const alreadyReached = !!targetSpot && reachedRef.current.has(targetSpot.nodeIndex)

      {

        // Explorador idle: monta a rota até o nó-alvo e a percorre.
        if (!queueRef.current.length && queuedNodeRef.current !== targetRef.current) {
          queueRef.current = pathToSpot(m, targetRef.current)
          queuedNodeRef.current = targetRef.current
        }
        const next = queueRef.current[0]
        if (next) {
          const d = dist(hero, next)
          if (d < ARRIVE_EPS) {
            queueRef.current.shift()
          } else {
            dir = { x: (next.x - hero.x) / d, y: (next.y - hero.y) / d }
          }
        } else if (!alreadyReached) {
          // Sem rota E ainda não chegou ao bolsão: perambula devagar em volta
          // do ponto (dá vida à espera). Já chegado, o herói PLANTA OS PÉS —
          // ver o porquê logo abaixo, onde `dir` fica null neste caso.
          const t = timeRef.current
          dir = { x: Math.cos(t * 0.6) * 0.25, y: Math.sin(t * 0.43) * 0.25 }
        }
        // `alreadyReached` sem rota: dir fica null. Antes disto o herói
        // continuava perambulando (com o ciclo de passada tocando) bem em
        // cima do bicho/achado enquanto o /step viajava — sem o d20 de
        // exploração pra "sumir" a caminhada por trás do overlay, isso lia
        // como andar desordenado. Agora ele só volta a andar quando um novo
        // `targetNode` chega (a run avança pro próximo nó).
      }

      if (dir) {
        const speed = WALK_SPEED * Math.hypot(dir.x, dir.y)
        const want = { x: hero.x + dir.x * WALK_SPEED * dt, y: hero.y + dir.y * WALK_SPEED * dt }
        const next = clampToWalkable(m, want)
        heroRef.current = next
        if (Math.abs(dir.x) > TURN_DX) facingRef.current = dir.x > 0 ? 1 : -1
        walkPhaseRef.current += dt * (6 + speed)
        // Estado que o boneco lê para escolher o frame (perfil/costas/parado).
        moveDirRef.current = dir
        moveSpeedRef.current = speed
        spriteClockRef.current += dt
      } else {
        moveSpeedRef.current = 0
      }

      // Nó de combate abre ao ENCOSTAR no vulto, não ao pisar no centro do
      // bolsão: é o monstro que puxa a luta, como em Chrono Trigger. Nó de
      // achado segue abrindo por proximidade do ponto. (`targetSpot` já saiu
      // computado lá em cima, junto do `alreadyReached`.)
      const touched =
        targetSpot &&
        monstersRef.current.some(
          mo =>
            mo.nodeIndex === targetSpot.nodeIndex &&
            dist(heroRef.current, monsterPos(mo, monsterClockRef.current)) < 1.5,
        )
      if (
        targetSpot &&
        targetSpot.kind !== 'start' &&
        !reachedRef.current.has(targetSpot.nodeIndex) &&
        (touched || dist(heroRef.current, targetSpot.pos) < ARRIVE_EPS * 2.2)
      ) {
        reachedRef.current.add(targetSpot.nodeIndex)
        queueRef.current = []
        onReachRef.current?.(targetSpot)
      }
    }

    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      timeRef.current += dt

      if (view.w < 2 || view.h < 2) {
        animRef.current = requestAnimationFrame(frame)
        return
      }

      if (!pausedRef.current) {
        stepWorld(dt)
        monsterClockRef.current += dt
      }

      // 🎥 Zoom: sempre interpolado (mesmo pausado — a investida acontece com o
      // mundo congelado). Reescreve o ppu efetivo antes de qualquer projeção.
      const zk = 1 - Math.exp(-CAM_ZOOM_SPEED * dt)
      zoomRef.current = lerp(zoomRef.current, zoomTargetRef.current, zk)
      view.ppu = view.basePpu * zoomRef.current

      // câmera — normalmente segue o herói; com `focusNode` mira o meio do
      // caminho entre ele e o vulto daquele nó, para os dois caberem no quadro
      // fechado da aproximação. O `visited` aqui casa com o filtro do desenho:
      // sem ele a câmera fecharia num bicho que já não está na tela.
      let target = heroRef.current
      const focus = focusRef.current
      if (focus != null) {
        const mo = monstersRef.current.find(
          m => m.nodeIndex === focus && !visitedRef.current.includes(m.nodeIndex),
        )
        if (mo) {
          const mp = monsterPos(mo, monsterClockRef.current)
          target = { x: (target.x + mp.x) / 2, y: (target.y + mp.y) / 2 }
        }
      }
      if (!camReadyRef.current) {
        camRef.current = { ...target }
        camReadyRef.current = true
      } else {
        const k = 1 - Math.exp(-CAM_FOLLOW * dt)
        camRef.current = {
          x: lerp(camRef.current.x, target.x, k),
          y: lerp(camRef.current.y, target.y, k),
        }
      }
      // não deixa a câmera mostrar o vazio além do mapa
      const b = mapRef.current.bounds
      const halfW = view.w / 2 / view.ppu
      const halfH = view.h / 2 / (view.ppu * Y_SQUASH)
      if (b.maxX - b.minX > halfW * 2) camRef.current.x = clamp(camRef.current.x, b.minX + halfW, b.maxX - halfW)
      else camRef.current.x = (b.minX + b.maxX) / 2
      if (b.maxY - b.minY > halfH * 2) camRef.current.y = clamp(camRef.current.y, b.minY + halfH, b.maxY - halfH)
      else camRef.current.y = (b.minY + b.maxY) / 2

      ctx.clearRect(0, 0, view.w, view.h)
      drawGround()
      for (const spot of mapRef.current.spots) drawSpotMark(spot)

      // Vegetação + herói ordenados por Y (o herói passa ATRÁS do que está na frente).
      const camY = camRef.current.y
      const yMin = camY - halfH - 4
      const yMax = camY + halfH + 4
      const camX = camRef.current.x
      const xMin = camX - halfW - 4
      const xMax = camX + halfW + 4
      // Fusão por Y de três listas ordenadas: vegetação, objetos de nó e o herói.
      // Quem tem Y menor está mais longe da câmera e é desenhado primeiro.
      const heroY = heroRef.current.y
      const objs = nodeObjsRef.current

      // Monstro COM boneco entra na profundidade: um chefe de 3.6 unidades
      // pintado por cima da árvore que está na frente dele lê como erro. Vulto
      // continua desenhado por cima de tudo (é silhueta escura, ninguém nota, e
      // mexer nisso seria mudar o que já está bom).
      const mobs: Array<{ y: number; mo: SceneMonster; index: number }> = []
      const lateMobs: Array<{ mo: SceneMonster; index: number }> = []
      monstersRef.current.forEach((mo, idx) => {
        if (visitedRef.current.includes(mo.nodeIndex)) return // já foi abatido
        if (getMonsterSpriteBySlug(mo.speciesSlug)) {
          mobs.push({ y: monsterPos(mo, monsterClockRef.current).y, mo, index: idx })
        } else {
          lateMobs.push({ mo, index: idx })
        }
      })
      mobs.sort((a, b) => a.y - b.y)

      let i = 0
      let j = 0
      let k = 0
      let heroDrawn = false
      while (i < props.length && props[i].pos.y < yMin) i++
      while (j < objs.length && objs[j].pos.y < yMin) j++

      for (;;) {
        const py = i < props.length ? props[i].pos.y : Infinity
        const oy = j < objs.length ? objs[j].pos.y : Infinity
        const my = k < mobs.length ? mobs[k].y : Infinity
        const hy = heroDrawn ? Infinity : heroY
        const next = Math.min(py, oy, my, hy)
        if (next === Infinity || next > yMax) break

        if (next === hy) {
          drawHero()
          heroDrawn = true
        } else if (next === my) {
          const m = mobs[k++]
          drawMonster(m.mo, m.index)
        } else if (py <= oy) {
          const p = props[i++]
          // Poça já foi desenhada com o piso — não entra na profundidade.
          if (p.kind !== 'puddle' && p.pos.x >= xMin && p.pos.x <= xMax) drawProp(p)
        } else {
          drawNodeObject(objs[j++])
        }
      }
      if (!heroDrawn) drawHero()
      // Sobra do merge (o laço para no yMax): drawMonster corta o que está fora
      // da tela, então isso é só garantia de não sumir com ninguém.
      while (k < mobs.length) {
        const m = mobs[k++]
        drawMonster(m.mo, m.index)
      }

      for (const m of lateMobs) drawMonster(m.mo, m.index)

      drawFog()
      drawRain(dt)

      animRef.current = requestAnimationFrame(frame)
    }

    animRef.current = requestAnimationFrame(frame)
    return () => {
      running = false
      cancelAnimationFrame(animRef.current)
      ro.disconnect()
    }
  }, [map])

  return (
    <div
      ref={wrapRef}
      className={`absolute inset-0 overflow-hidden bg-black touch-none select-none ${className}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
