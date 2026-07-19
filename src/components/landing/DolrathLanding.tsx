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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Swords, Shield, Coins, Wallet, Play, Sparkles, Menu, X,
  Github, Twitter, MessageCircle, Scroll,
  AlertTriangle, Gem, Lock, Flame, Scale,
} from 'lucide-react'
import { Button, Card, GlassCard, Badge, SectionHeading, Reveal, ArenaSky } from './ui'
import { useI18n, useT } from '@/lib/i18n/I18nProvider'
import { pickName, pickTitle } from '@/lib/i18n/names'
import LanguageToggle from '@/components/ui/LanguageToggle'
import LaunchCountdown from './LaunchCountdown'
import { ShowcaseDie } from '@/components/battle/AnimatedDice'
import JourneyShowcase from './journey/JourneyCarousel'
import { JourneyWindow } from './journey/JourneyFrame'
import TradesMapPreview from './trades/TradesMapPreview'
import { itemImagePath } from '@/lib/itemCatalog'
import { getChainInfo } from '@/lib/chainConfig'
import WaitlistForm from './WaitlistForm'
import { DUNGEONS, DUNGEON_LIST, type DungeonId, type DungeonMonsterDef, type DungeonBossDef } from '@/lib/dungeonAdventures'

// ============================================================
// Gear / raridade — molduras e tiles de equipamento reais
// As imagens vivem em /items/<slug>.webp (mesmas do jogo).
// Tier romano por raridade: I·Comum II·Incomum III·Raro IV·Épico V·Lendário
// ============================================================

type RarityKey = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

const RARITY_FRAME: Record<RarityKey, { ring: string; glow: string; text: string; tier: string; label: string }> = {
  COMMON:    { ring: 'border-zinc-400/50',    glow: 'rgba(161,161,170,0.35)', text: 'text-zinc-300',    tier: 'I',   label: 'Common' },
  UNCOMMON:  { ring: 'border-emerald-400/60', glow: 'rgba(52,211,153,0.45)',  text: 'text-emerald-300', tier: 'II',  label: 'Uncommon' },
  RARE:      { ring: 'border-sky-400/60',     glow: 'rgba(56,189,248,0.5)',   text: 'text-sky-300',     tier: 'III', label: 'Rare' },
  EPIC:      { ring: 'border-fuchsia-400/70', glow: 'rgba(232,121,249,0.55)', text: 'text-fuchsia-300', tier: 'IV',  label: 'Epic' },
  LEGENDARY: { ring: 'border-amber-400/70',   glow: 'rgba(251,191,36,0.6)',   text: 'text-amber-300',   tier: 'V',   label: 'Legendary' },
}

// `name` = chave PT do catálogo (resolve a arte /items/<slug>.webp); `nameEn` = display.
interface GearPiece { name: string; nameEn: string; rarity: RarityKey }

// ============================================================
// Navbar
// ============================================================

const NAV_LINKS = [
  { label: 'Play', href: '#jornada' },
  { label: 'Bestiary', href: '#bestiario' },
  { label: 'Trades', href: '#oficios' },
  { label: 'Economy', href: '#economia' },
  { label: 'Docs', href: '/doc' },
]

function Navbar({ primaryHref }: { primaryHref: string }) {
  const [open, setOpen] = useState(false)
  const t = useT()
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6" aria-label={t('Main navigation')}>
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
              <span className="hidden min-[420px]:inline text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
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
                {t(l.label)}
              </a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <LaunchCountdown />
            <LanguageToggle />
            <Button as="a" href={primaryHref} size="sm" icon={<Wallet size={16} />}>
              {t('Connect Wallet')}
            </Button>
          </div>
          <div className="md:hidden flex items-center gap-2">
            <LaunchCountdown />
            <LanguageToggle />
            <button
              className="p-2 rounded-lg text-white hover:bg-white/5"
              aria-expanded={open}
              aria-label={open ? t('Close menu') : t('Open menu')}
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
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
                {t(l.label)}
              </a>
            ))}
            <Button as="a" href={primaryHref} className="mt-2" icon={<Wallet size={16} />}>
              {t('Connect Wallet')}
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
  const t = useT()
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
            <Badge tone="primary" icon={<Sparkles size={14} />}>{t('On-chain RPG · NFT')}</Badge>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight text-balance text-white">
              {t('Forge your')}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
                {t('legend')}
              </span>
              {' '}{t('in Dolrath')}
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="text-lg text-white/85 max-w-xl text-pretty">
            {t('Create a tabletop-style RPG character: pick your race and class, upgrade your gear and hunt legendary treasure by slaying bosses. Grow strong and challenge real players in epic dice-rolling PvP. Tactical turn-based combat: awaken your form — Dragon, Celestial and more — and let every dice roll turn the battle.')}
            </p>
          </Reveal>
          <Reveal delay={300} className="flex flex-wrap items-center gap-4">
            <Button as="a" href={primaryHref} size="lg" icon={<Swords size={18} />}>{t('Play now')}</Button>
            <Button as="a" href="#jornada" size="lg" variant="secondary" icon={<Play size={16} />}>
              {t('Watch gameplay')}
            </Button>
          </Reveal>
          <Reveal delay={400} className="flex flex-wrap items-center gap-3 text-xs text-white/70">
            <span className="font-combat">ERC-721</span>
            <span aria-hidden="true">·</span>
            <span>{t('No purchase required to try it')}</span>
            <span aria-hidden="true">·</span>
            <span className="font-combat">{t('open testnet')}</span>
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
  { Icon: Swords, title: 'Turn-based PvP battles', desc: 'Duel other players: the dice multiplies your stats and your build decides who stays standing. Strategy, not blind luck.' },
  { Icon: Sparkles, title: 'Combat transformations', desc: 'Awaken the Dragon, the Celestial or the Shapeshifter\'s beasts mid-fight — temporary buffs and special abilities.' },
  { Icon: Shield, title: 'NFT characters you truly own', desc: 'ERC-721 heroes in your wallet. Sell, trade or hold — no one can take them from you.' },
  { Icon: Coins, title: 'Dungeons, gold & marketplace', desc: 'Dive into dungeons for growing rewards, earn gold and trade relics on the player-to-player market.' },
]

function Features() {
  const t = useT()
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
                <h3 className="font-semibold text-white text-lg leading-snug">{t(f.title)}</h3>
                <p className="text-sm text-textsec leading-relaxed">{t(f.desc)}</p>
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
  const { locale, t } = useI18n()
  const displayName = pickName(monster, locale)
  const title = boss ? pickTitle(monster as DungeonBossDef, locale) : undefined
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
          alt={displayName}
          loading="lazy"
          onError={() => setFailed(true)}
          className="art-bright absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-black/50 text-5xl">{monster.emoji}</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 via-40% to-transparent" />
      {boss && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-amber-400/70 bg-black/60 px-2 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-sm">
          👑 {t('Boss')}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3 text-center">
        <h3
          className={`text-sm font-bold leading-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] ${boss ? 'text-amber-300' : 'text-white'}`}
        >
          {displayName}
        </h3>
        {title && (
          <span className="mt-0.5 block font-combat text-[11px] text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {title}
          </span>
        )}
      </div>
    </motion.div>
  )
}

function MonsterGallerySection() {
  const [active, setActive] = useState<DungeonId>('floresta')
  const [userPicked, setUserPicked] = useState(false)
  const [inView, setInView] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const { locale, t } = useI18n()
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
          eyebrow={t('Bestiary')}
          title={t('Every dungeon has its own monsters')}
          sub={t('From the Gloomwood Forest to the Arcane Ruins, each biome hides different threats — and a boss guarding the best spoils.')}
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
              {d.emoji} {pickName(d, locale)}
            </button>
          ))}
        </div>
        <div className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={active}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            >
              {dungeon.monsters.map((m) => (
                <MonsterCard key={m.name} monster={m} accent={dungeon.accent} />
              ))}
              <MonsterCard monster={dungeon.boss} accent={dungeon.accent} boss />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Relíquias — vitrine de loot épico & lendário (imagens reais do jogo)
// ============================================================

const RELICS: { piece: GearPiece; tag: string }[] = [
  { piece: { name: 'Égide de Gorthak', nameEn: "Gorthak's Aegis", rarity: 'LEGENDARY' }, tag: 'Heavy armor' },
  { piece: { name: 'Esmagador de Gorthak', nameEn: "Gorthak's Crusher", rarity: 'LEGENDARY' }, tag: 'Axe' },
  { piece: { name: 'Manto de Vol\'theris', nameEn: "Vol'theris' Mantle", rarity: 'LEGENDARY' }, tag: 'Arcane vestment' },
  { piece: { name: 'Lâmina de Krax-thar', nameEn: 'Blade of Krax-thar', rarity: 'LEGENDARY' }, tag: 'Sword' },
  { piece: { name: 'Arco de Sylariel', nameEn: "Sylariel's Bow", rarity: 'LEGENDARY' }, tag: 'Bow' },
  { piece: { name: 'Égide do Dragão Ancião', nameEn: 'Elder Dragon Aegis', rarity: 'EPIC' }, tag: 'Heavy armor' },
  { piece: { name: 'Cajado da Aurora Arcana', nameEn: 'Staff of the Arcane Dawn', rarity: 'EPIC' }, tag: 'Staff' },
  { piece: { name: 'Couraça de Escamas Ígneas', nameEn: 'Emberscale Cuirass', rarity: 'RARE' }, tag: 'Heavy armor' },
]

function RelicCard({ piece, tag }: { piece: GearPiece; tag: string }) {
  const r = RARITY_FRAME[piece.rarity]
  const { locale, t } = useI18n()
  const displayName = pickName(piece, locale)
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
          alt={displayName}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border ${r.ring} bg-black/60 px-2 py-0.5 text-[10px] font-bold ${r.text}`}>
          {t(r.label)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <h3 className={`text-sm font-bold leading-tight ${r.text}`}>{displayName}</h3>
        <span className="font-combat text-[11px] text-textsec">{t(tag)}</span>
      </div>
    </div>
  )
}

function RelicsSection() {
  const t = useT()
  return (
    <section id="reliquias" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow={t('Boss loot')}
          title={t('Relics forged in Dolrath')}
          sub={t('Epic and legendary weapons and armor drop from dungeon bosses and weekly adventures — every piece is an NFT of yours, ready to equip or trade on the marketplace.')}
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
            {t('Epic and Legendary drop from bosses only')}
          </Badge>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Ofícios — o mesmo Mapa do Reino de /gathering, num teaser: a Coleta
// funciona como um stake — manda o personagem pro campo, ele gasta
// stamina sozinho enquanto você tá offline, e você volta pra colher.
// ============================================================

function TradesSection() {
  const t = useT()
  return (
    <section id="oficios" className="relative py-24 bg-secondary/40">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col gap-10">
        <SectionHeading
          eyebrow={t('Trades')}
          title={t('Gathering works like a stake')}
          sub={t("Send a character to the Kingdom Map and it starts earning on its own: spending stamina, gathering resources and stacking them up in real time while you're offline. You just come back to collect.")}
        />
        <JourneyWindow stepLabel={`⛏️ ${t('Gathering')}`}>
          <TradesMapPreview />
        </JourneyWindow>
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="max-w-xl text-xs text-textsec">
            {t('Every character on the account can gather at the same time — the raw materials later feed the Forge, Alchemy and Cooking.')}
          </p>
          <Button as="a" href="/gathering" variant="outline">{t('Go to Gathering')}</Button>
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
    title: 'GOLD with no money printer',
    desc: 'All GOLD is born from playing — with a daily cap per player and real spending (shops, forge, alchemy) that consumes gold before it ever becomes a token. The economy cannot inflate because it is not allowed to.',
  },
  {
    Icon: Lock,
    title: 'DOL: 1 billion, forever',
    desc: 'The game token has a fixed supply minted exactly once. There is no mint function in the contract: supply can only shrink. Scarcity guaranteed by code, not by promise.',
  },
  {
    Icon: Flame,
    title: 'Real burn on every sale',
    desc: 'Every marketplace trade destroys a slice of the currency right in the contract — not a dead wallet, actual supply gone. The more the game turns, the scarcer the tokens get.',
  },
  {
    Icon: Scale,
    title: 'AI-balanced, data-proven',
    desc: 'Every number in the economy was tuned by the Claude Fable 5 AI across thousands of simulated battles and a 10-year economic projection — before any player felt it firsthand.',
  },
]

function EconomySection() {
  const t = useT()
  return (
    <section id="economia" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading
          eyebrow={t('Economy')}
          title={t("A game that doesn't betray its players")}
          sub={t('Play-to-earn games died inflating their own tokens. Dolrath was designed the other way around: locked emission, burn tied to usage, and every parameter validated in simulation before going live.')}
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ECONOMY_PILLARS.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <GlassCard hover className="p-6 h-full flex flex-col gap-4">
                <span className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                  <p.Icon size={22} />
                </span>
                <h3 className="font-semibold text-white text-lg leading-snug">{t(p.title)}</h3>
                <p className="text-sm text-textsec leading-relaxed">{t(p.desc)}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
        <p className="text-center text-sm text-textsec">
          {t('Full transparency: the complete tokenomics lives in the')}{' '}
          <a href="/doc#tokenomics" className="text-primary hover:underline">{t('public documentation')}</a>{' '}
          {t('and the 10-year projection in the')}{' '}
          <a href="/tokenomics/dashboard.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t('interactive dashboard')}</a>.
        </p>
      </div>
    </section>
  )
}

// ============================================================
// Como funciona
// ============================================================

const STEPS = [
  { n: '01', Icon: Wallet, title: 'Connect your wallet', desc: 'MetaMask or any compatible wallet. No sign-up, no password.' },
  { n: '02', Icon: Scroll, title: 'Create your NFT character', desc: 'Pick a race and class and distribute attributes. It is born in your wallet as an ERC-721.' },
  { n: '03', Icon: Swords, title: 'Fight and evolve', desc: 'Train against monsters, challenge players, stack gold and equip ever-better items.' },
]

function HowSection() {
  const t = useT()
  return (
    <section id="como-funciona" className="relative py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col gap-12">
        <SectionHeading eyebrow={t('How it works')} title={t('From wallet to arena in three steps')} />
        <ol className="grid md:grid-cols-3 gap-6">
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative">
              <Reveal delay={i * 100} className="h-full">
                <Card className="relative h-full flex flex-col gap-4 pt-8">
                  <span className="absolute -top-4 left-6 font-combat font-bold text-sm text-primary bg-background border border-primary/40 rounded-lg px-3 py-1.5 shadow-lg shadow-primary/10">
                    {s.n}
                  </span>
                  <span className="text-textsec"><s.Icon size={24} /></span>
                  <h3 className="font-semibold text-white text-lg">{t(s.title)}</h3>
                  <p className="text-sm text-textsec leading-relaxed">{t(s.desc)}</p>
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
  const t = useT()
  return (
    <section className="relative py-28 overflow-hidden">
      <ArenaSky starCount={24} glow={glow} parallax={false} moon={false} />
      {/* A Anciã da Mata espreitando atrás do chamado final. */}
      <img
        src="/boss-ancia-da-mata.webp"
        alt={t('Elder of the Grove, the Corrupted Warden — boss of the Gloomwood Forest')}
        className="pointer-events-none select-none absolute right-0 top-1/2 -translate-y-1/2 h-[125%] w-auto max-w-none opacity-65 hidden md:block [mask-image:linear-gradient(to_left,black_55%,transparent)]"
      />
      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 flex flex-col items-center gap-7 text-center">
        <h2 className="text-3xl md:text-5xl font-bold text-balance leading-tight">
          {t("The dungeon won't explore itself.")}
        </h2>
        <p className="text-textsec max-w-xl text-pretty">
          {t('Join the testnet, create your first hero for free and roll your first d20 today.')}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button as="a" href={primaryHref} size="lg" icon={<Wallet size={18} />}>{t('Connect Wallet')}</Button>
          <Button as="a" href="#jornada" size="lg" variant="secondary" icon={<Play size={16} />}>{t('Watch gameplay')}</Button>
        </div>
        <div className="flex flex-col items-center gap-1 w-full">
          <WaitlistForm source="final-cta" />
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Footer
// ============================================================

// URLs de comunidade vêm de env (NEXT_PUBLIC_*) — placeholders viram '#' até o
// Mario criar os canais. Assim o footer nunca aponta para lugar nenhum sem querer.
const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || '#'
const TWITTER_URL = process.env.NEXT_PUBLIC_TWITTER_URL || '#'
const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL || '#'

const FOOT_COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Game',
    links: [
      { label: 'Play', href: '/dashboard' },
      { label: 'Characters', href: '/character/create' },
      { label: 'Dungeons', href: '/dashboard' },
      { label: 'Documentation', href: '/doc' },
    ],
  },
  {
    title: 'Economy',
    links: [
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'Tokenomics', href: '/tokenomics/dashboard.html' },
      { label: 'NFT Items', href: '/doc#tokenomics' },
      { label: 'Contracts', href: '/doc#tokenomics' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Discord', href: DISCORD_URL },
      { label: 'X / Twitter', href: TWITTER_URL },
      { label: 'GitHub', href: GITHUB_URL },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Use', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Risk Notice', href: '/disclaimer' },
    ],
  },
]

const SOCIALS = [
  { Icon: MessageCircle, label: 'Discord', href: DISCORD_URL },
  { Icon: Twitter, label: 'X / Twitter', href: TWITTER_URL },
  { Icon: Github, label: 'GitHub', href: GITHUB_URL },
]

function Footer() {
  const t = useT()
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
            {t('On-chain dark-fantasy RPG. Your heroes, your relics, your rolls — forever yours.')}
          </p>
          {getChainInfo().isMainnet ? (
            <Badge tone="warning" icon={<AlertTriangle size={13} />}>
              {t('Crypto involves risk — play responsibly')}
            </Badge>
          ) : (
            <Badge tone="warning" icon={<AlertTriangle size={13} />}>
              {t('On testnet — assets have no real value')}
            </Badge>
          )}
          <div className="flex gap-2">
            {SOCIALS.filter((s) => s.href && s.href !== '#').map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="w-9 h-9 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-textsec hover:text-white hover:border-white/20 transition-colors"
              >
                <s.Icon size={16} />
              </a>
            ))}
          </div>
          <WaitlistForm source="footer" compact />
        </div>
        {FOOT_COLS.map((col) => (
          <nav key={col.title} aria-label={t(col.title)} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white">{t(col.title)}</h3>
            {col.links
              .filter((l) => l.href && l.href !== '#')
              .map((l) => {
                const external = l.href.startsWith('http')
                return (
                  <a
                    key={l.label}
                    href={l.href}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="text-sm text-textsec hover:text-white transition-colors w-fit"
                  >
                    {t(l.label)}
                  </a>
                )
              })}
          </nav>
        ))}
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-2 items-center justify-between text-xs text-textsec/70">
          <div className="flex items-center gap-3">
            <span>{t('© 2026 BDI — Black Dolrath Idle. All rights reserved.')}</span>
            <LanguageToggle />
          </div>
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
  const t = useT()
  // Entrada no app: logado vai ao dashboard, senão ao login (espelha a home antiga)
  const primaryHref = session ? '/dashboard' : '/auth/login'
  const glow = 1

  return (
    <div className="min-h-screen bg-background text-white">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-4 focus:left-4 focus:bg-surface focus:px-4 focus:py-2 focus:rounded-lg"
      >
        {t('Skip to content')}
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
