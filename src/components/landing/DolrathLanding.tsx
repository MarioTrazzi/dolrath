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
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion'
import {
  Dices, Swords, Shield, Coins, Wallet, Play, Sparkles, ArrowRight, Menu, X,
  Github, Twitter, MessageCircle, Scroll, Wand2, Target, Axe, DoorOpen,
  AlertTriangle, Zap,
} from 'lucide-react'
import { Button, Card, GlassCard, Badge, StatBar, SectionHeading, D20, DiceChip, Reveal } from './ui'

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
  { label: 'Masmorras', href: '#destaques' },
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

function Hero({ primaryHref, glow, starCount, spinDice }: {
  primaryHref: string; glow: number; starCount: number; spinDice: boolean
}) {
  const reduce = useReducedMotion()
  const spin = spinDice && !reduce
  return (
    <section className="relative min-h-screen flex items-center pt-28 pb-20">
      <ArenaSky starCount={starCount} glow={glow} />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 w-full">
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] items-center gap-12">
          <div className="flex flex-col items-start gap-6 max-w-2xl">
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
                Crie um personagem que é seu de verdade, equipe-o até os dentes e
                desça às masmorras. Combate tático por turnos onde cada rolagem de
                dado pode mudar a batalha.
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
  { Icon: Dices, title: 'Combate por turnos com dados', desc: 'Cada ataque é uma rolagem. Estratégia, atributos e um pouco de sorte decidem quem fica de pé.' },
  { Icon: Shield, title: 'Personagens NFT seus de verdade', desc: 'Heróis ERC-721 na sua carteira. Venda, troque ou guarde — ninguém pode tirá-los de você.' },
  { Icon: DoorOpen, title: 'Masmorras & modo treino', desc: 'Explore masmorras com recompensas crescentes ou afie sua build contra monstros sem risco.' },
  { Icon: Coins, title: 'Ouro & marketplace', desc: 'Ganhe ouro em batalha e negocie armas, armaduras e relíquias no mercado entre jogadores.' },
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
  name, level, emoji, hp, hpMax, mp, mpMax, sta, staMax, gear, reverse = false, hit = false,
}: {
  name: string; level: number; emoji: string
  hp: number; hpMax: number; mp: number; mpMax: number; sta: number; staMax: number
  gear: string[]; reverse?: boolean; hit?: boolean
}) {
  return (
    <div className={`flex flex-col gap-3 ${reverse ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-white">{name}</span>
        <span className="font-combat text-xs text-textsec">Nv. {level}</span>
      </div>
      {/* arte do personagem — placeholder */}
      <div className="relative">
        <motion.div
          animate={hit ? { x: reverse ? [0, 10, -6, 0] : [0, -10, 6, 0] } : {}}
          transition={{ duration: 0.45 }}
          className="w-24 h-28 sm:w-28 sm:h-32 rounded-2xl border border-white/10 flex items-center justify-center text-5xl sm:text-6xl"
          style={{
            background: 'linear-gradient(180deg, rgba(22,33,62,0.9), rgba(15,15,35,0.95))',
            boxShadow: hit ? '0 0 24px rgba(231,76,60,0.45)' : '0 0 24px rgba(147,51,234,0.18)',
          }}
          aria-hidden="true"
        >
          {emoji}
        </motion.div>
        {/* pedestal */}
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-28 sm:w-32 h-4 rounded-[50%] blur-[2px]"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          aria-hidden="true"
        />
        {hit && (
          <span
            className="absolute -top-3 left-1/2 -translate-x-1/2 font-combat font-bold text-xl text-error"
            style={{ animation: 'float-damage 1.6s ease-out forwards', textShadow: '0 0 12px rgba(231,76,60,0.8)' }}
          >
            −24
          </span>
        )}
      </div>
      <div className="w-40 sm:w-48 flex flex-col gap-1.5 mt-2">
        <StatBar kind="hp" value={hp} max={hpMax} />
        <StatBar kind="mp" value={mp} max={mpMax} />
        <StatBar kind="stamina" value={sta} max={staMax} />
      </div>
      {/* equipamentos */}
      <ul className={`flex flex-col gap-1 ${reverse ? 'items-end' : 'items-start'}`} aria-label={`Equipamentos de ${name}`}>
        {gear.map((g) => (
          <li key={g} className="text-[11px] font-combat text-textsec/90 px-2 py-0.5 rounded border border-white/10 bg-white/5">
            {g}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ArenaSection({ glow }: { glow: number }) {
  const [phase, setPhase] = useState<'idle' | 'rolling' | 'hit'>('idle')
  useEffect(() => {
    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const loop = () => {
      if (!alive) return
      setPhase('rolling')
      timers.push(setTimeout(() => alive && setPhase('hit'), 1400))
      timers.push(setTimeout(() => alive && setPhase('idle'), 3200))
    }
    loop()
    const id = setInterval(loop, 5600)
    return () => {
      alive = false
      clearInterval(id)
      timers.forEach(clearTimeout)
    }
  }, [])
  const hit = phase === 'hit'
  return (
    <section id="arena" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
          <div className="flex flex-col gap-6 order-2 lg:order-1">
            <SectionHeading
              align="left"
              eyebrow="Arena de combate"
              title="Cada turno é uma cena. Cada dado, uma decisão."
              sub="Os dois lutadores frente a frente sob o céu enluarado, equipamentos à mostra. Você escolhe a ação, o dado gira — e o resultado explode na tela: dano flutuante, esquivas, críticos."
            />
            <ul className="flex flex-col gap-3">
              {([
                [Dices, 'Rolagens d20 visíveis — nada acontece escondido'],
                [Zap, 'Atributos que importam: Força, Agilidade, Crítico, Velocidade'],
                [Shield, 'PvP ranqueado ou modo treino contra monstros, sem risco'],
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
                  <Badge tone="error" className="font-combat">CRÍTICO ×2!</Badge>
                </div>
                <div className="flex justify-between items-end gap-4">
                  <Fighter
                    name="Kaelen" level={12} emoji="🧝"
                    hp={86} hpMax={100} mp={42} mpMax={60} sta={70} staMax={80}
                    gear={['Lâmina Lunar +3', 'Couraça Élfica', 'Anel de Agilidade']}
                  />
                  <div className="flex flex-col items-center gap-3 pb-16 shrink-0">
                    <DiceChip sides={20} value={18} rolling={phase === 'rolling'} />
                    <span className="font-combat text-[10px] text-textsec/70 text-center">
                      18 + FOR 6<br />vs DEF 13
                    </span>
                  </div>
                  <Fighter
                    reverse hit={hit}
                    name="Gor'Mak" level={11} emoji="👹"
                    hp={hit ? 34 : 58} hpMax={110} mp={20} mpMax={30} sta={44} staMax={90}
                    gear={['Machado Bruto', 'Pele de Troll', 'Totem de Fúria']}
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
// Raças & Classes
// ============================================================

const RACES = [
  { emoji: '👤', name: 'Humano', lore: 'Versáteis e ambiciosos — prosperam em qualquer masmorra.' },
  { emoji: '👹', name: 'Orc', lore: 'Força bruta forjada em guerra. Bater primeiro é doutrina.' },
  { emoji: '🧝', name: 'Elfo', lore: 'Séculos de precisão. A flecha já partiu antes de você piscar.' },
  { emoji: '🐲', name: 'Draconiano', lore: 'Sangue antigo de dragão correndo em veias mortais.' },
  { emoji: '🌓', name: 'Metamorfo', lore: 'Nenhuma forma é definitiva: dragão, lobo, urso ou águia.' },
]

const CLASSES = [
  { Icon: Axe, name: 'Guerreiro', lore: 'Linha de frente. Aço, resistência e dano sustentado.' },
  { Icon: Wand2, name: 'Mago', lore: 'Verga a mana ao seu favor — frágil, devastador.' },
  { Icon: Target, name: 'Arqueiro', lore: 'Crítico e velocidade. Termina lutas antes de começarem.' },
]

const TRANSFORMS = ['🐉 Dragão', '🐺 Lobo', '🐻 Urso', '🦅 Águia']

function RacesSection() {
  return (
    <section id="racas" className="relative py-24 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow="Raças & Classes"
          title="Quem você será quando a lua subir?"
          sub="Cinco raças, três classes e quatro transformações — combine atributos e forje uma build só sua."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {RACES.map((r, i) => (
            <Reveal key={r.name} delay={i * 60}>
              <GlassCard hover className="p-5 h-full flex flex-col gap-2 text-center items-center">
                <span className="text-4xl" aria-hidden="true">{r.emoji}</span>
                <h3 className="font-semibold text-white">{r.name}</h3>
                <p className="text-xs text-textsec leading-relaxed">{r.lore}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
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
        <div className="flex flex-wrap justify-center gap-3">
          {TRANSFORMS.map((t) => (
            <Badge key={t} tone="neutral" className="text-sm px-4 py-1.5">{t}</Badge>
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
  const starCount = 40
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
        <Hero primaryHref={primaryHref} glow={glow} starCount={starCount} spinDice={spinDice} />
        <Features />
        <ArenaSection glow={glow} />
        <RacesSection />
        <HowSection />
        <FinalCTA primaryHref={primaryHref} glow={glow} />
      </main>
      <Footer />
    </div>
  )
}
