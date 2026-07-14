'use client'

import React, { useEffect, useRef } from 'react'
import type { DungeonId } from '@/lib/dungeonAdventures'
import { WALK_FULL_STRIP, WALK_HERO_SPRITE, FLORESTA_WALK_FALLBACK } from '@/lib/walkSceneAssets'

// ============================================================
// WalkScene — treadmill Anterra:
// herói FIXO na tela; o mundo rola; surge "?"; ícone se aproxima.
// ============================================================

export type WalkMode = 'idle' | 'scroll' | 'approach'

export interface WalkTrailMark {
  id: number
  /** 0 = acabou de passar (atrás), valores maiores = mais atrás no scroll */
  age: number
  emoji: string
  kind?: string
}

export interface WalkSceneProps {
  dungeonId: DungeonId
  accent: string
  mode: WalkMode
  /** Marks revelados atrás do herói (rastro). */
  trailMarks?: WalkTrailMark[]
  /** Próximo evento é boss? (ainda mostra ? até o card). */
  nextIsBoss?: boolean
  onApproachComplete?: () => void
  className?: string
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

function paintFallbackStrip(
  ctx: CanvasRenderingContext2D,
  y: number,
  w: number,
  h: number,
  dungeonId: DungeonId,
) {
  const sky = dungeonId === 'caverna' ? '#0a1520' : dungeonId === 'pantano' ? '#0c1408' : dungeonId === 'ruinas' ? '#100818' : '#060e08'
  const mid = dungeonId === 'caverna' ? '#12263a' : dungeonId === 'pantano' ? '#1a2a12' : dungeonId === 'ruinas' ? '#1c1028' : '#0f1c12'
  const ground = dungeonId === 'caverna' ? '#1a3348' : dungeonId === 'pantano' ? '#243818' : dungeonId === 'ruinas' ? '#2a1838' : '#1a2e1a'
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, sky)
  g.addColorStop(0.5, mid)
  g.addColorStop(1, ground)
  ctx.fillStyle = g
  ctx.fillRect(0, y, w, h)
  // path
  const pathX = w * 0.5
  const pathW = w * 0.16
  ctx.fillStyle = 'rgba(55,45,30,0.55)'
  ctx.beginPath()
  ctx.moveTo(pathX - pathW * 0.5, y + h)
  ctx.lineTo(pathX - pathW * 0.45, y)
  ctx.lineTo(pathX + pathW * 0.45, y)
  ctx.lineTo(pathX + pathW * 0.5, y + h)
  ctx.closePath()
  ctx.fill()
  // trees
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const tx = pathX + side * (w * (0.22 + (i % 3) * 0.08))
    const ty = y + h * (0.1 + (i * 0.11) % 0.8)
    const s = 30 + (i % 4) * 10
    ctx.fillStyle = 'rgba(8,18,10,0.95)'
    ctx.beginPath()
    ctx.moveTo(tx, ty - s)
    ctx.lineTo(tx - s * 0.55, ty)
    ctx.lineTo(tx + s * 0.55, ty)
    ctx.closePath()
    ctx.fill()
  }
}

export default function WalkScene({
  dungeonId,
  accent,
  mode,
  trailMarks = [],
  nextIsBoss = false,
  onApproachComplete,
  className = '',
}: WalkSceneProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heroImgRef = useRef<HTMLImageElement | null>(null)
  const stripImgRef = useRef<HTMLImageElement | null>(null)
  const animRef = useRef(0)
  const worldOffsetRef = useRef(0)
  const approachTRef = useRef(0)
  const bobRef = useRef(0)
  const modeRef = useRef(mode)
  const approachDoneRef = useRef(false)
  const onCompleteRef = useRef(onApproachComplete)
  const marksRef = useRef(trailMarks)
  const nextBossRef = useRef(nextIsBoss)
  const accentRef = useRef(accent)

  modeRef.current = mode
  onCompleteRef.current = onApproachComplete
  marksRef.current = trailMarks
  nextBossRef.current = nextIsBoss
  accentRef.current = accent

  // Reset approach flags when mode changes
  useEffect(() => {
    if (mode === 'scroll') {
      approachDoneRef.current = false
      approachTRef.current = 0
    } else if (mode === 'approach') {
      approachDoneRef.current = false
      approachTRef.current = 0
    } else if (mode === 'idle') {
      approachTRef.current = 0
      approachDoneRef.current = false
    }
  }, [mode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const hero = await loadImage(WALK_HERO_SPRITE)
      if (!cancelled) heroImgRef.current = hero
      const stripUrl = WALK_FULL_STRIP[dungeonId]
      if (stripUrl) {
        let strip = await loadImage(stripUrl)
        if (!strip && dungeonId === 'floresta') {
          strip = await loadImage(FLORESTA_WALK_FALLBACK)
        }
        if (!cancelled) stripImgRef.current = strip
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dungeonId])

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

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

    const drawFrame = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      bobRef.current += dt

      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const m = modeRef.current

      // --- treadmill scroll ---
      const scrollSpeed = h * 0.22 // px/s
      if (m === 'scroll') {
        worldOffsetRef.current += scrollSpeed * dt
        // after ~1.5s of scroll, signal transition to approach via parent
        // Parent owns mode; we just animate. Parent switches to approach on timer.
      }

      // --- approach 0→1 ---
      if (m === 'approach') {
        approachTRef.current = Math.min(1, approachTRef.current + dt / 0.75)
        if (approachTRef.current >= 1 && !approachDoneRef.current) {
          approachDoneRef.current = true
          onCompleteRef.current?.()
        }
      }

      ctx.clearRect(0, 0, w, h)

      const strip = stripImgRef.current
      const tileH = strip
        ? Math.max(h * 1.35, (w * strip.naturalHeight) / strip.naturalWidth)
        : h * 1.6

      // draw looping strip (two tiles) — world scrolls UP (offset increases → draw lower)
      const off = worldOffsetRef.current % tileH
      const drawTile = (sy: number) => {
        if (strip) {
          ctx.drawImage(strip, 0, sy, w, tileH)
          ctx.fillStyle = 'rgba(0,0,0,0.18)'
          ctx.fillRect(0, sy, w, tileH)
        } else {
          paintFallbackStrip(ctx, sy, w, tileH, dungeonId)
        }
      }
      // tiles covering viewport
      drawTile(-off)
      drawTile(-off + tileH)
      drawTile(-off - tileH)

      // Hero screen-fixed position (center-bottom of light)
      const heroBaseX = w * 0.5
      const heroBaseY = h * 0.62

      // Event marker appears ahead (above hero) during approach / end of scroll
      const markerX = w * 0.5 + Math.sin(worldOffsetRef.current * 0.01) * (w * 0.06)
      const markerY = h * 0.28
      const showMarker = m === 'approach' || m === 'scroll'
      const approachT = easeOutCubic(approachTRef.current)

      // Hero moves toward marker during approach
      const heroX = m === 'approach' ? heroBaseX + (markerX - heroBaseX) * approachT : heroBaseX
      const heroY = m === 'approach' ? heroBaseY + (markerY - heroBaseY) * approachT : heroBaseY

      // Trail marks behind (below hero)
      for (const mark of marksRef.current) {
        const my = heroBaseY + 40 + mark.age * 55
        if (my > h + 20) continue
        const mx = heroBaseX + Math.sin(mark.id * 1.7) * 18
        ctx.globalAlpha = Math.max(0.25, 0.7 - mark.age * 0.15)
        ctx.font = '16px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(mark.emoji, mx, my)
        ctx.globalAlpha = 1
      }

      // Halo (larger visibility)
      const lightR = Math.min(w, h) * 0.48
      const fog = ctx.createRadialGradient(heroX, heroY, lightR * 0.12, heroX, heroY, lightR)
      fog.addColorStop(0, 'rgba(0,0,0,0)')
      fog.addColorStop(0.4, 'rgba(0,0,0,0.18)')
      fog.addColorStop(0.75, 'rgba(0,0,0,0.72)')
      fog.addColorStop(1, 'rgba(0,0,0,0.88)')
      ctx.fillStyle = fog
      ctx.fillRect(0, 0, w, h)

      const warm = ctx.createRadialGradient(heroX, heroY, 0, heroX, heroY, lightR * 0.85)
      warm.addColorStop(0, 'rgba(255,220,140,0.18)')
      warm.addColorStop(0.5, 'rgba(255,200,100,0.06)')
      warm.addColorStop(1, 'transparent')
      ctx.fillStyle = warm
      ctx.fillRect(heroX - lightR, heroY - lightR, lightR * 2, lightR * 2)

      // "?" marker
      if (showMarker) {
        const pulse = 0.85 + Math.sin(bobRef.current * 4) * 0.15
        const mr = 14 * pulse
        ctx.beginPath()
        ctx.arc(markerX, markerY, mr, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(15,15,30,0.9)'
        ctx.fill()
        ctx.strokeStyle = nextBossRef.current ? '#f39c12' : accentRef.current
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.font = 'bold 16px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = nextBossRef.current ? '#f39c12' : accentRef.current
        ctx.fillText(nextBossRef.current ? '?' : '?', markerX, markerY + 1)
      }

      // Hero sprite (sneak bob)
      const sneak = m === 'scroll' || m === 'approach'
      const bob = sneak ? Math.sin(bobRef.current * 7) * 2.2 : Math.sin(bobRef.current * 2) * 1.2
      const hero = heroImgRef.current
      const hs = Math.min(48, w * 0.12)
      if (hero) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(heroX, heroY + bob - 2, hs * 0.46, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(hero, heroX - hs / 2, heroY + bob - hs * 0.62, hs, hs)
        ctx.restore()
        ctx.strokeStyle = accentRef.current
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(heroX, heroY + bob - 2, hs * 0.46, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        ctx.fillStyle = '#2a1a12'
        ctx.beginPath()
        ctx.ellipse(heroX, heroY + bob + 6, 9, 12, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#1a120c'
        ctx.beginPath()
        ctx.arc(heroX, heroY + bob - 6, 8, 0, Math.PI * 2)
        ctx.fill()
      }

      // light rain
      if (m !== 'approach' || approachT < 0.5) {
        ctx.strokeStyle = 'rgba(200,220,255,0.1)'
        ctx.lineWidth = 1
        const rainSeed = Math.floor(bobRef.current * 40 + worldOffsetRef.current * 0.1)
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
