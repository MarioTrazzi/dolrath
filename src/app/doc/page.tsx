'use client'

// ============================================================
// 📖 /doc — Documentação oficial do Dolrath RPG
//
// Página de referência única ("white paper" + game design doc) no estilo de
// uma documentação de API. PÚBLICA (não exige login).
//
// IMPORTANTE: os dados são IMPORTADOS DIRETAMENTE das fontes puras do código
// (itemCatalog, dungeonAdventures, transformationSystem, enhancementSystem,
// experienceSystem, characterCreationData, gameData, staminaSystem). Assim,
// qualquer edição de balanceamento nessas fontes reflete automaticamente aqui.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { useT, useI18n } from '@/lib/i18n/I18nProvider'
import { localizeItemName, localizeItemDesc, localizeRarityLabel, localizeSpecialEffect } from '@/lib/i18n/catalog'
import type { TFunction } from '@/lib/i18n/t'
import type { Locale } from '@/lib/i18n/config'
import { pickName } from '@/lib/i18n/names'
import Link from 'next/link'

import { races as RACES_SRC, pointSystem } from '@/lib/characterCreationData'
import { CLASSES } from '@/lib/gameData'
import { TRANSFORMATION_CONFIG } from '@/lib/transformationSystem'
import { ITEM_CATALOG, CONSUMABLE_CATALOG, INGREDIENT_CATALOG, FORGE_MATERIAL_CATALOG, PROCESSED_CATALOG, FOOD_CATALOG, RARITY_DROP_WEIGHT, getIngredientByName, getProcessedByName, itemImagePath, type CatalogItem } from '@/lib/itemCatalog'
import { POTION_RECIPES } from '@/lib/alchemy'
import { FORGE_RECIPES } from '@/lib/forge'
import { PROCESSING_RECIPES, PROCESSING_GROUP_LABEL } from '@/lib/processing'
import { COOKING_RECIPES, COOKING_GROUP_LABEL } from '@/lib/cooking'
import { parseFoodBuffSpec, foodBuffSpecLabel } from '@/lib/foodBuff'
import { CRAFT_BASE_CHANCE, CRAFT_MIN_LEVEL, CRAFT_XP } from '@/lib/craftingProfession'
import { DUNGEON_LIST } from '@/lib/dungeonAdventures'
import { getXPForNextLevel } from '@/lib/experienceSystem'
import { getBaseChance, getStatMultiplier, PRI, DUO, TRI, TET, PEN, SAFE_ENHANCE_MAX } from '@/lib/enhancementSystem'
import { STAMINA_COSTS, STAMINA_PROGRESSION } from '@/lib/staminaSystem'

// ---------------- Helpers visuais ----------------

type RarityKey = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

const RARITY: Record<RarityKey, { label: string; text: string; ring: string; bg: string }> = {
  // `label` em PT: é a mesma fonte de localizeRarityLabel (catalog.ts).
  COMMON: { label: 'Comum', text: 'text-zinc-300', ring: 'ring-zinc-500/40', bg: 'bg-zinc-500/10' },
  UNCOMMON: { label: 'Incomum', text: 'text-emerald-300', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10' },
  RARE: { label: 'Raro', text: 'text-sky-300', ring: 'ring-sky-500/40', bg: 'bg-sky-500/10' },
  EPIC: { label: 'Épico', text: 'text-fuchsia-300', ring: 'ring-fuchsia-500/40', bg: 'bg-fuchsia-500/10' },
  LEGENDARY: { label: 'Lendário', text: 'text-amber-300', ring: 'ring-amber-500/40', bg: 'bg-amber-500/10' },
}
const RARITY_ORDER: RarityKey[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']

function Pill({ rarity }: { rarity: RarityKey }) {
  const { locale } = useI18n()
  const r = RARITY[rarity]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${r.text} ${r.ring} ${r.bg}`}>
      {localizeRarityLabel(r.label, locale)}
    </span>
  )
}

function Tag({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'dol' | 'gold' | 'warn' | 'ok' | 'todo' }) {
  const tones: Record<string, string> = {
    default: 'text-textsec ring-white/10 bg-white/5',
    dol: 'text-yellow-300 ring-yellow-500/40 bg-yellow-500/10',
    gold: 'text-amber-300 ring-amber-500/40 bg-amber-500/10',
    warn: 'text-orange-300 ring-orange-500/40 bg-orange-500/10',
    ok: 'text-emerald-300 ring-emerald-500/40 bg-emerald-500/10',
    todo: 'text-sky-300 ring-sky-500/40 bg-sky-500/10',
  }
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>
}

function Section({ id, title, kicker, children }: { id: string; title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-white/5 pt-12 first:border-0 first:pt-0">
      {kicker && <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">{kicker}</div>}
      <h2 className="text-2xl sm:text-3xl font-bold text-white">{title}</h2>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-textsec">{children}</div>
    </section>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[4px] border border-[#46464c] bg-[#1e1e21]/95 p-5 shadow-xl shadow-black/40 ${className}`}>{children}</div>
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-black/40 px-1.5 py-0.5 font-game text-[13px] text-emerald-300 ring-1 ring-white/10">{children}</code>
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-[3px] border border-black/60 bg-[#101013] p-4 font-game text-[13px] leading-relaxed text-emerald-200">
      {children}
    </pre>
  )
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[3px] border border-black/60">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-textsec">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-white/[0.03]">
              {r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-2 text-textsec">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Todo() {
  const t = useT()
  return <Tag tone="todo">{t('🔜 TODO')}</Tag>
}

function Live() {
  const t = useT()
  return <Tag tone="ok">{t('✅ LIVE')}</Tag>
}

function Soon() {
  const t = useT()
  return <Tag tone="todo">{t('🔜 COMING SOON')}</Tag>
}

// Contrato pronto e testado, deploy agendado para a Fase 2 do lançamento
// (dentro da temporada 1). Distinto de EM BREVE, que é desenho sem código.
function Phase2() {
  const t = useT()
  return <Tag tone="todo">{t('🛠️ PHASE 2')}</Tag>
}

// Card visual de item (mesmo tamanho dos cards da /store) com a imagem gerada.
// Usado na seção Itens para revisar toda a arte de uma vez.
function ItemArtCard({
  name, type, rarity, level, goldPrice, statsText, meta,
}: {
  name: string
  type: string
  rarity: RarityKey
  level?: number
  goldPrice?: number
  statsText?: string
  meta?: React.ReactNode
}) {
  const r = RARITY[rarity]
  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-[4px] border border-[#3c3c41] bg-[#19191c] ring-1 ${r.ring} shadow-lg`}>
      <div className="relative aspect-square overflow-hidden bg-black/50">
        {/* asset estático /items/<slug>.webp — img simples (sem next/image) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={itemImagePath(name)}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2"><Pill rarity={rarity} /></span>
        {typeof goldPrice === 'number' && goldPrice > 0 && (
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/30">{goldPrice} 🪙</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h4 className={`text-sm font-bold leading-tight ${r.text}`}>{name}</h4>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-textsec">
          <Code>{type}</Code>
          {typeof level === 'number' && <span>Nv {level}</span>}
        </div>
        {statsText && <p className="font-game text-[11px] leading-snug text-emerald-300">{statsText}</p>}
        {meta && <div className="mt-auto pt-1 text-[11px] text-textsec">{meta}</div>}
      </div>
    </div>
  )
}

function ItemGallery({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
}

// ---------------- Derivações a partir das fontes ----------------

const RACE_EMOJI: Record<string, string> = { draconiano: '🐉', metamorfo: '🐺', humano: '⚔️', elfo: '🧝' }
// Chaves EN (i18n EN-as-key): quem exibe passa por t().
const WEAPON_LABEL: Record<string, string> = { sword: 'Sword', dagger: 'Dagger', staff: 'Staff', bow: 'Bow', mace: 'Mace', spear: 'Spear', fists: 'Fists' }
const BONUS_PT: Record<string, string> = { strength: 'STR', dexterity: 'DEX', intelligence: 'INT', constitution: 'CON' }
const STAT_SHORT: Record<string, string> = { str: 'str', agi: 'agi', int: 'int', def: 'def', res: 'res', hp: 'hp', mp: 'mp', stamina: 'stm', bonusDamage: 'damage', bonusDefense: 'defense', bonusSpeed: 'speed' }
const SOURCE_LABEL: Record<string, string> = { shop: '🏪 Shop', dungeon: '🗝️ Dungeon', dungeon_boss: '👑 Boss', adventure_boss: '🗓️ Adventure' }
const BUILD_LABEL: Record<string, string> = { brute: '💪 Strength', agile: '🏹 Agility', arcane: '🔮 Arcane', guardian: '🛡️ Guardian' }
// Nome PT das masmorras = chave de dungeonAdventures; o display sai de pickName.
const DUNGEON_NAME_PT: Record<string, string> = { floresta: 'Floresta Sombria', caverna: 'Caverna de Cristal', pantano: 'Pântano Maldito', ruinas: 'Ruínas Arcanas' }
const ENHANCEMENT_STONES = [
  // `name` PT = chave do catálogo; `use` é chave EN passada por t().
  { name: 'Pedra Negra (Arma)', rarity: 'UNCOMMON' as RarityKey, use: '+1 to +15 · weapons/shields' },
  { name: 'Pedra Negra (Armadura)', rarity: 'UNCOMMON' as RarityKey, use: '+1 to +15 · armour' },
  { name: 'Pedra Negra Mágica Concentrada (Arma)', rarity: 'EPIC' as RarityKey, use: 'I–V (PRI–PEN) · weapons/shields' },
  { name: 'Pedra Negra Mágica Concentrada (Armadura)', rarity: 'EPIC' as RarityKey, use: 'I–V (PRI–PEN) · armour' },
]
const ADVENTURE_BOSSES = [
  { day: 'Week 1', emoji: '🔥', name: 'Krax-thar', title: 'the World Devourer', theme: 'Fiery dragon' },
  { day: 'Week 2', emoji: '🕷️', name: "Vol'theris", title: 'the Weaver of the Void', theme: 'Void spider' },
  { day: 'Week 3', emoji: '🗿', name: 'Gorthak', title: 'the Colossus of Adamantite', theme: 'Titanic golem' },
  { day: 'Week 4', emoji: '✨', name: 'Sylariel', title: 'the Celestial Queen', theme: 'Fallen elf' },
]

function DungeonAndRace({ it }: { it: CatalogItem }): React.ReactNode {
  const { locale } = useI18n()
  const where = it.adventureBoss
    ? it.adventureBoss
    : it.dungeons.map((d) => localizeItemName(DUNGEON_NAME_PT[d] ?? d, locale)).join(', ') || '—'
  return <span className="text-xs">{where}{it.raceRestriction ? <> · <Tag tone="warn">{it.raceRestriction}</Tag></> : null}</span>
}

function consumableEffectToString(stats: Record<string, any>, t: TFunction): string {
  const parts: string[] = []
  if (stats.healAmount) parts.push(stats.healAmount >= 9999 ? t('full HP') : `+${stats.healAmount} HP`)
  if (stats.manaAmount) parts.push(stats.manaAmount >= 9999 ? t('full MP') : `+${stats.manaAmount} MP`)
  if (stats.staminaAmount) parts.push(`+${stats.staminaAmount} stm`)
  if (stats.attackBonus) parts.push(`+${stats.attackBonus} ATK`)
  if (stats.defenseBonus) parts.push(`+${stats.defenseBonus} DEF`)
  if (stats.dodgeBonus) parts.push(`+${stats.dodgeBonus}% ${t('dodge')}`)
  if (stats.shieldAmount) parts.push(t('shield {n}', { n: stats.shieldAmount }))
  if (stats.reviveHpPercent) parts.push(t('revive {n}%', { n: stats.reviveHpPercent }))
  if (stats.duration) parts.push(t('{n} turns', { n: stats.duration }))
  if (stats.cure) parts.push(t('cures status'))
  return parts.join(' · ')
}
const MOD_LABEL: Record<string, string> = { strength: 'STR', defense: 'DEF', hp: 'HP', agility: 'AGI', intelligence: 'INT', attack: 'ATK', critical: 'CRIT' }
const TRANSF_RACE: Record<string, string> = { dragon: 'Draconian', wolf: 'Shapeshifter', bear: 'Shapeshifter', eagle: 'Shapeshifter' }

function itemStatsToString(stats: Record<string, any>, t: TFunction, locale: Locale): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === 'number') parts.push(`${t(STAT_SHORT[k] ?? k)}+${v}`)
  }
  if (typeof stats.specialEffect === 'string') {
    parts.push(`✦ ${localizeSpecialEffect(stats.specialEffect, locale)}`)
  }
  return parts.join(' · ')
}

function bonusToString(b: Record<string, number | undefined>): string {
  return Object.entries(b).filter(([, v]) => v).map(([k, v]) => `+${v} ${BONUS_PT[k] ?? k}`).join(' · ')
}

function modsToString(m: Record<string, number>): string {
  return Object.entries(m).map(([k, v]) => `${MOD_LABEL[k] ?? k} ×${v}`).join(' · ')
}

function pct(x: number): string {
  return x > 0 ? `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%` : '—'
}

// `label` em chave EN (i18n EN-as-key): quem renderiza passa por t().
const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'tokenomics', label: 'Tokenomics' },
  { id: 'races', label: 'Races' },
  { id: 'classes', label: 'Classes' },
  { id: 'attributes', label: 'Attributes & Stats' },
  { id: 'progression', label: 'Progression & XP' },
  { id: 'combat', label: 'Combat' },
  { id: 'transformations', label: 'Transformations' },
  { id: 'pvp', label: 'PvP' },
  { id: 'pve', label: 'PvE & Dungeons' },
  { id: 'items', label: 'Items' },
  { id: 'enhancement', label: 'Enhancement' },
  { id: 'crafting', label: 'Materials & Crafting' },
  { id: 'stamina', label: 'Stamina' },
  { id: 'ai', label: 'AI & Images' },
  { id: 'structure', label: 'Notes & Roadmap' },
]

const ENHANCE_TARGETS = [
  { label: '+8', t: 8 }, { label: '+10', t: 10 }, { label: '+12', t: 12 }, { label: '+15', t: 15 },
  { label: 'I (PRI)', t: PRI }, { label: 'II (DUO)', t: DUO }, { label: 'III (TRI)', t: TRI }, { label: 'IV (TET)', t: TET }, { label: 'V (PEN)', t: PEN },
]
const XP_SAMPLE = [1, 4, 9, 19, 49]

const RESOLVED = [
  'Tokenomics v2 in the contracts: DOL with a fixed 1B supply (no mint), burnable GOLD and a market fee with real burn (4% items / 5% characters).',
  'Tokenomics dashboard published at /tokenomics/dashboard.html (120-month projection, 3 scenarios).',
  'The old dungeon system (rank F–S monsters) was removed — only the MATERIALS in dungeonData.ts remain.',
  'Points per level standardised at 1/level (pointSystem.leveling aligned with characterLevelSystem).',
  'The wisdom attribute was removed from types/game.ts, gameData.ts and characterFactory.ts (simplification).',
  'The doc now imports straight from the pure sources — balancing edits are reflected here automatically.',
  'The doc was made public and shown on the landing page.',
]

const ROADMAP = [
  { title: 'Deploy of the v2 contracts (Amoy → mainnet)', body: 'DolToken v2 (fixed 1B), burnable GOLD and both markets with a fee are ready and tested in the repository. What is left is redeploying on Amoy (new addresses in the envs) and, right after the economic go-live, on Polygon mainnet.' },
  { title: 'Weekly adventures (PvE) — implementation', body: "The gear of the 4 weekly bosses is already catalogued (Krax-thar, Vol'theris, Gorthak, Sylariel). What is left is the mode itself: rotation by Saturday (week 1–4), the boss encounter and the exclusive drop table (source adventure_boss)." },
  { title: 'Align the stat source on the server', body: 'Creation uses characterCreationData.ts (newer, rebalanced), but the server (api/character/route.ts) still computes stats from gameData.ts. Consolidate into a single source after the test battery.' },
  { title: 'Tune the stamina costs', body: 'Passive regen is implemented (+2/15s after 15 min without spending). What is left is the test battery to measure whether the spend per activity is high or low and calibrate the costs.' },
  { title: 'AI: image generation (Anthropic)', body: 'Migrate to our own Anthropic key and generate character images in the SAME style, adding only the traits the player chooses. Improve the prompt for consistency.' },
  { title: 'Pending PvP rewards', body: 'Implement win streak, first win of the day, database persistence and the rewards UI (marked TODO today).' },
]

// ---------------- Página ----------------

export default function DocPage() {
  const t = useT()
  const { locale } = useI18n()
  const [active, setActive] = useState('overview')

  useEffect(() => {
    const handler = () => {
      let current = NAV[0].id
      for (const item of NAV) {
        const el = document.getElementById(item.id)
        if (el && el.getBoundingClientRect().top <= 140) current = item.id
      }
      setActive(current)
    }
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const lastUpdated = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const transformations = useMemo(() => Object.entries(TRANSFORMATION_CONFIG), [])

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-background via-secondary to-background" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40 [background:radial-gradient(60%_50%_at_50%_-10%,rgba(233,69,96,0.18),transparent)]" />

      <div className="mx-auto max-w-7xl px-4 pt-28 pb-24 sm:px-6">
        {/* Hero */}
        <header className="mb-10">
          <Tag tone="default">{t('📖 Official documentation · v1.0 · public')}</Tag>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Dolrath <span className="text-primary">Game Docs</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-textsec">
            {t('Complete reference for the tokenized RPG of Dolrath. The numbers here are read straight from the game source — this page is a living mirror of the current balancing.')}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <Tag tone="ok">{t('Updated {date}', { date: lastUpdated })}</Tag>
            <Tag>{t('Next.js 14 · Prisma · Wallet login (SIWE)')}</Tag>
            <Tag>{t('Polygon (Amoy/Mainnet)')}</Tag>
            <Tag tone="ok">{t('Source: data imported from the code')}</Tag>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="hidden lg:block">
            <nav className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-white/10 bg-surface/40 p-3 backdrop-blur-xl">
              <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-widest text-textsec">{t('Contents')}</div>
              <ul className="space-y-0.5">
                {NAV.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        active === item.id ? 'bg-primary/15 font-semibold text-primary' : 'text-textsec hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {t(item.label)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Content */}
          <main className="min-w-0 space-y-12">
            {/* Visão Geral */}
            <Section id="overview" kicker={t('Introduction')} title={t('Overview')}>
              <p>
                <strong className="text-white">Dolrath</strong>{t(' is a turn-based combat RPG inspired by')}
                <em> Solo Leveling</em>{t(', where characters, items and currency are ')}
                <strong className="text-white">{t('tokenized on-chain')}</strong>
                {t('. An AI narrates the combat, and progression happens in PvP (real time over socket) and PvE (dungeons with d20 events).')}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card><div className="text-2xl">🧬</div><h3 className="mt-2 font-semibold text-white">{t('Character = NFT')}</h3><p className="mt-1 text-sm">{t('Created by paying DOL, mintable as ERC-721 and tradable on an on-chain market.')}</p></Card>
                <Card><div className="text-2xl">⚔️</div><h3 className="mt-2 font-semibold text-white">{t('Tactical combat')}</h3><p className="mt-1 text-sm">{t('Dice (d6–d20), critical from AGI, dodge from SPEED and block from RES.')}</p></Card>
                <Card><div className="text-2xl">💰</div><h3 className="mt-2 font-semibold text-white">{t('Dual economy')}</h3><p className="mt-1 text-sm">{t('GOLD (elastic, earned by playing) for items and crafting; DOL (fixed 1B supply) for creation, characters, staking and governance.')}</p></Card>
              </div>
              <Card>
                <h3 className="font-semibold text-white">{t('Main loop')}</h3>
                <Formula>{t('Create a character (pays DOL)\n   → earn XP/GOLD in PvE (dungeons) and PvP (arena)\n   → buy/drop/craft items\n   → enhance gear (BDO style)\n   → level up, distribute points, unlock transformations\n   → trade characters/items on the on-chain market')}</Formula>
              </Card>
            </Section>

            {/* Tokenomics */}
            <Section id="tokenomics" kicker={t('Economy')} title={t('Tokenomics')}>
              <p>
                {t('Economy ')}<strong className="text-white">{t('dual-token')}</strong>{t(' on Polygon: ')}
                <Tag tone="dol">DOL</Tag>{t(' is the long-term asset (fixed supply, governance, staking) and ')}
                <Tag tone="gold">GOLD</Tag>
                {t(' is the elastic gameplay currency, earned by playing and spent in the shop, forge, alchemy and item market. Separating the two protects the value of DOL from the sell pressure of the grind — the lesson of the play-to-earn games that died inflating their main token.')}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <div className="flex items-center justify-between"><h3 className="font-semibold text-white">{t('DOL — long-term asset')}</h3><Tag tone="dol">DOL</Tag></div>
                  <p className="mt-2 text-sm">
                    ERC-20 <Code>DolToken.sol</Code>{t(' — ')}
                    <strong className="text-white">{t('fixed supply of 1,000,000,000')}</strong>
                    {t(', minted once at deploy. ')}
                    <strong className="text-white">{t('There is no mint function')}</strong>
                    {t(': the supply can only go down (burns). On-chain name: ')}<Code>Dolrath</Code>.
                  </p>
                  <p className="mt-2 text-sm">
                    <strong className="text-white">{t('DOL is not pegged to the dollar.')}</strong>
                    {t(' It is not a stablecoin, has no backing, is not redeemable and the studio does not buy it back. The one paying in dollars is the player buying the hero — and that dollar is revenue, it does not become a prize for anyone.')}
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    <li>
                      {t('Character creation: ')}<Tag tone="gold">2 USDC</Tag> (<Code>CHARACTER_CREATION_COST_DOL</Code>) —
                      <strong className="text-white">{t(' 100% revenue')}</strong>{t(': NFT, AI portrait and infra.')}
                    </li>
                    <li>
                      {t('Ranking prizes')} <Soon />{t(' — today the arena scoreboard is ')}
                      <strong className="text-white">{t('global, permanent and prizeless')}</strong>
                      {t(': no entry, no pool, no payout. The reward system will be redesigned.')}
                    </li>
                    <li>{t('The character market trades in DOL (5% fee: 2.5% burn + 2.5% treasury)')} <Phase2 /></li>
                    <li>{t('Staking with veDOL')} <Soon /></li>
                    <li>{t('Governance (DAO)')} <Soon /></li>
                  </ul>
                </Card>
                <Card>
                  <div className="flex items-center justify-between"><h3 className="font-semibold text-white">{t('GOLD — gameplay currency')}</h3><Tag tone="gold">GOLD</Tag></div>
                  <p className="mt-2 text-sm">
                    ERC-20 <Code>DolrathGold.sol</Code>{t(' — elastic issuance ')}
                    <strong className="text-white">{t('gated by gameplay')}</strong>
                    {t(': every GOLD is born off-chain (server-authoritative, stamina, daily cap) and only becomes a token when the player ')}
                    <strong className="text-white">{t(' claims it on-chain')}</strong> (EIP-712, <Code>claimWithSig</Code>{t(', claim fee 0%).')}
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    <li>{t('Earned in PvE (dungeons), PvP and events')}</li>
                    <li>{t('Spent in the shop, forge, alchemy and item market')}</li>
                    <li>{t('Issuance cap: ')}<strong className="text-white">{t('20,000/day per user')}</strong> (<Code>DUNGEON_DAILY_GOLD_CAP</Code>)</li>
                  </ul>
                </Card>
              </div>

              <h3 className="pt-2 text-lg font-semibold text-white">{t('GOLD flow — three layers')}</h3>
              <Card>
                <Formula>{t('[1] Character (Character.gold)   ← dungeon, PvP, item sale\n        │  spent in the shop, forge, alchemy (OFF-chain sinks)\n        ▼\n[2] Account bank (User.goldBalance)   ← voluntary deposit\n        │  claim signed by the server (EIP-712), 0% fee\n        ▼\n[3] On-chain GOLD (ERC-20)   ← P2P item market, on-chain shop\n        └─ real burn: 2% of every market sale destroys supply')}</Formula>
                <p className="mt-2 text-xs">
                  {t('The sinks hit the balance ')}<strong className="text-white">{t('before')}</strong>
                  {t(' the claim: in practice only 20–40% of the GOLD earned becomes a token. The exit (claim) is not taxed; ')}
                  <em>{t('circulation')}</em>{t(' is — the fee lives in the market, not at the door.')}
                </p>
              </Card>

              <h3 className="pt-2 text-lg font-semibold text-white">{t('DOL allocation (1B, fixed supply)')}</h3>
              <Table
                head={[t('Bucket'), '%', 'DOL', t('Vesting')]}
                rows={[
                  [<strong key="p" className="text-white">Play &amp; Achieve</strong>, '30%', '300M', t('issuance of 25% of the remaining balance/year (year 1: 75M, year 2: 56M…)')],
                  [<strong key="t" className="text-white">{t('Treasury / DAO')}</strong>, '20%', '200M', t('linear over 48 months')],
                  [<strong key="e" className="text-white">{t('Team')}</strong>, '15%', '150M', t('12-month cliff + 36-month linear')],
                  [<strong key="i" className="text-white">{t('Investors')}</strong>, '12%', '120M', t('6-month cliff + 24-month linear')],
                  [<strong key="l" className="text-white">{t('Liquidity')}</strong>, '10%', '100M', t('25% at TGE, the rest as needed (LP with lock)')],
                  [<strong key="ec" className="text-white">{t('Ecosystem')}</strong>, '8%', '80M', t('partnerships, grants and integrations')],
                  [<strong key="c" className="text-white">{t('Community')}</strong>, '5%', '50M', t('40% at TGE (airdrops, launch events)')],
                ]}
              />
              <p className="text-xs text-textsec">
                {t('Issuance to players decays 25% per year over the remaining balance of the bucket — it never drops to zero suddenly, never explodes. Full detail in the ')}
                <Code>docs/21-whitepaper</Code>{t(' of the repository.')}
              </p>

              <h3 className="pt-2 text-lg font-semibold text-white">{t('Fees & burns')}</h3>
              <Table
                head={[t('Where'), t('Fee'), t('Destination'), t('Status')]}
                rows={[
                  [t('Item market (GOLD)'), '4%', t('2% real burn + 2% treasury'), <Live key="1" />],
                  [t('Character market (DOL)'), '5%', t('2.5% real burn + 2.5% treasury'), <Phase2 key="2" />],
                  [t('Forge (gear craft)'), t('30% of catalog value (min. 10)'), t('off-chain sink'), <Live key="3" />],
                  [t('Alchemy (potion craft)'), t('30% of the value (min. 5)'), t('off-chain sink'), <Live key="4" />],
                  [t('Selling an item to the shop (NPC)'), t('buyback at 60% of catalog'), t('off-chain sink (40%)'), <Live key="5" />],
                  [t('On-chain GOLD claim'), t('0% (gas only)'), '—', <Live key="6" />],
                  [t('Season passes in DOL'), t('50% burned'), t('burn + treasury'), <Soon key="7" />],
                  [t('Primary collections (NFT)'), t('100% of the primary sale'), t('partial burn + treasury'), <Soon key="8" />],
                  [t('Quarterly buyback'), t('set by the DAO'), t('burn'), <Soon key="9" />],
                ]}
              />
              <p className="text-xs text-textsec">
                {t('The fees of both markets are in the contract (')}<Code>burnFeeBps</Code>/<Code>treasuryFeeBps</Code>
                {t(', hard cap of 10%) and the burn is ')}
                <strong className="text-white">{t('real destruction of supply')}</strong> (<Code>burnFrom</Code>{t('), not a dead wallet.')}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <div className="flex items-center gap-2"><Soon /><h3 className="font-semibold text-white">{t('DOL staking (veDOL)')}</h3></div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    <li>{t('Locks from 3 to 24 months — the longer, the more weight (veDOL)')}</li>
                    <li>{t('Reward: 20% of each issuance epoch + 50% of the treasury fees')}</li>
                    <li><strong className="text-white">{t('No fixed APY promised')}</strong>{t(' — the yield comes from real game revenue')}</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">{t('Liquidity — official stance')}</h3>
                  <p className="mt-2 text-sm">
                    {t('The official pair with project liquidity (and LP lock) is ')}
                    <strong className="text-white">{t('DOL only')}</strong>
                    {t('. GOLD is worth what it buys inside the game: the project ')}
                    <strong className="text-white">{t('does not subsidise')}</strong>
                    {t(' external GOLD price. A GOLD/DOL pair may exist through natural market arbitrage.')}
                  </p>
                </Card>
              </div>

              <h3 className="pt-2 text-lg font-semibold text-white">{t('Economic roadmap')}</h3>
              <Table
                head={[t('Stage'), t('What'), t('Status')]}
                rows={[
                  [t('E0 — Foundation'), t('Off-chain GOLD with a daily cap, sinks (shop/forge/alchemy), signed claim'), <Live key="0" />],
                  [t('E1 — v2 contracts'), t('DOL fixed 1B supply, market fees with real burn (mainnet deploy pending)'), <Tag key="1" tone="warn">{t('🚧 CONTRACTS READY')}</Tag>],
                  [t('E2 — TGE & liquidity'), t('DOL distribution, official pair with LP lock, listing'), <Soon key="2" />],
                  [t('E3 — Staking'), t('veDOL, epochs, treasury fee distribution'), <Soon key="3" />],
                  [t('E4 — DAO'), t('Governance over treasury, buyback and economic parameters'), <Soon key="4" />],
                  [t('E5 — Expansion'), t('Guilds, land, raids and seasons plugged into the same sinks'), <Soon key="5" />],
                ]}
              />

              <h3 className="pt-2 text-lg font-semibold text-white">{t('On-chain contracts')}</h3>
              <Table
                head={[t('Contract'), t('Standard'), t('Function')]}
                rows={[
                  [<Code key="a">DolToken.sol</Code>, 'ERC-20', t('DOL — fixed 1B supply, no mint, burnable')],
                  [<Code key="b">DolrathGold.sol</Code>, 'ERC-20', t('GOLD — claim by EIP-712 signature, burnable')],
                  [<Code key="c">DolrathCharacters.sol</Code>, 'ERC-721', t('Characters as NFT (paid mint + signature)')],
                  [<Code key="d">DolrathItems.sol</Code>, 'ERC-721', t('Items as NFT (holds the GOLD paid at mint)')],
                  [<Code key="e">DolrathCharacterMarket.sol</Code>, t('Market'), t('Escrow + sale in DOL · 5% fee (2.5% burn / 2.5% treasury)')],
                  [<Code key="f">DolrathItemMarket.sol</Code>, t('Market'), t('Escrow + sale in GOLD · 4% fee (2% burn / 2% treasury)')],
                ]}
              />
              <p className="text-sm">
                {t('Mints and claims require a ')}<strong className="text-white">{t('server signature')}</strong>
                {t(' (EIP-712) to prevent arbitrary minting; the markets use ')}<Code>nonReentrant</Code>{t(' and NFT escrow.')}
              </p>

              <Card>
                <h3 className="font-semibold text-white">{t('📊 Tokenomics dashboard')}</h3>
                <p className="mt-2 text-sm">
                  {t('Deterministic 120-month projection (3 scenarios: pessimistic/base/optimistic) — DOL circulation, issuance × burn, staking, treasury, player growth and market cap per price assumption.')}
                </p>
                <a
                  href="/tokenomics/dashboard.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/15 px-4 py-2 text-sm font-semibold text-primary ring-1 ring-primary/40 hover:bg-primary/25"
                >
                  {t('Open the interactive dashboard →')}
                </a>
              </Card>
            </Section>

            {/* Raças */}
            <Section id="races" kicker={t('Character')} title={t('Races')}>
              <p>{t('Four playable races. Draconian and Shapeshifter have a transformation; Human and Elf receive compensating buffs.')}</p>
              <p className="text-xs text-textsec">
                <Tag tone="warn">{t('⚠️ display values')}</Tag>
                {t(' The numbers below come from ')}<Code>characterCreationData.ts</Code>
                {t(' (a newer file, shown on the creation screen — the ')}<em>{t('rebalanced intent')}</em>
                {t('). Today the server still computes the real stats from ')}<Code>gameData.ts</Code>
                {t('; aligning the two sources is on the roadmap.')}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {RACES_SRC.map((r) => (
                  <Card key={r.id}>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{RACE_EMOJI[r.id] ?? '🎭'}</span>
                      <div><h3 className="font-semibold text-white">{r.name}</h3><p className="text-xs text-textsec">{r.specialAbility}</p></div>
                    </div>
                    <p className="mt-3 text-sm">{r.description}</p>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div><dt className="inline font-semibold text-white">{t('Base: ')}</dt><dd className="inline font-game text-emerald-300">str {r.baseStats.str} · agi {r.baseStats.agi} · int {r.baseStats.int} · res {r.baseStats.res} · hp {r.baseStats.hp} · mp {r.baseStats.mp}</dd></div>
                      <div><dt className="inline font-semibold text-white">{t('Racial bonus: ')}</dt><dd className="inline">{bonusToString(r.bonusStats as any) || '—'}</dd></div>
                      <div><dt className="inline font-semibold text-white">{t('Transformation: ')}</dt><dd className="inline">{r.transformation ?? '—'}</dd></div>
                      <div><dt className="inline font-semibold text-white">{t('Restrictions: ')}</dt><dd className="inline text-orange-300">{(r.restrictions && r.restrictions.length) ? r.restrictions.join(' · ') : t('None')}</dd></div>
                    </dl>
                  </Card>
                ))}
              </div>
            </Section>

            {/* Classes */}
            <Section id="classes" kicker={t('Character')} title={t('Classes')}>
              <p>{t('The class defines attribute bonuses, allowed weapons and thematic abilities.')} <Tag>source: gameData.ts</Tag></p>
              <Table
                head={[t('Class'), t('Description'), t('Bonus'), t('Weapons'), t('Abilities')]}
                rows={CLASSES.map((c) => [
                  <span key={c.id} className="font-semibold text-white">{c.name}</span>,
                  c.description,
                  <span key="b" className="font-game text-emerald-300">{bonusToString(c.bonuses as any)}</span>,
                  c.availableWeapons.map((w) => t(WEAPON_LABEL[w] ?? w)).join(', '),
                  c.abilities.join(' · '),
                ])}
              />
            </Section>

            {/* Atributos */}
            <Section id="attributes" kicker={t('System')} title={t('Attributes & Stats')}>
              <p>{t('Primary attributes feed derived combat stats. Distribute points at creation and at every level.')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">{t('Primary attributes')}</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li><Code>STR</Code>{t(' strength — physical damage, HP/STA')}</li>
                    <li><Code>AGI</Code>{t(' agility — critical, speed, dodge, MP')}</li>
                    <li><Code>INT</Code>{t(' intelligence — magic damage, MP')}</li>
                    <li><Code>RES/DEF</Code>{t(' resistance — defense, block and stamina')}</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">{t('Derived stats')}</h3>
                  <Formula>{t('crit  = AGI × 0.2   (% chance)\nspeed = AGI × 0.5\n\nmaxHP  = (100 + CON×2 + STR×1)   × Lm\nmaxMP  = (50  + INT×3 + AGI×0.5) × Lm\nmaxSTA = (80  + CON×2 + STR×0.5) × Lm\n\nLm (level mult.) = 1 + (level-1) × 0.1')}</Formula>
                </Card>
              </div>
              <Card>
                <h3 className="font-semibold text-white">{t('Point distribution')}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  <li><strong className="text-white">{t('Creation:')}</strong> {pointSystem.creation.availablePoints}{t(' free points, max. ')}{pointSystem.creation.maxStatValue}{t(' per stat (1 point = 1 stat).')}</li>
                  <li><strong className="text-white">{t('Level up:')}</strong> {pointSystem.leveling.pointsPerLevel}{t(' point per level.')}</li>
                </ul>
              </Card>
            </Section>

            {/* Progressão */}
            <Section id="progression" kicker={t('System')} title={t('Progression & XP')}>
              <p>{t('A smooth exponential curve up to max level 100. Levelling up recalculates HP/MP/STA and grants points.')}</p>
              <Card><Formula>{t('XP_to_next(level) = baseXP × level^exp + level × mult\n  baseXP = 100   exp = 1.4   mult = 50   maxLevel = 100')}</Formula></Card>
              <Table
                head={[t('Level'), t('XP to next')]}
                rows={XP_SAMPLE.map((l) => [`${l} → ${l + 1}`, getXPForNextLevel(l).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US')])}
              />
              <p className="text-xs text-textsec">{t('Values computed in real time by ')}<Code>getXPForNextLevel()</Code> (experienceSystem.ts).</p>
            </Section>

            {/* Combate */}
            <Section id="combat" kicker={t('Mechanics')} title={t('Combat System')}>
              <p>{t('Round-based combat: the attacker chooses an offensive action and the defender reacts (dodge or block). Everything goes through dice rolls.')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">{t('Actions & dice')}</h3>
                  <Table head={[t('Action'), t('Die'), t('Base damage')]} rows={[[t('Light attack'), 'd6', '8'], [t('Heavy attack'), 'd10', '12'], [t('Special attack'), 'd20', '20'], [t('Dodge'), 'd12', '—'], [t('Defend/Block'), 'd10', '—']]} />
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">{t('Damage formula')}</h3>
                  <Formula>{t('damage = base + STR + (die+mod) + weapon_bonus\n\ncritical: only on the MAXIMUM roll of the die\n          AND passing the chance test (AGI×0.2%)\ncritical mult. = 1.5 + (crit/100)')}</Formula>
                </Card>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card><h3 className="font-semibold text-white">{t('Dodge (SPEED)')}</h3><Formula>{t('value = die + defender_speed\nhard  = 10 + attacker_speed × 0.3\nsuccess → damage = 0')}</Formula></Card>
                <Card><h3 className="font-semibold text-white">{t('Block (RES)')}</h3><Formula>{t('value = die + RES + shield_bonus  (diff. 12)\nfull block    → damage × 0.2 (−80%)\npartial block → reduction = RES/100 (10%–80%)')}</Formula></Card>
              </div>
              <p className="text-xs text-textsec">{t('Gear bonuses come in already scaled by the enhancement level. Source: ')}<Code>enhancedCombatSystem.ts</Code>.</p>
            </Section>

            {/* Transformações */}
            <Section id="transformations" kicker={t('Mechanics')} title={t('Transformations')}>
              <p>{t('Limited abilities that temporarily change stats and unlock exclusive skills. They cost MP + Stamina, with a duration and a cooldown in turns.')} <Tag>source: transformationSystem.ts</Tag></p>
              <div className="grid gap-4 sm:grid-cols-2">
                {transformations.map(([key, cfg]) => (
                  <Card key={key}>
                    <div className="flex items-center justify-between"><h3 className="font-semibold text-white">{cfg.name}</h3><Tag>{TRANSF_RACE[key] ?? '—'}</Tag></div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Tag>⏱️ {t('{n} turns', { n: cfg.duration })}</Tag>
                      <Tag>♻️ CD {cfg.cooldown}</Tag>
                      <Tag tone="warn">{cfg.cost.mp} MP · {cfg.cost.stamina} STA</Tag>
                    </div>
                    <p className="mt-3 text-xs"><span className="font-semibold text-white">{t('Modifiers:')}</span> <span className="font-game text-emerald-300">{modsToString(cfg.statModifiers as any)}</span></p>
                    <p className="mt-2 text-xs"><span className="font-semibold text-white">Skills:</span> {cfg.specialAbilities.map((s) => s.name).join(' · ')}</p>
                    <p className="mt-2 text-xs"><span className="font-semibold text-emerald-300">{t('Resists:')}</span> {cfg.resistances.join(', ')} · <span className="font-semibold text-orange-300">{t('Vulnerable:')}</span> {cfg.vulnerabilities.join(', ')}</p>
                  </Card>
                ))}
              </div>
            </Section>

            {/* PvP */}
            <Section id="pvp" kicker={t('Game modes')} title={t('PvP — Arena')}>
              <p>{t('Player-versus-player battles in real time (socket). Rewards guarantee daily progression and reward skill, not farming.')}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card><h3 className="font-semibold text-white">{t('🏆 Victory')}</h3><p className="mt-1 text-sm">{t('50 XP · 15 GOLD base (+50% bonus)')}</p></Card>
                <Card><h3 className="font-semibold text-white">{t('😔 Defeat')}</h3><p className="mt-1 text-sm">{t('25 XP · 8 GOLD (50% of a win)')}</p></Card>
                <Card><h3 className="font-semibold text-white">{t('💎 Participation')}</h3><p className="mt-1 text-sm">{t('15 XP · 5 GOLD (flee/disconnect)')}</p></Card>
              </div>
              <Card>
                <h3 className="font-semibold text-white">{t('Scaling & bonuses')}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  <li>{t('XP +10%/level (max. 5×) · GOLD +8%/level')}</li>
                  <li>{t('Level difference: ±15%/level · ')}<strong className="text-white">{t('Underdog')}</strong>{t(' +50% (beating someone 5+ levels above)')}</li>
                  <li>{t('Anti-farm: −30% for beating someone 5+ levels below')}</li>
                  <li>{t('Perfect win (without losing HP): +30% XP / +50% GOLD · Transformation kill: +20%')}</li>
                  <li>{t('Win combo / first of the day: ')}<Todo /></li>
                </ul>
              </Card>
              <p className="text-xs text-textsec">{t('Stamina cost: basic ')}{STAMINA_COSTS.pvp.basic}{t(' · ranked ')}{STAMINA_COSTS.pvp.ranked}{t(' · tournament ')}{STAMINA_COSTS.pvp.tournament}.</p>
            </Section>

            {/* PvE */}
            <Section id="pve" kicker={t('Game modes')} title={t('PvE & Dungeons')}>
              <p>{t('Four themed dungeons. You explore rooms rolling a ')}<strong className="text-white">d20</strong>{t(' per event; at the end, you face the boss. Monsters and rewards scale with level, room and difficulty.')} <Tag>source: dungeonAdventures.ts</Tag></p>
              <Table
                head={[t('Dungeon'), t('Difficulty'), t('Rooms'), t('Boss')]}
                rows={DUNGEON_LIST.map((d) => [
                  <span key={d.id} className="font-semibold text-white">{d.emoji} {pickName(d, locale)}</span>,
                  <span key="s">{'★'.repeat(d.difficultyStars)}<span className="text-white/20">{'★'.repeat(Math.max(0, 4 - d.difficultyStars))}</span> <span className="text-xs">(×{d.difficulty})</span></span>,
                  d.rooms,
                  `${pickName(d.boss, locale)} — ${d.boss.title}`,
                ])}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">{t('Event table (d20)')}</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li><span className="font-semibold text-white">{t('☠️ Trap')}</span>{t(' — damage as % of max HP')}</li>
                    <li><span className="font-semibold text-white">{t('⚔️ Monster')}</span>{t(' — scaled turn-based battle')}</li>
                    <li><span className="font-semibold text-white">{t('🍃 Nothing')}</span>{t(' — flavour, move along')}</li>
                    <li><span className="font-semibold text-white">{t('💰 Gold')}</span>{t(' — random gold × level')}</li>
                    <li><span className="font-semibold text-white">{t('🧪 Item')}</span>{t(' — a themed item is drawn')}</li>
                    <li><span className="font-semibold text-white">{t('✨ Blessing')}</span>{t(' — restores HP/MP/STA and/or XP')}</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">{t('Monster scaling')}</h3>
                  <Formula>{t('Lf = 1 + (level-1)×0.1 + (room-1)×0.05\nHP  = baseHP × difficulty × Lf\nATK = baseATK × diff × (1+(level-1)×0.08)\nDEF = baseDEF × diff × (1+(level-1)×0.06)\nboss: +2 levels, bigger reward')}</Formula>
                </Card>
              </div>
              <Card>
                <div className="flex items-center gap-2"><Todo /><h3 className="font-semibold text-white">{t('Weekly adventures')}</h3></div>
                <p className="mt-2 text-sm">{t('A weekly content mode still to be designed (format, rewards and how the item catalog drop connects). The old dungeon system (rank F–S monsters) was removed.')}</p>
              </Card>
              <p className="text-xs text-textsec">{t('Stamina cost: simple ')}{STAMINA_COSTS.dungeon.simple}{t(' · normal ')}{STAMINA_COSTS.dungeon.normal}{t(' · hard ')}{STAMINA_COSTS.dungeon.hard}{t(' · raid ')}{STAMINA_COSTS.dungeon.raid}.</p>
            </Section>

            {/* Itens */}
            <Section id="items" kicker={t('Content')} title={t('Items')}>
              <p>{t('The catalog is the single source of items, split by ')}<strong className="text-white">{t('how the item is obtained')}</strong>{t('. The shop (NPC) sells basic→intermediate to sustain the early/mid-game; everything ')}<em>{t('rare or above')}</em>{t(', accessories and the best consumables come from dungeons and adventures.')} <Tag>source: itemCatalog.ts</Tag></p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">{t('Tiers & origin')}</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    <li><Pill rarity="COMMON" /> & <Pill rarity="UNCOMMON" /> (<em>{t('Superior')}</em>) → <strong className="text-white">{t('🏪 Shop')}</strong></li>
                    <li><Pill rarity="RARE" />{t(' → 🗝️ dungeon floor')}</li>
                    <li><Pill rarity="EPIC" />{t(' → 👑 dungeon boss (exclusive)')}</li>
                    <li><Pill rarity="LEGENDARY" />{t(' → 👑 dungeon boss or 🗓️ weekly adventure')}</li>
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {RARITY_ORDER.map((rk) => <Tag key={rk}><Pill rarity={rk} /> {t('weight')} {RARITY_DROP_WEIGHT[rk]}</Tag>)}
                  </div>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">{t('Builds & race restriction')}</h3>
                  <p className="mt-2 text-sm">{t('Each shop tier brings ')}<strong className="text-white">{t('4 variants')}</strong>{t(' of similar power but a different attribute spread — the player picks by build:')}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(BUILD_LABEL).map(([k, v]) => <Tag key={k}>{t(v)}</Tag>)}
                  </div>
                  <p className="mt-3 text-sm">
                    {t('Gear by ')}<strong className="text-white">{t('CLASS')}</strong>{t(' (via ')}<Code>canClassEquip</Code>):{' '}
                    <strong className="text-white">{t('Warrior')}</strong>{t(' uses heavy/medium + sword/axe/shield; ')}
                    <strong className="text-white">{t('Rogue')}</strong>{t(' light/medium + dagger/bow; ')}
                    <strong className="text-white">{t('Mage')}</strong>{t(' light + staff/orb; ')}
                    <strong className="text-white">{t('Monk')}</strong>
                    {t(' light/medium + gauntlet. Race still counts for stats, transformations and exclusive legendary items. The shop filters by race+class (')}
                    <Code>getShopItems(race, class)</Code>).
                  </p>
                </Card>
              </div>

              <p className="text-sm text-textsec">Galeria completa com a arte gerada de cada item (mesmo tamanho dos cards da <Code>/store</Code>) — para revisar tudo e marcar o que precisa refazer. {ITEM_CATALOG.length + CONSUMABLE_CATALOG.length} itens.</p>

              {/* 🏪 Loja */}
              <h3 className="pt-2 text-lg font-semibold text-white">🏪 Loja — armas, armaduras &amp; apoio</h3>
              {(['COMMON', 'UNCOMMON'] as RarityKey[]).map((rk) => {
                const items = ITEM_CATALOG.filter((i) => i.source === 'shop' && i.rarity === rk)
                if (!items.length) return null
                return (
                  <div key={rk} className="space-y-3">
                    <div className="flex items-center gap-2 pt-2"><Pill rarity={rk} /><span className="text-sm text-textsec">{rk === 'UNCOMMON' ? 'Superior · ' : ''}{items.length} itens</span></div>
                    <ItemGallery>
                      {items.map((it) => (
                        <ItemArtCard
                          key={it.name} name={it.name} type={it.type} rarity={it.rarity}
                          level={it.level} goldPrice={it.goldPrice} statsText={itemStatsToString(it.stats, t, locale)}
                          meta={it.build ? t(BUILD_LABEL[it.build]) : undefined}
                        />
                      ))}
                    </ItemGallery>
                  </div>
                )
              })}

              {/* 🗝️ Masmorras & Aventuras */}
              <h3 className="pt-4 text-lg font-semibold text-white">🗝️ Masmorras &amp; Aventuras — gear raro e acima</h3>
              {(['RARE', 'EPIC', 'LEGENDARY'] as RarityKey[]).map((rk) => {
                const items = ITEM_CATALOG.filter((i) => i.source !== 'shop' && i.rarity === rk)
                if (!items.length) return null
                return (
                  <div key={rk} className="space-y-3">
                    <div className="flex items-center gap-2 pt-2"><Pill rarity={rk} /><span className="text-sm text-textsec">{items.length} itens</span></div>
                    <ItemGallery>
                      {items.map((it) => (
                        <ItemArtCard
                          key={it.name} name={it.name} type={it.type} rarity={it.rarity}
                          level={it.level} goldPrice={it.goldPrice} statsText={itemStatsToString(it.stats, t, locale)}
                          meta={<><span>{t(SOURCE_LABEL[it.source])}</span> · <DungeonAndRace it={it} /></>}
                        />
                      ))}
                    </ItemGallery>
                  </div>
                )
              })}

              {/* 🗓️ Aventuras semanais — contexto dos chefes */}
              <h3 className="pt-4 text-lg font-semibold text-white">🗓️ Chefes das Aventuras Semanais</h3>
              <p className="text-sm">{t('One unique boss per Saturday (4-week rotation), each with exclusive named gear (Legendary and above) — the Black Desert model (Kzarka, Garmoth, Karanda…).')}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {ADVENTURE_BOSSES.map((b) => {
                  const drops = ITEM_CATALOG.filter((i) => i.adventureBoss === b.name)
                  return (
                    <Card key={b.name}>
                      <div className="flex items-center gap-2"><span className="text-2xl">{b.emoji}</span><div><h4 className="font-semibold text-white">{b.name}</h4><p className="text-xs text-textsec">{b.title}</p></div></div>
                      <p className="mt-2 text-xs text-textsec">{t(b.theme)} · {t(b.day)} · {t('Saturday')}</p>
                      <ul className="mt-2 space-y-1 text-xs">
                        {drops.map((d) => (
                          <li key={d.name} className="flex items-center justify-between gap-2">
                            <span className="text-amber-300">{d.name}</span><Code>{d.type}</Code>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )
                })}
              </div>

              {/* 🧪 Consumíveis */}
              <h3 className="pt-4 text-lg font-semibold text-white">{t('🧪 Consumables')}</h3>
              <p className="text-sm">{t('The shop sells basics and intermediates; dungeons and adventures bring enhanced and unique versions.')}</p>
              {([
                { label: '🏪 Shop — basics & intermediates', filter: (c: typeof CONSUMABLE_CATALOG[number]) => c.source === 'shop' },
                { label: '🗝️ Dungeons & Adventures — enhanced & unique', filter: (c: typeof CONSUMABLE_CATALOG[number]) => c.source !== 'shop' },
              ]).map((group) => {
                const items = CONSUMABLE_CATALOG.filter(group.filter)
                return (
                  <div key={group.label} className="space-y-3">
                    <div className="pt-2 text-sm font-semibold text-white">{t(group.label)} <span className="text-textsec">· {items.length}</span></div>
                    <ItemGallery>
                      {items.map((c) => (
                        <ItemArtCard
                          key={c.name} name={c.name} type="CONSUMABLE" rarity={c.rarity as RarityKey}
                          level={c.level} goldPrice={c.goldPrice} statsText={consumableEffectToString(c.stats, t)}
                          meta={c.adventureBoss ?? t(SOURCE_LABEL[c.source])}
                        />
                      ))}
                    </ItemGallery>
                  </div>
                )
              })}

              {/* ⚒️ Pedras de aprimoramento */}
              <h3 className="pt-4 text-lg font-semibold text-white">⚒️ Pedras de Aprimoramento</h3>
              <p className="text-sm">{t('Obtained in dungeons (fighting monsters / exploring) — not sold in the shop. 10 lesser stones forge 1 concentrated at the Forge Table. System details in the ')}<a href="#enhancement" className="text-primary hover:underline">{t('Enhancement')}</a>{t(' section.')}</p>
              <ItemGallery>
                {ENHANCEMENT_STONES.map((s) => (
                  <ItemArtCard key={s.name} name={s.name} type="ENHANCEMENT_STONE" rarity={s.rarity} meta={`🗝️ Masmorra · ${s.use}`} />
                ))}
              </ItemGallery>
            </Section>

            {/* Aprimoramento */}
            <Section id="enhancement" kicker={t('Gear progression')} title={t('Enhancement (Black Desert style)')}>
              <p>{t('Gear goes from ')}<Code>+0</Code>{t(' to ')}<Code>+15</Code>{t(' and then to the roman tiers ')}<Code>I (PRI)</Code> → <Code>V (PEN)</Code>{t('. Failures have consequences and build up ')}<em>{t('failstacks')}</em>. <Tag>source: enhancementSystem.ts</Tag></p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">Regras por categoria</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    <li><strong className="text-white">{t('Weapons/Armour:')}</strong>{t(' +1 to +')}{SAFE_ENHANCE_MAX}{t(' guaranteed; from there on with risk. Failure at II–V ')}<span className="text-orange-300">{t('drops 1 level')}</span>{t('; before that it only loses durability.')}</li>
                    <li><strong className="text-white">{t('Accessories:')}</strong>{t(' jump from base straight to PRI consuming a copy; failure ')}<span className="text-red-400">{t('DESTROYS')}</span>{t(' the accessory.')}</li>
                    <li><strong className="text-white">{t('Failstacks:')}</strong>{t(' every failure raises the chance of the next; success resets it.')}</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">{t('Chance & failstacks')}</h3>
                  <Formula>{t('chance = base + (base/10) × FS\nsoftcap 70% → above that each FS is worth base/50\nhard cap = 90%\nup to +{n}: chance = 100% (safe)', { n: SAFE_ENHANCE_MAX })}</Formula>
                  <p className="mt-2 text-xs">{t('Materials: Black Stone (weapon/armour) and the Concentrated version for PRI+. Accessories use a copy of the item itself.')}</p>
                </Card>
              </div>
              <Table
                head={[t('Target'), t('Base chance (weapon/armour)'), t('Accessory'), t('Stats ×')]}
                rows={ENHANCE_TARGETS.map((e) => [
                  e.label,
                  pct(getBaseChance('WEAPON', e.t)),
                  pct(getBaseChance('ACCESSORY', e.t)),
                  `×${getStatMultiplier(e.t).toFixed(2)}`,
                ])}
              />
            </Section>

            {/* Crafting */}
            <Section id="crafting" kicker={t('Economy')} title={t('Processing, Forge & Alchemy')}>
              <p>{t('Forge, Alchemy, ')}<strong className="text-white">{t('Processing')}</strong>{t(' and ')}<strong className="text-white">{t('Cooking')}</strong>{t(' are ')}<strong className="text-white">{t('player professions')}</strong>{t(' with level and XP (the blacksmith NPC only sells and repairs; the alchemist only sells). The level belongs to ')}<strong className="text-white">{t('the whole account')}</strong>{t(' (like the Farm: every craft from any hero adds up). The pipeline is a production chain: ')}<strong className="text-white">{t('raw material')}</strong>{t(' (gathering/farm/dungeon) → ')}<strong className="text-white">{t('⚙️ Processing')}</strong>{t(' (refines into bars, cloth, extracts…) → ')}<strong className="text-white">{t('⚒️ Forge / ⚗️ Alchemy / 🍳 Cooking')}</strong>{t(' (uncommon pieces, potions and dishes). In the Forge and in Alchemy each craft rolls a ')}<strong className="text-white">{t('success chance')}</strong>{t(' from the recipe rarity + your level — ')}<strong className="text-orange-300">{t('failure consumes the materials and the fee')}</strong>{t(', but still gives reduced XP. Higher-rarity recipes ')}<strong className="text-white">{t('unlock by level')}</strong>{t(': common lv1, uncommon lv5, rare lv12, epic lv20.')} <Tag tone="ok">source: craftingProfession.ts · processing.ts · forge.ts · alchemy.ts · cooking.ts</Tag></p>

              <Table
                head={[t('Rarity'), t('Unlocks'), t('Base chance'), t('Cap'), t('XP (success / failure)')]}
                rows={(['COMMON', 'UNCOMMON', 'RARE', 'EPIC'] as const).map((r) => [
                  <Pill key="p" rarity={r} />,
                  <span key="l" className="text-white">{t('level {n}', { n: CRAFT_MIN_LEVEL[r] })}</span>,
                  <span key="b">{Math.round(CRAFT_BASE_CHANCE[r] * 100)}% <span className="text-xs text-textsec">{t('(+1%/level)')}</span></span>,
                  <span key="t">{Math.round(Math.min(0.95, CRAFT_BASE_CHANCE[r] + 0.01 * (50 - CRAFT_MIN_LEVEL[r])) * 100)}%</span>,
                  <span key="x" className="text-amber-300">{CRAFT_XP[r]} / {Math.round(CRAFT_XP[r] * 0.4)} XP</span>,
                ])}
              />

              {/* ⚙️ Processamento (fonte: processing.ts) */}
              <h3 className="pt-2 text-lg font-semibold text-white">{t('⚙️ Processing (Refining Bench)')}</h3>
              <p className="text-sm">
                {t('It refines raw material into processed inputs — the link between gathering/farm and the other benches. Like stone refining, it never fails (it is conversion, not fabrication): each recipe has fixed XP, a standard 2 raw → 1 processed ratio and unlocks by the recipe Processing level. The distillery also purifies Water → Pure Water (1:1; the well and gathering drop raw Water). The uncommon Forge recipes and the Alchemy potions require these inputs; Feed (milling) and Linen Bandage (textile) are made here too. So is basic stone refining: 10 Shards → 1 Black Stone (Weapon/Armour).')}
              </p>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">{t('Processed inputs')}</h4>
              <ItemGallery>
                {[...PROCESSED_CATALOG]
                  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
                  .map((p) => (
                    <ItemArtCard
                      key={p.name} name={p.name} type="Processado" rarity={p.rarity}
                      meta="⚙️ Bancada"
                    />
                  ))}
              </ItemGallery>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Receitas de processamento</h4>
              <Table
                head={[t('Result'), t('Bench'), t('Inputs'), t('Level'), 'XP', t('Fee')]}
                rows={PROCESSING_RECIPES.map((r) => [
                  <span key={r.id} className={`font-semibold ${RARITY[r.rarity].text}`}>⚙️ {r.outputName}</span>,
                  <span key="g" className="text-xs">{t(PROCESSING_GROUP_LABEL[r.group])}</span>,
                  <span key="m" className="text-xs">{r.inputs.map((m) => `${m.quantity}× ${localizeItemName(m.name, locale)}`).join(' · ')}</span>,
                  <span key="l" className="text-white">nv {r.minLevel}</span>,
                  <span key="x" className="text-amber-300">+{r.xp}</span>,
                  <span key="c" className="text-amber-300">{r.goldCost} 🪙</span>,
                ])}
              />

              {/* ⚒️ Forja (fonte: forge.ts) */}
              <h3 className="pt-4 text-lg font-semibold text-white">⚒️ Forja (Ferreiro)</h3>
              <p className="text-sm">
                {t('It forges common / uncommon pieces from materials: a common recipe uses raw material (leather, Heavy Iron, Ent Sap…) — the newcomer arrives from gathering and already forges; an uncommon recipe requires the PROCESSED input (Steel Bar, Cured Leather, Linen Cloth + Iron Bar). The Black Stone Shard ties every gear recipe together; basic refining (10 shards → 1 Black Stone) lives in Processing, and what is left in the Forge is the concentrated step: 10 Stones → 1 Concentrated (guaranteed conversion; Concentrated needs Forge lv10). The Memory Shard (boss only) repairs rare, epic and legendary pieces (+25 durability each) — and, since 2026-08-17, a level 0 copy in the bag also works, including on those.')}
              </p>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Materiais de forja</h4>
              <ItemGallery>
                {[...FORGE_MATERIAL_CATALOG]
                  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
                  .map((m) => (
                    <ItemArtCard
                      key={m.name} name={m.name} type="Material" rarity={m.rarity}
                      meta={m.source === 'dungeon_boss' ? t('👑 Boss only') : t('🗝️ Dungeon')}
                    />
                  ))}
              </ItemGallery>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Receitas de forja</h4>
              <Table
                head={['Resultado', 'Raridade', 'Materiais', 'Taxa']}
                rows={FORGE_RECIPES.map((r) => [
                  <span key={r.id} className={`font-semibold ${RARITY[r.rarity].text}`}>
                    {r.kind === 'stone' ? '🪨' : '⚒️'} {r.outputName}
                  </span>,
                  <Pill key="r" rarity={r.rarity} />,
                  <span key="m" className="text-xs">{r.materials.map((m) => `${m.quantity}× ${localizeItemName(m.name, locale)}`).join(' · ')}</span>,
                  <span key="c" className="text-amber-300">{r.goldCost} 🪙</span>,
                ])}
              />

              {/* ⚗️ Alquimia & Poções — livro de receitas (fonte: alchemy.ts) */}
              <h3 className="pt-4 text-lg font-semibold text-white">{t('⚗️ Alchemy & Potions')}</h3>
              <p className="text-sm">
                {t('Alchemy is potions only: they are transmuted at the Transmutation Triangle from processed extracts (Herbal Extract, Mana Essence, Root Extract — the Processing distillery) + gathering/dungeon ingredients.')}
                {t('Each attempt consumes the recipe inputs + a gold fee and rolls the chance of your Alchemy level.')}
                {t('Common / uncommon ingredients come from gathering and the dungeon floor; rare / epic only from bosses. Bread, Feed and Bandage left here: Feed/Bandage belong to Processing and Bread goes to Cooking.')}
                <Tag tone="ok"> fonte: alchemy.ts</Tag>
              </p>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Ingredientes</h4>
              <ItemGallery>
                {[...INGREDIENT_CATALOG]
                  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
                  .map((ing) => (
                    <ItemArtCard
                      key={ing.name} name={ing.name} type="Ingrediente" rarity={ing.rarity}
                      meta={ing.source === 'dungeon_boss' ? t('👑 Boss') : t('🗝️ Dungeon floor')}
                    />
                  ))}
              </ItemGallery>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Receitas</h4>
              <Table
                head={[t('Potion'), t('Rarity'), t('Ingredients'), t('Fee')]}
                rows={[...POTION_RECIPES]
                  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
                  .map((r) => [
                    <span key={r.id} className={`font-semibold ${RARITY[r.rarity].text}`}>🧪 {r.outputName}</span>,
                    <Pill key="r" rarity={r.rarity} />,
                    <span key="i" className="text-xs">
                      {r.ingredients.map((ing) => `${(getIngredientByName(ing.name) ?? getProcessedByName(ing.name))?.emoji ?? ''} ${ing.quantity}× ${localizeItemName(ing.name, locale)}`).join(' · ')}
                    </span>,
                    <span key="c" className="text-amber-300">{r.goldCost} 🪙</span>,
                  ])}
              />

              {/* 🍳 Culinária (fonte: cooking.ts · foodBuff.ts) */}
              <h3 className="pt-4 text-lg font-semibold text-white">{t('🍳 Cooking (Kitchen)')}</h3>
              <p className="text-sm">
                {t('The fourth bench of the ecosystem: dishes that give attribute bonuses over REAL time (STR/AGI/INT/DEF for 15–30 minutes — weaker than a combat potion, but they last the whole farm; the Banquet gives +1 to everything). You eat from the inventory: one dish at a time (eating another replaces it) and the bonus goes straight into the dungeon combat attributes. Like Processing, cooking never fails — fixed XP per recipe, unlocked by the account Cooking level. The dishes use Flour from milling, Feed and farm/gathering inputs; Bread restores 20 HP outside combat.')} <Tag tone="ok">fonte: cooking.ts · foodBuff.ts</Tag>
              </p>
              <ItemGallery>
                {[...FOOD_CATALOG]
                  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
                  .map((f) => (
                    <ItemArtCard
                      key={f.name} name={f.name} type="Comida" rarity={f.rarity}
                      meta="🍳 Cozinha"
                    />
                  ))}
              </ItemGallery>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">{t('Cooking recipes')}</h4>
              <Table
                head={[t('Dish'), t('Station'), t('Inputs'), t('Effect when eaten'), t('Level'), 'XP', t('Fee')]}
                rows={COOKING_RECIPES.map((r) => {
                  const food = FOOD_CATALOG.find((f) => f.name === r.outputName)
                  const fb = parseFoodBuffSpec(food?.stats)
                  const effect = fb
                    ? foodBuffSpecLabel(fb)
                    : `+${Number((food?.stats as any)?.healAmount) || 0} HP fora de combate`
                  return [
                    <span key={r.id} className={`font-semibold ${RARITY[r.rarity].text}`}>🍳 {r.outputName}</span>,
                    <span key="g" className="text-xs">{COOKING_GROUP_LABEL[r.group]}</span>,
                    <span key="m" className="text-xs">{r.inputs.map((m) => `${m.quantity}× ${localizeItemName(m.name, locale)}`).join(' · ')}</span>,
                    <span key="e" className="text-xs text-emerald-300">{effect}</span>,
                    <span key="l" className="text-white">nv {r.minLevel}</span>,
                    <span key="x" className="text-amber-300">+{r.xp}</span>,
                    <span key="c" className="text-amber-300">{r.goldCost} 🪙</span>,
                  ]
                })}
              />
            </Section>

            {/* Stamina */}
            <Section id="stamina" kicker="Economia de tempo" title="Stamina">
              <p>{t('Stamina limits activities per day (ethical monetisation, no pay-to-win). ')}<strong className="text-white">{t('Passive regeneration:')}</strong>{t(' after ')}<strong className="text-white">{t('15 minutes without spending stamina')}</strong>{t(', it comes back ')}<strong className="text-white">{t('+2 every 15 seconds')}</strong>{t(' until full. Any spend restarts the 15-min wait. The value will still be tuned with a test battery of the spend per activity.')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">Custos por atividade</h3>
                  <Table
                    head={['Atividade', 'Custo']}
                    rows={[
                      [t('PvP basic / ranked / tournament'), `${STAMINA_COSTS.pvp.basic} / ${STAMINA_COSTS.pvp.ranked} / ${STAMINA_COSTS.pvp.tournament}`],
                      ['Masmorra simples → raid', `${STAMINA_COSTS.dungeon.simple} / ${STAMINA_COSTS.dungeon.normal} / ${STAMINA_COSTS.dungeon.hard} / ${STAMINA_COSTS.dungeon.raid}`],
                      [t('Training · Exploration'), `${STAMINA_COSTS.activities.training} · ${STAMINA_COSTS.activities.exploration}`],
                      [t('Crafting · Transformation'), `${STAMINA_COSTS.activities.crafting} · ${STAMINA_COSTS.activities.transformation}`],
                    ]}
                  />
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">{t('Progression by tier')}</h3>
                  <Table
                    head={['Faixa', 'Base', 'Atividades/dia']}
                    rows={[
                      ['Novato (1–5)', STAMINA_PROGRESSION.beginner.baseStamina, STAMINA_PROGRESSION.beginner.activitiesPerDay],
                      [t('Intermediate (6–15)'), STAMINA_PROGRESSION.intermediate.baseStamina, STAMINA_PROGRESSION.intermediate.activitiesPerDay],
                      ['Veterano (16+)', STAMINA_PROGRESSION.veteran.baseStamina, STAMINA_PROGRESSION.veteran.activitiesPerDay],
                    ]}
                  />
                </Card>
              </div>
            </Section>

            {/* IA */}
            <Section id="ai" kicker={t('System')} title={t('AI & Image Generation')}>
              <p>{t('An AI narrates the combat cinematically, comments on rolls and gives tactical advice. Today the narration uses pre-written responses (fallback).')} <Tag>source: aiJudge.ts</Tag></p>
              <Card>
                <div className="flex items-center gap-2"><Todo /><h3 className="font-semibold text-white">{t('Character image generation (Anthropic)')}</h3></div>
                <p className="mt-2 text-sm">
                  {t('Next step: migrate to our ')}<strong className="text-white">{t('own Anthropic key')}</strong>
                  {t(' and generate character images in the ')}<strong className="text-white">{t('same visual style')}</strong>
                  {t(', adding only the traits the player chooses. It requires improving the prompt to guarantee style consistency across all characters.')}
                </p>
              </Card>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>{t('Combat narration — epic, max. 3 sentences.')}</li>
                <li>{t('Dice commentary — reacts to criticals, misses and high hits.')}</li>
                <li>{t('Tactical advice — analyses HP/MP/stamina and enemy weaknesses.')}</li>
              </ul>
            </Section>

            {/* Estrutura / Roadmap */}
            <Section id="structure" kicker="Para o time" title="Notas & Roadmap">
              <h3 className="text-lg font-semibold text-white">✅ Resolvido nesta rodada</h3>
              <Card>
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {RESOLVED.map((r) => <li key={r}>{t(r)}</li>)}
                </ul>
              </Card>
              <h3 className="pt-2 text-lg font-semibold text-white">{t('🔜 Next steps / under study')}</h3>
              <div className="space-y-3">
                {ROADMAP.map((n) => (
                  <Card key={n.title}>
                    <div className="flex items-start gap-3">
                      <Todo />
                      <div><h4 className="font-semibold text-white">{t(n.title)}</h4><p className="mt-1 text-sm">{t(n.body)}</p></div>
                    </div>
                  </Card>
                ))}
              </div>
              <h3 className="pt-2 text-lg font-semibold text-white">{t('ℹ️ By design')}</h3>
              <Card>
                <p className="text-sm"><strong className="text-white">{t('DOL vs GOLD:')}</strong>{t(' they are two tokens with distinct purposes — ')}<Tag tone="dol">DOL</Tag>{t(' is the premium currency (creation/characters) and ')}<Tag tone="gold">GOLD</Tag>{t(' is the main game currency (shop/items). It is not a bug.')}</p>
              </Card>
            </Section>

            <div className="border-t border-white/5 pt-8 text-center">
              <p className="text-sm text-textsec">
                {t('Documentation generated from the Dolrath source code.')}{' '}
                <Link href="/" className="text-primary hover:underline">{t('Back to home')}</Link>
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}