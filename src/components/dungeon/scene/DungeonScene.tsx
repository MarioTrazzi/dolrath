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
import { drawNodeIcon, nodeIconColor } from '@/lib/dungeonScene/icons'
import {
  monsterFacing,
  monsterPos,
  planMonsters,
  type SceneMonster,
} from '@/lib/dungeonScene/monsters'

export interface DungeonSceneProps {
  map: SceneMapDef
  /** Retrato do herói (NFT). Sem ele, desenha um boneco procedural. */
  heroSprite?: string | null
  /** O que há em cada nó (planNodeContents). Sem isto, o nó vira só um "?". */
  contents?: Map<number, SpotContent>
  /** Nó que o herói procura agora. */
  targetNode: number
  /** Nós já resolvidos (marcador apagado). */
  visitedNodes: number[]
  /** Congela o mundo (combate aberto por cima). */
  paused?: boolean
  onReachSpot?: (spot: MapSpot) => void
  className?: string
}

const WALK_SPEED = 6.2 // unidades/s
const ARRIVE_EPS = 0.55
/** Achatamento vertical — dá o ar de 3/4 sem sair do top-down. */
const Y_SQUASH = 0.82
const CAM_FOLLOW = 5.5

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

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
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
  contents,
  targetNode,
  visitedNodes,
  paused = false,
  onReachSpot,
  className = '',
}: DungeonSceneProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heroImgRef = useRef<HTMLImageElement | null>(null)
  const spritesRef = useRef(new Map<string, Sprite | null>())
  /** Altura em px da MAIOR variante de cada tipo — base da escala relativa. */
  const kindScaleRef = useRef(new Map<string, number>())
  const groundRef = useRef<HTMLImageElement | null>(null)
  const nodeObjsRef = useRef<NodeObject[]>([])
  const monstersRef = useRef<SceneMonster[]>([])
  const animRef = useRef(0)

  // ---- estado do mundo (tudo em ref: o loop não reinicia) ----
  const heroRef = useRef<Vec2>({ ...map.entrance })
  const camRef = useRef<Vec2>({ ...map.entrance })
  const camReadyRef = useRef(false)
  const facingRef = useRef(1)
  const walkPhaseRef = useRef(0)
  const timeRef = useRef(0)
  const queueRef = useRef<Vec2[]>([])
  const queuedNodeRef = useRef(-1)
  const reachedRef = useRef(new Set<number>())

  // ---- props espelhadas ----
  const contentsRef = useRef(contents)
  const targetRef = useRef(targetNode)
  const visitedRef = useRef(visitedNodes)
  const pausedRef = useRef(paused)
  const onReachRef = useRef(onReachSpot)
  const mapRef = useRef(map)

  contentsRef.current = contents
  targetRef.current = targetNode
  visitedRef.current = visitedNodes
  pausedRef.current = paused
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

  // Objetos de achado (baú, entulho, erva, fonte) existem NO MUNDO, ordenados
  // por profundidade junto com a vegetação — não são crachá flutuante.
  useEffect(() => {
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
    monstersRef.current = contents ? planMonsters(map, contents, map.seed) : []
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
    let view = { w: 0, h: 0, ppu: 16 }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Retrato: o enquadramento é ditado pela LARGURA — ~26 unidades de mundo
      // atravessadas na tela, em qualquer altura de aparelho.
      view = { w, h, ppu: clamp(w / 26, 10, 34) }
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
      const r = (spot.kind === 'boss' ? 2.6 : 1.8) * view.ppu * (isTarget ? pulse : 1)

      // anel no chão
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(1, Y_SQUASH)
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.strokeStyle = done ? 'rgba(120,120,120,0.35)' : color
      ctx.globalAlpha = done ? 0.5 : isTarget ? 0.95 : 0.6
      ctx.lineWidth = 2
      ctx.stroke()
      if (isTarget && !done) {
        ctx.globalAlpha = 0.12
        ctx.fillStyle = color
        ctx.fill()
      }
      ctx.restore()
      ctx.globalAlpha = 1

      // Achado tem OBJETO no mundo (desenhado no passe de profundidade); aqui só
      // o anel. Combate mostra o ícone flutuando sobre o ponto.
      if (content?.category === 'find') return

      const iconY = y - r * 0.85 - view.ppu * 0.75
      const float = isTarget && !done ? Math.sin(timeRef.current * 2.4) * view.ppu * 0.12 : 0
      if (content) {
        const size = view.ppu * (content.flavor === 'boss' ? 2.4 : 1.7)
        drawNodeIcon(ctx, content.flavor, x, iconY + float, size, {
          color: done ? 'rgba(150,150,150,0.55)' : undefined,
          alpha: done ? 0.5 : isTarget ? 1 : 0.8,
        })
      } else {
        ctx.font = `bold ${Math.round(view.ppu * 1.15)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = done ? 'rgba(160,160,160,0.5)' : color
        ctx.fillText(done ? '·' : '?', x, iconY)
      }
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
      const img = spriteOf(obj.flavor, 1)
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
        // Boneco procedural (placeholder até o sprite de 4 direções da F2).
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
     * Vulto de monstro: silhueta escura com olhos acesos. Nada de arte pintada
     * aqui — ver o porquê em lib/dungeonScene/monsters.ts.
     */
    const drawMonster = (mo: SceneMonster) => {
      const t = timeRef.current
      const wp = monsterPos(mo, t)
      const x = sx(wp.x)
      const y = sy(wp.y)
      if (x < -60 || x > view.w + 60 || y < -60 || y > view.h + 60) return

      const u = mo.size * view.ppu
      const face = monsterFacing(mo, t)
      const bob = Math.sin(t * mo.speed * 3.2 + mo.phase) * u * 0.04

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

    const drawRain = () => {
      ctx.strokeStyle = 'rgba(190,215,255,0.10)'
      ctx.lineWidth = 1
      const seed = Math.floor(timeRef.current * 45)
      for (let i = 0; i < 26; i++) {
        const rx = (i * 137 + seed * 17) % view.w
        const ry = (i * 89 + seed * 41) % view.h
        ctx.beginPath()
        ctx.moveTo(rx, ry)
        ctx.lineTo(rx + 2.5, ry + 13)
        ctx.stroke()
      }
    }

    // ---- passo de mundo ----
    const stepWorld = (dt: number) => {
      const m = mapRef.current
      const hero = heroRef.current
      let dir: Vec2 | null = null

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
        } else {
          // Sem rota: perambula devagar em volta do ponto (dá vida à espera).
          const t = timeRef.current
          dir = { x: Math.cos(t * 0.6) * 0.25, y: Math.sin(t * 0.43) * 0.25 }
        }
      }

      if (dir) {
        const speed = WALK_SPEED * Math.hypot(dir.x, dir.y)
        const want = { x: hero.x + dir.x * WALK_SPEED * dt, y: hero.y + dir.y * WALK_SPEED * dt }
        const next = clampToWalkable(m, want)
        heroRef.current = next
        if (Math.abs(dir.x) > 0.05) facingRef.current = dir.x > 0 ? 1 : -1
        walkPhaseRef.current += dt * (6 + speed)
      }

      // Nó de combate abre ao ENCOSTAR no vulto, não ao pisar no centro do
      // bolsão: é o monstro que puxa a luta, como em Chrono Trigger. Nó de
      // achado segue abrindo por proximidade do ponto.
      const targetSpot = m.spots.find(s => s.nodeIndex === targetRef.current)
      const touched =
        targetSpot &&
        monstersRef.current.some(
          mo =>
            mo.nodeIndex === targetSpot.nodeIndex &&
            dist(heroRef.current, monsterPos(mo, timeRef.current)) < 1.5,
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

      if (!pausedRef.current) stepWorld(dt)

      // câmera
      const target = heroRef.current
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
      let i = 0
      let j = 0
      let heroDrawn = false
      while (i < props.length && props[i].pos.y < yMin) i++
      while (j < objs.length && objs[j].pos.y < yMin) j++

      for (;;) {
        const py = i < props.length ? props[i].pos.y : Infinity
        const oy = j < objs.length ? objs[j].pos.y : Infinity
        const hy = heroDrawn ? Infinity : heroY
        const next = Math.min(py, oy, hy)
        if (next === Infinity || next > yMax) break

        if (next === hy) {
          drawHero()
          heroDrawn = true
        } else if (py <= oy) {
          const p = props[i++]
          // Poça já foi desenhada com o piso — não entra na profundidade.
          if (p.kind !== 'puddle' && p.pos.x >= xMin && p.pos.x <= xMax) drawProp(p)
        } else {
          drawNodeObject(objs[j++])
        }
      }
      if (!heroDrawn) drawHero()

      for (const mo of monstersRef.current) {
        if (visitedRef.current.includes(mo.nodeIndex)) continue // já foi abatido
        drawMonster(mo)
      }

      drawFog()
      drawRain()

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
