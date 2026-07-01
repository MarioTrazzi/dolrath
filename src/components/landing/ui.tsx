'use client'

// ============================================================
// DOLRATH — Design System (componentes-base reutilizáveis)
// Handoff do Claude Design, portado para React/TS.
// Reaproveite em outras páginas (dashboard, inventário, loja).
//
// Do / Don't:
//   ✓ glow colorido (primary/roxo)        ✗ sombra preta dura
//   ✓ border-white/10, blur generoso      ✗ bordas opacas cinza
//   ✓ números de combate em fonte mono    ✗ números em Inter
//   ✓ rounded-lg/xl/2xl                   ✗ cantos retos
// ============================================================

import React, { useMemo } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'

type DivProps = React.HTMLAttributes<HTMLDivElement>

// ---------- Button ----------
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  as?: 'button' | 'a'
  href?: string
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm gap-1.5',
  md: 'px-6 py-3 text-sm gap-2',
  lg: 'px-8 py-4 text-base gap-2.5',
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]',
  secondary:
    'bg-surface/60 backdrop-blur-xl border border-white/10 text-white hover:border-white/20 hover:bg-surface/80 active:scale-[0.98]',
  outline:
    'bg-transparent border border-primary/50 text-primary hover:bg-primary/10 hover:border-primary active:scale-[0.98]',
  danger:
    'bg-gradient-to-r from-error to-red-700 text-white hover:shadow-lg hover:shadow-error/25 active:scale-[0.98]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon = null,
  iconRight = null,
  className = '',
  children,
  as = 'button',
  ...rest
}: ButtonProps) {
  const cls = `inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 select-none ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`
  const content = (
    <>
      {icon}
      <span>{children}</span>
      {iconRight}
    </>
  )
  if (as === 'a') {
    return (
      <a className={cls} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    )
  }
  return (
    <button className={cls} {...rest}>
      {content}
    </button>
  )
}

// ---------- Cards ----------
export function Card({ className = '', children, ...rest }: DivProps) {
  return (
    <div className={`ds-card ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function GlassCard({
  className = '',
  hover = false,
  children,
  ...rest
}: DivProps & { hover?: boolean }) {
  return (
    <div
      className={`glass-card ${
        hover
          ? 'transition-all duration-300 hover:border-white/20 hover:shadow-primary/10 hover:-translate-y-1'
          : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

// ---------- Badge ----------
type BadgeTone = 'primary' | 'neutral' | 'success' | 'warning' | 'error'

const BADGE_TONES: Record<BadgeTone, string> = {
  primary: 'bg-primary/15 text-primary border-primary/30',
  neutral: 'bg-white/5 text-textsec border-white/10',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  error: 'bg-error/15 text-error border-error/30',
}

export function Badge({
  tone = 'neutral',
  icon = null,
  className = '',
  children,
}: {
  tone?: BadgeTone
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium tracking-wide backdrop-blur-xl ${BADGE_TONES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}

// ---------- StatBar (HP / MP / Stamina) ----------
type StatKind = 'hp' | 'mp' | 'stamina'

// Cores LITERAIS (hex). Importante: não usar var(--x) aqui — o componente
// concatena alpha (ex.: `${color}99`), e `var(--success)99` é CSS inválido,
// o que fazia as barras de HP/STA renderizarem VAZIAS.
const STAT_KINDS: Record<StatKind, { color: string; name: string }> = {
  hp: { color: '#2ecc71', name: 'HP' },
  mp: { color: '#3b82f6', name: 'MP' },
  stamina: { color: '#f39c12', name: 'STA' },
}

export function StatBar({
  kind = 'hp',
  value,
  max,
  label,
  className = '',
}: {
  kind?: StatKind
  value: number
  max: number
  label?: string
  className?: string
}) {
  const k = STAT_KINDS[kind]
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-combat text-[11px] w-8 shrink-0 text-textsec">{label || k.name}</span>
      <div
        className="relative flex-1 h-2.5 rounded-full bg-black/40 border border-white/10 overflow-hidden"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || k.name}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${k.color}99, ${k.color})`,
            boxShadow: `0 0 8px ${k.color}66`,
          }}
        />
      </div>
      <span className="font-combat text-[11px] text-textsec w-16 text-right shrink-0">
        {value}/{max}
      </span>
    </div>
  )
}

// ---------- SectionHeading ----------
export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = 'center',
  className = '',
}: {
  eyebrow?: string
  title: React.ReactNode
  sub?: React.ReactNode
  align?: 'center' | 'left'
  className?: string
}) {
  return (
    <div
      className={`flex flex-col gap-3 ${
        align === 'center' ? 'items-center text-center' : 'items-start text-left'
      } ${className}`}
    >
      {eyebrow && (
        <span className="text-xs font-semibold tracking-[0.2em] uppercase text-primary">
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl md:text-4xl font-bold text-white text-balance">{title}</h2>
      {sub && <p className="max-w-xl text-textsec text-pretty">{sub}</p>}
    </div>
  )
}

// ---------- D20 (motivo gráfico) ----------
export function D20({
  size = 120,
  value = 20 as number | string,
  glow = true,
  className = '',
}: {
  size?: number
  value?: number | string
  glow?: boolean
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      style={glow ? { filter: 'drop-shadow(0 0 18px rgba(233,69,96,0.45))' } : undefined}
    >
      <polygon
        points="50,4 89,26 89,72 50,96 11,72 11,26"
        fill="rgba(30,30,63,0.85)"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <polygon
        points="50,18 76,64 24,64"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line x1="50" y1="4" x2="50" y2="18" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <line x1="89" y1="26" x2="76" y2="64" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1="11" y1="26" x2="24" y2="64" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <line x1="89" y1="72" x2="76" y2="64" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <line x1="11" y1="72" x2="24" y2="64" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <line x1="50" y1="96" x2="50" y2="80" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <text
        x="50"
        y="54"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontFamily="'Courier New', monospace"
        fontWeight="bold"
        fontSize="26"
      >
        {value}
      </text>
    </svg>
  )
}

// ---------- DiceChip ----------
export function DiceChip({
  sides = 20,
  value,
  rolling = false,
  className = '',
}: {
  sides?: number
  value?: number | string
  rolling?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 backdrop-blur-xl ${className}`}
    >
      <motion.span
        animate={rolling ? { rotate: 360 } : { rotate: 0 }}
        transition={rolling ? { repeat: Infinity, duration: 1, ease: 'linear' } : {}}
        className="inline-flex"
      >
        <D20 size={18} value="" glow={false} />
      </motion.span>
      <span className="font-combat text-xs text-textsec">d{sides}</span>
      <span className="font-combat text-sm font-bold text-primary">{rolling ? '…' : value}</span>
    </span>
  )
}

// ---------- ArenaSky (céu enluarado — hero, CTA e telas de auth) ----------
interface Star {
  id: number; x: number; y: number; size: number; delay: number; dur: number; dim: boolean
}

// Estrelas determinísticas (seed fixa) para layout estável entre renders.
function makeStars(count: number, seed = 7): Star[] {
  let s = seed
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rnd() * 100,
    y: rnd() * 88,
    size: 6 + rnd() * 9,
    delay: rnd() * 4,
    dur: 2.5 + rnd() * 3,
    dim: rnd() > 0.6,
  }))
}

export function ArenaSky({
  starCount = 40, glow = 1, parallax = true, moon = true,
}: { starCount?: number; glow?: number; parallax?: boolean; moon?: boolean }) {
  const stars = useMemo(() => makeStars(starCount), [starCount])
  const { scrollY } = useScroll()
  const yStars = useTransform(scrollY, [0, 800], [0, parallax ? 80 : 0])
  const yMoon = useTransform(scrollY, [0, 800], [0, parallax ? 140 : 0])
  return (
    <div className="absolute inset-0 overflow-hidden arena-sky" aria-hidden="true">
      {/* brilhos de cena */}
      <div
        className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[80rem] h-[26rem] rounded-full blur-3xl"
        style={{ background: 'rgba(233,69,96,0.16)', opacity: glow }}
      />
      <div
        className="absolute top-1/4 -left-40 w-[34rem] h-[34rem] rounded-full blur-3xl"
        style={{ background: 'rgba(147,51,234,0.18)', opacity: glow }}
      />
      {/* lua */}
      {moon && (
        <motion.div style={{ y: yMoon }} className="absolute top-[12%] right-[12%]">
          <div
            className="w-20 h-20 md:w-28 md:h-28 rounded-full"
            style={{
              background: 'radial-gradient(circle at 38% 35%, #fef3c7, #fde68a 55%, #f5d57a)',
              boxShadow: `0 0 60px 18px rgba(253,230,138,${0.35 * glow}), 0 0 140px 60px rgba(253,230,138,${0.12 * glow})`,
            }}
          />
        </motion.div>
      )}
      {/* estrelas ✦ */}
      <motion.div style={{ y: yStars }} className="absolute inset-0">
        {stars.map((st) => (
          <span
            key={st.id}
            className="absolute text-amber-100 select-none"
            style={{
              left: `${st.x}%`,
              top: `${st.y}%`,
              fontSize: `${st.size}px`,
              opacity: st.dim ? 0.3 : 0.7,
              animation: `star-twinkle ${st.dur}s ease-in-out ${st.delay}s infinite`,
            }}
          >
            ✦
          </span>
        ))}
      </motion.div>
      {/* horizonte */}
      <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}

// ---------- Reveal (entrada suave ao entrar na viewport) ----------
export function Reveal({
  delay = 0,
  className = '',
  children,
}: {
  delay?: number // em ms (mantém a API do design)
  className?: string
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  if (reduce) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  )
}
