'use client'

// ============================================================
// BDI — BLACK DOLRATH IDLE — Landing page
// Navbar de vidro, hero cinematográfico, Jornada Dolrath (carrossel com as
// telas REAIS do jogo em ./journey/), bestiário, relíquias, ofícios,
// economia, como funciona, CTA e footer.
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Swords, Shield, Coins, Wallet, Play, Sparkles, ArrowRight, Menu, X,
  Github, Twitter, MessageCircle, Scroll,
  AlertTriangle, Gem, Lock, Flame, Scale,
} from 'lucide-react'
import { Button, Card, GlassCard, Badge, SectionHeading, Reveal, ArenaSky } from './ui'
import { ShowcaseDie } from '@/components/battle/AnimatedDice'
import JourneyShowcase from './journey/JourneyCarousel'
import { itemImagePath } from '@/lib/itemCatalog'
import { getChainInfo } from '@/lib/chainConfig'
import { DUNGEONS, DUNGEON_LIST, type DungeonId, type DungeonMonsterDef, type DungeonBossDef } from '@/lib/dungeonAdventures'
import { GATHER_FIELDS } from '@/lib/gathering'
import { FIELD_ACCENT } from '@/components/gathering/GatheringPanel'
import { PROCESSING_GROUP_LABEL, type ProcessingRecipe } from '@/lib/processing'

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

// ============================================================
// Navbar
// ============================================================

const NAV_LINKS = [
  { label: 'Jogar', href: '#jornada' },
  { label: 'Bestiário', href: '#bestiario' },
  { label: 'Ofícios', href: '#oficios' },
  { label: 'Economia', href: '#economia' },
  { label: 'Docs', href: '/doc' },
]

function Navbar({ primaryHref }: { primaryHref: string }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6" aria-label="Navegação principal">
        <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-secondary/70 backdrop-blur-xl px-4 sm:px-6 py-3 shadow-2xl shadow-black/20">
          <Link href="/" className="flex items-center gap-2.5 text-white">
            <Image
              src="/logo-bdi-icon.png"
              alt=""
              aria-hidden="true"
              width={38}
              height={38}
              className="shrink-0 drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]"
            />
            <span className="flex flex-col leading-none">
              <span className="font-bold text-lg tracking-tight">BDI</span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                Black Dolrath Idle
              </span>
            </span>
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

// Ciclo do fundo do hero: a cena normal "desperta" para a forma Celestial
// (elfo irradiando aura dourada + Anciã da Mata com aura verde) por alguns
// segundos, com relâmpagos, e depois volta ao normal — em loop.
function useHeroAwaken(enabled: boolean) {
  const [awaken, setAwaken] = useState(false)
  const [strobe, setStrobe] = useState(false) // saída em estroboscópio (transição rápida)
  const [bolt, setBolt] = useState(0) // muda a cada relâmpago p/ re-disparar a animação
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (delay: number, fn: () => void) => timers.push(setTimeout(() => alive && fn(), delay))
    const flash = (delay: number) => at(delay, () => setBolt((b) => b + 1))
    const loop = () => {
      if (!alive) return
      // entrada: salva de relâmpagos -> forma celestial (cross-fade suave)
      setStrobe(false)
      flash(0); flash(140); flash(320)
      at(220, () => setAwaken(true))
      // saída: o SEGUNDO relâmpago encerra a transformação em estroboscópio.
      // pisca p/ a forma normal, brilha de volta na celestial e fixa no normal.
      at(4500, () => setStrobe(true))
      flash(4520); at(4540, () => setAwaken(false)) // 1º flash: pisca p/ a forma anterior
      at(4680, () => setAwaken(true))               // brilha de volta na celestial
      flash(4880); at(4900, () => setAwaken(false)) // 2º flash: brilha e fixa no normal
      at(5120, () => setStrobe(false))
    }
    const id = setInterval(loop, 9000)
    const kickoff = setTimeout(loop, 2600)
    return () => {
      alive = false
      clearInterval(id)
      clearTimeout(kickoff)
      timers.forEach(clearTimeout)
    }
  }, [enabled])
  return { awaken, strobe, bolt }
}

function Hero({ primaryHref }: {
  primaryHref: string
}) {
  const reduce = useReducedMotion()
  const { awaken, strobe, bolt } = useHeroAwaken(!reduce)
  const fadeMs = strobe ? 90 : 700 // estroboscópio na saída x cross-fade suave na entrada
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
      {/* Forma Celestial: mesma cena com o elfo desperto (aura dourada) e o
          chefe com aura verde — entra em cross-fade durante o "awaken". */}
      <img
        src="/hero-masmorra-floresta-celestial.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
        style={{ opacity: awaken ? 1 : 0, transition: `opacity ${fadeMs}ms ease-out` }}
      />
      {/* Véu estático sob o texto — NÃO depende do awaken (trocar o gradient
          a cada flash do strobe era o que engasgava o paint). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(4,4,10,0.72) 0%, rgba(4,4,10,0.4) 36%, rgba(4,4,10,0.12) 55%, transparent 70%)',
        }}
      />
      {/* Brilho celestial dourado que pulsa enquanto a forma está desperta */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none mix-blend-screen"
        style={{
          opacity: awaken ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease-out`,
          background:
            'radial-gradient(45% 60% at 24% 55%, rgba(251,191,36,0.28), transparent 70%), radial-gradient(40% 55% at 76% 45%, rgba(74,222,128,0.16), transparent 72%)',
          animation: awaken ? 'hero-aura-pulse 2.2s ease-in-out infinite' : 'none',
        }}
      />
      {/* Relâmpago: clarão branco-azulado curto, re-disparado a cada estalo */}
      {bolt > 0 && (
        <div
          key={bolt}
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none mix-blend-screen"
          style={{
            background:
              'linear-gradient(180deg, rgba(226,232,240,0.9), rgba(148,163,255,0.35) 40%, transparent 75%)',
            animation: 'hero-lightning 0.55s ease-out forwards',
          }}
        />
      )}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 w-full">
        <div className="flex items-center justify-between gap-8">
        <div className="flex flex-col items-start gap-6 max-w-2xl [text-shadow:0_2px_16px_rgba(0,0,0,0.9)]">
          <Reveal delay={0}>
            <Badge tone="primary" icon={<Sparkles size={14} />}>RPG on-chain · NFT</Badge>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight text-balance text-white">
              Forje sua{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
                lenda
              </span>
              {' em Dolrath'}
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-lg text-white/85 max-w-xl text-pretty">
            Crie um personagem no estilo RPG de mesa, Escolha sua raça e sua classe,
            aprimore seu gear e busque tesouros lendários derrotando os chefes,
            fique forte e desafie jogadores reais em PvPs épicos com rolagem de dados.
            Combate tático por turnos: desperte sua forma — Dragão, Celestial e mais — e deixe cada rolagem de dado mudar a batalha.
            </p>
          </Reveal>
          <Reveal delay={300} className="flex flex-wrap items-center gap-4">
            <Button as="a" href={primaryHref} size="lg" icon={<Swords size={18} />}>Jogar agora</Button>
            <Button as="a" href="#jornada" size="lg" variant="secondary" icon={<Play size={16} />}>
              Ver gameplay
            </Button>
          </Reveal>
          <Reveal delay={400} className="flex flex-wrap items-center gap-3 text-xs text-white/70">
            <span className="font-combat">ERC-721</span>
            <span aria-hidden="true">·</span>
            <span>Sem compra obrigatória para testar</span>
            <span aria-hidden="true">·</span>
            <span className="font-combat">testnet aberta</span>
          </Reveal>
        </div>
        {/* Emblema BDI no centro com o trio de dados "pedra amaldiçoada"
            orbitando ao redor — só desktop (3 poliedros CSS girando é RAF
            demais pro mobile). Arraste/toque rola de verdade. */}
        <Reveal delay={250} className="hidden lg:block shrink-0 pr-2">
          <div className="relative h-[440px] w-[420px]">
            <Image
              src="/logo-bdi.png"
              alt="BDI — Black Dolrath Idle"
              width={270}
              height={270}
              priority
              className="absolute inset-0 m-auto drop-shadow-[0_0_36px_rgba(251,191,36,0.3)]"
            />
            <motion.div
              className="absolute right-16 top-0 z-10"
              animate={reduce ? {} : { y: [0, -12, 0] }}
              transition={reduce ? {} : { repeat: Infinity, duration: 5.2, ease: 'easeInOut' }}
            >
              <ShowcaseDie sides={6} size={84} interactive />
            </motion.div>
            <motion.div
              className="absolute -left-14 top-[190px] z-10"
              animate={reduce ? {} : { y: [0, -14, 0] }}
              transition={reduce ? {} : { repeat: Infinity, duration: 6.4, ease: 'easeInOut', delay: 0.9 }}
            >
              <ShowcaseDie sides={20} size={128} interactive />
            </motion.div>
            <motion.div
              className="absolute bottom-2 right-24 z-10"
              animate={reduce ? {} : { y: [0, -10, 0] }}
              transition={reduce ? {} : { repeat: Infinity, duration: 5.8, ease: 'easeInOut', delay: 1.7 }}
            >
              <ShowcaseDie sides={8} size={72} interactive />
            </motion.div>
          </div>
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
// Bestiário — galeria de monstros reais por masmorra (arte gerada,
// os mesmos assets usados no combate). Fica logo abaixo das masmorras.
// ============================================================

function MonsterCard({ monster, accent, boss = false }: { monster: DungeonMonsterDef; accent: string; boss?: boolean }) {
  const [failed, setFailed] = useState(false)
  const title = boss ? (monster as DungeonBossDef).title : undefined
  // Arte dos monstros é retrato 2:3 — card 3/4 + object-top (mesmo padrão do
  // combat-lobby) preenche o quadro sem letterbox nem cortar a cabeça.
  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      className="group relative aspect-[3/4] overflow-hidden rounded-2xl border-2 bg-black/60"
      style={{
        borderColor: boss ? '#fbbf24' : `${accent}44`,
        boxShadow: boss ? '0 0 24px rgba(251,191,36,0.35)' : `0 0 14px ${accent}22`,
      }}
    >
      {monster.image && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={monster.image}
          alt={monster.name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="art-bright absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-black/50 text-5xl">{monster.emoji}</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
      {boss && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-amber-400/70 bg-black/60 px-2 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-sm">
          👑 Chefe
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3 text-center">
        <h3 className={`text-sm font-bold leading-tight drop-shadow ${boss ? 'text-amber-300' : 'text-white'}`}>
          {monster.name}
        </h3>
        {title && <span className="mt-0.5 block font-combat text-[11px] text-white/70">{title}</span>}
      </div>
    </motion.div>
  )
}

function MonsterGallerySection() {
  const [active, setActive] = useState<DungeonId>('floresta')
  const [userPicked, setUserPicked] = useState(false)
  const [inView, setInView] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const dungeon = DUNGEONS[active]

  // Auto-cycle: com a seção visível, troca de masmorra sozinho a cada 4s
  // (como se clicasse nos botões) até o visitante escolher uma de verdade.
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      { threshold: 0.25 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!inView || userPicked) return
    const id = window.setInterval(() => {
      setActive((prev) => {
        const i = DUNGEON_LIST.findIndex((d) => d.id === prev)
        return DUNGEON_LIST[(i + 1) % DUNGEON_LIST.length].id
      })
    }, 4000)
    return () => window.clearInterval(id)
  }, [inView, userPicked])

  return (
    <section ref={sectionRef} id="bestiario" className="relative py-24 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-10">
        <SectionHeading
          eyebrow="Bestiário"
          title="Cada masmorra tem seus próprios monstros"
          sub="Da Floresta Sombria às Ruínas Arcanas, cada bioma esconde ameaças diferentes — e um chefe que guarda o melhor espólio."
        />
        <div className="flex flex-wrap justify-center gap-2">
          {DUNGEON_LIST.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setActive(d.id)
                setUserPicked(true)
              }}
              className="rounded-full border px-4 py-1.5 text-xs font-semibold transition-all"
              style={{
                borderColor: active === d.id ? d.accent : `${d.accent}33`,
                background: active === d.id ? `${d.accent}22` : 'transparent',
                color: active === d.id ? d.accent : 'rgba(255,255,255,0.6)',
              }}
            >
              {d.emoji} {d.name}
            </button>
          ))}
        </div>
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          {dungeon.monsters.map((m) => (
            <MonsterCard key={m.name} monster={m} accent={dungeon.accent} />
          ))}
          <MonsterCard monster={dungeon.boss} accent={dungeon.accent} boss />
        </motion.div>
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
// Ofícios — Coleta, Processamento e Craft (sem assets de imagem
// dedicados; usa o mesmo painel chumbo+ouro do Aprimoramento/Reparo).
// ============================================================

const PROCESSING_GROUP_EMOJI: Record<ProcessingRecipe['group'], string> = {
  smelt: '🔥', wood: '🪚', textile: '🧵', mill: '🌾', still: '⚗️', refine: '🪨',
}

function TradesSection() {
  const fields = Object.values(GATHER_FIELDS)
  const groups = Object.keys(PROCESSING_GROUP_LABEL) as ProcessingRecipe['group'][]
  return (
    <section id="oficios" className="relative py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow="Ofícios"
          title="Colete, processe, forje"
          sub="A cadeia de produção do jogo: colete recursos brutos pelo reino, processe-os em materiais refinados e leve tudo para o ferreiro, alquimista ou fazenda transformar em equipamento e consumíveis."
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Coleta */}
          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 shadow-2xl shadow-amber-900/30">
            <h3 className="text-lg font-bold text-amber-400">⛏️ Coleta</h3>
            <p className="text-xs text-textsec">Cada personagem da conta pode render recursos pelo Mapa do Reino, gastando stamina em tempo real.</p>
            <div className="mt-1 flex flex-col gap-2">
              {fields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 p-2.5"
                  style={{ borderColor: `${FIELD_ACCENT[f.id]}44` }}
                >
                  <span className="text-2xl">{f.emoji}</span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">{f.name}</span>
                    <span className="text-[11px] text-textsec">{f.tagline}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Processamento */}
          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 shadow-2xl shadow-amber-900/30">
            <h3 className="text-lg font-bold text-amber-400">⚙️ Processamento</h3>
            <p className="text-xs text-textsec">Transforme o bruto da Coleta em material refinado — sem falha, só tempo e insumo.</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {groups.map((g) => (
                <div key={g} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-2.5">
                  <span className="text-xl">{PROCESSING_GROUP_EMOJI[g]}</span>
                  <span className="text-xs font-semibold text-white">{PROCESSING_GROUP_LABEL[g]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Craft */}
          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 shadow-2xl shadow-amber-900/30">
            <h3 className="text-lg font-bold text-amber-400">🔨 Craft</h3>
            <p className="text-xs text-textsec">O material refinado vira equipamento na Forja, poção na Alquimia ou receita na Culinária.</p>
            <div className="mt-1 flex flex-col gap-2 text-sm text-white/80">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-2.5">
                <span className="text-xl">⛏️</span><span>Bruto</span>
                <ArrowRight size={14} className="text-amber-400" />
                <span className="text-xl">⚙️</span><span>Refinado</span>
                <ArrowRight size={14} className="text-amber-400" />
                <span className="text-xl">⚔️</span><span>Equipamento</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 p-2.5">
                <span className="text-xl">🌿</span><span>Ingrediente</span>
                <ArrowRight size={14} className="text-amber-400" />
                <span className="text-xl">🧪</span><span>Poção</span>
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-2 pt-2">
              <Button as="a" href="/gathering" variant="outline" className="justify-center">Ir para a Coleta</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Economia — o anúncio do equilíbrio
// ============================================================

const ECONOMY_PILLARS = [
  {
    Icon: Coins,
    title: 'GOLD sem impressora',
    desc: 'Todo GOLD nasce jogando — com teto diário por jogador e gastos reais (loja, forja, alquimia) que consomem o ouro antes de ele virar token. A economia não infla porque não pode.',
  },
  {
    Icon: Lock,
    title: 'DOL: 1 bilhão, para sempre',
    desc: 'O token do jogo tem supply fixo cunhado uma única vez. Não existe função de mint no contrato: o supply só pode diminuir. Escassez garantida por código, não por promessa.',
  },
  {
    Icon: Flame,
    title: 'Queima real a cada venda',
    desc: 'Toda negociação no marketplace destrói uma fatia da moeda direto no contrato — não é carteira morta, é supply a menos. Quanto mais o jogo gira, mais escassos os tokens ficam.',
  },
  {
    Icon: Scale,
    title: 'Balanceado por IA, provado por dados',
    desc: 'Cada número da economia foi afinado pela IA Claude Fable 5 com milhares de combates simulados e 10 anos de projeção econômica — antes de qualquer jogador sentir na pele.',
  },
]

function EconomySection() {
  return (
    <section id="economia" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow="Economia"
          title="Um jogo que não trai quem joga"
          sub="Os play-to-earn morreram inflacionando o próprio token. Dolrath foi desenhado ao contrário: emissão travada, queima acoplada ao uso e cada parâmetro validado em simulação antes de ir ao ar."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ECONOMY_PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <GlassCard hover className="p-6 h-full flex flex-col gap-4">
                <span className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  <p.Icon size={22} />
                </span>
                <h3 className="font-semibold text-white text-lg leading-snug">{p.title}</h3>
                <p className="text-sm text-textsec leading-relaxed">{p.desc}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
        <p className="text-center text-sm text-textsec">
          Transparência total: a tokenomics completa está na{' '}
          <a href="/doc#tokenomics" className="text-primary hover:underline">documentação pública</a>{' '}
          e a projeção de 10 anos no{' '}
          <a href="/tokenomics/dashboard.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">dashboard interativo</a>.
        </p>
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
        <h2 className="text-3xl md:text-5xl font-bold text-balance leading-tight">
          A masmorra não vai se explorar sozinha.
        </h2>
        <p className="text-textsec max-w-xl text-pretty">
          Entre na testnet, crie seu primeiro herói de graça e role seu primeiro
          d20 ainda hoje.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button as="a" href={primaryHref} size="lg" icon={<Wallet size={18} />}>Conectar Carteira</Button>
          <Button as="a" href="#jornada" size="lg" variant="secondary" icon={<Play size={16} />}>Ver gameplay</Button>
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
          <span className="flex items-center gap-2.5 text-white">
            <Image src="/logo-bdi-icon.png" alt="" aria-hidden="true" width={36} height={36} />
            <span className="flex flex-col leading-none">
              <span className="font-bold text-lg">BDI</span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                Black Dolrath Idle
              </span>
            </span>
          </span>
          <p className="text-sm text-textsec max-w-xs">
            RPG de fantasia sombria on-chain. Seus heróis, suas relíquias, suas
            rolagens — para sempre seus.
          </p>
          {getChainInfo().isMainnet ? (
            <Badge tone="warning" icon={<AlertTriangle size={13} />}>
              Cripto envolve risco — jogue com responsabilidade
            </Badge>
          ) : (
            <Badge tone="warning" icon={<AlertTriangle size={13} />}>
              Em testnet — ativos sem valor real
            </Badge>
          )}
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
          <span>© 2026 BDI — Black Dolrath Idle. Todos os direitos reservados.</span>
          <span className="font-combat">
            v0.4.2 · {getChainInfo().isMainnet ? 'Polygon Mainnet' : `${getChainInfo().name} (testnet)`}
          </span>
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
        <Hero primaryHref={primaryHref} />
        <JourneyShowcase primaryHref={primaryHref} />
        <Features />
        <MonsterGallerySection />
        <RelicsSection />
        <TradesSection />
        <EconomySection />
        <HowSection />
        <FinalCTA primaryHref={primaryHref} glow={glow} />
      </main>
      <Footer />
    </div>
  )
}
