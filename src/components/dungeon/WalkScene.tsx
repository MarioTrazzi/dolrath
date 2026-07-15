'use client'

import React, { useEffect, useRef } from 'react'
import type { DungeonId } from '@/lib/dungeonAdventures'
import { WALK_FULL_STRIP, WALK_HERO_SPRITE, FLORESTA_WALK_FALLBACK } from '@/lib/walkSceneAssets'

// ============================================================
// WalkScene — pan sobre UM mapa (sem tiling):
// personagem serpenteia; câmera acompanha com clamp nas bordas.
// ============================================================

export type WalkMode = 'idle' | 'scroll' | 'approach'

export interface WalkPathPoint {
  x: number
  y: number
}

export interface WalkTrailMark {
  id: number
  /** Índice do nó onde o mark ficou (posição no path). */
  age: number
  emoji: string
  kind?: string
}

export interface WalkSceneProps {
  dungeonId: DungeonId
  accent: string
  mode: WalkMode
  /** Índice do nó atual (0 = entrada). */
  nodeIndex: number
  /** Pontos da trilha em % do mapa (x/y 0–100). */
  pathPoints: WalkPathPoint[]
  /** Retrato do personagem (NFT) no card da trilha. */
  avatar?: string | null
  /** Marks revelados nos nós já visitados. */
  trailMarks?: WalkTrailMark[]
  /** Próximo evento é boss? (ainda mostra ? até o card). */
  nextIsBoss?: boolean
  onApproachComplete?: () => void
  className?: string
}

const MAP_ZOOM = 1.2
/** Duração do scroll (deve bater com o timer do DungeonRun ~1500ms). */
const SCROLL_DUR = 1.5
/** Duração do approach até o nó. */
const APPROACH_DUR = 0.75
/** Fração do segmento coberta no scroll (resto no approach). */
const SCROLL_FRACTION = 0.62

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w * 0.5, h * 0.5)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function paintFallbackMap(
  ctx: CanvasRenderingContext2D,
  mapW: number,
  mapH: number,
  dungeonId: DungeonId,
) {
  const sky = dungeonId === 'caverna' ? '#0a1520' : dungeonId === 'pantano' ? '#0c1408' : dungeonId === 'ruinas' ? '#100818' : '#060e08'
  const mid = dungeonId === 'caverna' ? '#12263a' : dungeonId === 'pantano' ? '#1a2a12' : dungeonId === 'ruinas' ? '#1c1028' : '#0f1c12'
  const ground = dungeonId === 'caverna' ? '#1a3348' : dungeonId === 'pantano' ? '#243818' : dungeonId === 'ruinas' ? '#2a1838' : '#1a2e1a'
  const g = ctx.createLinearGradient(0, 0, 0, mapH)
  g.addColorStop(0, sky)
  g.addColorStop(0.5, mid)
  g.addColorStop(1, ground)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, mapW, mapH)
  // trilha zigzag
  ctx.strokeStyle = 'rgba(55,45,30,0.55)'
  ctx.lineWidth = mapW * 0.08
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const steps = 8
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = mapW * (0.5 + (i % 2 === 0 ? -0.22 : 0.22) * (i === 0 || i === steps ? 0 : 1))
    const y = mapH * (0.94 - t * 0.86)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

/** Bias vertical na tela: início = herói baixo; meio = centro; fim = um pouco mais alto. */
function screenBiasY(progress: number, viewH: number) {
  const t = clamp(progress, 0, 1)
  // 0 → 72% da tela; 0.5 → 55%; 1 → 38%
  const frac = t < 0.5
    ? lerp(0.72, 0.55, t / 0.5)
    : lerp(0.55, 0.38, (t - 0.5) / 0.5)
  return viewH * frac
}

export default function WalkScene({
  dungeonId,
  accent,
  mode,
  nodeIndex,
  pathPoints,
  avatar = null,
  trailMarks = [],
  nextIsBoss = false,
  onApproachComplete,
  className = '',
}: WalkSceneProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heroImgRef = useRef<HTMLImageElement | null>(null)
  const mapImgRef = useRef<HTMLImageElement | null>(null)
  const animRef = useRef(0)
  const segmentTRef = useRef(0)
  const camRef = useRef({ x: 0, y: 0 })
  const camReadyRef = useRef(false)
  const bobRef = useRef(0)
  const modeRef = useRef(mode)
  const approachDoneRef = useRef(false)
  const onCompleteRef = useRef(onApproachComplete)
  const marksRef = useRef(trailMarks)
  const nextBossRef = useRef(nextIsBoss)
  const accentRef = useRef(accent)
  const nodeIndexRef = useRef(nodeIndex)
  const pathRef = useRef(pathPoints)

  modeRef.current = mode
  onCompleteRef.current = onApproachComplete
  marksRef.current = trailMarks
  nextBossRef.current = nextIsBoss
  accentRef.current = accent
  nodeIndexRef.current = nodeIndex
  pathRef.current = pathPoints

  // Reset segment quando o modo muda
  useEffect(() => {
    if (mode === 'scroll') {
      approachDoneRef.current = false
      segmentTRef.current = 0
    } else if (mode === 'approach') {
      approachDoneRef.current = false
      // Continua de onde o scroll parou (não zera)
      if (segmentTRef.current < SCROLL_FRACTION) {
        segmentTRef.current = SCROLL_FRACTION
      }
    } else if (mode === 'idle') {
      segmentTRef.current = 0
      approachDoneRef.current = false
    }
  }, [mode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const heroSrc = avatar || WALK_HERO_SPRITE
      const hero = await loadImage(heroSrc)
      if (!cancelled) heroImgRef.current = hero
      const mapUrl = WALK_FULL_STRIP[dungeonId]
      if (mapUrl) {
        let map = await loadImage(mapUrl)
        if (!map && dungeonId === 'floresta') {
          map = await loadImage(FLORESTA_WALK_FALLBACK)
        }
        if (!cancelled) mapImgRef.current = map
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dungeonId, avatar])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let running = true
    let last = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const { clientWidth: w, clientHeight: h } = wrap
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      camReadyRef.current = false
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const pointAt = (idx: number) => {
      const pts = pathRef.current
      if (!pts.length) return { x: 50, y: 94 }
      const i = clamp(idx, 0, pts.length - 1)
      return pts[i]
    }

    const worldFromPct = (px: number, py: number, mapW: number, mapH: number) => ({
      x: (px / 100) * mapW,
      y: (py / 100) * mapH,
    })

    const drawFrame = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      bobRef.current += dt

      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (w < 2 || h < 2) {
        animRef.current = requestAnimationFrame(drawFrame)
        return
      }

      const m = modeRef.current
      const idx = nodeIndexRef.current
      const pts = pathRef.current
      const lastIdx = Math.max(0, pts.length - 1)

      // --- segmento 0→1 durante scroll/approach ---
      if (m === 'scroll') {
        segmentTRef.current = Math.min(
          SCROLL_FRACTION,
          segmentTRef.current + (SCROLL_FRACTION / SCROLL_DUR) * dt,
        )
      } else if (m === 'approach') {
        const approachRange = 1 - SCROLL_FRACTION
        segmentTRef.current = Math.min(
          1,
          segmentTRef.current + (approachRange / APPROACH_DUR) * dt,
        )
        if (segmentTRef.current >= 1 && !approachDoneRef.current) {
          approachDoneRef.current = true
          onCompleteRef.current?.()
        }
      }

      const segT = m === 'idle' ? 0 : easeInOutCubic(clamp(segmentTRef.current, 0, 1))
      const from = pointAt(idx)
      const to = pointAt(Math.min(idx + 1, lastIdx))
      const heroPctX = lerp(from.x, to.x, segT)
      const heroPctY = lerp(from.y, to.y, segT)

      // Progresso global (inclui segmento em andamento) para bias da câmera
      const baseProg = lastIdx > 0 ? idx / lastIdx : 0
      const stepProg = lastIdx > 0 ? 1 / lastIdx : 0
      const progress = clamp(baseProg + segT * stepProg, 0, 1)

      // --- mapa único (sem tile) ---
      // Garante altura extra pra pan base→topo (em telas altas o zoom lateral não bastava).
      const mapImg = mapImgRef.current
      const aspect = mapImg
        ? mapImg.naturalHeight / mapImg.naturalWidth
        : 1536 / 1024
      const mapW = Math.max(w * MAP_ZOOM, (h * 1.55) / aspect)
      const mapH = mapW * aspect

      const heroWorld = worldFromPct(heroPctX, heroPctY, mapW, mapH)
      const biasY = screenBiasY(progress, h)
      const targetCamX = heroWorld.x - w * 0.5
      const targetCamY = heroWorld.y - biasY
      const maxCamX = Math.max(0, mapW - w)
      const maxCamY = Math.max(0, mapH - h)
      const clampedTarget = {
        x: clamp(targetCamX, 0, maxCamX),
        y: clamp(targetCamY, 0, maxCamY),
      }

      if (!camReadyRef.current) {
        camRef.current = clampedTarget
        camReadyRef.current = true
      } else {
        // follow suave; no fim “estica” um pouco mais rápido
        const follow = progress > 0.85 ? 8 : 5
        const k = 1 - Math.exp(-follow * dt)
        camRef.current = {
          x: lerp(camRef.current.x, clampedTarget.x, k),
          y: lerp(camRef.current.y, clampedTarget.y, k),
        }
      }

      const cam = camRef.current
      const heroScreenX = heroWorld.x - cam.x
      const heroScreenY = heroWorld.y - cam.y

      ctx.clearRect(0, 0, w, h)

      // Desenha o mapa uma vez, deslocado pela câmera
      ctx.save()
      ctx.translate(-cam.x, -cam.y)
      if (mapImg) {
        ctx.drawImage(mapImg, 0, 0, mapW, mapH)
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.fillRect(0, 0, mapW, mapH)
      } else {
        paintFallbackMap(ctx, mapW, mapH, dungeonId)
      }
      ctx.restore()

      // Trail marks nos nós visitados (espaço do mapa → tela)
      for (const mark of marksRef.current) {
        const markIdx = clamp(mark.id, 0, lastIdx)
        const mp = pointAt(markIdx)
        const mw = worldFromPct(mp.x, mp.y, mapW, mapH)
        const sx = mw.x - cam.x
        const sy = mw.y - cam.y
        if (sy < -20 || sy > h + 20 || sx < -20 || sx > w + 20) continue
        ctx.globalAlpha = Math.max(0.3, 0.75 - mark.age * 0.12)
        ctx.font = '15px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(mark.emoji, sx, sy)
        ctx.globalAlpha = 1
      }

      // Halo em volta do herói
      const lightR = Math.min(w, h) * 0.52
      const fog = ctx.createRadialGradient(heroScreenX, heroScreenY, lightR * 0.14, heroScreenX, heroScreenY, lightR)
      fog.addColorStop(0, 'rgba(0,0,0,0)')
      fog.addColorStop(0.42, 'rgba(0,0,0,0.14)')
      fog.addColorStop(0.78, 'rgba(0,0,0,0.68)')
      fog.addColorStop(1, 'rgba(0,0,0,0.86)')
      ctx.fillStyle = fog
      ctx.fillRect(0, 0, w, h)

      const warm = ctx.createRadialGradient(heroScreenX, heroScreenY, 0, heroScreenX, heroScreenY, lightR * 0.8)
      warm.addColorStop(0, 'rgba(255,220,140,0.16)')
      warm.addColorStop(0.5, 'rgba(255,200,100,0.05)')
      warm.addColorStop(1, 'transparent')
      ctx.fillStyle = warm
      ctx.fillRect(heroScreenX - lightR, heroScreenY - lightR, lightR * 2, lightR * 2)

      // "?" no próximo nó (à frente na trilha)
      const showMarker = m === 'approach' || m === 'scroll'
      if (showMarker && idx < lastIdx) {
        const next = pointAt(idx + 1)
        const nw = worldFromPct(next.x, next.y, mapW, mapH)
        const mx = nw.x - cam.x
        const my = nw.y - cam.y
        const pulse = 0.85 + Math.sin(bobRef.current * 4) * 0.15
        const mr = 13 * pulse
        ctx.beginPath()
        ctx.arc(mx, my, mr, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(15,15,30,0.9)'
        ctx.fill()
        ctx.strokeStyle = nextBossRef.current ? '#f39c12' : accentRef.current
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.font = 'bold 15px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = nextBossRef.current ? '#f39c12' : accentRef.current
        ctx.fillText('?', mx, my + 1)
      }

      // Card retangular do personagem
      const sneak = m === 'scroll' || m === 'approach'
      const bob = sneak ? Math.sin(bobRef.current * 7) * 1.8 : Math.sin(bobRef.current * 2) * 1.0
      const hero = heroImgRef.current
      const cardW = Math.min(34, w * 0.085)
      const cardH = cardW * 1.28
      const cardX = heroScreenX - cardW / 2
      const cardY = heroScreenY + bob - cardH * 0.55
      const radius = Math.max(4, cardW * 0.12)

      if (hero) {
        ctx.save()
        roundRectPath(ctx, cardX, cardY, cardW, cardH, radius)
        ctx.clip()
        const iw = hero.naturalWidth || hero.width
        const ih = hero.naturalHeight || hero.height
        const scale = Math.max(cardW / iw, cardH / ih)
        const dw = iw * scale
        const dh = ih * scale
        ctx.drawImage(hero, cardX + (cardW - dw) / 2, cardY + (cardH - dh) / 2, dw, dh)
        ctx.restore()

        roundRectPath(ctx, cardX, cardY, cardW, cardH, radius)
        ctx.strokeStyle = accentRef.current
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath()
        ctx.ellipse(heroScreenX, cardY + cardH + 3, cardW * 0.38, 3.5, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = '#2a1a12'
        roundRectPath(ctx, cardX, cardY, cardW, cardH, radius)
        ctx.fill()
        ctx.strokeStyle = accentRef.current
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // chuva leve
      if (m !== 'approach' || segT < 0.85) {
        ctx.strokeStyle = 'rgba(200,220,255,0.1)'
        ctx.lineWidth = 1
        const rainSeed = Math.floor(bobRef.current * 40 + cam.y * 0.1)
        for (let i = 0; i < 16; i++) {
          const rx = (i * 97 + rainSeed * 13) % w
          const ry = (i * 53 + rainSeed * 29) % h
          ctx.beginPath()
          ctx.moveTo(rx, ry)
          ctx.lineTo(rx + 2, ry + 10)
          ctx.stroke()
        }
      }

      animRef.current = requestAnimationFrame(drawFrame)
    }

    animRef.current = requestAnimationFrame(drawFrame)
    return () => {
      running = false
      cancelAnimationFrame(animRef.current)
      ro.disconnect()
    }
  }, [dungeonId])

  return (
    <div ref={wrapRef} className={`absolute inset-0 overflow-hidden bg-black ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
    </div>
  )
}
