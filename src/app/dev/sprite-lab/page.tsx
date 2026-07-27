'use client'

/**
 * 🧪 Página DEV do boneco de caminhada raça×classe (sem auth/DB).
 * Serve para calibrar ordem do ciclo / fps / altura antes de congelar em heroSprites.ts —
 * mesmo espírito do /dev/battle-fx.
 *
 * Fluxo pra cada folha nova do Gemini:
 *   1. sprite-sources/<race>-<class>.png
 *   2. npx tsx scripts/slice-hero-sprite-sheet.ts --race <race> --class <class> --row 2
 *   3. abrir aqui, achar os índices, colar o JSON no heroSprites.ts
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

import { HERO_SPRITES, HERO_SPRITE_SCREEN_H, type HeroSpriteDef, type SpriteFacing } from '@/lib/heroSprites'
import { WALK_FULL_STRIP } from '@/lib/walkSceneAssets'

/** Mesmo mapa que a WalkScene desenha por baixo do boneco na Floresta. */
const WALK_BG = WALK_FULL_STRIP.floresta

/** Ciclos prontos pra comparar rápido — o do meio é o que está no manifesto. */
const PRESETS: Record<string, (def: HeroSpriteDef) => number[]> = {
  'do manifesto': (def) => def.walk,
  'só passadas': (def) => def.walk.filter((f) => f !== def.idle),
  'todos os frames': (def) => Array.from({ length: def.frames }, (_, i) => i),
}

export default function SpriteLabPage() {
  const keys = Object.keys(HERO_SPRITES)
  const [slug, setSlug] = useState(keys[0] || '')
  const def = HERO_SPRITES[slug]

  const [cycle, setCycle] = useState<number[]>(def?.walk ?? [0])
  const [fps, setFps] = useState(def?.fps ?? 8)
  const [screenH, setScreenH] = useState(HERO_SPRITE_SCREEN_H)
  const [facing, setFacing] = useState<SpriteFacing>(def?.facing ?? 'right')
  const [flip, setFlip] = useState(false)
  const [showBack, setShowBack] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [frameIdx, setFrameIdx] = useState(0)

  // Trocar de combinação recarrega os controles a partir do manifesto
  useEffect(() => {
    if (!def) return
    setCycle(def.walk)
    setFps(def.fps)
    setFacing(def.facing)
  }, [slug, def])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef(0)
  const tRef = useRef(0)

  // Estado lido dentro do rAF sem religar o loop
  const live = useRef({ cycle, fps, screenH, flip, showBack, playing, frameIdx, def })
  live.current = { cycle, fps, screenH, flip, showBack, playing, frameIdx, def }

  useEffect(() => {
    if (!def) return
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
    }
    img.src = def.src
    return () => {
      imgRef.current = null
    }
  }, [def])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = live.current
      if (s.playing) tRef.current += dt

      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      const img = imgRef.current
      const d = s.def
      if (img && d) {
        const cyc = s.cycle.length ? s.cycle : [0]
        const step = Math.floor(tRef.current * s.fps)
        const frame = s.showBack
          ? (d.back ?? cyc[0])
          : s.playing
            ? cyc[((step % cyc.length) + cyc.length) % cyc.length]
            : (cyc[s.frameIdx % cyc.length] ?? 0)

        // De costas alterna o espelho pra dar o 2º tempo do passo (igual à WalkScene)
        const mirrored = s.showBack ? (s.playing ? step % 2 !== 0 : false) : s.flip

        const dh = s.screenH
        const dw = dh * (d.frameW / d.frameH)
        const cx = w / 2
        const footY = h * 0.78
        const bob = s.playing ? Math.sin(tRef.current * 8) * 2 : 0

        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath()
        ctx.ellipse(cx, footY - 1, dw * 0.22, 3, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.save()
        ctx.imageSmoothingEnabled = true
        if (mirrored) {
          ctx.translate(cx, 0)
          ctx.scale(-1, 1)
          ctx.translate(-cx, 0)
        }
        ctx.drawImage(
          img,
          frame * d.frameW,
          0,
          d.frameW,
          d.frameH,
          cx - dw / 2,
          footY + bob - dh,
          dw,
          dh
        )
        ctx.restore()

        ctx.fillStyle = '#e8c37a'
        ctx.font = '11px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`frame [${frame}]${mirrored ? ' espelhado' : ''}`, 8, 16)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const snippet = useMemo(() => {
    if (!def) return ''
    return (
      `  '${slug}': {\n` +
      `    src: '${def.src}',\n` +
      `    frameW: ${def.frameW},\n` +
      `    frameH: ${def.frameH},\n` +
      `    frames: ${def.frames},\n` +
      `    facing: '${facing}',\n` +
      `    walk: [${cycle.join(', ')}],\n` +
      (def.idle !== undefined ? `    idle: ${def.idle},\n` : '') +
      (def.back !== undefined ? `    back: ${def.back},\n` : '') +
      `    fps: ${fps},\n` +
      `  },`
    )
  }, [slug, def, facing, cycle, fps])

  if (!def) {
    return (
      <div className="min-h-screen bg-[#14100c] text-amber-100 p-8 font-mono text-sm">
        Nenhum boneco em HERO_SPRITES. Rode:
        <pre className="mt-3 text-amber-300">
          npx tsx scripts/slice-hero-sprite-sheet.ts --race elfo --class rogue --row 2
        </pre>
      </div>
    )
  }

  const toggleInCycle = (i: number) =>
    setCycle((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))

  return (
    <div className="min-h-screen bg-[#14100c] text-amber-100 p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-amber-300">🧝 Sprite Lab — boneco de caminhada</h1>
        <p className="text-xs text-amber-100/60">
          Calibre e cole o resultado em <code className="text-amber-300">src/lib/heroSprites.ts</code>.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => setSlug(k)}
            className={`px-3 py-1.5 rounded border text-xs ${
              k === slug
                ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                : 'border-amber-100/20 text-amber-100/70 hover:border-amber-100/40'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {/* Tira fatiada com o índice de cada frame */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-amber-200">
          Frames da tira — clique para incluir/tirar do ciclo
        </h2>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: def.frames }, (_, i) => {
            const inCycle = cycle.includes(i)
            const isBack = def.back === i
            const isIdle = def.idle === i
            return (
              <button
                key={i}
                onClick={() => toggleInCycle(i)}
                className={`relative rounded border p-1 ${
                  inCycle ? 'border-amber-400 bg-amber-400/10' : 'border-amber-100/15 bg-black/30'
                }`}
                title={`frame ${i}`}
              >
                <div
                  style={{
                    width: def.frameW * 0.6,
                    height: def.frameH * 0.6,
                    backgroundImage: `url(${def.src})`,
                    backgroundPosition: `-${i * def.frameW * 0.6}px 0`,
                    backgroundSize: `${def.frames * def.frameW * 0.6}px ${def.frameH * 0.6}px`,
                    imageRendering: 'auto',
                  }}
                />
                <span className="block text-center text-[10px] text-amber-200/80 mt-0.5">
                  [{i}]{isBack ? ' costas' : ''}{isIdle ? ' parado' : ''}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-amber-100/50">
          Ordem atual do ciclo: <span className="text-amber-300">[{cycle.join(', ')}]</span> — clicar
          adiciona no fim; use os presets pra recomeçar.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([label, build]) => (
            <button
              key={label}
              onClick={() => setCycle(build(def))}
              className="px-2 py-1 rounded border border-amber-100/20 text-[11px] text-amber-100/70 hover:border-amber-100/40"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Preview no tamanho da cena, sobre o fundo real de caminhada */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-amber-200">Preview no tamanho da masmorra</h2>
        <div
          className="relative inline-block rounded border border-amber-100/20 overflow-hidden"
          style={{
            backgroundImage: `url(${WALK_BG})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <canvas ref={canvasRef} width={320} height={200} className="block" />
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="px-3 py-1.5 rounded border border-amber-400 bg-amber-400/15 text-amber-200"
          >
            {playing ? '⏸ pausar' : '▶ tocar'}
          </button>

          {!playing && (
            <label className="flex items-center gap-2">
              passo
              <input
                type="range"
                min={0}
                max={Math.max(0, cycle.length - 1)}
                value={frameIdx}
                onChange={(e) => setFrameIdx(Number(e.target.value))}
              />
              <span className="text-amber-300 w-6">{frameIdx}</span>
            </label>
          )}

          <label className="flex items-center gap-2">
            fps
            <input
              type="range"
              min={2}
              max={16}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
            />
            <span className="text-amber-300 w-6">{fps}</span>
          </label>

          <label className="flex items-center gap-2">
            altura
            <input
              type="range"
              min={24}
              max={120}
              value={screenH}
              onChange={(e) => setScreenH(Number(e.target.value))}
            />
            <span className="text-amber-300 w-8">{screenH}px</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} />
            espelhar
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showBack}
              onChange={(e) => setShowBack(e.target.checked)}
              disabled={def.back === undefined}
            />
            de costas (subindo)
          </label>

          <label className="flex items-center gap-2">
            olha para
            <select
              value={facing}
              onChange={(e) => setFacing(e.target.value as SpriteFacing)}
              className="bg-black/40 border border-amber-100/20 rounded px-1 py-0.5 text-amber-200"
            >
              <option value="right">direita</option>
              <option value="left">esquerda</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-amber-100/50">
          A WalkScene usa altura {HERO_SPRITE_SCREEN_H}px (HERO_SPRITE_SCREEN_H). Mudou aqui? Ajuste
          lá também.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-amber-200">Cole em heroSprites.ts</h2>
        <pre className="bg-black/50 border border-amber-100/15 rounded p-3 text-[11px] text-amber-200 overflow-x-auto">
          {snippet}
        </pre>
      </section>
    </div>
  )
}
