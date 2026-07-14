'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import type { DungeonId } from '@/lib/dungeonAdventures'
import type { MapPoint, NodeVisualState, RevealedNode } from '@/components/dungeon/DungeonMap'
import { KIND_GLOW } from '@/components/dungeon/DungeonMap'
import {
  WALK_FULL_STRIP,
  WALK_HERO_SPRITE,
  pickWalkSegments,
  segmentCountForTrail,
  seedRng,
  type WalkSegmentDef,
  type WalkSegmentKind,
} from '@/lib/walkSceneAssets'

// ============================================================
// WalkScene — cena vertical estilo World of Anterra:
// strip/segmentos + herói andando + halo de luz + nós no caminho.
// Um único canvas para fluidez no mobile.
// ============================================================

export interface WalkSceneProps {
  dungeonId: DungeonId
  accent: string
  points: MapPoint[]
  tokenIdx: number
  moving: boolean
  /** Dim/blur visual quando o combate está por cima. */
  combatMode?: boolean
  nodeState: (nodeIdx: number) => NodeVisualState
  revealed: Record<number, RevealedNode | undefined>
  /** Seed da run (runId) — determina sequência de segmentos. */
  seed?: string
  className?: string
}

const SEG_H_RATIO = 0.55 // cada segmento = 55% da altura do viewport (mundo)

function themeColors(id: DungeonId): { sky: string; mid: string; ground: string; accent: string } {
  switch (id) {
    case 'caverna':
      return { sky: '#0a1520', mid: '#12263a', ground: '#1a3348', accent: '#22d3ee' }
    case 'pantano':
      return { sky: '#0c1408', mid: '#1a2a12', ground: '#243818', accent: '#a3e635' }
    case 'ruinas':
      return { sky: '#100818', mid: '#1c1028', ground: '#2a1838', accent: '#c084fc' }
    default:
      return { sky: '#060e08', mid: '#0f1c12', ground: '#1a2e1a', accent: '#34d399' }
  }
}

function paintProceduralSegment(
  ctx: CanvasRenderingContext2D,
  kind: WalkSegmentKind,
  x: number,
  y: number,
  w: number,
  h: number,
  dungeonId: DungeonId,
  seed: string,
) {
  const c = themeColors(dungeonId)
  const rand = seedRng(`${seed}:${kind}:${y}`)

  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, c.sky)
  g.addColorStop(0.45, c.mid)
  g.addColorStop(1, c.ground)
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  // path central (entrada embaixo / saída em cima — mesma faixa)
  const pathX = x + w * 0.5
  const pathW = w * 0.16
  ctx.fillStyle = dungeonId === 'pantano' ? 'rgba(40,55,30,0.55)' : 'rgba(55,45,30,0.5)'
  ctx.beginPath()
  ctx.moveTo(pathX - pathW * 0.55, y + h)
  ctx.quadraticCurveTo(pathX - pathW * 0.2, y + h * 0.5, pathX - pathW * 0.5, y)
  ctx.lineTo(pathX + pathW * 0.5, y)
  ctx.quadraticCurveTo(pathX + pathW * 0.2, y + h * 0.5, pathX + pathW * 0.55, y + h)
  ctx.closePath()
  ctx.fill()

  // foliage / rocks / decor por kind
  const drawTree = (tx: number, ty: number, s: number) => {
    ctx.fillStyle = 'rgba(8,18,10,0.95)'
    ctx.beginPath()
    ctx.moveTo(tx, ty - s)
    ctx.lineTo(tx - s * 0.55, ty)
    ctx.lineTo(tx + s * 0.55, ty)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(30,20,10,0.8)'
    ctx.fillRect(tx - s * 0.08, ty, s * 0.16, s * 0.25)
  }

  if (kind === 'pines' || kind === 'clearing' || kind === 'path') {
    for (let i = 0; i < 7; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const tx = pathX + side * (w * (0.22 + rand() * 0.22))
      const ty = y + h * (0.15 + rand() * 0.7)
      drawTree(tx, ty, 28 + rand() * 40)
    }
  }
  if (kind === 'rocks' || kind === 'ruins' || kind === 'crystals') {
    for (let i = 0; i < 5; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const rx = pathX + side * (w * (0.18 + rand() * 0.25))
      const ry = y + h * (0.2 + rand() * 0.6)
      ctx.fillStyle = kind === 'crystals' ? 'rgba(80,140,200,0.35)' : 'rgba(40,40,50,0.7)'
      ctx.beginPath()
      ctx.moveTo(rx, ry - 18 - rand() * 20)
      ctx.lineTo(rx - 22, ry + 10)
      ctx.lineTo(rx + 24, ry + 12)
      ctx.closePath()
      ctx.fill()
    }
  }
  if (kind === 'brook' || kind === 'mire') {
    ctx.fillStyle = kind === 'mire' ? 'rgba(60,90,40,0.35)' : 'rgba(40,90,120,0.35)'
    ctx.beginPath()
    ctx.ellipse(pathX, y + h * 0.55, pathW * 1.4, h * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (kind === 'cave-mouth' || kind === 'bones') {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.beginPath()
    ctx.ellipse(pathX, y + h * 0.35, w * 0.14, h * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // vinheta lateral
  const edge = ctx.createLinearGradient(x, 0, x + w, 0)
  edge.addColorStop(0, 'rgba(0,0,0,0.55)')
  edge.addColorStop(0.25, 'transparent')
  edge.addColorStop(0.75, 'transparent')
  edge.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = edge
  ctx.fillRect(x, y, w, h)
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

export default function WalkScene({
  dungeonId,
  accent,
  points,
  tokenIdx,
  moving,
  combatMode = false,
  nodeState,
  revealed,
  seed = 'default',
  className = '',
}: WalkSceneProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heroImgRef = useRef<HTMLImageElement | null>(null)
  const stripImgRef = useRef<HTMLImageElement | null>(null)
  const segImgsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const animRef = useRef<number>(0)
  const displayIdxRef = useRef(tokenIdx)
  const targetIdxRef = useRef(tokenIdx)
  const bobRef = useRef(0)
  const liveRef = useRef({ tokenIdx, moving, combatMode, nodeState, revealed, accent, points })
  liveRef.current = { tokenIdx, moving, combatMode, nodeState, revealed, accent, points }

  const segments = useMemo(
    () => pickWalkSegments(dungeonId, seed, segmentCountForTrail(points.length)),
    [dungeonId, seed, points.length],
  )

  // Suaviza tokenIdx → displayIdx quando moving
  useEffect(() => {
    targetIdxRef.current = tokenIdx
    if (!moving) displayIdxRef.current = tokenIdx
  }, [tokenIdx, moving])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const hero = await loadImage(WALK_HERO_SPRITE)
      if (!cancelled) heroImgRef.current = hero

      const stripUrl = WALK_FULL_STRIP[dungeonId]
      if (stripUrl) {
        const strip = await loadImage(stripUrl)
        if (!cancelled) stripImgRef.current = strip
      }

      const map = new Map<string, HTMLImageElement>()
      await Promise.all(
        segments.map(async (s) => {
          if (!s.src) return
          const img = await loadImage(s.src)
          if (img && s.src) map.set(s.src, img)
        }),
      )
      if (!cancelled) segImgsRef.current = map
    })()
    return () => {
      cancelled = true
    }
  }, [dungeonId, segments])

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
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    const drawFrame = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      bobRef.current += dt

      const live = liveRef.current
      const pts = live.points
      const isMoving = live.moving
      const inCombat = live.combatMode

      // interpola displayIdx em direção ao target enquanto moving
      const target = targetIdxRef.current
      if (isMoving || Math.abs(displayIdxRef.current - target) > 0.001) {
        const speed = isMoving ? 2.2 : 6
        displayIdxRef.current = lerp(displayIdxRef.current, target, 1 - Math.exp(-speed * dt))
        if (!isMoving && Math.abs(displayIdxRef.current - target) < 0.01) {
          displayIdxRef.current = target
        }
      }

      const w = wrap.clientWidth
      const h = wrap.clientHeight
      ctx.clearRect(0, 0, w, h)

      const strip = stripImgRef.current
      const hasSegAssets = segments.some(s => s.src && segImgsRef.current.has(s.src))

      let worldH: number
      const worldW = w
      let drawWorld: (scrollY: number) => void

      // Floresta: strip único até existir ≥1 segmento gerado carregado.
      // Outras masmorras / com assets: segmentos (imagem ou procedural).
      if (strip && dungeonId === 'floresta' && !hasSegAssets) {
        const aspect = strip.naturalHeight / strip.naturalWidth
        worldH = Math.max(h * 2.4, w * aspect)
        drawWorld = (scrollY) => {
          ctx.drawImage(strip, 0, -scrollY, worldW, worldH)
          ctx.fillStyle = 'rgba(0,0,0,0.25)'
          ctx.fillRect(0, -scrollY, worldW, worldH)
        }
      } else {
        const segH = h * SEG_H_RATIO
        worldH = Math.max(h * 2.4, segH * segments.length)
        drawWorld = (scrollY) => {
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i]
            const sy = worldH - (i + 1) * segH
            const img = seg.src ? segImgsRef.current.get(seg.src) : undefined
            if (img) {
              ctx.drawImage(img, 0, sy - scrollY, worldW, segH)
            } else {
              paintProceduralSegment(ctx, seg.kind, 0, sy - scrollY, worldW, segH, dungeonId, seed)
            }
          }
        }
      }

      const worldPos = (idx: number) => {
        const lastIdx = Math.max(1, pts.length - 1)
        const clamped = Math.min(lastIdx, Math.max(0, idx))
        const base = pts[Math.floor(clamped)] ?? pts[0]
        const next = pts[Math.min(lastIdx, Math.ceil(clamped))] ?? base
        const f = clamped - Math.floor(clamped)
        return {
          xPct: lerp(base.x, next.x, f),
          yPct: lerp(base.y, next.y, f),
        }
      }

      const pos = worldPos(displayIdxRef.current)
      const heroWorldX = (pos.xPct / 100) * worldW
      const heroWorldY = (pos.yPct / 100) * worldH
      const camY = Math.min(Math.max(0, heroWorldY - h * 0.55), Math.max(0, worldH - h))

      drawWorld(camY)

      const heroScreenX = heroWorldX
      const heroScreenY = heroWorldY - camY

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const nx = (p.x / 100) * worldW
        const ny = (p.y / 100) * worldH - camY
        if (ny < -40 || ny > h + 40) continue
        const st = live.nodeState(i)
        const rev = live.revealed[i]
        const isBoss = p.kind === 'boss'
        const r = isBoss ? 14 : p.kind === 'main' ? 10 : 6
        let fill = 'rgba(255,255,255,0.15)'
        if (st === 'done') fill = rev ? (KIND_GLOW[rev.kind] || live.accent) : 'rgba(80,200,120,0.5)'
        else if (st === 'current') fill = live.accent
        else if (st === 'next') fill = p.kind === 'main' ? '#f39c12' : live.accent
        ctx.beginPath()
        ctx.arc(nx, ny, r, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.globalAlpha = st === 'locked' ? 0.35 : 0.85
        ctx.fill()
        ctx.globalAlpha = 1
        if (st === 'next') {
          ctx.strokeStyle = fill
          ctx.lineWidth = 2
          ctx.stroke()
        }
        if (rev && st === 'done') {
          ctx.font = `${isBoss ? 14 : 11}px serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(rev.emoji, nx, ny)
        }
      }

      const lightR = inCombat ? Math.min(w, h) * 0.22 : Math.min(w, h) * 0.34
      const fog = ctx.createRadialGradient(
        heroScreenX,
        heroScreenY,
        lightR * 0.12,
        heroScreenX,
        heroScreenY,
        lightR,
      )
      fog.addColorStop(0, 'rgba(0,0,0,0)')
      fog.addColorStop(0.45, inCombat ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.25)')
      fog.addColorStop(0.78, inCombat ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.82)')
      fog.addColorStop(1, inCombat ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.94)')
      ctx.fillStyle = fog
      ctx.fillRect(0, 0, w, h)

      const warm = ctx.createRadialGradient(
        heroScreenX,
        heroScreenY,
        0,
        heroScreenX,
        heroScreenY,
        lightR * 0.85,
      )
      warm.addColorStop(0, 'rgba(255,220,140,0.2)')
      warm.addColorStop(0.45, 'rgba(255,200,100,0.07)')
      warm.addColorStop(1, 'transparent')
      ctx.fillStyle = warm
      ctx.fillRect(heroScreenX - lightR, heroScreenY - lightR, lightR * 2, lightR * 2)

      const bob = isMoving ? Math.sin(bobRef.current * 10) * 3 : Math.sin(bobRef.current * 2.2) * 1.5
      const hero = heroImgRef.current
      const hs = Math.min(56, w * 0.14)
      if (hero) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(heroScreenX, heroScreenY + bob - 4, hs * 0.48, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(hero, heroScreenX - hs / 2, heroScreenY + bob - hs * 0.65, hs, hs)
        ctx.restore()
        ctx.strokeStyle = live.accent
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(heroScreenX, heroScreenY + bob - 4, hs * 0.48, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        ctx.fillStyle = '#2a1a12'
        ctx.beginPath()
        ctx.ellipse(heroScreenX, heroScreenY + bob + 6, 10, 14, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#1a120c'
        ctx.beginPath()
        ctx.arc(heroScreenX, heroScreenY + bob - 8, 9, 0, Math.PI * 2)
        ctx.fill()
      }

      if (!inCombat) {
        ctx.strokeStyle = 'rgba(200,220,255,0.12)'
        ctx.lineWidth = 1
        const rainSeed = Math.floor(bobRef.current * 40)
        for (let i = 0; i < 18; i++) {
          const rx = ((i * 97 + rainSeed * 13) % w)
          const ry = ((i * 53 + rainSeed * 29) % h)
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
  }, [dungeonId, seed, segments])

  return (
    <div ref={wrapRef} className={`absolute inset-0 overflow-hidden bg-black ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
    </div>
  )
}

/** Export leve para testes / debug de segmentos. */
export type { WalkSegmentDef }
