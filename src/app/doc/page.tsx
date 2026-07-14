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
  COMMON: { label: 'Comum', text: 'text-zinc-300', ring: 'ring-zinc-500/40', bg: 'bg-zinc-500/10' },
  UNCOMMON: { label: 'Incomum', text: 'text-emerald-300', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10' },
  RARE: { label: 'Raro', text: 'text-sky-300', ring: 'ring-sky-500/40', bg: 'bg-sky-500/10' },
  EPIC: { label: 'Épico', text: 'text-fuchsia-300', ring: 'ring-fuchsia-500/40', bg: 'bg-fuchsia-500/10' },
  LEGENDARY: { label: 'Lendário', text: 'text-amber-300', ring: 'ring-amber-500/40', bg: 'bg-amber-500/10' },
}
const RARITY_ORDER: RarityKey[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']

function Pill({ rarity }: { rarity: RarityKey }) {
  const r = RARITY[rarity]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${r.text} ${r.ring} ${r.bg}`}>
      {r.label}
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
  return <Tag tone="todo">🔜 TODO</Tag>
}

function Live() {
  return <Tag tone="ok">✅ AO VIVO</Tag>
}

function Soon() {
  return <Tag tone="todo">🔜 EM BREVE</Tag>
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
const WEAPON_PT: Record<string, string> = { sword: 'Espada', dagger: 'Adaga', staff: 'Cajado', bow: 'Arco', mace: 'Maça', spear: 'Lança', fists: 'Punhos' }
const BONUS_PT: Record<string, string> = { strength: 'STR', dexterity: 'DEX', intelligence: 'INT', constitution: 'CON' }
const STAT_SHORT: Record<string, string> = { str: 'str', agi: 'agi', int: 'int', def: 'def', res: 'res', hp: 'hp', mp: 'mp', stamina: 'stm', bonusDamage: 'dano', bonusDefense: 'defesa', bonusSpeed: 'vel' }
const SOURCE_LABEL: Record<string, string> = { shop: '🏪 Loja', dungeon: '🗝️ Masmorra', dungeon_boss: '👑 Chefe', adventure_boss: '🗓️ Aventura' }
const BUILD_LABEL: Record<string, string> = { brute: '💪 Força', agile: '🏹 Agilidade', arcane: '🔮 Arcano', guardian: '🛡️ Guardião' }
const DUNGEON_PT: Record<string, string> = { floresta: 'Floresta Sombria', caverna: 'Caverna de Cristal', pantano: 'Pântano Maldito', ruinas: 'Ruínas Arcanas' }
const ENHANCEMENT_STONES = [
  { name: 'Pedra Negra (Arma)', rarity: 'UNCOMMON' as RarityKey, use: '+1 a +15 · armas/escudos' },
  { name: 'Pedra Negra (Armadura)', rarity: 'UNCOMMON' as RarityKey, use: '+1 a +15 · armaduras' },
  { name: 'Pedra Negra Mágica Concentrada (Arma)', rarity: 'EPIC' as RarityKey, use: 'I–V (PRI–PEN) · armas/escudos' },
  { name: 'Pedra Negra Mágica Concentrada (Armadura)', rarity: 'EPIC' as RarityKey, use: 'I–V (PRI–PEN) · armaduras' },
]
const ADVENTURE_BOSSES = [
  { day: 'Semana 1', emoji: '🔥', name: 'Krax-thar', title: 'o Devorador de Mundos', theme: 'Dragão ígneo' },
  { day: 'Semana 2', emoji: '🕷️', name: "Vol'theris", title: 'a Tecelã do Vazio', theme: 'Aranha do vazio' },
  { day: 'Semana 3', emoji: '🗿', name: 'Gorthak', title: 'o Colosso de Adamantite', theme: 'Golem titânico' },
  { day: 'Semana 4', emoji: '✨', name: 'Sylariel', title: 'a Rainha Celeste', theme: 'Elfa caída' },
]

function dungeonAndRace(it: CatalogItem): React.ReactNode {
  const where = it.adventureBoss
    ? it.adventureBoss
    : it.dungeons.map((d) => DUNGEON_PT[d] ?? d).join(', ') || '—'
  return <span className="text-xs">{where}{it.raceRestriction ? <> · <Tag tone="warn">{it.raceRestriction}</Tag></> : null}</span>
}

function consumableEffectToString(stats: Record<string, any>): string {
  const parts: string[] = []
  if (stats.healAmount) parts.push(stats.healAmount >= 9999 ? 'HP total' : `+${stats.healAmount} HP`)
  if (stats.manaAmount) parts.push(stats.manaAmount >= 9999 ? 'MP total' : `+${stats.manaAmount} MP`)
  if (stats.staminaAmount) parts.push(`+${stats.staminaAmount} stm`)
  if (stats.attackBonus) parts.push(`+${stats.attackBonus} ATK`)
  if (stats.defenseBonus) parts.push(`+${stats.defenseBonus} DEF`)
  if (stats.dodgeBonus) parts.push(`+${stats.dodgeBonus}% esquiva`)
  if (stats.shieldAmount) parts.push(`escudo ${stats.shieldAmount}`)
  if (stats.reviveHpPercent) parts.push(`revive ${stats.reviveHpPercent}%`)
  if (stats.duration) parts.push(`${stats.duration} turnos`)
  if (stats.cure) parts.push('cura status')
  return parts.join(' · ')
}
const MOD_PT: Record<string, string> = { strength: 'STR', defense: 'DEF', hp: 'HP', agility: 'AGI', intelligence: 'INT', attack: 'ATK', critical: 'CRIT' }
const TRANSF_RACE: Record<string, string> = { dragon: 'Draconiano', wolf: 'Metamorfo', bear: 'Metamorfo', eagle: 'Metamorfo' }

function itemStatsToString(stats: Record<string, any>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === 'number') parts.push(`${STAT_SHORT[k] ?? k}+${v}`)
  }
  if (typeof stats.specialEffect === 'string') parts.push(`✦ ${stats.specialEffect}`)
  return parts.join(' · ')
}

function bonusToString(b: Record<string, number | undefined>): string {
  return Object.entries(b).filter(([, v]) => v).map(([k, v]) => `+${v} ${BONUS_PT[k] ?? k}`).join(' · ')
}

function modsToString(m: Record<string, number>): string {
  return Object.entries(m).map(([k, v]) => `${MOD_PT[k] ?? k} ×${v}`).join(' · ')
}

function pct(x: number): string {
  return x > 0 ? `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%` : '—'
}

const NAV = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'tokenomics', label: 'Tokenomics' },
  { id: 'races', label: 'Raças' },
  { id: 'classes', label: 'Classes' },
  { id: 'attributes', label: 'Atributos & Stats' },
  { id: 'progression', label: 'Progressão & XP' },
  { id: 'combat', label: 'Combate' },
  { id: 'transformations', label: 'Transformações' },
  { id: 'pvp', label: 'PvP' },
  { id: 'pve', label: 'PvE & Masmorras' },
  { id: 'items', label: 'Itens' },
  { id: 'enhancement', label: 'Aprimoramento' },
  { id: 'crafting', label: 'Materiais & Crafting' },
  { id: 'stamina', label: 'Stamina' },
  { id: 'ai', label: 'IA & Imagens' },
  { id: 'structure', label: 'Notas & Roadmap' },
]

const ENHANCE_TARGETS = [
  { label: '+8', t: 8 }, { label: '+10', t: 10 }, { label: '+12', t: 12 }, { label: '+15', t: 15 },
  { label: 'I (PRI)', t: PRI }, { label: 'II (DUO)', t: DUO }, { label: 'III (TRI)', t: TRI }, { label: 'IV (TET)', t: TET }, { label: 'V (PEN)', t: PEN },
]
const XP_SAMPLE = [1, 4, 9, 19, 49]

const RESOLVED = [
  'Tokenomics v2 nos contratos: DOL com supply fixo de 1B (sem mint), GOLD queimável e taxa de mercado com queima real (4% itens / 5% personagens).',
  'Dashboard de tokenomics publicado em /tokenomics/dashboard.html (projeção de 120 meses, 3 cenários).',
  'Sistema antigo de masmorras (monstros rank F–S) removido — restam só os MATERIAIS em dungeonData.ts.',
  'Pontos por nível padronizados em 1/nível (pointSystem.leveling alinhado ao characterLevelSystem).',
  'Atributo wisdom removido de types/game.ts, gameData.ts e characterFactory.ts (simplificação).',
  'Doc agora importa direto das fontes puras — edições de balanceamento refletem aqui automaticamente.',
  'Doc tornado público e exibido na landing.',
]

const ROADMAP = [
  { title: 'Deploy dos contratos v2 (Amoy → mainnet)', body: 'DolToken v2 (1B fixo), GOLD queimável e os dois mercados com taxa já estão prontos e testados no repositório. Falta redeployar na Amoy (novos endereços nas envs) e, na sequência do go-live econômico, na mainnet Polygon.' },
  { title: 'Aventuras semanais (PvE) — implementação', body: 'Gear dos 4 chefes semanais já catalogado (Krax-thar, Vol\'theris, Gorthak, Sylariel). Falta implementar o modo em si: rotação por sábado (semana 1–4), encontro do chefe e a tabela de drop exclusiva (source adventure_boss).' },
  { title: 'Alinhar fonte de stats no servidor', body: 'A criação usa characterCreationData.ts (mais nova, rebalanceada), mas o servidor (api/character/route.ts) ainda computa stats por gameData.ts. Consolidar numa fonte única após a bateria de testes.' },
  { title: 'Afinar custos de stamina', body: 'Regen passivo implementado (+2/15s após 15 min sem gastar). Falta a bateria de testes para medir se o gasto por atividade está alto ou baixo e calibrar os custos.' },
  { title: 'IA: geração de imagens (Anthropic)', body: 'Migrar para chave Anthropic própria e gerar imagens de personagem no MESMO estilo, adicionando apenas as características que o player escolher. Melhorar o prompt para consistência.' },
  { title: 'Recompensas PvP pendentes', body: 'Implementar win streak, primeira vitória do dia, persistência em banco e UI de recompensas (hoje marcados como TODO).' },
]

// ---------------- Página ----------------

export default function DocPage() {
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
          <Tag tone="default">📖 Documentação oficial · v1.0 · pública</Tag>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Dolrath <span className="text-primary">Game Docs</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-textsec">
            Referência completa do RPG tokenizado de Dolrath. Os números aqui são lidos diretamente do
            código-fonte do jogo — esta página é um espelho vivo do balanceamento atual.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <Tag tone="ok">Atualizado {lastUpdated}</Tag>
            <Tag>Next.js 14 · Prisma · Login por carteira (SIWE)</Tag>
            <Tag>Polygon (Amoy/Mainnet)</Tag>
            <Tag tone="ok">Fonte: dados importados do código</Tag>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="hidden lg:block">
            <nav className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-white/10 bg-surface/40 p-3 backdrop-blur-xl">
              <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-widest text-textsec">Conteúdo</div>
              <ul className="space-y-0.5">
                {NAV.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        active === item.id ? 'bg-primary/15 font-semibold text-primary' : 'text-textsec hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Content */}
          <main className="min-w-0 space-y-12">
            {/* Visão Geral */}
            <Section id="overview" kicker="Introdução" title="Visão Geral">
              <p>
                <strong className="text-white">Dolrath</strong> é um RPG de combate por turnos inspirado em
                <em> Solo Leveling</em>, onde personagens, itens e moeda são <strong className="text-white">tokenizados on-chain</strong>.
                Uma IA narra o combate, e a progressão acontece em PvP (tempo real via socket) e PvE (masmorras com eventos de d20).
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card><div className="text-2xl">🧬</div><h3 className="mt-2 font-semibold text-white">Personagem = NFT</h3><p className="mt-1 text-sm">Criados pagando DOL, mintáveis como ERC-721 e negociáveis num mercado on-chain.</p></Card>
                <Card><div className="text-2xl">⚔️</div><h3 className="mt-2 font-semibold text-white">Combate tático</h3><p className="mt-1 text-sm">Dados (d6–d20), crítico por AGI, esquiva por SPEED e bloqueio por RES.</p></Card>
                <Card><div className="text-2xl">💰</div><h3 className="mt-2 font-semibold text-white">Economia dupla</h3><p className="mt-1 text-sm">GOLD (elástico, ganho jogando) para itens e crafting; DOL (supply fixo de 1B) para criação, personagens, staking e governança.</p></Card>
              </div>
              <Card>
                <h3 className="font-semibold text-white">Loop principal</h3>
                <Formula>{`Criar personagem (paga DOL)
   → ganhar XP/GOLD em PvE (masmorras) e PvP (arena)
   → comprar/dropar/craftar itens
   → aprimorar equipamento (estilo BDO)
   → subir de nível, distribuir pontos, desbloquear transformações
   → negociar personagens/itens no mercado on-chain`}</Formula>
              </Card>
            </Section>

            {/* Tokenomics */}
            <Section id="tokenomics" kicker="Economia" title="Tokenomics">
              <p>
                Economia <strong className="text-white">dual-token</strong> em Polygon: <Tag tone="dol">DOL</Tag> é o ativo de longo prazo
                (supply fixo, governança, staking) e <Tag tone="gold">GOLD</Tag> é a moeda elástica do gameplay, ganha jogando e
                gasta em loja, forja, alquimia e mercado de itens. Separar as duas protege o valor do DOL da pressão de venda
                do grind — a lição dos play-to-earn que morreram inflacionando o token principal.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <div className="flex items-center justify-between"><h3 className="font-semibold text-white">DOL — ativo de longo prazo</h3><Tag tone="dol">DOL</Tag></div>
                  <p className="mt-2 text-sm">
                    ERC-20 <Code>DolToken.sol</Code> — <strong className="text-white">supply fixo de 1.000.000.000</strong>, cunhado
                    uma única vez no deploy. <strong className="text-white">Não existe função de mint</strong>: o supply só pode
                    diminuir (queimas). Nome on-chain: <Code>Dolrath</Code>.
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    <li>Criação de personagem: <Tag tone="dol">2 DOL</Tag> (<Code>CHARACTER_CREATION_COST_DOL</Code>)</li>
                    <li>Mercado de personagens negocia em DOL (taxa 5%: 2,5% queima + 2,5% treasury)</li>
                    <li>Staking com veDOL <Soon /></li>
                    <li>Governança (DAO) <Soon /></li>
                  </ul>
                </Card>
                <Card>
                  <div className="flex items-center justify-between"><h3 className="font-semibold text-white">GOLD — moeda do gameplay</h3><Tag tone="gold">GOLD</Tag></div>
                  <p className="mt-2 text-sm">
                    ERC-20 <Code>DolrathGold.sol</Code> — emissão elástica <strong className="text-white">gateada por gameplay</strong>:
                    todo GOLD nasce off-chain (servidor-autoritativo, stamina, teto diário) e só vira token quando o jogador
                    <strong className="text-white"> reivindica on-chain</strong> (EIP-712, <Code>claimWithSig</Code>, taxa de claim 0%).
                  </p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    <li>Ganho em PvE (masmorras), PvP e eventos</li>
                    <li>Gasto em loja, forja, alquimia e mercado de itens</li>
                    <li>Teto de emissão: <strong className="text-white">20.000/dia por usuário</strong> (<Code>DUNGEON_DAILY_GOLD_CAP</Code>)</li>
                  </ul>
                </Card>
              </div>

              <h3 className="pt-2 text-lg font-semibold text-white">Fluxo do GOLD — três camadas</h3>
              <Card>
                <Formula>{`[1] Personagem (Character.gold)   ← masmorra, PvP, venda de item
        │  gasta na loja, forja, alquimia (sinks OFF-chain)
        ▼
[2] Banco da conta (User.goldBalance)   ← depósito voluntário
        │  claim assinado pelo servidor (EIP-712), 0% de taxa
        ▼
[3] GOLD on-chain (ERC-20)   ← mercado de itens P2P, loja on-chain
        └─ queima real: 2% de cada venda no mercado destrói supply`}</Formula>
                <p className="mt-2 text-xs">
                  Os sinks atacam o saldo <strong className="text-white">antes</strong> do claim: na prática só 20–40% do GOLD ganho
                  vira token. A saída (claim) não é taxada; a <em>circulação</em> é — a taxa vive no mercado, não na porta.
                </p>
              </Card>

              <h3 className="pt-2 text-lg font-semibold text-white">Alocação do DOL (1B, supply fixo)</h3>
              <Table
                head={['Bucket', '%', 'DOL', 'Vesting']}
                rows={[
                  [<strong key="p" className="text-white">Play &amp; Achieve</strong>, '30%', '300M', 'emissão de 25% do saldo restante/ano (ano 1: 75M, ano 2: 56M…)'],
                  [<strong key="t" className="text-white">Treasury / DAO</strong>, '20%', '200M', 'linear em 48 meses'],
                  [<strong key="e" className="text-white">Equipe</strong>, '15%', '150M', 'cliff 12 meses + linear 36 meses'],
                  [<strong key="i" className="text-white">Investidores</strong>, '12%', '120M', 'cliff 6 meses + linear 24 meses'],
                  [<strong key="l" className="text-white">Liquidez</strong>, '10%', '100M', '25% no TGE, resto conforme necessidade (LP com lock)'],
                  [<strong key="ec" className="text-white">Ecossistema</strong>, '8%', '80M', 'parcerias, grants e integrações'],
                  [<strong key="c" className="text-white">Comunidade</strong>, '5%', '50M', '40% no TGE (airdrops, eventos de lançamento)'],
                ]}
              />
              <p className="text-xs text-textsec">
                A emissão a jogadores decai 25% ao ano sobre o saldo restante do bucket — nunca zera de repente, nunca explode.
                Detalhe completo no <Code>docs/21-whitepaper</Code> do repositório.
              </p>

              <h3 className="pt-2 text-lg font-semibold text-white">Taxas & queimas</h3>
              <Table
                head={['Onde', 'Taxa', 'Destino', 'Status']}
                rows={[
                  ['Mercado de itens (GOLD)', '4%', '2% queima real + 2% treasury', <Live key="1" />],
                  ['Mercado de personagens (DOL)', '5%', '2,5% queima real + 2,5% treasury', <Live key="2" />],
                  ['Forja (craft de equipamento)', '30% do valor de catálogo (mín. 10)', 'sink off-chain', <Live key="3" />],
                  ['Alquimia (craft de poções)', '30% do valor (mín. 5)', 'sink off-chain', <Live key="4" />],
                  ['Venda de item à loja (NPC)', 'recompra a 60% do catálogo', 'sink off-chain (40%)', <Live key="5" />],
                  ['Claim de GOLD on-chain', '0% (só gas)', '—', <Live key="6" />],
                  ['Passes de temporada em DOL', '50% queimado', 'queima + treasury', <Soon key="7" />],
                  ['Coleções primárias (NFT)', '100% da venda primária', 'queima parcial + treasury', <Soon key="8" />],
                  ['Buyback trimestral', 'definido pela DAO', 'queima', <Soon key="9" />],
                ]}
              />
              <p className="text-xs text-textsec">
                As taxas dos dois mercados estão no contrato (<Code>burnFeeBps</Code>/<Code>treasuryFeeBps</Code>, teto rígido de 10%)
                e a queima é <strong className="text-white">destruição real de supply</strong> (<Code>burnFrom</Code>), não carteira morta.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <div className="flex items-center gap-2"><Soon /><h3 className="font-semibold text-white">Staking de DOL (veDOL)</h3></div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    <li>Locks de 3 a 24 meses — quanto mais longo, mais peso (veDOL)</li>
                    <li>Recompensa: 20% de cada epoch de emissão + 50% das taxas do treasury</li>
                    <li><strong className="text-white">Sem APY fixo prometido</strong> — o yield vem de receita real do jogo</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">Liquidez — postura oficial</h3>
                  <p className="mt-2 text-sm">
                    O par oficial com liquidez do projeto (e lock de LP) é <strong className="text-white">só do DOL</strong>.
                    O GOLD vale pelo que compra dentro do jogo: o projeto <strong className="text-white">não subsidia</strong> preço
                    externo de GOLD. Um par GOLD/DOL pode existir por arbitragem natural do mercado.
                  </p>
                </Card>
              </div>

              <h3 className="pt-2 text-lg font-semibold text-white">Roadmap econômico</h3>
              <Table
                head={['Etapa', 'O quê', 'Status']}
                rows={[
                  ['E0 — Fundação', 'GOLD off-chain com teto diário, sinks (loja/forja/alquimia), claim assinado', <Live key="0" />],
                  ['E1 — Contratos v2', 'DOL supply fixo 1B, taxas de mercado com queima real (deploy mainnet pendente)', <Tag key="1" tone="warn">🚧 CONTRATOS PRONTOS</Tag>],
                  ['E2 — TGE & liquidez', 'Distribuição do DOL, par oficial com LP lock, listagem', <Soon key="2" />],
                  ['E3 — Staking', 'veDOL, epochs, distribuição de taxas do treasury', <Soon key="3" />],
                  ['E4 — DAO', 'Governança sobre treasury, buyback e parâmetros econômicos', <Soon key="4" />],
                  ['E5 — Expansão', 'Guildas, terrenos, raids e seasons plugados nos mesmos sinks', <Soon key="5" />],
                ]}
              />

              <h3 className="pt-2 text-lg font-semibold text-white">Contratos on-chain</h3>
              <Table
                head={['Contrato', 'Padrão', 'Função']}
                rows={[
                  [<Code key="a">DolToken.sol</Code>, 'ERC-20', 'DOL — supply fixo 1B, sem mint, burnable'],
                  [<Code key="b">DolrathGold.sol</Code>, 'ERC-20', 'GOLD — claim por assinatura EIP-712, burnable'],
                  [<Code key="c">DolrathCharacters.sol</Code>, 'ERC-721', 'Personagens como NFT (mint pago + assinatura)'],
                  [<Code key="d">DolrathItems.sol</Code>, 'ERC-721', 'Itens como NFT (guarda GOLD pago no mint)'],
                  [<Code key="e">DolrathCharacterMarket.sol</Code>, 'Market', 'Escrow + venda por DOL · taxa 5% (2,5% burn / 2,5% treasury)'],
                  [<Code key="f">DolrathItemMarket.sol</Code>, 'Market', 'Escrow + venda por GOLD · taxa 4% (2% burn / 2% treasury)'],
                ]}
              />
              <p className="text-sm">Mints e claims exigem <strong className="text-white">assinatura do servidor</strong> (EIP-712) para impedir cunhagem arbitrária; os mercados usam <Code>nonReentrant</Code> e escrow do NFT.</p>

              <Card>
                <h3 className="font-semibold text-white">📊 Dashboard de tokenomics</h3>
                <p className="mt-2 text-sm">
                  Projeção determinística de 120 meses (3 cenários: pessimista/base/otimista) — circulação do DOL, emissão × queima,
                  staking, treasury, crescimento de jogadores e market cap por premissa de preço.
                </p>
                <a
                  href="/tokenomics/dashboard.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/15 px-4 py-2 text-sm font-semibold text-primary ring-1 ring-primary/40 hover:bg-primary/25"
                >
                  Abrir dashboard interativo →
                </a>
              </Card>
            </Section>

            {/* Raças */}
            <Section id="races" kicker="Personagem" title="Raças">
              <p>Quatro raças jogáveis. Draconiano e Metamorfo têm transformação; Humano e Elfo recebem buffs compensatórios.</p>
              <p className="text-xs text-textsec">
                <Tag tone="warn">⚠️ valores de exibição</Tag> Os números abaixo vêm de <Code>characterCreationData.ts</Code> (arquivo mais novo, mostrado na tela de criação — a <em>intenção rebalanceada</em>). Hoje o servidor ainda calcula os stats reais por <Code>gameData.ts</Code>; alinhar as duas fontes está no roadmap.
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
                      <div><dt className="inline font-semibold text-white">Base: </dt><dd className="inline font-game text-emerald-300">str {r.baseStats.str} · agi {r.baseStats.agi} · int {r.baseStats.int} · res {r.baseStats.res} · hp {r.baseStats.hp} · mp {r.baseStats.mp}</dd></div>
                      <div><dt className="inline font-semibold text-white">Bônus racial: </dt><dd className="inline">{bonusToString(r.bonusStats as any) || '—'}</dd></div>
                      <div><dt className="inline font-semibold text-white">Transformação: </dt><dd className="inline">{r.transformation ?? '—'}</dd></div>
                      <div><dt className="inline font-semibold text-white">Restrições: </dt><dd className="inline text-orange-300">{(r.restrictions && r.restrictions.length) ? r.restrictions.join(' · ') : 'Nenhuma'}</dd></div>
                    </dl>
                  </Card>
                ))}
              </div>
            </Section>

            {/* Classes */}
            <Section id="classes" kicker="Personagem" title="Classes">
              <p>A classe define bônus de atributo, armas permitidas e habilidades temáticas. <Tag>fonte: gameData.ts</Tag></p>
              <Table
                head={['Classe', 'Descrição', 'Bônus', 'Armas', 'Habilidades']}
                rows={CLASSES.map((c) => [
                  <span key={c.id} className="font-semibold text-white">{c.name}</span>,
                  c.description,
                  <span key="b" className="font-game text-emerald-300">{bonusToString(c.bonuses as any)}</span>,
                  c.availableWeapons.map((w) => WEAPON_PT[w] ?? w).join(', '),
                  c.abilities.join(' · '),
                ])}
              />
            </Section>

            {/* Atributos */}
            <Section id="attributes" kicker="Sistema" title="Atributos & Stats">
              <p>Atributos primários alimentam stats de combate derivados. Distribua pontos na criação e a cada nível.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">Atributos primários</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li><Code>STR</Code> força — dano físico, HP/STA</li>
                    <li><Code>AGI</Code> agilidade — crítico, velocidade, esquiva, MP</li>
                    <li><Code>INT</Code> inteligência — dano mágico, MP</li>
                    <li><Code>RES/DEF</Code> resistência — defesa, bloqueio e stamina</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">Stats derivados</h3>
                  <Formula>{`crit  = AGI × 0.2   (% de chance)
speed = AGI × 0.5

maxHP  = (100 + CON×2 + STR×1)   × Lm
maxMP  = (50  + INT×3 + AGI×0.5) × Lm
maxSTA = (80  + CON×2 + STR×0.5) × Lm

Lm (mult. de nível) = 1 + (nível-1) × 0.1`}</Formula>
                </Card>
              </div>
              <Card>
                <h3 className="font-semibold text-white">Distribuição de pontos</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  <li><strong className="text-white">Criação:</strong> {pointSystem.creation.availablePoints} pontos livres, máx. {pointSystem.creation.maxStatValue} por stat (1 ponto = 1 stat).</li>
                  <li><strong className="text-white">Level up:</strong> {pointSystem.leveling.pointsPerLevel} ponto por nível.</li>
                </ul>
              </Card>
            </Section>

            {/* Progressão */}
            <Section id="progression" kicker="Sistema" title="Progressão & XP">
              <p>Curva exponencial suave até o nível máximo 100. Subir de nível recalcula HP/MP/STA e concede pontos.</p>
              <Card><Formula>{`XP_para_próximo(nível) = baseXP × nível^exp + nível × mult
  baseXP = 100   exp = 1.4   mult = 50   maxLevel = 100`}</Formula></Card>
              <Table
                head={['Nível', 'XP p/ próximo']}
                rows={XP_SAMPLE.map((l) => [`${l} → ${l + 1}`, getXPForNextLevel(l).toLocaleString('pt-BR')])}
              />
              <p className="text-xs text-textsec">Valores calculados em tempo real por <Code>getXPForNextLevel()</Code> (experienceSystem.ts).</p>
            </Section>

            {/* Combate */}
            <Section id="combat" kicker="Mecânicas" title="Sistema de Combate">
              <p>Combate por rodadas: o atacante escolhe ação ofensiva e o defensor reage (esquivar ou bloquear). Tudo passa por rolagens de dado.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">Ações & dados</h3>
                  <Table head={['Ação', 'Dado', 'Dano base']} rows={[['Ataque leve', 'd6', '8'], ['Ataque pesado', 'd10', '12'], ['Ataque especial', 'd20', '20'], ['Esquivar', 'd12', '—'], ['Defender/Bloquear', 'd10', '—']]} />
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">Fórmula de dano</h3>
                  <Formula>{`dano = base + STR + (dado+mod) + bônus_arma

crítico: só quando rola o MÁXIMO do dado
         E passa no teste de chance (AGI×0.2%)
mult. crítico = 1.5 + (crit/100)`}</Formula>
                </Card>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card><h3 className="font-semibold text-white">Esquiva (SPEED)</h3><Formula>{`valor   = dado + speed_defensor
difícil = 10 + speed_atacante × 0.3
sucesso → dano = 0`}</Formula></Card>
                <Card><h3 className="font-semibold text-white">Bloqueio (RES)</h3><Formula>{`valor = dado + RES + bônus_escudo  (dif. 12)
bloqueio total  → dano × 0.2 (−80%)
bloqueio parcial→ redução = RES/100 (10%–80%)`}</Formula></Card>
              </div>
              <p className="text-xs text-textsec">Bônus de equipamento entram já escalados pelo nível de aprimoramento. Fonte: <Code>enhancedCombatSystem.ts</Code>.</p>
            </Section>

            {/* Transformações */}
            <Section id="transformations" kicker="Mecânicas" title="Transformações">
              <p>Habilidades limitadas que alteram stats temporariamente e liberam skills exclusivas. Custam MP + Stamina, com duração e cooldown em turnos. <Tag>fonte: transformationSystem.ts</Tag></p>
              <div className="grid gap-4 sm:grid-cols-2">
                {transformations.map(([key, t]) => (
                  <Card key={key}>
                    <div className="flex items-center justify-between"><h3 className="font-semibold text-white">{t.name}</h3><Tag>{TRANSF_RACE[key] ?? '—'}</Tag></div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Tag>⏱️ {t.duration} turnos</Tag>
                      <Tag>♻️ CD {t.cooldown}</Tag>
                      <Tag tone="warn">{t.cost.mp} MP · {t.cost.stamina} STA</Tag>
                    </div>
                    <p className="mt-3 text-xs"><span className="font-semibold text-white">Modificadores:</span> <span className="font-game text-emerald-300">{modsToString(t.statModifiers as any)}</span></p>
                    <p className="mt-2 text-xs"><span className="font-semibold text-white">Skills:</span> {t.specialAbilities.map((s) => s.name).join(' · ')}</p>
                    <p className="mt-2 text-xs"><span className="font-semibold text-emerald-300">Resiste:</span> {t.resistances.join(', ')} · <span className="font-semibold text-orange-300">Vulnerável:</span> {t.vulnerabilities.join(', ')}</p>
                  </Card>
                ))}
              </div>
            </Section>

            {/* PvP */}
            <Section id="pvp" kicker="Modos de jogo" title="PvP — Arena">
              <p>Batalhas jogador vs jogador em tempo real (socket). Recompensas garantem progressão diária e premiam skill, não farming.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card><h3 className="font-semibold text-white">🏆 Vitória</h3><p className="mt-1 text-sm">50 XP · 15 GOLD base (+50% bônus)</p></Card>
                <Card><h3 className="font-semibold text-white">😔 Derrota</h3><p className="mt-1 text-sm">25 XP · 8 GOLD (50% da vitória)</p></Card>
                <Card><h3 className="font-semibold text-white">💎 Participação</h3><p className="mt-1 text-sm">15 XP · 5 GOLD (fuga/desconexão)</p></Card>
              </div>
              <Card>
                <h3 className="font-semibold text-white">Escalonamento & bônus</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  <li>XP +10%/nível (máx. 5×) · GOLD +8%/nível</li>
                  <li>Diferença de nível: ±15%/nível · <strong className="text-white">Underdog</strong> +50% (vencer 5+ níveis acima)</li>
                  <li>Anti-farm: −30% ao vencer alguém 5+ níveis abaixo</li>
                  <li>Vitória perfeita (sem perder HP): +30% XP / +50% GOLD · Transformation kill: +20%</li>
                  <li>Combo de vitórias / 1ª do dia: <Todo /></li>
                </ul>
              </Card>
              <p className="text-xs text-textsec">Custo de stamina: básico {STAMINA_COSTS.pvp.basic} · ranqueado {STAMINA_COSTS.pvp.ranked} · torneio {STAMINA_COSTS.pvp.tournament}.</p>
            </Section>

            {/* PvE */}
            <Section id="pve" kicker="Modos de jogo" title="PvE & Masmorras">
              <p>Quatro masmorras temáticas. Você explora salas rolando um <strong className="text-white">d20</strong> por evento; ao fim, enfrenta o boss. Monstros e recompensas escalam com nível, sala e dificuldade. <Tag>fonte: dungeonAdventures.ts</Tag></p>
              <Table
                head={['Masmorra', 'Dificuldade', 'Salas', 'Boss']}
                rows={DUNGEON_LIST.map((d) => [
                  <span key={d.id} className="font-semibold text-white">{d.emoji} {d.name}</span>,
                  <span key="s">{'★'.repeat(d.difficultyStars)}<span className="text-white/20">{'★'.repeat(Math.max(0, 4 - d.difficultyStars))}</span> <span className="text-xs">(×{d.difficulty})</span></span>,
                  d.rooms,
                  `${d.boss.name} — ${d.boss.title}`,
                ])}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">Tabela de eventos (d20)</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li><span className="font-semibold text-white">☠️ Armadilha</span> — dano % do HP máximo</li>
                    <li><span className="font-semibold text-white">⚔️ Monstro</span> — batalha por turnos escalada</li>
                    <li><span className="font-semibold text-white">🍃 Nada</span> — ambientação, segue em frente</li>
                    <li><span className="font-semibold text-white">💰 Ouro</span> — ouro aleatório × nível</li>
                    <li><span className="font-semibold text-white">🧪 Item</span> — item temático sorteado</li>
                    <li><span className="font-semibold text-white">✨ Bênção</span> — restaura HP/MP/STA e/ou XP</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">Escalonamento de monstros</h3>
                  <Formula>{`Lf = 1 + (nível-1)×0.1 + (sala-1)×0.05
HP  = baseHP × dificuldade × Lf
ATK = baseATK × dif × (1+(nível-1)×0.08)
DEF = baseDEF × dif × (1+(nível-1)×0.06)
boss: +2 níveis, recompensa maior`}</Formula>
                </Card>
              </div>
              <Card>
                <div className="flex items-center gap-2"><Todo /><h3 className="font-semibold text-white">Aventuras semanais</h3></div>
                <p className="mt-2 text-sm">Modo de conteúdo semanal ainda a ser projetado (formato, recompensas e como o drop do catálogo de itens se conecta). O antigo sistema de masmorras (monstros rank F–S) foi removido.</p>
              </Card>
              <p className="text-xs text-textsec">Custo stamina: simples {STAMINA_COSTS.dungeon.simple} · normal {STAMINA_COSTS.dungeon.normal} · difícil {STAMINA_COSTS.dungeon.hard} · raid {STAMINA_COSTS.dungeon.raid}.</p>
            </Section>

            {/* Itens */}
            <Section id="items" kicker="Conteúdo" title="Itens">
              <p>O catálogo é a fonte única de itens, dividido por <strong className="text-white">como o item é obtido</strong>. A loja (NPC) vende o básico→intermediário para sustentar o early/mid-game; tudo <em>raro ou acima</em>, acessórios e os melhores consumíveis vêm de masmorras e aventuras. <Tag>fonte: itemCatalog.ts</Tag></p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">Tiers & origem</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    <li><Pill rarity="COMMON" /> e <Pill rarity="UNCOMMON" /> (<em>Superior</em>) → <strong className="text-white">🏪 Loja</strong></li>
                    <li><Pill rarity="RARE" /> → 🗝️ chão de masmorra</li>
                    <li><Pill rarity="EPIC" /> → 👑 chefe de masmorra (exclusivo)</li>
                    <li><Pill rarity="LEGENDARY" /> → 👑 chefe de masmorra ou 🗓️ aventura semanal</li>
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {RARITY_ORDER.map((rk) => <Tag key={rk}><Pill rarity={rk} /> peso {RARITY_DROP_WEIGHT[rk]}</Tag>)}
                  </div>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">Builds & restrição de raça</h3>
                  <p className="mt-2 text-sm">Cada tier da loja traz <strong className="text-white">4 variantes</strong> de potência parecida, mas distribuição de atributos diferente — o jogador escolhe pela build:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(BUILD_LABEL).map(([k, v]) => <Tag key={k}>{v}</Tag>)}
                  </div>
                  <p className="mt-3 text-sm">Equipamento por <strong className="text-white">CLASSE</strong> (via <Code>canClassEquip</Code>): <strong className="text-white">Guerreiro</strong> usa pesada/média + espada/machado/escudo; <strong className="text-white">Ladino</strong> leve/média + adaga/arco; <strong className="text-white">Mago</strong> leve + cajado/orbe; <strong className="text-white">Monge</strong> leve/média + manopla. A raça segue valendo para stats, transformações e itens lendários exclusivos. A loja filtra por raça+classe (<Code>getShopItems(race, class)</Code>).</p>
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
                          level={it.level} goldPrice={it.goldPrice} statsText={itemStatsToString(it.stats)}
                          meta={it.build ? BUILD_LABEL[it.build] : undefined}
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
                          level={it.level} goldPrice={it.goldPrice} statsText={itemStatsToString(it.stats)}
                          meta={<><span>{SOURCE_LABEL[it.source]}</span> · {dungeonAndRace(it)}</>}
                        />
                      ))}
                    </ItemGallery>
                  </div>
                )
              })}

              {/* 🗓️ Aventuras semanais — contexto dos chefes */}
              <h3 className="pt-4 text-lg font-semibold text-white">🗓️ Chefes das Aventuras Semanais</h3>
              <p className="text-sm">Um chefe único por sábado (rotação de 4 semanas), cada um com gear nomeado exclusivo (Lendário acima) — modelo Black Desert (Kzarka, Garmoth, Karanda…).</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {ADVENTURE_BOSSES.map((b) => {
                  const drops = ITEM_CATALOG.filter((i) => i.adventureBoss === b.name)
                  return (
                    <Card key={b.name}>
                      <div className="flex items-center gap-2"><span className="text-2xl">{b.emoji}</span><div><h4 className="font-semibold text-white">{b.name}</h4><p className="text-xs text-textsec">{b.title}</p></div></div>
                      <p className="mt-2 text-xs text-textsec">{b.theme} · {b.day} · Sábado</p>
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
              <h3 className="pt-4 text-lg font-semibold text-white">🧪 Consumíveis</h3>
              <p className="text-sm">Loja vende básicos e intermediários; masmorras e aventuras trazem versões aprimoradas e únicas.</p>
              {([
                { label: '🏪 Loja — básicos & intermediários', filter: (c: typeof CONSUMABLE_CATALOG[number]) => c.source === 'shop' },
                { label: '🗝️ Masmorras & Aventuras — aprimorados & únicos', filter: (c: typeof CONSUMABLE_CATALOG[number]) => c.source !== 'shop' },
              ]).map((group) => {
                const items = CONSUMABLE_CATALOG.filter(group.filter)
                return (
                  <div key={group.label} className="space-y-3">
                    <div className="pt-2 text-sm font-semibold text-white">{group.label} <span className="text-textsec">· {items.length}</span></div>
                    <ItemGallery>
                      {items.map((c) => (
                        <ItemArtCard
                          key={c.name} name={c.name} type="CONSUMABLE" rarity={c.rarity as RarityKey}
                          level={c.level} goldPrice={c.goldPrice} statsText={consumableEffectToString(c.stats)}
                          meta={c.adventureBoss ?? SOURCE_LABEL[c.source]}
                        />
                      ))}
                    </ItemGallery>
                  </div>
                )
              })}

              {/* ⚒️ Pedras de aprimoramento */}
              <h3 className="pt-4 text-lg font-semibold text-white">⚒️ Pedras de Aprimoramento</h3>
              <p className="text-sm">Obtidas em masmorras (luta com monstros / exploração) — não vendidas na loja. 10 pedras menores forjam 1 concentrada na Mesa de Forja. Detalhes do sistema na seção <a href="#enhancement" className="text-primary hover:underline">Aprimoramento</a>.</p>
              <ItemGallery>
                {ENHANCEMENT_STONES.map((s) => (
                  <ItemArtCard key={s.name} name={s.name} type="ENHANCEMENT_STONE" rarity={s.rarity} meta={`🗝️ Masmorra · ${s.use}`} />
                ))}
              </ItemGallery>
            </Section>

            {/* Aprimoramento */}
            <Section id="enhancement" kicker="Progressão de gear" title="Aprimoramento (estilo Black Desert)">
              <p>Equipamentos sobem de <Code>+0</Code> a <Code>+15</Code> e depois para os tiers romanos <Code>I (PRI)</Code> → <Code>V (PEN)</Code>. Falhas têm consequências e acumulam <em>failstacks</em>. <Tag>fonte: enhancementSystem.ts</Tag></p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">Regras por categoria</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    <li><strong className="text-white">Armas/Armaduras:</strong> +1 a +{SAFE_ENHANCE_MAX} garantido; daí em diante com risco. Falha em II–V <span className="text-orange-300">regride 1 nível</span>; antes disso só perde durabilidade.</li>
                    <li><strong className="text-white">Acessórios:</strong> pulam de base direto para PRI consumindo uma cópia; falha <span className="text-red-400">DESTRÓI</span> o acessório.</li>
                    <li><strong className="text-white">Failstacks:</strong> cada falha aumenta a chance da próxima; sucesso zera.</li>
                  </ul>
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">Chance & failstacks</h3>
                  <Formula>{`chance = base + (base/10) × FS
softcap 70% → acima disso cada FS vale base/50
hardcap rígido = 90%
até +${SAFE_ENHANCE_MAX}: chance = 100% (seguro)`}</Formula>
                  <p className="mt-2 text-xs">Materiais: Pedra Negra (arma/armadura) e versão Concentrada para PRI+. Acessórios usam cópia do próprio item.</p>
                </Card>
              </div>
              <Table
                head={['Alvo', 'Chance base (arma/armadura)', 'Acessório', 'Stats ×']}
                rows={ENHANCE_TARGETS.map((e) => [
                  e.label,
                  pct(getBaseChance('WEAPON', e.t)),
                  pct(getBaseChance('ACCESSORY', e.t)),
                  `×${getStatMultiplier(e.t).toFixed(2)}`,
                ])}
              />
            </Section>

            {/* Crafting */}
            <Section id="crafting" kicker="Economia" title="Processamento, Forja & Alquimia">
              <p>Forja, Alquimia, <strong className="text-white">Processamento</strong> e <strong className="text-white">Culinária</strong> são <strong className="text-white">profissões do jogador</strong> com nível e XP (o NPC ferreiro só vende e repara; a alquimista só vende). O nível é <strong className="text-white">da conta inteira</strong> (como a Fazenda: todo craft de qualquer herói soma). O pipeline é uma cadeia de produção: <strong className="text-white">matéria-prima crua</strong> (coleta/fazenda/masmorra) → <strong className="text-white">⚙️ Processamento</strong> (beneficia em barras, tecidos, extratos…) → <strong className="text-white">⚒️ Forja / ⚗️ Alquimia / 🍳 Culinária</strong> (peças incomuns, poções e pratos). Na Forja e na Alquimia cada craft rola uma <strong className="text-white">chance de sucesso</strong> pela raridade da receita + seu nível — <strong className="text-orange-300">a falha consome os materiais e a taxa</strong>, mas ainda dá XP reduzido. Receitas de raridade maior <strong className="text-white">destravam por nível</strong>: comum nv1, incomum nv5, rara nv12, épica nv20. <Tag tone="ok">fonte: craftingProfession.ts · processing.ts · forge.ts · alchemy.ts · cooking.ts</Tag></p>

              <Table
                head={['Raridade', 'Destrava', 'Chance base', 'Teto', 'XP (sucesso / falha)']}
                rows={(['COMMON', 'UNCOMMON', 'RARE', 'EPIC'] as const).map((r) => [
                  <Pill key="p" rarity={r} />,
                  <span key="l" className="text-white">nível {CRAFT_MIN_LEVEL[r]}</span>,
                  <span key="b">{Math.round(CRAFT_BASE_CHANCE[r] * 100)}% <span className="text-xs text-textsec">(+1%/nível)</span></span>,
                  <span key="t">{Math.round(Math.min(0.95, CRAFT_BASE_CHANCE[r] + 0.01 * (50 - CRAFT_MIN_LEVEL[r])) * 100)}%</span>,
                  <span key="x" className="text-amber-300">{CRAFT_XP[r]} / {Math.round(CRAFT_XP[r] * 0.4)} XP</span>,
                ])}
              />

              {/* ⚙️ Processamento (fonte: processing.ts) */}
              <h3 className="pt-2 text-lg font-semibold text-white">⚙️ Processamento (Bancada de Beneficiamento)</h3>
              <p className="text-sm">
                Beneficia matéria-prima crua em <strong className="text-white">insumos processados</strong> — é o elo entre a coleta/fazenda e as outras bancadas. Como o refino de pedra, <strong className="text-white">nunca falha</strong> (é conversão, não fabricação): cada receita tem <strong className="text-white">XP fixo</strong>, ratio padrão <strong className="text-white">2 crus → 1 processado</strong> e destrava pelo <strong className="text-white">nível de Processamento</strong> da receita. As receitas <Pill rarity="UNCOMMON" /> da Forja e as poções da Alquimia exigem esses insumos; a <strong className="text-white">Ração</strong> (moagem) e a <strong className="text-white">Bandagem de Linho</strong> (têxtil) também são feitas aqui. O <strong className="text-white">refino básico de pedra</strong> também: <strong className="text-white">10 Estilhaços → 1 Pedra Negra</strong> (Arma/Armadura).
              </p>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Insumos processados</h4>
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
                head={['Resultado', 'Bancada', 'Insumos', 'Nível', 'XP', 'Taxa']}
                rows={PROCESSING_RECIPES.map((r) => [
                  <span key={r.id} className={`font-semibold ${RARITY[r.rarity].text}`}>⚙️ {r.outputName}</span>,
                  <span key="g" className="text-xs">{PROCESSING_GROUP_LABEL[r.group]}</span>,
                  <span key="m" className="text-xs">{r.inputs.map((m) => `${m.quantity}× ${m.name}`).join(' · ')}</span>,
                  <span key="l" className="text-white">nv {r.minLevel}</span>,
                  <span key="x" className="text-amber-300">+{r.xp}</span>,
                  <span key="c" className="text-amber-300">{r.goldCost} 🪙</span>,
                ])}
              />

              {/* ⚒️ Forja (fonte: forge.ts) */}
              <h3 className="pt-4 text-lg font-semibold text-white">⚒️ Forja (Ferreiro)</h3>
              <p className="text-sm">
                Forja peças <Pill rarity="COMMON" /> / <Pill rarity="UNCOMMON" /> a partir de materiais: receita <strong className="text-white">comum usa matéria-prima crua</strong> (couro, Ferro Pesado, Seiva de Ent…) — o novato chega da coleta e já forja; receita <strong className="text-white">incomum exige o insumo PROCESSADO</strong> (Barra de Aço, Couro Curtido, Tecido de Linho + Barra de Ferro). O <strong className="text-white">Estilhaço de Pedra Negra</strong> liga toda receita de gear; o refino básico (<strong className="text-white">10 estilhaços → 1 Pedra Negra</strong>) fica no Processamento, e na Forja resta o degrau concentrado: <strong className="text-white">10 Pedras → 1 Concentrada</strong> (conversão garantida; Concentrada pede Forja nv10). O <strong className="text-white">Estilhaço de Memória</strong> (só de chefe) repara peças raras, épicas e lendárias (+10 durabilidade cada).
              </p>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Materiais de forja</h4>
              <ItemGallery>
                {[...FORGE_MATERIAL_CATALOG]
                  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
                  .map((m) => (
                    <ItemArtCard
                      key={m.name} name={m.name} type="Material" rarity={m.rarity}
                      meta={m.source === 'dungeon_boss' ? '👑 Só chefe' : '🗝️ Masmorra'}
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
                  <span key="m" className="text-xs">{r.materials.map((m) => `${m.quantity}× ${m.name}`).join(' · ')}</span>,
                  <span key="c" className="text-amber-300">{r.goldCost} 🪙</span>,
                ])}
              />

              {/* ⚗️ Alquimia & Poções — livro de receitas (fonte: alchemy.ts) */}
              <h3 className="pt-4 text-lg font-semibold text-white">⚗️ Alquimia &amp; Poções</h3>
              <p className="text-sm">
                A alquimia é <strong className="text-white">só poções</strong>: elas são transmutadas no <strong className="text-white">Triângulo de Transmutação</strong> a partir de <strong className="text-white">extratos processados</strong> (Extrato Herbal, Essência de Mana, Extrato de Raiz — destilaria do Processamento) + ingredientes de coleta/masmorra.
                Cada tentativa consome os insumos da receita + uma <strong className="text-white">taxa em gold</strong> e rola a chance do seu nível de Alquimia.
                Ingredientes <Pill rarity="COMMON" /> / <Pill rarity="UNCOMMON" /> vêm da coleta e do chão de masmorra; <Pill rarity="RARE" /> / <Pill rarity="EPIC" /> só de <strong className="text-white">chefe</strong>. Pão, Ração e Bandagem saíram daqui: Ração/Bandagem são do Processamento e o Pão vai para a <strong className="text-white">Culinária</strong>.
                <Tag tone="ok"> fonte: alchemy.ts</Tag>
              </p>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Ingredientes</h4>
              <ItemGallery>
                {[...INGREDIENT_CATALOG]
                  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
                  .map((ing) => (
                    <ItemArtCard
                      key={ing.name} name={ing.name} type="Ingrediente" rarity={ing.rarity}
                      meta={ing.source === 'dungeon_boss' ? '👑 Chefe' : '🗝️ Chão de masmorra'}
                    />
                  ))}
              </ItemGallery>

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Receitas</h4>
              <Table
                head={['Poção', 'Raridade', 'Ingredientes', 'Taxa']}
                rows={[...POTION_RECIPES]
                  .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
                  .map((r) => [
                    <span key={r.id} className={`font-semibold ${RARITY[r.rarity].text}`}>🧪 {r.outputName}</span>,
                    <Pill key="r" rarity={r.rarity} />,
                    <span key="i" className="text-xs">
                      {r.ingredients.map((ing) => `${(getIngredientByName(ing.name) ?? getProcessedByName(ing.name))?.emoji ?? ''} ${ing.quantity}× ${ing.name}`).join(' · ')}
                    </span>,
                    <span key="c" className="text-amber-300">{r.goldCost} 🪙</span>,
                  ])}
              />

              {/* 🍳 Culinária (fonte: cooking.ts · foodBuff.ts) */}
              <h3 className="pt-4 text-lg font-semibold text-white">🍳 Culinária (Cozinha)</h3>
              <p className="text-sm">
                A quarta bancada do ecossistema: pratos que dão <strong className="text-white">bônus de atributo por tempo REAL</strong> (STR/AGI/INT/DEF por 15–30 minutos — mais fracos que poção de combate, porém duram o farm inteiro; o <strong className="text-white">Banquete</strong> dá +1 em tudo). Come-se pelo inventário: <strong className="text-white">um prato por vez</strong> (comer outro substitui) e o bônus entra direto nos atributos do combate da masmorra. Como o Processamento, cozinhar <strong className="text-white">nunca falha</strong> — XP fixo por receita, destravada pelo <strong className="text-white">nível de Culinária</strong> da conta. Os pratos usam a <strong className="text-white">Farinha</strong> da moagem, a <strong className="text-white">Ração</strong> e insumos da fazenda/coleta; o <strong className="text-white">Pão</strong> restaura 20 HP fora de combate. <Tag tone="ok">fonte: cooking.ts · foodBuff.ts</Tag>
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

              <h4 className="pt-2 text-sm font-semibold text-textsec uppercase tracking-wide">Receitas de culinária</h4>
              <Table
                head={['Prato', 'Estação', 'Insumos', 'Efeito ao comer', 'Nível', 'XP', 'Taxa']}
                rows={COOKING_RECIPES.map((r) => {
                  const food = FOOD_CATALOG.find((f) => f.name === r.outputName)
                  const fb = parseFoodBuffSpec(food?.stats)
                  const effect = fb
                    ? foodBuffSpecLabel(fb)
                    : `+${Number((food?.stats as any)?.healAmount) || 0} HP fora de combate`
                  return [
                    <span key={r.id} className={`font-semibold ${RARITY[r.rarity].text}`}>🍳 {r.outputName}</span>,
                    <span key="g" className="text-xs">{COOKING_GROUP_LABEL[r.group]}</span>,
                    <span key="m" className="text-xs">{r.inputs.map((m) => `${m.quantity}× ${m.name}`).join(' · ')}</span>,
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
              <p>Stamina limita atividades por dia (monetização ética, sem pay-to-win). <strong className="text-white">Regeneração passiva:</strong> após <strong className="text-white">15 minutos sem gastar stamina</strong>, ela volta <strong className="text-white">+2 a cada 15 segundos</strong> até encher. Qualquer gasto reinicia a espera de 15 min. O valor ainda será afinado com uma bateria de testes do gasto por atividade.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h3 className="font-semibold text-white">Custos por atividade</h3>
                  <Table
                    head={['Atividade', 'Custo']}
                    rows={[
                      ['PvP básico / ranqueado / torneio', `${STAMINA_COSTS.pvp.basic} / ${STAMINA_COSTS.pvp.ranked} / ${STAMINA_COSTS.pvp.tournament}`],
                      ['Masmorra simples → raid', `${STAMINA_COSTS.dungeon.simple} / ${STAMINA_COSTS.dungeon.normal} / ${STAMINA_COSTS.dungeon.hard} / ${STAMINA_COSTS.dungeon.raid}`],
                      ['Treino · Exploração', `${STAMINA_COSTS.activities.training} · ${STAMINA_COSTS.activities.exploration}`],
                      ['Crafting · Transformação', `${STAMINA_COSTS.activities.crafting} · ${STAMINA_COSTS.activities.transformation}`],
                    ]}
                  />
                </Card>
                <Card>
                  <h3 className="font-semibold text-white">Progressão por faixa</h3>
                  <Table
                    head={['Faixa', 'Base', 'Atividades/dia']}
                    rows={[
                      ['Novato (1–5)', STAMINA_PROGRESSION.beginner.baseStamina, STAMINA_PROGRESSION.beginner.activitiesPerDay],
                      ['Intermediário (6–15)', STAMINA_PROGRESSION.intermediate.baseStamina, STAMINA_PROGRESSION.intermediate.activitiesPerDay],
                      ['Veterano (16+)', STAMINA_PROGRESSION.veteran.baseStamina, STAMINA_PROGRESSION.veteran.activitiesPerDay],
                    ]}
                  />
                </Card>
              </div>
            </Section>

            {/* IA */}
            <Section id="ai" kicker="Sistema" title="IA & Geração de Imagens">
              <p>Uma IA narra o combate de forma cinematográfica, comenta rolagens e dá conselhos táticos. Hoje a narração usa respostas pré-escritas (fallback). <Tag>fonte: aiJudge.ts</Tag></p>
              <Card>
                <div className="flex items-center gap-2"><Todo /><h3 className="font-semibold text-white">Geração de imagens de personagem (Anthropic)</h3></div>
                <p className="mt-2 text-sm">
                  Próximo passo: migrar para uma <strong className="text-white">chave Anthropic própria</strong> e gerar imagens de personagem
                  no <strong className="text-white">mesmo estilo visual</strong>, adicionando apenas as características que o player escolher.
                  Requer melhorar o prompt para garantir consistência de estilo entre todos os personagens.
                </p>
              </Card>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>Narração de combate — épica, máx. 3 frases.</li>
                <li>Comentário de dados — reage a críticos, falhas e acertos altos.</li>
                <li>Conselho tático — analisa HP/MP/stamina e fraquezas do inimigo.</li>
              </ul>
            </Section>

            {/* Estrutura / Roadmap */}
            <Section id="structure" kicker="Para o time" title="Notas & Roadmap">
              <h3 className="text-lg font-semibold text-white">✅ Resolvido nesta rodada</h3>
              <Card>
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {RESOLVED.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </Card>
              <h3 className="pt-2 text-lg font-semibold text-white">🔜 Próximos passos / em estudo</h3>
              <div className="space-y-3">
                {ROADMAP.map((n) => (
                  <Card key={n.title}>
                    <div className="flex items-start gap-3">
                      <Todo />
                      <div><h4 className="font-semibold text-white">{n.title}</h4><p className="mt-1 text-sm">{n.body}</p></div>
                    </div>
                  </Card>
                ))}
              </div>
              <h3 className="pt-2 text-lg font-semibold text-white">ℹ️ Por design</h3>
              <Card>
                <p className="text-sm"><strong className="text-white">DOL vs GOLD:</strong> são dois tokens distintos de propósito — <Tag tone="dol">DOL</Tag> é a moeda premium (criação/personagens) e <Tag tone="gold">GOLD</Tag> é a moeda principal do jogo (loja/itens). Não é um bug.</p>
              </Card>
            </Section>

            <div className="border-t border-white/5 pt-8 text-center">
              <p className="text-sm text-textsec">
                Documentação gerada a partir do código-fonte de Dolrath.{' '}
                <Link href="/" className="text-primary hover:underline">Voltar à home</Link>
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}