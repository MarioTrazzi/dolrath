'use client'

// ============================================================
// DOLRATH — Landing page
// Implementação do handoff "Dolrath Landing.html" (Claude Design).
// Navbar de vidro, hero com céu enluarado + d20 girando, destaques,
// mockup da arena de combate, raças & classes, como funciona, CTA e footer.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import {
  Dices, Swords, Shield, Coins, Wallet, Play, Sparkles, ArrowRight, Menu, X,
  Github, Twitter, MessageCircle, Scroll, Wand2, VenetianMask, Hand, Axe,
  AlertTriangle, Zap, Gem, RefreshCw, Palette, Crown, Skull,
  Lock, Hammer,
} from 'lucide-react'
import { Button, Card, GlassCard, Badge, StatBar, SectionHeading, D20, DiceChip, Reveal } from './ui'
import { itemImagePath } from '@/lib/itemCatalog'

// ============================================================
// Gear / raridade — molduras e tiles de equipamento reais
// As imagens vivem em /items/<slug>.webp (mesmas do jogo).
// Tier romano por raridade: I·Comum II·Incomum III·Raro IV·Épico V·Lendário
// ============================================================

type RarityKey = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

const RARITY_FRAME: Record<RarityKey, { ring: string; glow: string; text: string; tier: string; label: string }> = {
  COMMON:    { ring: 'border-zinc-400/50',    glow: 'rgba(161,161,170,0.35)', text: 'text-zinc-300',    tier: 'I',   label: 'Comum' },
  UNCOMMON:  { ring: 'border-emerald-400/60', glow: 'rgba(52,211,153,0.45)',  text: 'text-emerald-300', tier: 'II',  label: 'Incomum' },
  RARE:      { ring: 'border-sky-400/60',     glow: 'rgba(56,189,248,0.5)',   text: 'text-sky-300',     tier: 'III', label: 'Raro' },
  EPIC:      { ring: 'border-fuchsia-400/70', glow: 'rgba(232,121,249,0.55)', text: 'text-fuchsia-300', tier: 'IV',  label: 'Épico' },
  LEGENDARY: { ring: 'border-amber-400/70',   glow: 'rgba(251,191,36,0.6)',   text: 'text-amber-300',   tier: 'V',   label: 'Lendário' },
}

interface GearPiece { name: string; rarity: RarityKey }

// Tile de item com moldura por raridade (reaproveita /items/<slug>.webp do jogo).
function GearTile({ piece, size = 'sm', className = '' }: { piece: GearPiece; size?: 'sm' | 'lg'; className?: string }) {
  const r = RARITY_FRAME[piece.rarity]
  const box = size === 'lg' ? 'w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem]' : 'w-10 h-10 sm:w-12 sm:h-12'
  return (
    <div
      className={`relative shrink-0 rounded-xl border ${r.ring} overflow-hidden bg-black/50 ${box} ${className}`}
      style={{ boxShadow: `0 0 14px ${r.glow}` }}
      title={`${piece.name} · ${r.label} (${r.tier})`}
    >
      {/* asset estático /items/<slug>.webp — img simples (sem next/image) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={itemImagePath(piece.name)} alt={piece.name} loading="lazy" className="w-full h-full object-cover" />
    </div>
  )
}

// ============================================================
// Céu enluarado (fundo do hero / CTA)
// ============================================================

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

function ArenaSky({
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

// ============================================================
// Navbar
// ============================================================

const NAV_LINKS = [
  { label: 'Jogar', href: '#arena' },
  { label: 'Personagens', href: '#racas' },
  { label: 'Masmorras', href: '#masmorras' },
  { label: 'Forja', href: '#aprimoramento' },
  { label: 'Marketplace', href: '#como-funciona' },
  { label: 'Docs', href: '/doc' },
]

function Navbar({ primaryHref }: { primaryHref: string }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6" aria-label="Navegação principal">
        <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-secondary/70 backdrop-blur-xl px-4 sm:px-6 py-3 shadow-2xl shadow-black/20">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight text-white">
            <span aria-hidden="true">⚔️</span>
            <span>Dolrath</span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-4 py-2 rounded-lg text-sm font-medium text-textsec hover:text-white hover:bg-white/5 transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>
          <div className="hidden md:block">
            <Button as="a" href={primaryHref} size="sm" icon={<Wallet size={16} />}>
              Conectar Carteira
            </Button>
          </div>
          <button
            className="md:hidden p-2 rounded-lg text-white hover:bg-white/5"
            aria-expanded={open}
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {open && (
          <div className="md:hidden mt-2 rounded-2xl border border-white/10 bg-secondary/90 backdrop-blur-xl p-4 flex flex-col gap-1 shadow-2xl">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-lg text-sm font-medium text-textsec hover:text-white hover:bg-white/5"
              >
                {l.label}
              </a>
            ))}
            <Button as="a" href={primaryHref} className="mt-2" icon={<Wallet size={16} />}>
              Conectar Carteira
            </Button>
          </div>
        )}
      </nav>
    </header>
  )
}

// ============================================================
// Hero
// ============================================================

function Hero({ primaryHref, spinDice }: {
  primaryHref: string; spinDice: boolean
}) {
  const reduce = useReducedMotion()
  const spin = spinDice && !reduce
  return (
    <section className="relative min-h-screen flex items-center pt-28 pb-20 overflow-hidden">
      {/* Arte cinematográfica: herói avançando pela Floresta Sombria com a
          Anciã da Mata (chefe) emergindo da névoa ao fundo. */}
      <img
        src="/hero-masmorra-floresta.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 w-full">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] items-center gap-12">
          <div className="flex flex-col items-start gap-6 max-w-2xl [text-shadow:0_2px_16px_rgba(0,0,0,0.85)]">
            <Reveal delay={0}>
              <Badge tone="primary" icon={<Sparkles size={14} />}>RPG on-chain · NFT</Badge>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight text-balance">
                Forje sua{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
                  lenda
                </span>
                {' em Dolrath'}
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="text-lg text-textsec max-w-xl text-pretty">
                Crie um personagem que é seu de verdade, aprimore seu gear e busque
                tesouros épicos. Combate tático por turnos: desperte sua forma —
                Dragão, Celestial e mais — e deixe cada rolagem de dado mudar a batalha.
              </p>
            </Reveal>
            <Reveal delay={300} className="flex flex-wrap items-center gap-4">
              <Button as="a" href={primaryHref} size="lg" icon={<Swords size={18} />}>Jogar agora</Button>
              <Button as="a" href="#arena" size="lg" variant="secondary" icon={<Play size={16} />}>
                Ver gameplay
              </Button>
            </Reveal>
            <Reveal delay={400} className="flex flex-wrap items-center gap-3 text-xs text-textsec/80">
              <span className="font-combat">ERC-721</span>
              <span aria-hidden="true">·</span>
              <span>Sem compra obrigatória para testar</span>
              <span aria-hidden="true">·</span>
              <span className="font-combat">testnet aberta</span>
            </Reveal>
          </div>
          {/* d20 girando */}
          <Reveal delay={250} className="hidden lg:flex justify-center">
            <motion.div
              animate={spin ? { rotate: 360 } : {}}
              transition={spin ? { repeat: Infinity, duration: 14, ease: 'linear' } : {}}
            >
              <motion.div
                animate={reduce ? {} : { y: [0, -14, 0] }}
                transition={reduce ? {} : { repeat: Infinity, duration: 5, ease: 'easeInOut' }}
              >
                <D20 size={260} value={20} />
              </motion.div>
            </motion.div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Faixa de destaques
// ============================================================

const FEATURES = [
  { Icon: Swords, title: 'Batalhas PvP por turnos', desc: 'Duele com outros jogadores: o dado multiplica seus atributos e a build decide quem fica de pé. Estratégia, não sorte cega.' },
  { Icon: Sparkles, title: 'Transformações de combate', desc: 'Desperte o Dragão, o Celestial ou as feras do Metamorfo no meio da luta — buffs temporários e habilidades especiais.' },
  { Icon: Shield, title: 'Personagens NFT seus de verdade', desc: 'Heróis ERC-721 na sua carteira. Venda, troque ou guarde — ninguém pode tirá-los de você.' },
  { Icon: Coins, title: 'Masmorras, ouro & marketplace', desc: 'Caia em masmorras por recompensas crescentes, ganhe ouro e negocie relíquias no mercado entre jogadores.' },
]

function Features() {
  return (
    <section id="destaques" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 80}>
              <GlassCard hover className="p-6 h-full flex flex-col gap-4">
                <span className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  <f.Icon size={22} />
                </span>
                <h3 className="font-semibold text-white text-lg leading-snug">{f.title}</h3>
                <p className="text-sm text-textsec leading-relaxed">{f.desc}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Arena de Combate (mockup)
// ============================================================

function Fighter({
  name, klass, level, baseImg, transformImg, transformLabel, baseGlow, auraGlow,
  hp, hpMax, mp, mpMax, sta, staMax, weapon, armor, reverse = false, hit = false, transformed = false,
}: {
  name: string; klass: string; level: number
  baseImg: string; transformImg: string; transformLabel: string
  baseGlow: string; auraGlow: string
  hp: number; hpMax: number; mp: number; mpMax: number; sta: number; staMax: number
  weapon: GearPiece; armor: GearPiece[]; reverse?: boolean; hit?: boolean; transformed?: boolean
}) {
  const wr = RARITY_FRAME[weapon.rarity]
  const glow = transformed ? auraGlow : baseGlow
  return (
    <div className={`flex flex-col gap-2.5 ${reverse ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-2 ${reverse ? 'flex-row-reverse' : ''}`}>
        <span className="font-semibold text-white">{name}</span>
        <span className="font-combat text-[11px] text-textsec">{klass} · Nv. {level}</span>
      </div>
      {/* retrato real do herói + arma principal — faz cross-fade para a forma transformada */}
      <motion.div
        animate={hit ? { x: reverse ? [0, 10, -6, 0] : [0, -10, 6, 0] } : {}}
        transition={{ duration: 0.45 }}
        className={`relative flex items-end gap-2.5 ${reverse ? 'flex-row-reverse' : ''}`}
      >
        <div
          className="relative w-20 h-28 sm:w-28 sm:h-36 rounded-2xl border overflow-hidden"
          style={{
            borderColor: transformed ? glow : 'rgba(255,255,255,0.12)',
            boxShadow: hit ? '0 0 26px rgba(231,76,60,0.5)' : `0 0 ${transformed ? 36 : 18}px ${glow}`,
            transition: 'box-shadow 0.6s ease, border-color 0.6s ease',
          }}
          aria-hidden="true"
        >
          {/* forma base */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={baseImg} alt="" loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ${transformed ? 'opacity-0' : 'opacity-100'}`}
          />
          {/* forma transformada */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={transformImg} alt="" loading="lazy"
            className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ${transformed ? 'opacity-100' : 'opacity-0'}`}
          />
          {/* aura ao despertar a forma */}
          <span
            className="absolute inset-0 pointer-events-none transition-opacity duration-700"
            style={{
              opacity: transformed ? 1 : 0,
              boxShadow: `inset 0 0 32px ${glow}`,
              background: `radial-gradient(circle at 50% 28%, ${glow}, transparent 72%)`,
            }}
          />
          {hit && (
            <span
              className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 font-combat font-bold text-xl text-error"
              style={{ animation: 'float-damage 1.6s ease-out forwards', textShadow: '0 0 12px rgba(231,76,60,0.8)' }}
            >
              −24
            </span>
          )}
        </div>
        <GearTile piece={weapon} size="lg" />
      </motion.div>
      {/* selo da transformação (aparece ao despertar a forma) */}
      <div className={`h-5 ${reverse ? 'self-end' : 'self-start'}`}>
        <motion.span
          initial={false}
          animate={{ opacity: transformed ? 1 : 0, y: transformed ? 0 : 5, scale: transformed ? 1 : 0.9 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm"
          style={{ borderColor: auraGlow, color: auraGlow, background: 'rgba(0,0,0,0.55)' }}
        >
          {transformLabel}
        </motion.span>
      </div>
      <span className={`font-combat text-[11px] font-semibold ${wr.text} max-w-[11rem] truncate ${reverse ? 'text-right' : ''}`}>
        {weapon.name}
      </span>
      {/* armadura equipada (tiers II e III) */}
      <div className={`flex gap-1.5 ${reverse ? 'flex-row-reverse' : ''}`} aria-label={`Equipamento de ${name}`}>
        {armor.map((g) => <GearTile key={g.name} piece={g} />)}
      </div>
      <div className="w-40 sm:w-48 flex flex-col gap-1.5 mt-1">
        <StatBar kind="hp" value={hp} max={hpMax} />
        <StatBar kind="mp" value={mp} max={mpMax} />
        <StatBar kind="stamina" value={sta} max={staMax} />
      </div>
    </div>
  )
}

// Ciclo da cena: forma base → desperta a transformação → dado gira → golpe → volta
type ArenaPhase = 'idle' | 'transform' | 'rolling' | 'hit'

function ArenaSection({ glow }: { glow: number }) {
  const [phase, setPhase] = useState<ArenaPhase>('idle')
  useEffect(() => {
    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const loop = () => {
      if (!alive) return
      setPhase('idle')
      timers.push(setTimeout(() => alive && setPhase('transform'), 1600))
      timers.push(setTimeout(() => alive && setPhase('rolling'), 3200))
      timers.push(setTimeout(() => alive && setPhase('hit'), 4600))
      timers.push(setTimeout(() => alive && setPhase('idle'), 6400))
    }
    loop()
    const id = setInterval(loop, 7400)
    return () => {
      alive = false
      clearInterval(id)
      timers.forEach(clearTimeout)
    }
  }, [])
  const hit = phase === 'hit'
  // depois de despertar, a forma transformada permanece até a cena reiniciar
  const transformed = phase === 'transform' || phase === 'rolling' || phase === 'hit'
  const statusBadge =
    phase === 'transform'
      ? { tone: 'primary' as const, text: 'TRANSFORMAÇÃO!' }
      : hit
        ? { tone: 'error' as const, text: 'CRÍTICO ×2!' }
        : { tone: 'neutral' as const, text: 'ATRIBUTOS × SORTE' }
  return (
    <section id="arena" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
          <div className="flex flex-col gap-6 order-2 lg:order-1">
            <SectionHeading
              align="left"
              eyebrow="Batalhas PvP · Arena"
              title="Cada turno é uma cena. Cada dado, uma decisão."
              sub="Desafie outros jogadores na arena: dois heróis frente a frente, equipamentos à mostra. Desperte sua forma de combate, escolha a ação e o dado gira — multiplicando seus atributos e explodindo na tela: dano crítico, esquivas e transformações."
            />
            <ul className="flex flex-col gap-3">
              {([
                [Dices, 'O dado multiplica seus atributos — nada acontece escondido'],
                [Sparkles, 'Transformações: Dragão, Celestial, Lobo, Urso ou Águia no meio da luta'],
                [Zap, 'Cada ação custa MP e Stamina — gerencie seus recursos por turno'],
                [Shield, 'PvP entre jogadores ou modo treino contra monstros, sem risco'],
              ] as const).map(([Ic, txt]) => (
                <li key={txt} className="flex items-start gap-3 text-sm text-textsec">
                  <span className="mt-0.5 text-primary shrink-0"><Ic size={18} /></span>
                  <span>{txt}</span>
                </li>
              ))}
            </ul>
            <div>
              <Button as="a" href="#destaques" variant="outline" iconRight={<ArrowRight size={16} />}>
                Entrar na arena
              </Button>
            </div>
          </div>
          {/* mockup da batalha */}
          <Reveal className="order-1 lg:order-2">
            <GlassCard className="relative overflow-hidden p-5 sm:p-8">
              <div className="absolute inset-0 arena-sky" aria-hidden="true">
                <div
                  className="absolute top-5 right-8 w-12 h-12 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at 38% 35%, #fef3c7, #fde68a 60%, #f5d57a)',
                    boxShadow: `0 0 30px 10px rgba(253,230,138,${0.3 * glow})`,
                  }}
                />
                {['12% 18%', '30% 8%', '55% 14%', '78% 28%', '8% 45%', '90% 55%'].map((pos, i) => {
                  const [x, y] = pos.split(' ')
                  return (
                    <span
                      key={i}
                      className="absolute text-amber-100"
                      style={{
                        left: x, top: y,
                        fontSize: `${7 + (i % 3) * 3}px`,
                        opacity: 0.5,
                        animation: `star-twinkle ${2.5 + i * 0.6}s ease-in-out ${i * 0.4}s infinite`,
                      }}
                    >
                      ✦
                    </span>
                  )
                })}
                <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-background/90 to-transparent" />
              </div>
              <div className="relative">
                <div className="flex items-center justify-between mb-6">
                  <span className="font-combat text-xs text-textsec">TURNO 07</span>
                  <Badge tone={statusBadge.tone} className="font-combat">{statusBadge.text}</Badge>
                </div>
                <div className="flex justify-between items-end gap-3 sm:gap-4">
                  {/* Elfa → forma Celestial (dourada) */}
                  <Fighter
                    transformed={transformed}
                    name="Sylariel" klass="Arqueira · Elfa" level={18}
                    baseImg="/elfopvp.png" transformImg="/elfo_transformed.png"
                    transformLabel="🌟 Celestial"
                    baseGlow="rgba(148,163,184,0.35)" auraGlow="rgba(251,191,36,0.55)"
                    hp={78} hpMax={90} mp={58} mpMax={72} sta={46} staMax={64}
                    weapon={{ name: 'Arco de Sylariel', rarity: 'LEGENDARY' }}
                    armor={[
                      { name: 'Vestes do Bosque Celeste', rarity: 'RARE' },
                      { name: 'Coif de Malha', rarity: 'UNCOMMON' },
                      { name: 'Luvas de Malha', rarity: 'UNCOMMON' },
                      { name: 'Anel de Cristal Pulsante', rarity: 'RARE' },
                    ]}
                  />
                  <div className="flex flex-col items-center gap-3 pb-24 shrink-0">
                    <DiceChip sides={20} value={18} rolling={phase === 'rolling'} />
                    <span className="font-combat text-[10px] text-textsec/70 text-center">
                      d20 × AGI<br />vs DEF
                    </span>
                  </div>
                  {/* Draconiano → forma Dragão (fogo) */}
                  <Fighter
                    reverse hit={hit} transformed={transformed}
                    name="Gorrak" klass="Guerreiro · Draconiano" level={19}
                    baseImg="/dracopvp.png" transformImg="/draco_transformed.png"
                    transformLabel="🐉 Dragão"
                    baseGlow="rgba(148,163,184,0.35)" auraGlow="rgba(239,68,68,0.55)"
                    hp={hit ? 40 : 72} hpMax={110} mp={18} mpMax={30} sta={58} staMax={86}
                    weapon={{ name: 'Lâmina de Krax-thar', rarity: 'LEGENDARY' }}
                    armor={[
                      { name: 'Couraça de Escamas Ígneas', rarity: 'RARE' },
                      { name: 'Elmo do Sentinela', rarity: 'UNCOMMON' },
                      { name: 'Manoplas do Sentinela', rarity: 'UNCOMMON' },
                      { name: 'Grevas de Aço', rarity: 'UNCOMMON' },
                    ]}
                  />
                </div>
              </div>
            </GlassCard>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Masmorras — cards reais (menores) + mapa com o herói andando nó a nó
// Espelha DUNGEON_LIST e buildTrailPoints (DungeonMap) do jogo.
// ============================================================

interface DungeonCard {
  id: string; name: string; emoji: string; tagline: string
  stars: number; rooms: number; minor: number; levelReq: number
  accent: string; boss: string
}

const DUNGEON_CARDS: DungeonCard[] = [
  { id: 'floresta', name: 'Floresta Sombria', emoji: '🌲', tagline: 'Trilhas vivas sob a luz da lua', stars: 1, rooms: 3, minor: 2, levelReq: 1, accent: '#34d399', boss: 'Anciã da Mata' },
  { id: 'caverna', name: 'Caverna de Cristal', emoji: '💎', tagline: 'Túneis que brilham no escuro', stars: 2, rooms: 4, minor: 2, levelReq: 10, accent: '#22d3ee', boss: 'Wyrm Cristalino' },
  { id: 'pantano', name: 'Pântano Maldito', emoji: '🐊', tagline: 'Névoa, lodo e luzes que mentem', stars: 3, rooms: 4, minor: 3, levelReq: 25, accent: '#a3e635', boss: 'Hidra do Pântano' },
  { id: 'ruinas', name: 'Ruínas Arcanas', emoji: '🏛️', tagline: 'Um império morto que ainda sonha', stars: 4, rooms: 5, minor: 3, levelReq: 40, accent: '#c084fc', boss: 'Lich Imperador' },
]

// Masmorras em construção — apenas vitrine (não clicáveis). A última (Cidadela
// de Dolrath, Nv.100) usa vermelho como o destino final do end-game.
interface SoonDungeon { id: string; name: string; emoji: string; tagline: string; levelReq: number; accent: string; boss: string }
const SOON_DUNGEONS: SoonDungeon[] = [
  { id: 'abismo', name: 'Abismo Gélido', emoji: '❄️', tagline: 'Onde a luz congela antes de chegar', levelReq: 55, accent: '#60a5fa', boss: 'Leviatã de Gelo' },
  { id: 'caldeira', name: 'Caldeira Ígnea', emoji: '🌋', tagline: 'Forjas onde os deuses morreram', levelReq: 70, accent: '#fb923c', boss: 'Senhor das Brasas' },
  { id: 'necropole', name: 'Necrópole Eterna', emoji: '☠️', tagline: 'Os mortos não esquecem seus nomes', levelReq: 85, accent: '#a78bfa', boss: 'Rei Cadáver' },
  { id: 'cidadela', name: 'Cidadela de Dolrath', emoji: '👹', tagline: 'O trono que dá nome ao mundo', levelReq: 100, accent: '#ef4444', boss: 'Dolrath, o Primeiro' },
]

type TrailKind = 'start' | 'minor' | 'main' | 'boss'
interface TrailPoint { x: number; y: number; kind: TrailKind }

// Mesma lógica de buildTrailPoints do jogo: trilha serpenteante (base → topo),
// entrada → (n nós menores + 1 sala principal) × salas → boss.
function buildTrail(rooms: number, minor: number): TrailPoint[] {
  const seq: TrailKind[] = ['start']
  for (let t = 1; t <= rooms; t++) {
    for (let m = 0; m < minor; m++) seq.push('minor')
    seq.push('main')
  }
  seq.push('boss')
  const last = seq.length - 1
  return seq.map((kind, i) => {
    const t = last > 0 ? i / last : 0
    const y = 92 - t * 80 // 92% (base) → 12% (topo)
    const x = i === 0 || i === last ? 50 : i % 2 === 1 ? 26 : 74
    return { x, y, kind }
  })
}

// Caminho SVG suave (Catmull-Rom → Bézier) — mesma curva do DungeonMap do jogo,
// para a trilha serpentear com curvas macias em vez de retas de nó a nó.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  const p = pts.map((q) => [q.x, q.y] as const)
  let d = `M ${p[0][0]} ${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`
  }
  return d
}

// Mapa em miniatura com o token do herói caminhando de nó em nó (loop).
function MiniDungeonMap({ dungeon }: { dungeon: DungeonCard }) {
  const reduce = useReducedMotion()
  const pts = useMemo(() => buildTrail(dungeon.rooms, dungeon.minor), [dungeon.rooms, dungeon.minor])
  const [step, setStep] = useState(0)
  useEffect(() => { setStep(0) }, [dungeon.id])
  useEffect(() => {
    if (reduce) { setStep(pts.length - 1); return }
    const id = setInterval(() => setStep((s) => (s + 1) % (pts.length + 2)), 850)
    return () => clearInterval(id)
  }, [pts.length, reduce])
  const cur = Math.min(step, pts.length - 1)
  const token = pts[cur]
  const bgPath = smoothPath(pts)
  const litPath = smoothPath(pts.slice(0, cur + 1))
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border"
      style={{
        aspectRatio: '3 / 4',
        borderColor: `${dungeon.accent}55`,
        background: `radial-gradient(120% 80% at 50% 100%, ${dungeon.accent}22, rgba(10,10,25,0.92) 62%)`,
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d={bgPath} fill="none" stroke={`${dungeon.accent}40`} strokeWidth={1.4} strokeDasharray="3 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={litPath} fill="none" stroke={dungeon.accent} strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 3px ${dungeon.accent})` }} />
      </svg>
      {pts.map((p, i) => {
        const visited = i <= cur
        const sz = p.kind === 'boss' ? 30 : p.kind === 'main' ? 24 : p.kind === 'start' ? 20 : 13
        return (
          <div
            key={i}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[11px] transition-all duration-500"
            style={{
              left: `${p.x}%`, top: `${p.y}%`, width: sz, height: sz,
              borderColor: visited ? dungeon.accent : 'rgba(255,255,255,0.18)',
              background: visited ? `${dungeon.accent}33` : 'rgba(0,0,0,0.5)',
              boxShadow: visited ? `0 0 10px ${dungeon.accent}88` : 'none',
            }}
          >
            {p.kind === 'boss' ? '👑' : p.kind === 'main' ? '⚔️' : p.kind === 'start' ? '🚪' : ''}
          </div>
        )
      })}
      <motion.div
        className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        initial={false}
        animate={{ left: `${token.x}%`, top: `${token.y}%` }}
        transition={{ duration: 0.55, ease: 'easeInOut' }}
        style={{ left: `${token.x}%`, top: `${token.y}%` }}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-black/70 text-[13px]" style={{ boxShadow: `0 0 14px ${dungeon.accent}` }}>
          🧝
        </span>
      </motion.div>
      <div className="absolute left-2 top-2 flex items-center gap-1.5">
        <span className="text-base">{dungeon.emoji}</span>
        <span className="font-combat text-[11px] font-bold text-white/90" style={{ textShadow: '0 1px 3px #000' }}>{dungeon.name}</span>
      </div>
      <div className="absolute bottom-2 right-2 font-combat text-[10px] text-white/60">{dungeon.rooms} salas + 👑</div>
    </div>
  )
}

function DungeonsSection() {
  const [active, setActive] = useState(0)
  const dungeon = DUNGEON_CARDS[active]
  return (
    <section id="masmorras" className="relative py-24 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow="Masmorras"
          title="Oito terras perigosas. Quatro já abertas."
          sub="Escolha uma masmorra e siga a trilha: role o d20 a cada nó, enfrente salas com monstros e chegue ao boss. Cada masmorra é um band de níveis — da Floresta (Nv.1) à Cidadela de Dolrath (Nv.100). Mais quatro estão em construção."
        />
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_0.8fr]">
          {/* cards menores — mesma identidade do jogo; clicar troca o mapa */}
          <div className="grid gap-4 sm:grid-cols-2">
            {DUNGEON_CARDS.map((d, i) => {
              const sel = i === active
              return (
                <button
                  key={d.id}
                  onClick={() => setActive(i)}
                  aria-pressed={sel}
                  className="relative overflow-hidden rounded-2xl border-2 p-4 text-left transition-all hover:scale-[1.02]"
                  style={{
                    borderColor: sel ? d.accent : `${d.accent}44`,
                    background: `linear-gradient(150deg, ${d.accent}22, rgba(12,12,28,0.85))`,
                    boxShadow: sel ? `0 0 22px ${d.accent}55` : 'none',
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{d.emoji}</div>
                    <div className="text-right">
                      <div className="text-xs tracking-tighter text-amber-400">
                        {'★'.repeat(d.stars)}<span className="text-white/25">{'★'.repeat(4 - d.stars)}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-white/55">{d.rooms} salas + 👑</div>
                    </div>
                  </div>
                  <h3 className="mt-2 text-base font-black text-white">{d.name}</h3>
                  <p className="text-[11px] italic text-white/60">{d.tagline}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-combat text-[10px]" style={{ color: d.accent }}>👑 {d.boss}</span>
                    <span className="font-combat text-[10px] text-white/50">Nv. {d.levelReq}+</span>
                  </div>
                </button>
              )
            })}

            {/* masmorras em construção — vitrine, não clicáveis */}
            {SOON_DUNGEONS.map((d) => (
              <div
                key={d.id}
                aria-disabled="true"
                className="relative cursor-not-allowed overflow-hidden rounded-2xl border-2 border-dashed p-4 text-left opacity-70 grayscale-[0.35]"
                style={{
                  borderColor: `${d.accent}55`,
                  background: `linear-gradient(150deg, ${d.accent}14, rgba(12,12,28,0.9))`,
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{d.emoji}</div>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{ borderColor: `${d.accent}66`, color: d.accent, background: `${d.accent}1a` }}
                  >
                    <Lock size={9} /> Em breve
                  </span>
                </div>
                <h3 className="mt-2 text-base font-black text-white/85">{d.name}</h3>
                <p className="text-[11px] italic text-white/45">{d.tagline}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-combat text-[10px] text-white/40">👑 {d.boss}</span>
                  <span className="font-combat text-[10px]" style={{ color: d.accent }}>Nv. {d.levelReq}+</span>
                </div>
              </div>
            ))}
          </div>
          {/* mapa + animação do token */}
          <div className="flex flex-col gap-3">
            <MiniDungeonMap dungeon={dungeon} />
            <p className="text-center font-combat text-[11px] text-textsec/70">
              🚪 entrada · ⚔️ salas principais (monstro + loot) · 👑 boss — o herói avança nó a nó
            </p>
          </div>
        </div>
        {/* como a masmorra funciona */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            [Zap, 'Stamina é seu orçamento do dia', 'Reseta amanhã e só é gasta avançando na trilha — o combate não consome stamina.'],
            [Skull, 'Morrer não tem penalidade', 'Você nunca perde XP, ouro ou itens ao cair ou sair. Cada tentativa te deixa mais forte.'],
            [Shield, 'Gear e aprimoramento contam', 'No combate da masmorra o equipamento e o +N viram atributos reais — leve sua melhor build.'],
            [Crown, 'Boss no fim da trilha', 'Salas principais garantem monstro e melhor espólio; o boss ancora o topo do band de níveis.'],
          ] as const).map(([Ic, t, dsc]) => (
            <GlassCard key={t} className="flex flex-col gap-2 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/15 text-primary"><Ic size={20} /></span>
              <h3 className="text-sm font-semibold text-white">{t}</h3>
              <p className="text-xs leading-relaxed text-textsec">{dsc}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Relíquias — vitrine de loot épico & lendário (imagens reais do jogo)
// ============================================================

const RELICS: { piece: GearPiece; tag: string }[] = [
  { piece: { name: 'Égide de Gorthak', rarity: 'LEGENDARY' }, tag: 'Armadura pesada' },
  { piece: { name: 'Esmagador de Gorthak', rarity: 'LEGENDARY' }, tag: 'Machado' },
  { piece: { name: 'Manto de Vol\'theris', rarity: 'LEGENDARY' }, tag: 'Veste arcana' },
  { piece: { name: 'Lâmina de Krax-thar', rarity: 'LEGENDARY' }, tag: 'Espada' },
  { piece: { name: 'Arco de Sylariel', rarity: 'LEGENDARY' }, tag: 'Arco' },
  { piece: { name: 'Égide do Dragão Ancião', rarity: 'EPIC' }, tag: 'Armadura pesada' },
  { piece: { name: 'Cajado da Aurora Arcana', rarity: 'EPIC' }, tag: 'Cajado' },
  { piece: { name: 'Couraça de Escamas Ígneas', rarity: 'RARE' }, tag: 'Armadura pesada' },
]

function RelicCard({ piece, tag }: { piece: GearPiece; tag: string }) {
  const r = RARITY_FRAME[piece.rarity]
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border ${r.ring} bg-surface/40`}
      style={{ boxShadow: `0 0 22px ${r.glow}` }}
    >
      <div className="relative aspect-square overflow-hidden bg-black/50">
        {/* asset estático /items/<slug>.webp — img simples (sem next/image) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={itemImagePath(piece.name)}
          alt={piece.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border ${r.ring} bg-black/60 px-2 py-0.5 text-[10px] font-bold ${r.text}`}>
          {r.label}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <h3 className={`text-sm font-bold leading-tight ${r.text}`}>{piece.name}</h3>
        <span className="font-combat text-[11px] text-textsec">{tag}</span>
      </div>
    </div>
  )
}

function RelicsSection() {
  return (
    <section id="reliquias" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow="Loot dos chefes"
          title="Relíquias forjadas em Dolrath"
          sub="Armaduras e armas épicas e lendárias caem dos chefes de masmorra e das aventuras semanais — cada peça é um NFT seu, pronto para equipar ou negociar no marketplace."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {RELICS.map((rel, i) => (
            <Reveal key={rel.piece.name} delay={i * 60}>
              <RelicCard piece={rel.piece} tag={rel.tag} />
            </Reveal>
          ))}
        </div>
        <div className="flex justify-center">
          <Badge tone="primary" icon={<Gem size={14} />} className="text-sm px-4 py-1.5">
            Épico e Lendário só de chefe
          </Badge>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Aprimoramento — demo auto-rodando do diálogo estilo BDO:
// um item ÉPICO sobe de +III → +IV (barra carrega, brilho dourado).
// Espelha EnhancementDialog.tsx (forja, failstacks, chance, sucesso).
// ============================================================

const ENHANCE_ITEM: GearPiece = { name: 'Cajado da Aurora Arcana', rarity: 'EPIC' }
const CHARGE_MS = 1500

function EnhancementDemo() {
  const reduce = useReducedMotion()
  // ready → charging → success → (loop)
  const [phase, setPhase] = useState<'ready' | 'charging' | 'success'>('ready')
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (reduce) { setPhase('success'); return }
    let t: ReturnType<typeof setTimeout>
    if (phase === 'ready') t = setTimeout(() => setPhase('charging'), 1900)
    else if (phase === 'charging') t = setTimeout(() => setPhase('success'), CHARGE_MS)
    else t = setTimeout(() => { setRun((r) => r + 1); setPhase('ready') }, 2600)
    return () => clearTimeout(t)
  }, [phase, reduce])

  const success = phase === 'success'

  return (
    <div className="w-full max-w-md rounded-xl border border-amber-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 shadow-2xl shadow-amber-900/30">
      {/* Cabeçalho */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold text-amber-400">⚒️ Aprimoramento</h3>
        <span className="rounded-lg px-2 py-1 text-gray-500">✕</span>
      </div>

      {/* Item + progressão de nível */}
      <div className="mb-4 flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-4 text-center">
        <div className="relative">
          <GearTile piece={ENHANCE_ITEM} size="lg" />
          {/* selo do nível atual no canto, estilo jogo */}
          <span
            className="absolute -bottom-1 right-0 rounded-md bg-black/80 px-1.5 text-sm font-black"
            style={{ color: '#f1d79a', textShadow: '0 1px 2px #000' }}
          >
            {success ? 'IV' : 'III'}
          </span>
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 0], scale: [0.4, 1.6, 2.2] }}
                transition={{ duration: 1 }}
                className="pointer-events-none absolute -inset-6"
                style={{ background: 'radial-gradient(circle, rgba(253,224,71,0.9) 0%, rgba(245,158,11,0.35) 40%, transparent 70%)' }}
              />
            )}
          </AnimatePresence>
        </div>
        <div className="text-base font-semibold text-cyan-300">{ENHANCE_ITEM.name}</div>
        <div className="flex items-center justify-center gap-3 text-2xl font-bold">
          <span className="text-gray-400">III</span>
          <span className="text-amber-400">→</span>
          <span className="text-amber-300">IV</span>
        </div>
      </div>

      {/* Chance + failstacks */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-center">
          <div className="text-xs uppercase tracking-wide text-gray-500">Chance de sucesso</div>
          <div className="mt-1 text-2xl font-bold text-yellow-400">24.0%</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-center">
          <div className="text-xs uppercase tracking-wide text-gray-500">Failstacks</div>
          <div className="mt-1 text-2xl font-bold text-purple-400">🔥 41</div>
        </div>
      </div>

      {/* Barra de aprimoramento (carrega → brilha). Altura reservada (min-h)
          para o card não mudar de tamanho entre as fases e empurrar a landing. */}
      <div className="relative mb-4 min-h-[5.5rem]">
        {phase !== 'ready' && (
          <div className="relative z-20">
            <div className="mb-1 text-center text-sm font-semibold">
              {phase === 'charging' ? (
                <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 0.7 }} className="text-amber-300">
                  ⚒️ Forjando...
                </motion.span>
              ) : (
                <span className="text-yellow-300">✨ SUCESSO!</span>
              )}
            </div>
            <div
              className={`relative h-7 overflow-hidden rounded-full border bg-gray-900 ${
                success ? 'border-yellow-300/70 shadow-[0_0_25px_rgba(253,224,71,0.8)]' : 'border-amber-500/40'
              }`}
            >
              <motion.div
                key={run}
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: CHARGE_MS / 1000, ease: [0.45, 0, 0.55, 1] }}
                className={`h-full ${success ? 'bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300' : 'bg-gradient-to-r from-amber-700 via-amber-500 to-amber-400'}`}
              />
              {phase === 'charging' && (
                <motion.div
                  initial={{ x: '-120%' }}
                  animate={{ x: '500%' }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                />
              )}
            </div>
            {success && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-center text-sm font-bold text-green-300">
                Aprimoramento bem-sucedido! Agora é +IV.
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Botão (decorativo, espelha o diálogo) */}
      <div className="w-full rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 py-3 text-center text-lg font-bold text-black shadow-lg shadow-amber-900/50">
        ⚒️ Aprimorar
      </div>
    </div>
  )
}

// Materiais de aprimoramento da ARMA exibidos abaixo do demo (espelham o
// catálogo: Pedra Negra básica sobe +1..+15; a Concentrada sobe os níveis
// romanos PRI→PEN e empilha failstacks para os saltos finais como o TET).
const ENHANCE_STONES = [
  { name: 'Pedra Negra (Arma)', note: 'Sobe a arma de +1 a +15' },
  { name: 'Pedra Negra Mágica Concentrada (Arma)', note: 'Saltos I→V (PRI→PEN) e acumula failstacks' },
] as const

function EnhancementStones() {
  return (
    <div className="w-full max-w-md rounded-xl border border-amber-500/20 bg-black/30 p-4">
      <p className="mb-3 text-center text-xs uppercase tracking-wide text-gray-500">
        Materiais para forjar a arma
      </p>
      <div className="grid grid-cols-2 gap-3">
        {ENHANCE_STONES.map((s) => (
          <div key={s.name} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-2.5">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-amber-500/40 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={itemImagePath(s.name)} alt={s.name} loading="lazy" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-amber-200">{s.name}</div>
              <div className="text-[11px] leading-tight text-white/50">{s.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EnhancementSection() {
  return (
    <section id="aprimoramento" className="relative py-24 bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow="Forja & Aprimoramento"
          title="Suba seu equipamento de +I a +V"
          sub="Aprimoramento estilo Black Desert: cada tentativa acumula failstacks e arrisca a durabilidade. A barra carrega, e no fim — brilho dourado de sucesso ou a falha. No combate da masmorra o +N vira atributos reais."
        />
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal className="flex flex-col items-center gap-4">
            <EnhancementDemo />
            <EnhancementStones />
          </Reveal>
          <Reveal delay={120} className="grid gap-4 sm:grid-cols-2">
            {([
              [Hammer, 'Failstacks acumulam', 'Cada falha aumenta a chance da próxima tentativa — o risco vira progresso.'],
              [Gem, 'Material por tentativa', 'Use uma pedra de aprimoramento ou uma cópia do próprio item para tentar subir +N.'],
              [Shield, 'O +N vira atributo', 'Na masmorra o nível de aprimoramento é convertido em stats reais — leve sua melhor build.'],
              [AlertTriangle, 'Risco real', 'Em níveis altos, falhar pode reduzir a durabilidade ou rebaixar a peça.'],
            ] as const).map(([Ic, t, dsc]) => (
              <GlassCard key={t} className="flex flex-col gap-2 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-300"><Ic size={20} /></span>
                <h3 className="text-sm font-semibold text-white">{t}</h3>
                <p className="text-xs leading-relaxed text-textsec">{dsc}</p>
              </GlassCard>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Bancadas — Ferreiro (reparo) + Alquimista (transmutação).
// Espelha RepairBench.tsx e AlchemyBench.tsx (durabilidade que
// reenche; triângulo com 3 ingredientes → poção no centro).
// ============================================================

// — Ferreiro: durabilidade desgastada que reenche queimando uma cópia —
function RepairDemo() {
  const reduce = useReducedMotion()
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (reduce) { setFull(true); return }
    const id = setInterval(() => setFull((f) => !f), 2200)
    return () => clearInterval(id)
  }, [reduce])
  const pct = full ? 100 : 24
  const barColor = full ? 'bg-emerald-500' : 'bg-red-500'

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-black/50 p-5">
      <h3 className="mb-1 text-xl font-black text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">🔧 Bancada de Reparo</h3>
      <p className="mb-5 text-sm text-white/55">Em itens comuns e incomuns, o ferreiro restaura a durabilidade queimando uma cópia nível 0 da peça — +10 por cópia, ou 100% de uma vez. Relíquias mais raras seguem outro caminho.</p>

      {/* dois slots da forja: item + cópia */}
      <div className="mb-4 flex items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div className="h-20 w-20 overflow-hidden rounded-xl border-2 border-amber-500/60 bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={itemImagePath('Armadura de Couro Batido')} alt="" className="h-full w-full object-cover" loading="lazy" />
          </div>
          <span className="text-[10px] text-white/50">item</span>
        </div>
        <span className="text-3xl text-amber-400">＋</span>
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-20 w-20 overflow-hidden rounded-xl border-2 border-dashed border-amber-500/60 bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={itemImagePath('Armadura de Couro Batido')} alt="" className="h-full w-full object-cover grayscale" loading="lazy" />
            <span className="absolute bottom-0.5 right-1 rounded bg-black/70 px-1.5 text-xs font-bold text-amber-300">x1</span>
          </div>
          <span className="text-[10px] text-white/50">cópia nível 0</span>
        </div>
      </div>

      {/* barra de durabilidade reenchendo */}
      <div className="mb-2 flex justify-between text-xs text-white/60">
        <span>Durabilidade</span>
        <motion.span key={String(full)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {full ? '120/120 (100%)' : '29/120 (24%)'}
        </motion.span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/50">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </div>

      <div className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-2.5 text-center text-sm font-black text-white">
        ⚒️ Reparar 100% (1 cópia)
      </div>
    </div>
  )
}

// — Alquimista: 3 ingredientes caem nos vértices → poção surge no centro —
const ALCH_PTS = { top: { x: 50, y: 16 }, left: { x: 18, y: 82 }, right: { x: 82, y: 82 }, center: { x: 50, y: 58 } }
const ALCH_INGREDIENTS = [
  { emoji: '🌿', accent: '#34d399', pos: ALCH_PTS.top },
  { emoji: '🍄', accent: '#e879f9', pos: ALCH_PTS.left },
  { emoji: '💧', accent: '#38bdf8', pos: ALCH_PTS.right },
]

function AlchemyDemo() {
  const reduce = useReducedMotion()
  // 0..3 = ingredientes colocados; 4 = poção criada; depois reseta
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (reduce) { setStep(4); return }
    const id = setInterval(() => setStep((s) => (s + 1) % 6), 850)
    return () => clearInterval(id)
  }, [reduce])
  const placed = Math.min(step, 3)
  const crafted = step >= 4
  const accent = '#34d399'

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-purple-950/30 p-5">
      <h3 className="mb-1 text-xl font-black text-emerald-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">⚗️ Triângulo de Transmutação</h3>
      <p className="mb-4 text-sm text-white/55">A alquimista junta 3 ingredientes nos vértices; se formarem uma receita, a poção surge no centro e vai pro inventário.</p>

      <div className="relative mx-auto" style={{ width: '100%', maxWidth: 320, aspectRatio: '1 / 0.92' }}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 92" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points={`${ALCH_PTS.top.x},${ALCH_PTS.top.y} ${ALCH_PTS.left.x},${ALCH_PTS.left.y} ${ALCH_PTS.right.x},${ALCH_PTS.right.y}`}
            fill="none"
            stroke={crafted ? accent : 'rgba(52,211,153,0.35)'}
            strokeWidth={1.2}
            strokeDasharray={crafted ? undefined : '4 4'}
            vectorEffect="non-scaling-stroke"
            style={{ filter: crafted ? `drop-shadow(0 0 6px ${accent})` : undefined }}
          />
        </svg>

        {/* vértices */}
        {ALCH_INGREDIENTS.map((ing, i) => {
          const on = i < placed
          return (
            <div
              key={i}
              className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border-2 transition-all duration-300"
              style={{
                left: `${ing.pos.x}%`, top: `${ing.pos.y}%`,
                borderColor: on ? ing.accent : '#ffffff33',
                borderStyle: on ? 'solid' : 'dashed',
                background: 'radial-gradient(circle at 50% 35%, rgba(16,40,32,0.9), rgba(5,8,10,0.95))',
                boxShadow: on ? `0 0 14px ${ing.accent}99` : 'inset 0 0 8px rgba(0,0,0,0.6)',
              }}
            >
              {on ? <span className="text-2xl drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]">{ing.emoji}</span> : <span className="text-xl text-white/25">＋</span>}
            </div>
          )
        })}

        {/* resultado no centro */}
        <div
          className="absolute grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 transition-all duration-300"
          style={{
            left: `${ALCH_PTS.center.x}%`, top: `${ALCH_PTS.center.y}%`,
            borderColor: crafted ? accent : '#ffffff22',
            background: 'radial-gradient(circle at 50% 35%, rgba(20,50,40,0.95), rgba(4,6,8,0.98))',
            boxShadow: crafted ? `0 0 26px ${accent}` : 'inset 0 0 12px rgba(0,0,0,0.7)',
          }}
        >
          <AnimatePresence mode="wait">
            {crafted ? (
              <motion.span
                key="potion"
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 14 }}
                className="text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
              >
                🧪
              </motion.span>
            ) : (
              <span key="q" className="text-2xl text-white/20">?</span>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {crafted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.5, 2.1] }}
                transition={{ duration: 1 }}
                className="pointer-events-none absolute -inset-4"
                style={{ background: `radial-gradient(circle, ${accent}cc 0%, ${accent}44 40%, transparent 70%)` }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 min-h-[1.5rem] text-center text-sm">
        {crafted ? (
          <span className="font-bold text-emerald-300">✨ Poção de Cura Maior criada!</span>
        ) : (
          <span className="text-white/50">Vértices preenchidos: <span className="font-semibold text-white">{placed}/3</span></span>
        )}
      </div>
    </div>
  )
}

function CraftingSection() {
  return (
    <section id="bancadas" className="relative py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow="Ferreiro & Alquimista"
          title="Repare, transmute, mantenha sua build"
          sub="Na loja, o ferreiro restaura a durabilidade das suas peças e a alquimista combina ingredientes do loot em poções de combate. Tudo com os mesmos ingredientes que caem nas masmorras."
        />
        <div className="grid items-stretch gap-8 lg:grid-cols-2">
          <Reveal><RepairDemo /></Reveal>
          <Reveal delay={120}><AlchemyDemo /></Reveal>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Raças & Classes
// ============================================================

// Cards de raça com NFT real (base ⇄ forma transformada). Espelha
// RACE_TRANSFORMATIONS / TRANSFORMATION_GLOW do jogo (transformationSystem.ts).
interface RaceCard {
  name: string
  base: string
  transformed: string
  formEmoji: string
  form: string
  glow: string
  lore: string
}

const RACE_CARDS: RaceCard[] = [
  { name: 'Humano', base: '/humanopvp.png', transformed: '/humano_transformed.png', formEmoji: '✨', form: 'Sétimo Sentido', glow: '#e2e8f0', lore: 'Versáteis e ambiciosos — prosperam em qualquer masmorra.' },
  { name: 'Elfo', base: '/elfopvp.png', transformed: '/elfo_transformed.png', formEmoji: '🌟', form: 'Celestial', glow: '#fbbf24', lore: 'Séculos de precisão. A flecha já partiu antes de você piscar.' },
  { name: 'Draconiano', base: '/dracopvp.png', transformed: '/draco_transformed.png', formEmoji: '🐉', form: 'Dragão', glow: '#ef4444', lore: 'Sangue antigo de dragão correndo em veias mortais.' },
  { name: 'Metamorfo', base: '/metamorfo_pvp.png', transformed: '/metamorfo_transformed.png', formEmoji: '🐺', form: 'Lobo · Urso · Águia', glow: '#93c5fd', lore: 'Nenhuma forma é definitiva — escolhe a fera para cada luta.' },
]

// Classes reais do jogo (gameData.ts → CLASSES)
const CLASSES = [
  { Icon: Axe, name: 'Guerreiro', lore: 'Linha de frente. Aço, resistência e dano sustentado.' },
  { Icon: VenetianMask, name: 'Ladino', lore: 'Ataques rápidos e furtivos: esquiva, precisão e o golpe pelas costas.' },
  { Icon: Wand2, name: 'Mago', lore: 'Verga a mana ao seu favor — frágil, devastador.' },
  { Icon: Hand, name: 'Monge', lore: 'Lutador desarmado: o próprio corpo é a arma. Ágil e resiliente.' },
]

// Card de NFT que faz flip (base ⇄ transformada) ao clicar no canto inferior
// direito — mesma interação da ficha do personagem (rotateY + ícone RefreshCw).
function RaceFlipCard({ card }: { card: RaceCard }) {
  const reduce = useReducedMotion()
  const [flipped, setFlipped] = useState(false)
  const img = flipped ? card.transformed : card.base
  const toggle = () => setFlipped((f) => !f)
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-surface/40 transition-shadow duration-500"
      style={{
        borderColor: flipped ? `${card.glow}99` : 'rgba(255,255,255,0.1)',
        boxShadow: flipped ? `0 0 28px ${card.glow}55` : '0 0 14px rgba(0,0,0,0.4)',
      }}
    >
      <div
        className="relative aspect-[3/4] overflow-hidden bg-black/60 cursor-pointer select-none"
        style={{ perspective: 900 }}
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        aria-label={`Alternar entre ${card.name} e a forma ${card.form}`}
        title="Clique para despertar a transformação"
      >
        <AnimatePresence mode="wait" initial={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img
            key={img}
            src={img}
            alt={`${card.name}${flipped ? ` — ${card.form}` : ''}`}
            loading="lazy"
            initial={reduce ? false : { rotateY: -90, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { rotateY: 90, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="absolute inset-0 h-full w-full object-cover object-top"
            style={{ backfaceVisibility: 'hidden' }}
          />
        </AnimatePresence>
        {/* aura ao despertar a forma */}
        <span
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: flipped ? 1 : 0,
            boxShadow: `inset 0 0 44px ${card.glow}`,
            background: `radial-gradient(circle at 50% 26%, ${card.glow}22, transparent 70%)`,
          }}
        />
        {/* selo da forma atual */}
        <span
          className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border bg-black/60 px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm transition-colors"
          style={{ borderColor: flipped ? card.glow : 'rgba(255,255,255,0.15)', color: flipped ? card.glow : '#cbd5e1' }}
        >
          {flipped ? `${card.formEmoji} ${card.form}` : card.name}
        </span>
        {/* botão de flip no canto inferior direito */}
        <span
          className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border bg-black/65 backdrop-blur-sm transition-transform group-hover:scale-110"
          style={{ borderColor: `${card.glow}99` }}
          aria-hidden="true"
        >
          <RefreshCw size={15} style={{ color: card.glow }} className={flipped ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <h3 className="text-sm font-bold leading-tight text-white">{card.name}</h3>
        <p className="text-[11px] text-textsec leading-relaxed">{card.lore}</p>
        <span className="font-combat text-[10px] text-primary/90 pt-0.5">
          Forma: {card.formEmoji} {card.form}
        </span>
      </div>
    </div>
  )
}

function RacesSection() {
  return (
    <section id="racas" className="relative py-24 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow="Raças, Classes & Transformações"
          title="Quem você será quando a lua subir?"
          sub="Cada herói é um NFT único: sua arte é gerada exclusivamente por IA a partir do prompt que você escreve. Clique no canto inferior direito do card para despertar a transformação de combate da raça — temporária, custa MP e Stamina, muda seus atributos e libera habilidades especiais."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {RACE_CARDS.map((card, i) => (
            <Reveal key={card.name} delay={i * 70}>
              <RaceFlipCard card={card} />
            </Reveal>
          ))}
        </div>
        <div className="flex justify-center">
          <Badge tone="primary" icon={<Palette size={14} />} className="text-sm px-4 py-1.5">
            Arte exclusiva — cada NFT é gerada por IA a partir do seu prompt
          </Badge>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto w-full">
          {CLASSES.map((c, i) => (
            <Reveal key={c.name} delay={i * 80}>
              <Card className="h-full flex flex-col gap-3">
                <span className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  <c.Icon size={20} />
                </span>
                <h3 className="font-semibold text-white">{c.name}</h3>
                <p className="text-xs text-textsec leading-relaxed">{c.lore}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Como funciona
// ============================================================

const STEPS = [
  { n: '01', Icon: Wallet, title: 'Conecte a carteira', desc: 'MetaMask ou qualquer carteira compatível. Sem cadastro, sem senha.' },
  { n: '02', Icon: Scroll, title: 'Crie seu personagem NFT', desc: 'Escolha raça, classe e distribua atributos. Ele nasce na sua carteira, como um ERC-721.' },
  { n: '03', Icon: Swords, title: 'Lute e evolua', desc: 'Treine contra monstros, desafie jogadores, acumule ouro e equipe itens cada vez melhores.' },
]

function HowSection() {
  return (
    <section id="como-funciona" className="relative py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading eyebrow="Como funciona" title="Da carteira à arena em três passos" />
        <ol className="grid md:grid-cols-3 gap-6">
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative">
              <Reveal delay={i * 100} className="h-full">
                <Card className="relative h-full flex flex-col gap-4 pt-8">
                  <span className="absolute -top-4 left-6 font-combat font-bold text-sm text-primary bg-background border border-primary/40 rounded-lg px-3 py-1.5 shadow-lg shadow-primary/10">
                    {s.n}
                  </span>
                  <span className="text-textsec"><s.Icon size={24} /></span>
                  <h3 className="font-semibold text-white text-lg">{s.title}</h3>
                  <p className="text-sm text-textsec leading-relaxed">{s.desc}</p>
                </Card>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ============================================================
// CTA final
// ============================================================

function FinalCTA({ primaryHref, glow }: { primaryHref: string; glow: number }) {
  return (
    <section className="relative py-28 overflow-hidden">
      <ArenaSky starCount={24} glow={glow} parallax={false} moon={false} />
      {/* A Anciã da Mata espreitando atrás do chamado final. */}
      <img
        src="/boss-ancia-da-mata.webp"
        alt="Anciã da Mata, a Guardiã Corrompida — chefe da Floresta Sombria"
        className="pointer-events-none select-none absolute right-0 top-1/2 -translate-y-1/2 h-[125%] w-auto max-w-none opacity-65 hidden md:block [mask-image:linear-gradient(to_left,black_55%,transparent)]"
      />
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 flex flex-col items-center gap-7 text-center">
        <D20 size={72} value={20} />
        <h2 className="text-3xl md:text-5xl font-bold text-balance leading-tight">
          A masmorra não vai se explorar sozinha.
        </h2>
        <p className="text-textsec max-w-xl text-pretty">
          Entre na testnet, crie seu primeiro herói de graça e role seu primeiro
          d20 ainda hoje.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button as="a" href={primaryHref} size="lg" icon={<Wallet size={18} />}>Conectar Carteira</Button>
          <Button as="a" href="#arena" size="lg" variant="secondary" icon={<Play size={16} />}>Ver gameplay</Button>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Footer
// ============================================================

const FOOT_COLS = [
  { title: 'Jogo', links: ['Jogar', 'Personagens', 'Masmorras', 'Modo treino'] },
  { title: 'Economia', links: ['Marketplace', 'Ouro', 'Itens NFT', 'Contratos'] },
  { title: 'Comunidade', links: ['Discord', 'X / Twitter', 'GitHub', 'Lore & Wiki'] },
]

const SOCIALS = [
  { Icon: MessageCircle, label: 'Discord' },
  { Icon: Twitter, label: 'X / Twitter' },
  { Icon: Github, label: 'GitHub' },
]

function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-secondary/60 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-4 items-start">
          <span className="flex items-center gap-2 font-bold text-lg text-white">
            <span aria-hidden="true">⚔️</span> Dolrath
          </span>
          <p className="text-sm text-textsec max-w-xs">
            RPG de fantasia sombria on-chain. Seus heróis, suas relíquias, suas
            rolagens — para sempre seus.
          </p>
          <Badge tone="warning" icon={<AlertTriangle size={13} />}>
            Em testnet — ativos sem valor real
          </Badge>
          <div className="flex gap-2">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href="#"
                aria-label={s.label}
                className="w-9 h-9 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-textsec hover:text-white hover:border-white/20 transition-colors"
              >
                <s.Icon size={16} />
              </a>
            ))}
          </div>
        </div>
        {FOOT_COLS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white">{col.title}</h3>
            {col.links.map((l) => (
              <a key={l} href="#" className="text-sm text-textsec hover:text-white transition-colors w-fit">
                {l}
              </a>
            ))}
          </nav>
        ))}
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-2 items-center justify-between text-xs text-textsec/70">
          <span>© 2026 Dolrath. Todos os direitos reservados.</span>
          <span className="font-combat">v0.4.2 · Sepolia testnet</span>
        </div>
      </div>
    </footer>
  )
}

// ============================================================
// Composição
// ============================================================

export default function DolrathLanding() {
  const { data: session } = useSession()
  // Entrada no app: logado vai ao dashboard, senão ao login (espelha a home antiga)
  const primaryHref = session ? '/dashboard' : '/auth/login'
  const glow = 1
  const spinDice = true

  return (
    <div className="min-h-screen bg-background text-white">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-4 focus:left-4 focus:bg-surface focus:px-4 focus:py-2 focus:rounded-lg"
      >
        Pular para o conteúdo
      </a>
      <Navbar primaryHref={primaryHref} />
      <main id="conteudo">
        <Hero primaryHref={primaryHref} spinDice={spinDice} />
        <Features />
        <ArenaSection glow={glow} />
        <DungeonsSection />
        <RelicsSection />
        <EnhancementSection />
        <CraftingSection />
        <RacesSection />
        <HowSection />
        <FinalCTA primaryHref={primaryHref} glow={glow} />
      </main>
      <Footer />
    </div>
  )
}
