'use client'

/**
 * 🧪 Página DEV dos bonecos recortados — heróis (raça×classe) e MONSTROS (sem auth/DB).
 * Serve para calibrar ordem dos ciclos / fps / altura antes de congelar no manifesto —
 * mesmo espírito do /dev/battle-fx.
 *
 * Fluxo pra cada folha nova do Gemini:
 *   1. sprite-sources/<race>-<class>.png       (ou --in direto do Downloads)
 *   2. npx tsx scripts/slice-hero-sprite-sheet.ts --race <race> --class <class> --row 2
 *      npx tsx scripts/slice-hero-sprite-sheet.ts --monster <slug> --in <folha> --rows 1,2
 *   3. abrir aqui, achar os índices, colar o JSON no heroSprites.ts / monsterSprites.ts
 *
 * A diferença entre os dois: o herói só tem PERFIL e COSTAS, porque ele nunca vem
 * na direção da câmera. O monstro ronda o bolsão em 360°, então tem também
 * FRENTE — e é por isso que aqui se edita TRÊS ciclos, não um.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

import {
  HERO_SPRITES,
  HERO_SPRITE_SCREEN_H,
  HERO_WORLD_H,
  type SpriteFacing,
} from '@/lib/heroSprites'
import { MONSTER_SPRITES } from '@/lib/monsterSprites'
import { WALK_FULL_STRIP } from '@/lib/walkSceneAssets'

/** Mesmo mapa que a WalkScene desenha por baixo do boneco na Floresta. */
const WALK_BG = WALK_FULL_STRIP.floresta

type Source = 'hero' | 'monster'
/** Qual direção da folha está em foco — de edição e de preview. */
type Dir = 'walk' | 'front' | 'back'

/**
 * Forma única para os dois manifestos. Normaliza aqui, UMA vez, o
 * `back: number | number[]` do herói — o resto da página lida com listas só.
 */
interface LabDef {
  src: string
  frameW: number
  frameH: number
  frames: number
  facing: SpriteFacing
  walk: number[]
  front: number[]
  back: number[]
  idle?: number
  fps: number
  /** Altura em unidades de mundo. Herói = HERO_WORLD_H. */
  worldH: number
}

function labDefs(source: Source): Record<string, LabDef> {
  if (source === 'monster') {
    return Object.fromEntries(
      Object.entries(MONSTER_SPRITES).map(([k, d]) => [
        k,
        { ...d, front: d.front ?? [], back: d.back ?? [] },
      ]),
    )
  }
  return Object.fromEntries(
    Object.entries(HERO_SPRITES).map(([k, d]) => [
      k,
      {
        ...d,
        front: [],
        back: d.back === undefined ? [] : Array.isArray(d.back) ? d.back : [d.back],
        worldH: HERO_WORLD_H,
      },
    ]),
  )
}

/** Ciclos prontos pra comparar rápido — o do meio é o que está no manifesto. */
const PRESETS: Record<string, (def: LabDef, dir: Dir) => number[]> = {
  'do manifesto': (def, dir) => def[dir],
  'só passadas': (def, dir) => def[dir].filter(f => f !== def.idle),
  'todos os frames': def => Array.from({ length: def.frames }, (_, i) => i),
  limpar: () => [],
}

const DIR_LABEL: Record<Dir, string> = {
  walk: 'perfil',
  front: 'de frente',
  back: 'de costas',
}

export default function SpriteLabPage() {
  const [source, setSource] = useState<Source>('hero')
  const defs = useMemo(() => labDefs(source), [source])
  const keys = useMemo(() => Object.keys(defs), [defs])
  const [slug, setSlug] = useState(Object.keys(labDefs('hero'))[0] || '')
  const def = defs[slug]

  const [cycles, setCycles] = useState<Record<Dir, number[]>>({ walk: [0], front: [], back: [] })
  const [editing, setEditing] = useState<Dir>('walk')
  const [view, setView] = useState<Dir>('walk')
  const [fps, setFps] = useState(8)
  const [screenH, setScreenH] = useState(HERO_SPRITE_SCREEN_H)
  const [worldH, setWorldH] = useState(HERO_WORLD_H)
  const [facing, setFacing] = useState<SpriteFacing>('right')
  const [flip, setFlip] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [frameIdx, setFrameIdx] = useState(0)
  /** Herói de referência ao lado — responde "o chefe está grande o bastante?". */
  const [compare, setCompare] = useState('')

  // Trocar de fonte cai na primeira folha dela.
  useEffect(() => {
    const first = Object.keys(defs)[0] || ''
    setSlug(s => (defs[s] ? s : first))
  }, [defs])

  // Trocar de folha recarrega os controles a partir do manifesto.
  useEffect(() => {
    if (!def) return
    setCycles({ walk: def.walk, front: def.front, back: def.back })
    setFps(def.fps)
    setFacing(def.facing)
    setWorldH(def.worldH)
    setEditing('walk')
    setView('walk')
  }, [slug, def])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const cmpImgRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef(0)
  const tRef = useRef(0)

  // Memoizado: sem isso `cmpDef` teria identidade nova a cada render e o efeito
  // que carrega a imagem de comparação rodaria de novo em todo clique.
  const heroDefs = useMemo(() => labDefs('hero'), [])
  const cmpDef = compare ? heroDefs[compare] : undefined

  // Estado lido dentro do rAF sem religar o loop
  const live = useRef({ cycles, view, fps, screenH, worldH, flip, playing, frameIdx, def, cmpDef })
  live.current = { cycles, view, fps, screenH, worldH, flip, playing, frameIdx, def, cmpDef }

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
    if (!cmpDef) {
      cmpImgRef.current = null
      return
    }
    const img = new Image()
    img.onload = () => {
      cmpImgRef.current = img
    }
    img.src = cmpDef.src
    return () => {
      cmpImgRef.current = null
    }
  }, [cmpDef])

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

      const step = Math.floor(tRef.current * s.fps)
      const footY = h * 0.78
      const bob = s.playing ? Math.sin(tRef.current * 8) * 2 : 0

      /** Régua única: 1 unidade de mundo = tantos px. É o que torna a
       *  comparação com o herói honesta. */
      const pxPerUnit = s.screenH / HERO_WORLD_H

      const shadow = (cx: number, dw: number) => {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath()
        ctx.ellipse(cx, footY - 1, dw * 0.22, 3, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      // Herói de referência, à esquerda.
      const cmp = s.cmpDef
      const cmpImg = cmpImgRef.current
      if (cmp && cmpImg) {
        const dh = HERO_WORLD_H * pxPerUnit
        const dw = dh * (cmp.frameW / cmp.frameH)
        const list = cmp.walk.length ? cmp.walk : [0]
        const f = list[((step % list.length) + list.length) % list.length]
        const cx = w * 0.25
        shadow(cx, dw)
        ctx.drawImage(cmpImg, f * cmp.frameW, 0, cmp.frameW, cmp.frameH, cx - dw / 2, footY + bob - dh, dw, dh)
        ctx.fillStyle = 'rgba(232,195,122,0.5)'
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`herói ${HERO_WORLD_H}u`, cx, h - 6)
      }

      const img = imgRef.current
      const d = s.def
      if (img && d) {
        const raw = s.cycles[s.view]
        // Direção sem ciclo próprio cai no perfil, como a cena faz.
        const list = (raw.length ? raw : s.cycles.walk.length ? s.cycles.walk : [0])
        const frame = s.playing
          ? list[((step % list.length) + list.length) % list.length]
          : (list[s.frameIdx % list.length] ?? 0)

        // Espelho alternado só faz sentido quando a direção tem UMA pose só.
        const mirrored =
          s.view === 'walk' ? s.flip : list.length === 1 ? s.playing && step % 2 !== 0 : false

        const dh = s.worldH * pxPerUnit
        const dw = dh * (d.frameW / d.frameH)
        const cx = cmp && cmpImg ? w * 0.68 : w / 2

        shadow(cx, dw)
        ctx.save()
        ctx.imageSmoothingEnabled = true
        if (mirrored) {
          ctx.translate(cx, 0)
          ctx.scale(-1, 1)
          ctx.translate(-cx, 0)
        }
        ctx.drawImage(img, frame * d.frameW, 0, d.frameW, d.frameH, cx - dw / 2, footY + bob - dh, dw, dh)
        ctx.restore()

        ctx.fillStyle = '#e8c37a'
        ctx.font = '11px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(
          `${DIR_LABEL[s.view]} — frame [${frame}]${mirrored ? ' espelhado' : ''}`,
          8,
          16,
        )
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const snippet = useMemo(() => {
    if (!def) return ''
    const head =
      `  '${slug}': {\n` +
      `    src: '${def.src}',\n` +
      `    frameW: ${def.frameW},\n` +
      `    frameH: ${def.frameH},\n` +
      `    frames: ${def.frames},\n` +
      `    facing: '${facing}',\n` +
      `    walk: [${cycles.walk.join(', ')}],\n`
    const idle = def.idle !== undefined ? `    idle: ${def.idle},\n` : ''
    if (source === 'monster') {
      return (
        head +
        (cycles.front.length ? `    front: [${cycles.front.join(', ')}],\n` : '') +
        (cycles.back.length ? `    back: [${cycles.back.join(', ')}],\n` : '') +
        idle +
        `    fps: ${fps},\n` +
        `    worldH: ${Number(worldH.toFixed(2))},\n` +
        `  },`
      )
    }
    return (
      head +
      idle +
      (cycles.back.length ? `    back: [${cycles.back.join(', ')}],\n` : '') +
      `    fps: ${fps},\n` +
      `  },`
    )
  }, [source, slug, def, facing, cycles, fps, worldH])

  if (!def) {
    return (
      <div className="min-h-screen bg-[#14100c] text-amber-100 p-8 font-mono text-sm space-y-3">
        <div>Nenhuma folha em {source === 'monster' ? 'MONSTER_SPRITES' : 'HERO_SPRITES'}. Rode:</div>
        <pre className="text-amber-300">
          {source === 'monster'
            ? 'npx tsx scripts/slice-hero-sprite-sheet.ts --monster <slug> --in <folha> --rows 1,2'
            : 'npx tsx scripts/slice-hero-sprite-sheet.ts --race elfo --class rogue --row 2'}
        </pre>
        <button
          onClick={() => setSource(source === 'monster' ? 'hero' : 'monster')}
          className="px-3 py-1.5 rounded border border-amber-400 text-amber-200"
        >
          ver {source === 'monster' ? 'heróis' : 'monstros'}
        </button>
      </div>
    )
  }

  const toggleInCycle = (i: number) =>
    setCycles(c => {
      const cur = c[editing]
      return { ...c, [editing]: cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i] }
    })

  const dirs: Dir[] = source === 'monster' ? ['walk', 'front', 'back'] : ['walk', 'back']

  return (
    <div className="min-h-screen bg-[#14100c] text-amber-100 p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-amber-300">
          {source === 'monster' ? '👹' : '🧝'} Sprite Lab — bonecos recortados
        </h1>
        <p className="text-xs text-amber-100/60">
          Calibre e cole o resultado em{' '}
          <code className="text-amber-300">
            src/lib/{source === 'monster' ? 'monsterSprites' : 'heroSprites'}.ts
          </code>
          .
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(['hero', 'monster'] as Source[]).map(s => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`px-3 py-1.5 rounded border text-xs ${
              s === source
                ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                : 'border-amber-100/20 text-amber-100/70 hover:border-amber-100/40'
            }`}
          >
            {s === 'hero' ? '🧝 heróis' : '👹 monstros'}
          </button>
        ))}
        <span className="w-px h-5 bg-amber-100/15 mx-1" />
        {keys.map(k => (
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
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-amber-200">
            Frames da tira — clique para incluir/tirar do ciclo
          </h2>
          <div className="flex gap-1">
            {dirs.map(d => (
              <button
                key={d}
                onClick={() => {
                  setEditing(d)
                  setView(d)
                }}
                className={`px-2 py-1 rounded border text-[11px] ${
                  d === editing
                    ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                    : 'border-amber-100/20 text-amber-100/70 hover:border-amber-100/40'
                }`}
              >
                editando: {DIR_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: def.frames }, (_, i) => {
            const inCycle = cycles[editing].includes(i)
            const badges = dirs.filter(d => cycles[d].includes(i))
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
                  [{i}]
                  {badges.length ? ` ${badges.map(b => DIR_LABEL[b]).join('+')}` : ''}
                  {def.idle === i ? ' parado' : ''}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-amber-100/50">
          {dirs.map(d => (
            <span key={d} className="mr-4">
              {DIR_LABEL[d]}: <span className="text-amber-300">[{cycles[d].join(', ')}]</span>
            </span>
          ))}
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([label, build]) => (
            <button
              key={label}
              onClick={() => setCycles(c => ({ ...c, [editing]: build(def, editing) }))}
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
            onClick={() => setPlaying(p => !p)}
            className="px-3 py-1.5 rounded border border-amber-400 bg-amber-400/15 text-amber-200"
          >
            {playing ? '⏸ pausar' : '▶ tocar'}
          </button>

          <div className="flex gap-1">
            {dirs.map(d => (
              <button
                key={d}
                onClick={() => setView(d)}
                disabled={d !== 'walk' && !cycles[d].length}
                className={`px-2 py-1 rounded border text-[11px] disabled:opacity-30 ${
                  d === view
                    ? 'border-amber-400 bg-amber-400/15 text-amber-200'
                    : 'border-amber-100/20 text-amber-100/70'
                }`}
              >
                {DIR_LABEL[d]}
              </button>
            ))}
          </div>

          {!playing && (
            <label className="flex items-center gap-2">
              passo
              <input
                type="range"
                min={0}
                max={Math.max(0, (cycles[view].length || 1) - 1)}
                value={frameIdx}
                onChange={e => setFrameIdx(Number(e.target.value))}
              />
              <span className="text-amber-300 w-6">{frameIdx}</span>
            </label>
          )}

          <label className="flex items-center gap-2">
            fps
            <input type="range" min={2} max={16} value={fps} onChange={e => setFps(Number(e.target.value))} />
            <span className="text-amber-300 w-6">{fps}</span>
          </label>

          <label className="flex items-center gap-2">
            altura do herói
            <input
              type="range"
              min={24}
              max={120}
              value={screenH}
              onChange={e => setScreenH(Number(e.target.value))}
            />
            <span className="text-amber-300 w-8">{screenH}px</span>
          </label>

          {source === 'monster' && (
            <label className="flex items-center gap-2">
              worldH
              <input
                type="range"
                min={10}
                max={80}
                value={Math.round(worldH * 10)}
                onChange={e => setWorldH(Number(e.target.value) / 10)}
              />
              <span className="text-amber-300 w-16">
                {worldH.toFixed(1)}u ({(worldH / HERO_WORLD_H).toFixed(1)}× herói)
              </span>
            </label>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={flip}
              onChange={e => setFlip(e.target.checked)}
              disabled={view !== 'walk'}
            />
            espelhar
          </label>

          <label className="flex items-center gap-2">
            comparar com
            <select
              value={compare}
              onChange={e => setCompare(e.target.value)}
              className="bg-black/40 border border-amber-100/20 rounded px-1 py-0.5 text-amber-200"
            >
              <option value="">— ninguém —</option>
              {Object.keys(HERO_SPRITES).map(k => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            olha para
            <select
              value={facing}
              onChange={e => setFacing(e.target.value as SpriteFacing)}
              className="bg-black/40 border border-amber-100/20 rounded px-1 py-0.5 text-amber-200"
            >
              <option value="right">direita</option>
              <option value="left">esquerda</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-amber-100/50">
          A régua é a mesma da cena: 1 unidade de mundo = altura do herói ÷ {HERO_WORLD_H}. Com um
          herói escolhido em &quot;comparar com&quot;, os dois saem na escala verdadeira um do outro.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-amber-200">
          Cole em {source === 'monster' ? 'monsterSprites.ts' : 'heroSprites.ts'}
        </h2>
        <pre className="bg-black/50 border border-amber-100/15 rounded p-3 text-[11px] text-amber-200 overflow-x-auto">
          {snippet}
        </pre>
      </section>
    </div>
  )
}
