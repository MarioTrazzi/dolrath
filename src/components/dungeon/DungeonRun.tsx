'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BattleScene, { BattleEvent, DiceResult, EquipmentMap, FighterView } from '@/components/battle/BattleScene'
import DungeonBackdrop from '@/components/dungeon/DungeonBackdrop'
import {
  buildTrailPoints,
  MapTrail,
  MapNode,
  PlayerToken,
  MapAmbient,
  NarrationDialog,
  DiceOverlay,
  NodeVisualState,
  RevealedNode,
} from '@/components/dungeon/DungeonMap'
import WalkScene, { type WalkMode, type WalkTrailMark } from '@/components/dungeon/WalkScene'
import {
  buildWalkPathPoints,
  walkSceneEnabled,
  DUNGEON_BATTLE_BG,
  DUNGEON_RUN_MAP_BG,
} from '@/lib/walkSceneAssets'
import {
  DungeonDef,
  DungeonEventDef,
  DungeonEventKind,
  NodeScaling,
  NodeLoot,
  LootDrop,
  ScaledMonster,
  scaleMonster,
  monsterImagePath,
} from '@/lib/dungeonAdventures'
import {
  TRANSFORMATION_CONFIG,
  getRaceTransformations,
  type TransformationType,
} from '@/lib/transformationSystem'
import {
  getFormSpecials,
  resolveSpecialHit,
  type SpecialDef,
} from '@/lib/transformationSpecials'
import {
  getSkillTree,
  getSkillTreeState,
  getSkillUnlocks,
  applyRankPatch,
} from '@/lib/skillTree'
import { applyEnhancementToStats } from '@/lib/enhancementSystem'
import { isBroken } from '@/lib/durability'
import { itemImagePath } from '@/lib/itemCatalog'
import { parseActiveFood, foodBuffAttrBonus, foodBuffLabel, foodBuffRemainingMin } from '@/lib/foodBuff'
import {
  computeLevers,
  transformLevers,
  deriveGearTier,
  normalizeCombatClass,
  classAttackName,
  resolveHit,
  resolveMonsterHit,
  monsterSpecialEffect,
  PVE_DIE,
  LUCK_LO,
  K50,
  MAX_LEVEL_REF,
  type Levers,
  type MonsterSpecialEffect,
} from '@/lib/combatModel'

// ============================================================
// DungeonRun — experiência completa de uma masmorra:
// exploração com d20 + eventos dinâmicos na tela, e combate
// turno a turno na arena nova (BattleScene + dados animados)
// ============================================================

export interface DungeonCharacter {
  id: string
  name: string
  level: number
  /** XP total acumulado do personagem (alimenta o contador de XP no topo da run). */
  experience?: number
  /** XP total exigido pelo próximo nível (do experienceSystem, via API de detalhe). */
  nextLevelExperience?: number
  race: string
  class: string
  avatar?: string | null
  /** Arte da forma transformada (gerada via gpt-image-1); substitui o avatar enquanto transformado */
  transformationImage?: string | null
  /** Metamorfo: mapa forma->imagem (escolhe a forma em combate) */
  transformationImages?: Record<string, string> | null
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  stamina: number
  maxStamina: number
  attack: number
  defense: number
  /** Poder mágico (AP), derivado de INT. Alimenta a Investida Arcana. */
  magicPower: number
  /** Atributos distribuídos (criação + nível) — alimentam o TILT do modelo enxuto. */
  str?: number
  agi?: number
  int?: number
  def?: number
  /** 🍳 Buff de comida ativo (Character.activeFood) — validado em lib/foodBuff.ts. */
  activeFood?: unknown
  equipment: any[]
  /** Forma FIXA travada na criação; null = Metamorfo (multi-forma, escolhe a forma na luta). */
  unlockedTransformation?: string | null
  /** 🌳 Árvore de habilidades comprada (lib/skillTree.ts). null = personagem legado (tudo liberado). */
  skillTree?: unknown
}

interface DungeonRunProps {
  dungeon: DungeonDef
  character: DungeonCharacter
  /** 🏆 Tier da masmorra escolhido (1..5). Default 1. Escala monstro + drops no servidor. */
  tier?: number
  onExit: (updates: { hp: number; mp: number; stamina: number; leveledUp?: boolean }) => void
  /** Re-run: o pai remonta a run do zero (mesma masmorra), preservando o piloto via initialAuto. */
  onRestart?: (updates: { hp: number; mp: number; stamina: number; level?: number; leveledUp?: boolean; auto: boolean }) => void
  /** Estado inicial do piloto automático (preservado entre re-runs). */
  initialAuto?: boolean
  /** Optional custom background image for battles (path relative to /public/) */
  backgroundImageUrl?: string
  /** Overlay opacity for custom background image (0-1, default 0.3) */
  backgroundImageOverlay?: number
}

type RunPhase = 'explore' | 'combat' | 'summary' | 'defeat'

type CombatStage =
  | 'initiative'
  | 'playerSelect'
  | 'playerRoll'
  | 'busy'

type AttackKind = 'basic' | 'weapon' | 'special'

// Combate NÃO gasta stamina (a stamina é o orçamento DIÁRIO de runs).
//
// ⚔️ MODELO ENXUTO (src/lib/combatModel.ts) é a fonte única da verdade — PvE e PvP
// usam o MESMO motor e os MESMOS 3 ataques (ATAQUE-POR-ARMA, docs/combate-ataque-por-arma.md):
//   dano = PODER × powerMult × SORTE(d12) × (1 − DR)
// O PODER vem dos levers (PROFILE da classe × escala nível+gear + TILT dos atributos);
// o ataque PRIMÁRIO é a ARMA (o poder da arma entra via gearTier). Mitigação proporcional
// (DR = armadura/(armadura+K)); esquiva usa a evasão do lever; bloqueio amplifica a
// armadura (×BLOCK_ARMOR_MULT). Todos rolam d12 (a sorte do modelo); diferem só no powerMult.
//  - basic (Golpe): golpe barato/seguro de todos (d6, sem MP).
//  - weapon (Ataque de Classe): o ataque de assinatura da CLASSE (d8, 8 MP). O nome aparece
//    por classe (Ataque Furtivo/Bola de Fogo/Golpe Triplo/Investida Pesada — ver classAttackName).
//  - special: SÓ p/ a IA dos monstros (burst d20). O jogador não usa mais este botão —
//    quando transformado, as HABILIDADES DE FORMA (transformationSpecials) cumprem esse papel.
// (powerMults espelham combatModel.ATTACKS: 0.72 / 1.0 / 1.5)
// DADO-COMO-PLUS (combatModel.resolveHit/resolveMonsterHit): o dado nunca disputa —
// só multiplica o dano (sorte) de quem rola. Esquiva é 100% uma %-de-stat, EXCETO que
// rolar o número MÁXIMO do dado garante o evento especial (crítico pro atacante,
// esquiva total pro defensor), independente de stat.
//   • jogador ataca: ELE rola (visível) — vira luck multiplicativo; o monstro esquiva
//     por % pura (monstro nunca rola).
//   • monstro ataca: ele NÃO rola (dano sai dos stats, com variação pequena sem dado);
//     o JOGADOR, defendendo, ainda "rola" (oculto, calculado) — número máximo = esquiva
//     total garantida, senão esquiva por %.
// Sem regen passivo no combate — o MP volta de consumíveis/espólios.
const ATTACKS: Record<
  AttackKind,
  { label: string; icon: string; powerMult: number; requiresTransform: boolean; mp: number }
> = {
  basic: { label: 'Golpe', icon: '👊', powerMult: 0.72, requiresTransform: false, mp: 0 },
  weapon: { label: 'Ataque de Classe', icon: '⚔️', powerMult: 1.0, requiresTransform: false, mp: 8 },
  special: { label: 'Especial', icon: '✨', powerMult: 1.5, requiresTransform: true, mp: 18 },
}

// Custo de stamina por TIPO de nó ao avançar na trilha (exploração).
const MINOR_STEP_COST = 4 // nó menor
const MAIN_STEP_COST = 8  // sala principal (encontro garantido)
const BOSS_STEP_COST = 6  // aproximar-se do covil

// Chance de encontrar monstro num nó MENOR (sala principal é sempre monstro).
const MINOR_MONSTER_CHANCE = 0.4

// Falas de transição do Mestre entre as salas (genéricas, tom de RPG)
const TRANSITIONS = [
  'Você respira fundo e segue trilha adentro.',
  'A vereda serpenteia entre raízes e sombras...',
  'Mais fundo na masmorra, o ar fica denso e frio.',
  'Galhos rangem acima; você avança com a lâmina à mão.',
  'A névoa se abre por um instante, revelando o caminho.',
]

// Dicas do rodapé — uma é sorteada no início da run e some após ~30s. Empurram o
// jogador pro loop de preparo (alquimista, ferreiro, aprimoramento) e relembram mecânicas.
const TIPS: { icon: string; text: string }[] = [
  { icon: '🧪', text: 'Não esqueça de passar na Alquimista e levar algumas poções para a aventura.' },
  { icon: '⚒️', text: 'Compre suas armaduras no Ferreiro e aprimore-as para buscar recompensas maiores nos bosses das masmorras.' },
  { icon: '⚡', text: 'A stamina se restaura sozinha: +2 a cada 15 min, após 15 min sem gastar.' },
  { icon: '🤖', text: 'Farm visual: ligue o Auto e deixe a aba aberta — o herói anda, coleta e luta sozinho.' },
  { icon: '✨', text: 'Salas principais (⚔️) têm monstro garantido e o melhor espólio — os bosses guardam os itens raros.' },
]

const MONSTER_ID = 'dungeon-monster'

// Atraso (ms) antes de animar um efeito de status (veneno/sangramento/atordoamento)
// que ocorre JUNTO com um golpe. Precisa ser maior que a investida+impacto mais longos
// (habilidades como Sopro/Cosmo chegam a ~1680ms) pra aura não engolir a animação do golpe.
const STATUS_FX_DELAY = 1700

interface ResolvedEvent {
  def: DungeonEventDef
  text: string
  effects: EffectChip[]
  monster?: ScaledMonster
  /** Pacote completo do encontro (1..3). monster = o primeiro (avatar do card). */
  monsters?: ScaledMonster[]
  /** d20 do nó (lootRoll do servidor): badge de sorte no card de vitória. */
  luckRoll?: number
}

interface Banner {
  key: number
  icon: string
  text: string
  /** Não some sozinho — precisa de clique pra fechar (avisos que o jogador pode perder, ex: piloto desligado). */
  sticky?: boolean
}

// Respostas das rotas servidor-autoritativas (/api/dungeon/run/*).
interface StepResponse {
  type: 'find' | 'monster' | 'boss'
  roll?: number
  monster?: ScaledMonster
  monsters?: ScaledMonster[]
  loot?: NodeLoot
  gold?: number
  cursor?: number
  stamina?: number
  pendingCombat?: boolean
  skippedDrops?: LootDrop[]
  error?: string
}
interface CombatGrant {
  gold: number
  killGold: number
  lootGold: number
  xp: number
  loot: NodeLoot
  skippedDrops?: LootDrop[]
  // d20 do nó (autoritativo do servidor) — dono da classe do loot creditado
  roll?: number
}
interface EquipmentWear {
  slot: string
  name: string
  durability: number
  maxDurability: number
  justBroke: boolean
}
interface CombatResponse {
  granted?: CombatGrant
  cleared?: boolean
  equipmentWear?: EquipmentWear[]
  finished?: boolean
  bossDefeated?: boolean
  retreated?: boolean
  defeated?: boolean
  leveledUp?: boolean
  newLevel?: number
  error?: string
  // status da run no corpo do 409 ("finished" = o clear do boss JÁ aterrissou
  // num request anterior — retry pós-sucesso conta como vitória, não como falha)
  status?: string
}

// Efeito de um consumível a partir dos stats do catálogo: restauração (hp/mp),
// cura de status, buffs temporários de combate e revive (auto ao cair).
function consumableEffect(stats: any): {
  hp: number; mp: number; cure: string | null
  atk: number; def: number; dodge: number; buffTurns: number
  revive: number
} {
  const s = stats || {}
  return {
    hp: Number(s.healAmount) || 0,
    mp: Number(s.manaAmount) || 0,
    cure: s.cure || null,
    atk: Number(s.attackBonus) || 0,
    def: Number(s.defenseBonus) || 0,
    dodge: Number(s.dodgeBonus) || 0,
    buffTurns: Number(s.duration) || 0,
    revive: Number(s.reviveHpPercent) || 0,
  }
}
function consumableIcon(stats: any): string {
  const e = consumableEffect(stats)
  if (e.revive) return '🪶'
  if (e.cure === 'poison') return '🧉'
  if (e.cure === 'bleed') return '🩹'
  if (e.atk) return '💪'
  if (e.def) return '🛡️'
  if (e.dodge) return '💨'
  if (e.hp && e.mp) return '💖'
  if (e.hp) return '❤️'
  if (e.mp) return '🔮'
  return '🧪'
}

interface DungeonConsumable {
  id: string
  name: string
  hp: number
  mp: number
  qty: number
  icon: string
  cure: string | null
  atk: number
  def: number
  dodge: number
  buffTurns: number
  revive: number
}

// Item coletado durante a run (guarda o nome para a arte real /items/<slug>.webp).
interface RunItem {
  name: string
  emoji: string
  label: string
}

// Chip de efeito exibido nos cards de evento/espólio: ou um número de stat (ouro/XP),
// ou um item — que renderiza o ÍCONE de jogo real (não o emoji-placeholder).
type EffectChip =
  | { kind: 'stat'; text: string }
  // highlight: drop de destaque (pedra de aprimoramento ou raridade RARE+) —
  // ganha moldura dourada + brilho no card de vitória, independente da raridade.
  | { kind: 'item'; name: string; emoji: string; label: string; rarity?: string; highlight?: boolean }

// Mesma linguagem visual de raridade usada na landing (DolrathLanding.tsx RARITY_FRAME),
// replicada aqui para os cards de loot da masmorra não terem que importar a landing inteira.
const LOOT_RARITY_RING: Record<string, { ring: string; glow: string; text: string }> = {
  COMMON:    { ring: 'border-zinc-400/50',    glow: 'rgba(161,161,170,0.35)', text: 'text-zinc-300' },
  UNCOMMON:  { ring: 'border-emerald-400/60', glow: 'rgba(52,211,153,0.45)',  text: 'text-emerald-300' },
  RARE:      { ring: 'border-sky-400/60',     glow: 'rgba(56,189,248,0.5)',   text: 'text-sky-300' },
  EPIC:      { ring: 'border-fuchsia-400/70', glow: 'rgba(232,121,249,0.55)', text: 'text-fuchsia-300' },
  LEGENDARY: { ring: 'border-amber-400/70',   glow: 'rgba(251,191,36,0.6)',   text: 'text-amber-300' },
}

// Miniatura do item: usa a arte /items/<slug>.webp e cai no emoji se a imagem falhar
// (mesmo padrão da forja/alquimia). Substitui os emojis-placeholder (📦/🧪/⚒️/...) dos drops.
function ItemThumb({ name, emoji, className = 'text-base' }: { name: string; emoji: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className={className}>{emoji}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={itemImagePath(name)}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-contain art-bright"
      referrerPolicy="no-referrer"
    />
  )
}

// Arte do monstro: imagem do DB (monster.image) → asset estático por nome
// (/monsters/<slug>.webp) → emoji se a arte 404. Mesmo padrão do ItemThumb,
// para os diálogos de encontro/boss mostrarem a arte real em vez do emoji.
function MonsterThumb({ name, image, emoji, className = 'text-6xl' }: { name: string; image?: string | null; emoji: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = image ?? monsterImagePath(name)
  if (failed) return <span className={className}>{emoji}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-contain art-bright"
      referrerPolicy="no-referrer"
    />
  )
}

// Lista de chips de efeito: itens ganham tiles grandes com arte real + moldura de
// raridade (mesma linguagem da landing); ouro/XP continuam como pílulas pequenas.
function EffectChipList({ effects }: { effects: EffectChip[] }) {
  if (effects.length === 0) return null
  const items = effects.filter((fx): fx is Extract<EffectChip, { kind: 'item' }> => fx.kind === 'item')
  const stats = effects.filter((fx): fx is Extract<EffectChip, { kind: 'stat' }> => fx.kind === 'stat')
  return (
    <div className="mb-5">
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          {items.map((fx, i) => {
            // Drop de destaque (pedra/RARE+) usa a moldura LENDÁRIA (dourada) com
            // brilho reforçado — o nat 20 precisa ser um momento.
            const frame = fx.highlight
              ? LOOT_RARITY_RING.LEGENDARY
              : LOOT_RARITY_RING[fx.rarity ?? 'COMMON'] ?? LOOT_RARITY_RING.COMMON
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.12, type: 'spring', stiffness: 300, damping: 18 }}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 ${fx.highlight ? 'bg-amber-400/10' : 'bg-white/5'} ${frame.ring}`}
                style={{ boxShadow: fx.highlight ? `0 0 22px ${frame.glow}, 0 0 8px ${frame.glow}` : `0 0 14px ${frame.glow}` }}
              >
                <span className="w-11 h-11 inline-flex items-center justify-center shrink-0 rounded-lg bg-black/20 text-2xl">
                  <ItemThumb name={fx.name} emoji={fx.emoji} className="text-2xl" />
                </span>
                <span className={`text-xs font-bold font-combat leading-tight text-left ${frame.text}`}>
                  {fx.label}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
      {stats.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {stats.map((fx, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.2 + (items.length + i) * 0.12, type: 'spring', stiffness: 300, damping: 18 }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-bold font-combat bg-white/10 border-white/20 text-white"
            >
              {fx.text}
            </motion.span>
          ))}
        </div>
      )}
    </div>
  )
}

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides)
}

function mkResult(sides: number, modifier: number): DiceResult {
  const r = rollDie(sides)
  return { sides, roll: r, modifier, total: r + modifier }
}

// Mapeia o array de CharacterEquipment (Prisma) para o formato da arena
function mapEquipment(equipArray: any[]): EquipmentMap {
  const map: EquipmentMap = {}
  for (const eq of equipArray || []) {
    if (eq?.slot && eq?.item) {
      map[eq.slot] = {
        id: eq.item.id,
        name: eq.item.name,
        image: eq.item.image,
        type: eq.item.type,
        stats: eq.item.stats || {},
        enhancementLevel: eq.enhancementLevel || 0,
      }
    }
  }
  return map
}

// Stats efetivos de uma peça de equipamento JÁ com o aprimoramento aplicado.
// (Antes o combate ignorava enhancementLevel e procurava chaves attack/defense
//  inexistentes — então armadura e aprimoramento valiam zero na masmorra.)
function enhancedStats(eq: any): Record<string, number> {
  const raw = eq?.item?.stats || {}
  const level = Number(eq?.enhancementLevel) || 0
  return applyEnhancementToStats(raw, level) as Record<string, number>
}

const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0)

// Poder agregado do equipamento (com aprimoramento) nas três dimensões usadas
// pelo combate da masmorra.
function equipmentPower(equipArray: any[]): { attack: number; defense: number; hp: number } {
  let attack = 0
  let defense = 0
  let hp = 0
  for (const eq of equipArray || []) {
    // Peça QUEBRADA (durabilidade 0) não contribui com nada até ser reparada.
    if (isBroken(eq)) continue
    const s = enhancedStats(eq)
    // ataque: melhor atributo ofensivo da peça (gear dá atributos REAIS — STR/AGI/INT)
    attack += Math.max(num(s.str), num(s.agi), num(s.int))
    // defesa: DEF da peça (+ resistência/constituição, se houver)
    defense += num(s.def) + Math.floor((num(s.res) + num(s.con)) / 2)
    // vida extra das peças
    hp += num(s.hp)
  }
  // HP é um pool inteiro (o aprimoramento fracionado tornava effMaxHp/hp decimais na barra).
  return { attack, defense, hp: Math.round(hp) }
}

interface Outcome {
  hit: boolean
  damage: number
  crit: boolean
  /** dado exibível (estilo RiPG) para o log de combate */
  sides: number
  atkRoll: number
  defRoll: number
}

// Jogador ataca o monstro: ELE rola (vira luck multiplicativo — combatModel.resolveHit,
// igual ao PvP). O monstro esquiva por % PURA (nunca rola nada) — exceto que o jogador
// rolar o número máximo do dado garante crítico, independente de stat (luckOf já cobre
// isso). `ignoreEvade` força o acerto (Visão Aguçada fura a esquiva do monstro).
function computePlayerOutcome(
  atkRoll: number,
  sides: number,
  power: number,
  monster: { armor: number; K: number; evade: number },
  ignoreEvade: boolean,
): Outcome {
  const r = resolveHit({ power }, monster, {
    defense: 'dodge', forcedRoll: atkRoll, sides,
    dodgeSucceeded: ignoreEvade ? false : undefined,
  })
  return { hit: !r.dodged, damage: r.damage, crit: r.crit, sides, atkRoll: r.roll, defRoll: 0 }
}

// Monstro ataca o jogador: ele NÃO rola — dano sai dos stats dele, com uma variação
// pequena sem dado (combatModel.resolveMonsterHit). O JOGADOR, defendendo, ainda "rola"
// (oculto/calculado): número máximo do dado dele = esquiva total GARANTIDA, senão
// esquiva por % pura — sem disputa de margem nenhuma.
function computeMonsterOutcome(
  sides: number,
  power: number,
  player: { armor: number; K: number; evade: number },
  forcedDefRoll?: number,
): Outcome {
  const r = resolveMonsterHit({ power, sides, defender: player, forcedDefRoll })
  return { hit: !r.avoided, damage: r.damage, crit: false, sides, atkRoll: 0, defRoll: r.defRoll }
}

// A "defesa" (bloqueio) virou só LORE: mecanicamente todo mundo ESQUIVA (sem bloqueio nem
// stamina). O log às vezes narra a reação como "defesa", às vezes como "esquiva", só pra dar
// sabor — a matemática é sempre a da esquiva.
function defenseVerb(): string {
  return Math.random() < 0.3 ? 'defendeu' : 'esquivou'
}

export default function DungeonRun({ 
  dungeon, 
  character, 
  tier = 1, 
  onExit, 
  onRestart, 
  initialAuto,
  backgroundImageUrl,
  backgroundImageOverlay = 0.3,
}: DungeonRunProps) {
  // 🌳 Árvore de habilidades: computado ANTES dos pools de recurso (maxHpPct/maxMpPct
  // entram no teto inicial). `skillTree` null (legado) libera tudo nos valores BASE
  // (ver LEGACY_UNLOCKS em lib/skillTree.ts).
  const skillTreeDef = useMemo(
    () => getSkillTree(character.class, character.unlockedTransformation),
    [character.class, character.unlockedTransformation]
  )
  const unlocks = useMemo(
    () => getSkillUnlocks(getSkillTreeState(character.skillTree), skillTreeDef),
    [character.skillTree, skillTreeDef]
  )
  const effMaxMp = Math.round(character.maxMp * (1 + unlocks.passives.maxMpPct))

  // ---------- Recursos locais do personagem (durante a run) ----------
  // HP e MP começam cheios: a stamina diária é o que limita as tentativas.
  const [hp, setHp] = useState(() => character.maxHp + equipmentPower(character.equipment).hp)
  const [mp, setMp] = useState(effMaxMp)
  const [stamina, setStamina] = useState(character.stamina)
  const hpRef = useRef(hp)
  hpRef.current = hp
  // Nível VIVO da run: a prop `character` fica congelada no valor de quando a run
  // montou — um level up mid-run precisa atualizar este estado (não `character.level`)
  // para refletir no combate seguinte (levers, card de batalha, escala do monstro).
  const [charLevel, setCharLevel] = useState(character.level)
  useEffect(() => { setCharLevel(character.level) }, [character.id, character.level])

  // ⚔️ Equipamento VIVO da run: o servidor debita durabilidade a cada abate e
  // devolve `equipmentWear` — aplicamos aqui para que uma peça que QUEBRE no
  // meio da run pare de contribuir imediatamente (gear/gearTier recalculam).
  const [equipList, setEquipList] = useState<any[]>(() => character.equipment || [])
  // Avisos de "quase quebrando" só 1x por peça (senão spamma o log a cada abate).
  const wearWarnedRef = useRef<Set<string>>(new Set())

  // ---------- Estado geral da run ----------
  const [phase, setPhase] = useState<RunPhase>('explore')
  const [log, setLog] = useState<string[]>([dungeon.enterText])
  const [totals, setTotals] = useState({ gold: 0, xp: 0, kills: 0, items: [] as RunItem[] })
  const totalsRef = useRef(totals)
  totalsRef.current = totals
  // Subiu de nível em ALGUM combate desta run? (avisa a página /dungeon ao sair)
  const [leveledUpThisRun, setLeveledUpThisRun] = useState(false)
  // Flash brilhante de "subiu de nível" (overlay dourado por ~2.6s); guarda o nível novo.
  const [levelUpFlash, setLevelUpFlash] = useState<number | null>(null)

  // ---------- Mapa de exploração (trilha de nós) ----------
  // entrada → (nós menores + sala principal) × salas → covil do boss.
  // WalkScene: pan sobre mapa único; fallback SVG: zigzag clássico.
  const useWalkScene = walkSceneEnabled(dungeon.id)
  const trailPoints = useMemo(
    () =>
      useWalkScene
        ? buildWalkPathPoints(dungeon.rooms, dungeon.minorNodes)
        : buildTrailPoints(dungeon.rooms, dungeon.minorNodes),
    [dungeon.rooms, dungeon.minorNodes, useWalkScene]
  )
  const LAST = trailPoints.length - 1
  const [tokenIdx, setTokenIdx] = useState(0)
  const [moving, setMoving] = useState(false)
  /** Treadmill: idle → scroll (mundo rola) → approach (ícone vai no ?) → resolve. */
  const [walkMode, setWalkMode] = useState<WalkMode>('idle')
  const [walkTrailMarks, setWalkTrailMarks] = useState<WalkTrailMark[]>([])
  const walkBusy = walkMode === 'scroll' || walkMode === 'approach' || moving
  const walkStepLockRef = useRef(false)
  const [narration, setNarration] = useState(dungeon.enterText)
  // 📜 O Mestre narra virou dialog sob demanda (não mais uma faixa fixa sob o
  // mapa): abre nos "beats" da história e junto de cada rolagem do d20, fecha
  // sozinho depois de dar tempo de ler (typewriter ~24ms/char + folga).
  const [narrationOpen, setNarrationOpen] = useState(true)
  const narrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showNarration = (text?: string) => {
    const t = text ?? narration
    if (text !== undefined) setNarration(text)
    setNarrationOpen(true)
    if (narrationTimerRef.current) clearTimeout(narrationTimerRef.current)
    narrationTimerRef.current = setTimeout(() => setNarrationOpen(false), 1000 + t.length * 26)
  }
  useEffect(() => {
    showNarration()
    return () => { if (narrationTimerRef.current) clearTimeout(narrationTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Uma dica por run, some sozinha depois de ~30s. Avança em sequência entre runs
  // (índice no localStorage) pra não repetir a mesma toda vez que reentrar na masmorra.
  const [tipIdx] = useState(() => {
    try {
      const last = Number(localStorage.getItem('dgn_tip_idx'))
      const next = Number.isFinite(last) ? (last + 1) % TIPS.length : Math.floor(Math.random() * TIPS.length)
      localStorage.setItem('dgn_tip_idx', String(next))
      return next
    } catch {
      return Math.floor(Math.random() * TIPS.length)
    }
  })
  const [tipVisible, setTipVisible] = useState(true)
  const [nodeEvents, setNodeEvents] = useState<Record<number, RevealedNode>>({})
  const [floats, setFloats] = useState<{ id: number; label: string; color: string }[]>([])
  // Consumíveis do inventário do personagem (usáveis no mapa e no combate)
  const [consumables, setConsumables] = useState<DungeonConsumable[]>([])
  const [showItems, setShowItems] = useState(false)
  const atBoss = tokenIdx === LAST
  const nextIsBoss = tokenIdx === LAST - 1
  const nextMainNode = trailPoints[tokenIdx + 1]?.kind === 'main'
  // Progresso por SALA PRINCIPAL (os nós menores não contam como "sala").
  const curTier = trailPoints[tokenIdx]?.tier || 0
  const atMainNode = trailPoints[tokenIdx]?.kind === 'main'
  const mainsDone = trailPoints.reduce((n, p, i) => n + (p.kind === 'main' && i < tokenIdx ? 1 : 0), 0)
  // Escalonamento (tier/tipo de nó) a partir de um índice da trilha.
  const scalingAt = (idx: number): NodeScaling => {
    const pt = trailPoints[idx]
    return { tier: pt?.tier || 1, isMain: pt?.kind === 'main', isBoss: pt?.kind === 'boss' }
  }
  const stepCost = (idx: number): number => {
    const pt = trailPoints[idx]
    if (pt?.kind === 'boss') return BOSS_STEP_COST
    if (pt?.kind === 'main') return MAIN_STEP_COST
    return MINOR_STEP_COST
  }

  // ---------- Exploração ----------
  const [exploreRolling, setExploreRolling] = useState(false)
  const [exploreResult, setExploreResult] = useState<DiceResult | null>(null)
  const [eventCard, setEventCard] = useState<ResolvedEvent | null>(null)
  const [trapShake, setTrapShake] = useState(false)

  // ---------- Combate ----------
  // `monster` = o ALVO ATIVO (o bicho que está sendo duelado). `pack` = todos os
  // monstros VIVOS do encontro (1..3). O pacote é lutado como duelos 1v1 em
  // sequência: ao matar o ativo, troca-se para o mais fraco vivo. Os não-ativos
  // "fustigam" (chip leve) por rodada. Derrotar pelo menos um já creditou XP.
  const [monster, setMonster] = useState<ScaledMonster | null>(null)
  const monsterRef = useRef<ScaledMonster | null>(null)
  monsterRef.current = monster
  const [pack, setPack] = useState<ScaledMonster[]>([])
  const packRef = useRef<ScaledMonster[]>([])
  packRef.current = pack
  // Encontro começou como PACOTE (>1)? Mantém o render em cascata mesmo quando sobra
  // 1 monstro — evita trocar de "cascata" p/ "card solo" no meio (causava flicker de
  // tombar/levantar o sobrevivente ao remontar o card).
  const [isPack, setIsPack] = useState(false)
  // FASE INIMIGA (estilo FF/Chrono): na vez dos inimigos, TODOS atacam 1x cada, em
  // sequência. `attacker` = quem está atacando agora; a fila guarda os próximos.
  const [attacker, setAttacker] = useState<ScaledMonster | null>(null)
  const attackerRef = useRef<ScaledMonster | null>(null)
  attackerRef.current = attacker
  const enemyQueueRef = useRef<string[]>([])
  // Acumula XP e gold-de-abate de TODOS os monstros do encontro atual, p/ o card de
  // vitória mostrar o TOTAL do nó (não só o último abate). Reseta a cada startCombat.
  const encounterXpRef = useRef(0)
  const encounterKillGoldRef = useRef(0)
  // 💀 Drops exibidos antes do card do nó (hoje o servidor devolve TUDO no clear,
  // então fica vazio; mantido pro merge do card tolerar fluxos antigos).
  const encounterDropsRef = useRef<LootDrop[]>([])
  // 🎯 Ids dos monstros abatidos no PACOTE atual (protocolo por nó): abates no
  // meio do pacote não tocam a rede — quem credita tudo é a chamada única de
  // desfecho ('clear' no último abate, ou 'retreat'/'lose' com esta lista).
  const killedIdsRef = useRef<string[]>([])
  // 👑 true enquanto o card de espólio do BOSS está na tela: o dismiss (botão ou
  // auto-pilot) só então dispara finishRun(true) — o jogador vê o brilho do drop
  // raro antes do resumo/re-run automático assumirem a tela.
  const bossVictoryPendingRef = useRef(false)
  // Card em destaque na arena (frente + iluminado): o ALVO do jogador na sua vez,
  // ou o ATACANTE atual na vez dos inimigos.
  const [focusEnemyId, setFocusEnemyId] = useState<string | null>(null)
  const [stage, setStage] = useState<CombatStage>('busy')
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null)
  const [pendingAttack, setPendingAttack] = useState<AttackKind | null>(null)
  // Habilidade de DANO da forma à espera da rolagem (d20 visível, fluxo igual ao ataque).
  const [pendingAbility, setPendingAbility] = useState<SpecialDef | null>(null)
  const [panelResult, setPanelResult] = useState<DiceResult | null>(null)
  const [hasRolled, setHasRolled] = useState(false)
  const [diceResults, setDiceResults] = useState<Record<string, DiceResult | undefined>>({})
  const [battleEvent, setBattleEvent] = useState<BattleEvent | null>(null)
  const [combatEnded, setCombatEnded] = useState(false)
  const [winnerId, setWinnerId] = useState<string | null>(null)
  // RUN AUTOMÁTICA: um "piloto" toca a expedição inteira — anda na trilha, confirma
  // loot/eventos e joga os combates. Persiste até ser desligado.
  const [auto, setAuto] = useState(initialAuto ?? false)
  // Espelho síncrono do piloto p/ callbacks estáveis (showLoot, abertura da run).
  const autoRef = useRef(auto)
  autoRef.current = auto
  // O piloto pode usar poções de HP/MP automaticamente (switch; ligado por padrão).
  const [autoConsumables, setAutoConsumables] = useState(true)
  // Diálogo de confirmação ao sair: PAUSA a run (o piloto não age enquanto aberto).
  const [exitConfirm, setExitConfirm] = useState(false)
  const [lootCard, setLootCard] = useState<ResolvedEvent | null>(null)
  const battleEventCounter = useRef(0)
  // d20 de sorte do nó atual (define a qualidade do loot pós-combate)
  const lootRollRef = useRef(12)

  // ---------- Sessão SERVIDOR-AUTORITATIVA ----------
  // O servidor é dono do RNG e do crédito de gold/xp/loot. O cliente guarda só
  // o runId e o monstro que o servidor rolou para o nó atual (para o combate).
  const runIdRef = useRef<string | null>(null)
  const [runReady, setRunReady] = useState(false)
  // Herói já em uso em outra aba (lock vivo): bloqueia a run com um aviso.
  const [blocked, setBlocked] = useState<string | null>(null)
  // Só o BOSS usa estes refs (o encontro comum guarda o monstro no próprio
  // eventCard) — nunca escrever aqui fora do branch `data.type === 'boss'` em
  // advance(), senão o botão de lutar com o chefe pode pegar um monstro errado.
  const serverMonsterRef = useRef<ScaledMonster | null>(null)
  const serverPackRef = useRef<ScaledMonster[] | null>(null)
  const startedRef = useRef(false)

  // ---------- Transformação (local, por combate) ----------
  const transformForms = useMemo(() => getRaceTransformations(character.race), [character.race])
  const [transform, setTransform] = useState<{ type: TransformationType; turns: number } | null>(null)
  const [transformCd, setTransformCd] = useState(0)
  // 🐉 Transformação é 1× POR LUTA: trava após o primeiro uso até o próximo combate.
  const [transformedThisFight, setTransformedThisFight] = useState(false)
  const transformedThisFightRef = useRef(false)
  transformedThisFightRef.current = transformedThisFight
  const [showFormPicker, setShowFormPicker] = useState(false)
  // 🌳 Submenu "⚔️ Ataque": lista Golpe + Ataque de Classe (se desbloqueado) + specials
  // da forma (filtradas/patchadas pela árvore) — substitui a fileira fixa de botões.
  const [showAttackMenu, setShowAttackMenu] = useState(false)
  const transformRef = useRef(transform)
  transformRef.current = transform
  const transformCdRef = useRef(transformCd)
  transformCdRef.current = transformCd
  const activeTransformCfg = transform ? TRANSFORMATION_CONFIG[transform.type] : null

  // ---------- Efeitos das HABILIDADES de forma (DoT/buff/debuff/recarga) ----------
  type CombatFx = {
    dmgDealtMult: number; dmgDealtTurns: number   // dano CAUSADO pelo jogador
    dmgTakenMult: number; dmgTakenTurns: number    // dano RECEBIDO pelo jogador
    enemyDmgMult: number; enemyDmgTurns: number     // dano dos inimigos (debuff de rugido)
    evadeBuff: number; evadeBuffTurns: number
    ignoreEvadeNext: boolean; amplifyNext: number; counterNext: boolean
    cd: Record<string, number>
    // 🐍 Golpes secundários de MONSTRO contra o jogador (ver MONSTER_SPECIAL_EFFECTS).
    poisoned: boolean; poisonDmg: number       // permanente até usar Antídoto: -poisonDmg HP/turno (escala por masmorra)
    bleeding: boolean; bleedFrac: number        // permanente até usar Bandagem de Linho: % do HP máx/turno
    stunTurns: number                           // turnos do jogador perdidos (Raízes Rasteiras etc.)
  }
  const FX0: CombatFx = {
    dmgDealtMult: 1, dmgDealtTurns: 0, dmgTakenMult: 1, dmgTakenTurns: 0, enemyDmgMult: 1, enemyDmgTurns: 0,
    evadeBuff: 0, evadeBuffTurns: 0, ignoreEvadeNext: false, amplifyNext: 1, counterNext: false, cd: {},
    poisoned: false, poisonDmg: 0, bleeding: false, bleedFrac: 0, stunTurns: 0,
  }
  const [combatFx, setCombatFx] = useState<CombatFx>(FX0)
  const combatFxRef = useRef(combatFx); combatFxRef.current = combatFx
  // DoT/imobilização por MONSTRO (keyed por id)
  const monsterFxRef = useRef<Record<string, { dots: { dmg: number; turns: number; label: string }[]; immobilizeTurns: number }>>({})
  // 🐍 Golpe secundário do monstro telegrafado nesta rodada (resolveMonsterAttack consome e limpa).
  const pendingMonsterEffectRef = useRef<MonsterSpecialEffect | null>(null)

  // ---------- Banners centrais ----------
  const [banner, setBanner] = useState<Banner | null>(null)
  const bannerKey = useRef(0)

  // ---------- Timers ----------
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    timeouts.current.push(t)
  }, [])
  useEffect(() => () => { timeouts.current.forEach(clearTimeout) }, [])

  const pushLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-40), msg])
  }, [])

  // Número flutuante sobre o mapa (efeito de ganho/perda)
  const pushFloat = useCallback((label: string, color: string) => {
    const id = Math.random()
    setFloats(prev => [...prev, { id, label, color }])
    later(() => setFloats(prev => prev.filter(f => f.id !== id)), 1500)
  }, [later])

  const showBanner = useCallback((icon: string, text: string, duration = 2400, opts?: { sticky?: boolean }) => {
    bannerKey.current += 1
    const key = bannerKey.current
    setBanner({ key, icon, text, sticky: opts?.sticky })
    if (!opts?.sticky) {
      later(() => setBanner(prev => (prev?.key === key ? null : prev)), duration)
    }
  }, [later])

  const pushBattleEvent = useCallback((data: Omit<BattleEvent, 'id'>) => {
    battleEventCounter.current += 1
    setBattleEvent({ ...data, id: battleEventCounter.current })
  }, [])

  // Abre a sessão no servidor (uma vez). O servidor valida posse + gating e
  // passa a ser dono do RNG/recompensas. Sem runId, a exploração fica travada.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/dungeon/run/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: character.id, dungeonId: dungeon.id, tier }),
        })
        const data = await res.json()
        if (!res.ok) {
          // Herói já rodando em outra aba/janela: bloqueia com tela dedicada.
          if (data?.code === 'HERO_IN_USE') {
            setBlocked(data?.error || 'Este herói já está em uma masmorra em outra aba.')
            return
          }
          showBanner('🚫', data?.error || 'Não foi possível entrar na masmorra')
          return
        }
        runIdRef.current = data.runId
        if (typeof data.stamina === 'number') setStamina(data.stamina)
        setRunReady(true)
        // Inventário já cheio ao entrar: avisa que os drops não vão ser coletados.
        // No piloto (re-run automático) isso viraria stamina queimada sem farm — desliga.
        if (data.inventoryFull) {
          if (autoRef.current) {
            setAuto(false)
            later(() => showBanner('🎒', 'Inventário cheio — piloto desligado. Abra espaço para voltar a farmar.', 3600, { sticky: true }), 400)
          } else {
            later(() => showBanner('🎒', 'Seu inventário está cheio! Itens encontrados não serão coletados.', 3200), 400)
          }
        }
      } catch {
        showBanner('⚠️', 'Sem conexão com o servidor')
      }
    })()
  }, [character.id, dungeon.id, showBanner, later])

  // 💓 Heartbeat: mantém o lock vivo enquanto a run está aberta. Se o servidor
  // disser que a run não está mais ativa (assumida/encerrada noutro lugar), bloqueia.
  // Para assim que a run chega a uma fase terminal (derrota/resumo) — ela mesma
  // já encerrou a sessão no servidor, então "inativa" aqui não é "outra aba".
  useEffect(() => {
    if (!runReady || !runIdRef.current) return
    if (phase === 'defeat' || phase === 'summary') return
    let stop = false
    const beat = async () => {
      try {
        const res = await fetch('/api/dungeon/run/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: runIdRef.current }),
        })
        const data = await res.json().catch(() => null)
        if (!stop && data && data.active === false) {
          setBlocked('Esta run foi encerrada em outra aba ou janela.')
        }
      } catch { /* rede instável: tenta no próximo tick */ }
    }
    const id = setInterval(beat, 25000)
    return () => { stop = true; clearInterval(id) }
  }, [runReady, phase])

  // Esconde a dica do rodapé depois de ~30s (aparece uma vez no início da run).
  useEffect(() => {
    const id = setTimeout(() => setTipVisible(false), 30000)
    return () => clearTimeout(id)
  }, [])

  // Exibe (sem persistir) o espólio que o SERVIDOR já creditou: ouro + drops.
  // `skippedDrops` são itens que o servidor NÃO conseguiu colocar no inventário
  // (sem slot livre) — não entram nos totais, só avisam o jogador que sumiram.
  const showLoot = useCallback((loot: NodeLoot, skippedDrops?: LootDrop[], roll?: number) => {
    if (loot.gold > 0) {
      setTotals(prev => ({ ...prev, gold: prev.gold + loot.gold }))
      pushFloat(`+${loot.gold} 💰`, '#f39c12')
    }
    const skippedNames = new Set((skippedDrops ?? []).map(d => d.name))
    // Todo drop no log carrega o d20 que o gerou — o jogador aprende a "indexar"
    // qual número rende qual classe de espólio.
    const dicePrefix = roll != null ? `🎲 ${roll} · ` : ''
    for (const d of loot.drops) {
      const label = d.enhancement ? `${d.name} +${d.enhancement}` : d.name
      if (skippedNames.has(d.name)) {
        pushLog(`🚫 Inventário cheio — ${label} foi perdido!`)
        continue
      }
      setTotals(prev => ({ ...prev, items: [...prev.items, { name: d.name, emoji: d.emoji, label }] }))
      pushLog(`${dicePrefix}${d.emoji} ${label}`)
    }
    if (skippedDrops && skippedDrops.length > 0) {
      // Sem slot livre o farm vira queima de stamina — o piloto desliga sozinho.
      if (autoRef.current) {
        setAuto(false)
        showBanner('🎒', 'Inventário cheio — piloto desligado. Abra espaço para voltar a farmar.', 3600, { sticky: true })
      } else {
        showBanner('🎒', 'Inventário cheio! Alguns itens não foram coletados.')
      }
    }
  }, [pushFloat, pushLog, showBanner])

  // Carrega os consumíveis restauradores (HP/MP) do inventário do personagem.
  const loadConsumables = useCallback(async () => {
    try {
      const res = await fetch(`/api/store/inventory?characterId=${character.id}`)
      if (!res.ok) return
      const data = await res.json()
      const list: DungeonConsumable[] = (Array.isArray(data) ? data : [])
        // battleUsable:false = comida da Culinária (Pão cura FORA de combate;
        // o buff dos pratos entra pelos levers) — fica fora do cinto da run.
        .filter((row: any) => row?.item?.type === 'CONSUMABLE' && row.quantity > 0 && row?.item?.stats?.battleUsable !== false)
        .map((row: any) => {
          const e = consumableEffect(row.item.stats)
          return {
            id: row.item.id, name: row.item.name, hp: e.hp, mp: e.mp, qty: row.quantity,
            icon: consumableIcon(row.item.stats), cure: e.cure,
            atk: e.atk, def: e.def, dodge: e.dodge, buffTurns: e.buffTurns, revive: e.revive,
          }
        })
        .filter((c: DungeonConsumable) => c.hp > 0 || c.mp > 0 || !!c.cure || c.atk > 0 || c.def > 0 || c.dodge > 0 || c.revive > 0)
      setConsumables(list)
    } catch {
      /* silencioso */
    }
  }, [character.id])

  useEffect(() => { loadConsumables() }, [loadConsumables])

  // ---------- Levers de combate (MODELO ENXUTO) ----------
  // Gear conta via TIER (raridade × aprimoramento → escala de poder); atributos da
  // criação/nível via TILT; a transformação aplica o buff simétrico (×TRANSFORM_SCALE).
  const gear = useMemo(() => equipmentPower(equipList), [equipList])
  const gearTier = useMemo(
    () => deriveGearTier((equipList || []).filter((e: any) => !isBroken(e)).map((e: any) => ({
      rarity: e?.item?.rarity ?? e?.rarity,
      enhancementLevel: e?.enhancementLevel,
    }))),
    [equipList]
  )
  const combatClass = useMemo(() => normalizeCombatClass(character.class) ?? 'warrior', [character.class])
  // 🍳 Buff de comida (Culinária): bônus PLANO de atributo por tempo REAL, somado
  // aos pontos distribuídos antes do tilt — avaliado na entrada da run (expiração
  // lazy: prato vencido é ignorado pelo parseActiveFood).
  const foodBuff = useMemo(() => parseActiveFood(character.activeFood), [character.activeFood])
  const foodAttrs = useMemo(() => foodBuffAttrBonus(foodBuff), [foodBuff])
  const baseLevers = useMemo<Levers>(
    () => computeLevers(combatClass, charLevel, gearTier, {
      str: (character.str ?? 0) + foodAttrs.str,
      agi: (character.agi ?? 0) + foodAttrs.agi,
      int: (character.int ?? 0) + foodAttrs.int,
      def: (character.def ?? 0) + foodAttrs.def,
    }),
    [combatClass, charLevel, gearTier, character.str, character.agi, character.int, character.def, foodAttrs]
  )
  // Avisa no diário que o herói entrou "bem alimentado" (uma vez, na abertura da run).
  useEffect(() => {
    if (!runReady || !foodBuff) return
    pushLog(`🍽 Bem alimentado: ${foodBuffLabel(foodBuff)} (${foodBuff.name}, ~${foodBuffRemainingMin(foodBuff)} min restantes)`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runReady])
  // Transformação = buff simétrico por cima dos levers-base (×TRANSFORM_SCALE).
  const playerLevers = useMemo<Levers>(
    () => (transform ? transformLevers(baseLevers) : baseLevers),
    [transform, baseLevers]
  )
  // HP da run = pool do jogo (atributos via maxHp + vida das peças). É o recurso que o
  // jogador gerencia entre lutas; a OFENSA/DEFESA do combate vêm dos levers.
  // 🏆 Passiva de Vitalidade/Baluarte (maxHpPct) soma no teto — capstones da árvore.
  const effMaxHp = Math.round((character.maxHp + gear.hp) * (1 + unlocks.passives.maxHpPct))
  // Peça com HP que quebra mid-run derruba o teto — o HP atual acompanha.
  useEffect(() => { setHp((h) => Math.min(h, effMaxHp)) }, [effMaxHp])
  // Poder efetivo de um ataque = poder do lever × multiplicador do tipo.
  const playerPowerFor = (kind: AttackKind) => playerLevers.power * ATTACKS[kind].powerMult
  // Nome do ATAQUE DE CLASSE (o `weapon`, d8) por classe — Ataque Furtivo/Bola de Fogo/etc.
  const classAtkName = useMemo(() => classAttackName(character.class), [character.class])
  // Ataque de Classe efetivo (dado/custo já com os ranks II/III comprados).
  const effWeaponDie = unlocks.classAttackDie
  const effWeaponMp = unlocks.classAttackMp

  // ---------- Lutadores para a arena ----------
  const playerFighter: FighterView = useMemo(() => ({
    id: character.id,
    name: character.name,
    level: charLevel,
    race: character.race,
    class: character.class,
    avatar: character.avatar,
    hp,
    maxHp: effMaxHp,
    mp,
    maxMp: effMaxMp,
    stamina,
    maxStamina: character.maxStamina,
    equipmentMap: mapEquipment(equipList),
    isAlive: hp > 0,
    isTransformed: !!transform,
    transformationType: transform?.type ?? null,
    // Metamorfo: usa a arte da forma ativa; demais raças usam a única imagem.
    transformationImage:
      (transform && character.transformationImages?.[transform.type]) ||
      character.transformationImage ||
      null,
    // ATK = poder ofensivo, DEF = armadura (ambos do lever; deltas = ganho da transformação),
    // STR = atributo de força distribuído (não muda na transformação).
    combatStats: {
      ad: Math.round(playerLevers.power),
      ap: Math.round(playerLevers.armor),
      dp: Math.max(0, Math.round(character.str ?? 0)),
      adDelta: Math.round(playerLevers.power - baseLevers.power),
      apDelta: Math.round(playerLevers.armor - baseLevers.armor),
      dpDelta: 0,
    },
    combatStatLabels: { ad: 'ATK', ap: 'DEF', dp: 'STR' },
  }), [character, charLevel, hp, mp, stamina, transform, effMaxHp, effMaxMp, playerLevers, baseLevers, equipList])

  const monsterFighter: FighterView | null = useMemo(() => monster ? {
    id: monster.id,
    name: monster.name,
    level: monster.level,
    race: dungeon.name,
    class: monster.isBoss ? 'Boss' : 'Monstro',
    avatar: monster.image ?? null,
    avatarEmoji: monster.emoji,
    hp: monster.hp,
    maxHp: monster.maxHp,
    mp: 0,
    maxMp: 0,
    stamina: 0,
    maxStamina: 0,
    isAlive: monster.hp > 0,
    // Monstro não tem atributo STR: card mostra só ATK (ataque) e DEF (defesa).
    combatStats: {
      ad: Math.floor(monster.attack + monster.level / 2),
      ap: monster.defense,
      dp: undefined,
    },
    combatStatLabels: { ad: 'ATK', ap: 'DEF' },
  } : null, [monster, dungeon.name])

  // Cards do PACOTE (>1 inimigo) na arena (cascata sobreposta). Cada card mantém a
  // id REAL do monstro (identidade estável → só o morto tomba, sem reaproveitar o
  // card do ativo). HP vive no roster, então as barras ficam escondidas na arena.
  const packFighters: FighterView[] | undefined = useMemo(() => {
    if (!isPack || pack.length === 0) return undefined
    return pack.map(m => ({
      id: m.id,
      name: m.name,
      level: m.level,
      race: dungeon.name,
      class: m.isBoss ? 'Boss' : 'Monstro',
      avatar: m.image ?? null,
      avatarEmoji: m.emoji,
      hp: m.hp,
      maxHp: m.maxHp,
      mp: 0,
      maxMp: 0,
      stamina: 0,
      maxStamina: 0,
      isAlive: m.hp > 0,
      combatStats: { ad: Math.floor(m.attack + m.level / 2), ap: m.defense, dp: undefined },
      combatStatLabels: { ad: 'ATK', ap: 'DEF' },
    }))
  }, [pack, isPack, monster?.id, dungeon.name])

  // ============================================================
  // EXPLORAÇÃO — mapa de trilha de nós
  // ============================================================

  // Estado visual de cada nó do mapa
  const nodeState = (idx: number): NodeVisualState => {
    if (idx === tokenIdx) return 'current'
    if (idx < tokenIdx) return 'done'
    if (idx === tokenIdx + 1) return 'next'
    return 'locked'
  }

  // Monta o card do nó a partir do que o SERVIDOR resolveu (monstro já rolado,
  // ou achado já creditado). Nenhum RNG ou crédito acontece aqui no cliente.
  const applyServerEvent = (data: StepResponse, atIdx: number): ResolvedEvent => {
    const sc = scalingAt(atIdx)
    lootRollRef.current = data.roll ?? 12

    if (data.type === 'monster' && (data.monsters?.length || data.monster)) {
      const ev = dungeon.events.find(e => e.kind === 'monster')!
      const group = data.monsters?.length ? data.monsters : [data.monster!]
      const scaled = group[0]
      setNodeEvents(prev => ({ ...prev, [atIdx]: { kind: 'monster', emoji: scaled.emoji } }))
      const many = group.length > 1
      pushLog(
        many
          ? `${ev.icon} ${ev.title} ${group.length} inimigos aparecem!`
          : `${ev.icon} ${ev.title} ${scaled.emoji} ${scaled.name} apareceu!`
      )
      const effects: EffectChip[] = many
        ? group.map(m => ({ kind: 'stat', text: `${m.emoji} ${m.name} • Nv.${m.level}` }))
        : [{ kind: 'stat', text: `${scaled.emoji} ${scaled.name} • Nv.${scaled.level}` }]
      return {
        def: ev,
        text: many
          ? `Um grupo de ${group.length} criaturas cerca você — mais fracas, mas em bando.`
          : sc.isMain ? `Guardião da sala: ${ev.description}` : ev.description,
        effects,
        monster: scaled,
        monsters: group,
      }
    }

    // Achado — o servidor já creditou ouro/itens; aqui só exibimos.
    const loot: NodeLoot = data.loot ?? { gold: 0, drops: [] }

    // ⛲ Fonte revitalizadora: restaura HP e MP cheios (sem espólio neste nó).
    if (loot.fountain) {
      setHp(effMaxHp)
      setMp(character.maxMp)
      setNodeEvents(prev => ({ ...prev, [atIdx]: { kind: 'blessing', emoji: '⛲' } }))
      pushFloat('HP/MP cheios! ⛲', '#34d399')
      pushLog('⛲ Você encontra uma fonte revitalizadora — HP e MP restaurados!')
      const def: DungeonEventDef = {
        kind: 'blessing', min: 0, max: 0, icon: '⛲',
        title: 'Fonte Revitalizadora',
        description: 'Águas cristalinas brotam entre as pedras. Você bebe e recupera todas as forças — HP e MP restaurados por completo.',
      }
      return {
        def, text: def.description,
        effects: [{ kind: 'stat', text: '❤️ HP cheio' }, { kind: 'stat', text: '🔮 MP cheio' }],
      }
    }

    showLoot(loot, data.skippedDrops, data.roll)

    const hasGear = loot.drops.some(d => d.kind === 'item' || d.kind === 'stone')
    const anyDrop = loot.drops.length > 0 || loot.gold > 0
    const roll = data.roll ?? 12
    const tier = roll <= 5 ? 'low' : roll <= 13 ? 'mid' : 'high'
    const icon = hasGear ? '🌟' : anyDrop ? '✨' : '🍃'
    const title = hasGear ? 'Grande achado!' : anyDrop ? 'Um bom achado' : 'Nada de útil...'
    const text = !anyDrop
      ? dungeon.ambience[Math.floor(Math.random() * dungeon.ambience.length)]
      : tier === 'high'
        ? 'A sorte sorri: você vasculha e encontra algo valioso.'
        : tier === 'mid'
          ? 'Entre folhas e pedras, você recolhe o que dá.'
          : 'Pouca coisa — mas nada se perde.'
    const revealKind: DungeonEventKind = hasGear ? 'item' : anyDrop ? 'gold' : 'nothing'
    setNodeEvents(prev => ({ ...prev, [atIdx]: { kind: revealKind, emoji: icon } }))

    const effects: EffectChip[] = []
    if (loot.gold > 0) effects.push({ kind: 'stat', text: `+${loot.gold} 💰` })
    for (const d of loot.drops) effects.push({
      kind: 'item', name: d.name, emoji: d.emoji, label: d.name, rarity: d.rarity,
      highlight: d.kind === 'stone' || ['RARE', 'EPIC', 'LEGENDARY'].includes(String(d.rarity ?? '').toUpperCase()),
    })

    const def: DungeonEventDef = { kind: revealKind, min: 0, max: 0, icon, title, description: text }
    return { def, text, effects, luckRoll: roll }
  }

  // Botão principal: treadmill (scroll → approach → /step) ou path clássico.
  const finishWalkStep = useCallback(async (dest: number) => {
    if (walkStepLockRef.current) return
    walkStepLockRef.current = true
    if (!runIdRef.current) {
      setWalkMode('idle')
      setMoving(false)
      walkStepLockRef.current = false
      return
    }
    setExploreRolling(true)
    let data: StepResponse
    try {
      const res = await fetch('/api/dungeon/run/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current }),
      })
      data = await res.json()
      if (!res.ok) {
        setExploreRolling(false)
        setWalkMode('idle')
        setMoving(false)
        walkStepLockRef.current = false
        if (res.status === 400) showBanner('😮‍💨', `${data?.error || 'Stamina insuficiente'} — ela volta +2 a cada 15 min ocioso`)
        else showBanner('⚠️', data?.error || 'Falha ao avançar')
        return
      }
    } catch {
      setExploreRolling(false)
      setWalkMode('idle')
      setMoving(false)
      walkStepLockRef.current = false
      showBanner('⚠️', 'Sem conexão com o servidor')
      return
    }

    if (typeof data.stamina === 'number') setStamina(data.stamina)
    setTokenIdx(dest)
    setWalkMode('idle')
    setMoving(false)
    walkStepLockRef.current = false

    if (data.type === 'boss') {
      setExploreRolling(false)
      if (data.monster) serverMonsterRef.current = data.monster
      serverPackRef.current = data.monsters?.length ? data.monsters : data.monster ? [data.monster] : null
      showNarration('A trilha desemboca no covil. O ar treme... algo antigo se ergue.')
      pushLog(`👑 Você chegou ao covil de ${dungeon.boss.name}...`)
      later(() => showBanner('👑', `${dungeon.boss.name} desperta!`, 3000), 200)
      return
    }

    setExploreResult(null)
    const result: DiceResult = { sides: 20, roll: data.roll ?? 12, modifier: 0, total: data.roll ?? 12 }
    setExploreResult(result)
    later(() => {
      setExploreRolling(false)
      setExploreResult(null)
      const resolved = applyServerEvent(data, dest)
      const emoji = resolved.def.icon || (resolved.monster ? '⚔️' : '❔')
      setWalkTrailMarks(prev => {
        const aged = prev.map(m => ({ ...m, age: m.age + 1 })).filter(m => m.age < 5)
        return [{ id: dest, age: 0, emoji: typeof emoji === 'string' ? emoji : '❔' }, ...aged]
      })
      later(() => setEventCard(resolved), 80)
    }, 320)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeon.boss.name])

  const handleWalkApproachComplete = useCallback(() => {
    if (walkMode !== 'approach') return
    const dest = tokenIdx + 1
    finishWalkStep(dest)
  }, [walkMode, tokenIdx, finishWalkStep])

  const advance = async () => {
    if (phase !== 'explore' || exploreRolling || walkBusy || eventCard || lootCard || atBoss) return
    if (!runReady || !runIdRef.current) return
    const dest = tokenIdx + 1

    // --- Treadmill: mundo rola → ? → approach → /step ---
    if (useWalkScene) {
      setMoving(true)
      setWalkMode('scroll')
      showNarration()
      later(() => {
        setWalkMode('approach')
      }, 1500)
      return
    }

    setExploreRolling(true)
    showNarration()
    let data: StepResponse
    try {
      const res = await fetch('/api/dungeon/run/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current }),
      })
      data = await res.json()
      if (!res.ok) {
        setExploreRolling(false)
        if (res.status === 400) showBanner('😮‍💨', `${data?.error || 'Stamina insuficiente'} — ela volta +2 a cada 15 min ocioso`)
        else showBanner('⚠️', data?.error || 'Falha ao avançar')
        return
      }
    } catch {
      setExploreRolling(false)
      showBanner('⚠️', 'Sem conexão com o servidor')
      return
    }

    if (typeof data.stamina === 'number') setStamina(data.stamina)

    if (data.type === 'boss') {
      setExploreRolling(false)
      if (data.monster) serverMonsterRef.current = data.monster
      serverPackRef.current = data.monsters?.length ? data.monsters : data.monster ? [data.monster] : null
      setMoving(true)
      setTokenIdx(dest)
      showNarration('A trilha desemboca no covil. O ar treme... algo antigo se ergue.')
      pushLog(`👑 Você chegou ao covil de ${dungeon.boss.name}...`)
      later(() => setMoving(false), 900)
      later(() => showBanner('👑', `${dungeon.boss.name} desperta!`, 3000), 950)
      return
    }

    setExploreResult(null)
    const result: DiceResult = { sides: 20, roll: data.roll ?? 12, modifier: 0, total: data.roll ?? 12 }
    setExploreResult(result)
    later(() => {
      setExploreRolling(false)
      setExploreResult(null)
      setMoving(true)
      setTokenIdx(dest)
      const resolved = applyServerEvent(data, dest)
      later(() => setMoving(false), 425)
      later(() => setEventCard(resolved), 325)
    }, 375)
  }

  // Fecha o card de evento e o Mestre narra a transição.
  const dismissEvent = () => {
    setEventCard(null)
    setExploreResult(null)
    setExploreRolling(false)
    if (nextIsBoss) {
      showNarration('A trilha termina adiante. Você sente um olhar antigo cravado em você...')
    } else if (!atBoss) {
      showNarration(TRANSITIONS[tokenIdx % TRANSITIONS.length])
    }
  }

  const isBossRoom = atBoss

  // ============================================================
  // COMBATE (motor local na arena nova)
  // ============================================================

  // O mais fraco vivo (menor HP atual) — alvo padrão e foco do piloto automático.
  const weakestOf = (list: ScaledMonster[]): ScaledMonster | null =>
    list.filter(m => m.hp > 0).reduce<ScaledMonster | null>((best, m) => (!best || m.hp < best.hp ? m : best), null)

  // Inicia o combate contra um PACOTE (1..3). O alvo ativo começa no mais fraco
  // (também o foco do automático). Aceita um único monstro por conveniência (boss).
  const startCombat = (group: ScaledMonster[] | ScaledMonster) => {
    const list = (Array.isArray(group) ? group : [group]).filter(m => m.hp > 0)
    if (list.length === 0) return
    const active = weakestOf(list) ?? list[0]
    setPack(list)
    packRef.current = list
    setMonster(active)
    monsterRef.current = active
    setAttacker(null)
    attackerRef.current = null
    enemyQueueRef.current = []
    encounterXpRef.current = 0
    encounterKillGoldRef.current = 0
    encounterDropsRef.current = []
    killedIdsRef.current = []
    setFocusEnemyId(active.id)
    setIsPack(list.length > 1)
    setEventCard(null)
    setExploreResult(null)
    setExploreRolling(false)
    setMoving(false)
    setWalkMode('idle')
    setCombatEnded(false)
    setWinnerId(null)
    setDiceResults({})
    setPanelResult(null)
    setHasRolled(false)
    setPendingAttack(null)
    setCurrentTurnId(null)
    setBattleEvent(null)
    setLootCard(null)
    // Transformação reinicia a cada combate (e libera o uso único da luta)
    setTransform(null)
    setTransformCd(0)
    setTransformedThisFight(false)
    transformedThisFightRef.current = false
    setPendingAbility(null)
    setShowFormPicker(false)
    setPhase('combat')
    setStage('initiative')
    pushLog(
      list.length > 1
        ? `⚔️ Combate contra ${list.length} inimigos começou! (foco: ${active.emoji} ${active.name})`
        : `⚔️ Combate contra ${active.emoji} ${active.name} começou!`
    )
  }

  // Troca o alvo ativo (clique no roster / piloto). Só durante o turno do jogador.
  const setActiveTarget = (id: string) => {
    const next = packRef.current.find(m => m.id === id && m.hp > 0)
    if (!next || next.id === monsterRef.current?.id) return
    setMonster(next)
    monsterRef.current = next
    setFocusEnemyId(next.id)
    pushLog(`🎯 Você foca ${next.emoji} ${next.name}.`)
  }

  // ---------- Transformação (custa só MP; stamina é o orçamento diário) ----------
  const activateTransform = (type: TransformationType) => {
    const cfg = TRANSFORMATION_CONFIG[type]
    if (!cfg || transform) return
    if (transformedThisFightRef.current) {
      showBanner('🔒', 'Você já se transformou nesta luta!')
      return
    }
    if (mp < cfg.cost.mp) {
      showBanner('🔮', `MP insuficiente para transformar! (${cfg.cost.mp}🔮)`)
      return
    }
    setMp(prev => Math.max(0, prev - cfg.cost.mp))
    // 🏆 Coração de Dragão / capstone de assinatura (transformExtraTurns): +1 turno de forma.
    setTransform({ type, turns: cfg.duration + unlocks.passives.transformExtraTurns })
    setTransformedThisFight(true)
    transformedThisFightRef.current = true
    setShowFormPicker(false)
    // Explosão de energia na cor da forma sobre o card do jogador (a arena lê o
    // transformationType do FighterView, que já terá virado no próximo render).
    later(() => pushBattleEvent({ kind: 'transform', actorId: character.id }), 50)
    showBanner('✨', `${cfg.name} ativada! (${cfg.duration} turnos)`, 2800)
    pushLog(`✨ Você assumiu a ${cfg.name}!`)
  }

  // Avança os contadores de transformação ao fim de cada turno ofensivo do jogador
  const tickPlayerTurn = useCallback(() => {
    const t = transformRef.current
    if (t) {
      const remaining = t.turns - 1
      if (remaining <= 0) {
        const cfg = TRANSFORMATION_CONFIG[t.type]
        setTransform(null)
        setTransformCd(cfg.cooldown)
        showBanner('↩️', 'A transformação terminou')
        pushLog('↩️ Sua transformação terminou.')
      } else {
        setTransform({ ...t, turns: remaining })
      }
    } else if (transformCdRef.current > 0) {
      setTransformCd(transformCdRef.current - 1)
    }
    // ☠️ Poison (permanente, flat do golpe que envenenou) + sangramento (% do HP máx) do jogador.
    // Piso de 1 HP — o veneno não mata sozinho, igual ao DoT que o jogador aplica nos monstros.
    const pfx = combatFxRef.current
    let dot = 0
    const dotLabels: string[] = []
    if (pfx.poisoned) { dot += pfx.poisonDmg || 4; dotLabels.push('veneno') }
    if (pfx.bleeding) { dot += Math.max(1, Math.round(effMaxHp * pfx.bleedFrac)); dotLabels.push('sangramento') }
    if (dot > 0) {
      // Estimativa só para o texto/log — a atualização REAL de baixo é relativa
      // de propósito: se um item (ex. Elixir Supremo) curou HP no mesmo turno,
      // antes desta chamada, um `setHp(valorAbsoluto)` aqui apagaria a cura (as
      // duas ficam no mesmo lote do React, sem re-render entre elas pra atualizar
      // hpRef). Com `setHp(prev => ...)` a cura e o DoT compõem corretamente.
      const nh = Math.max(1, hpRef.current - dot)
      const lost = hpRef.current - nh
      if (lost > 0) {
        pushFloat(`-${lost} ☠️`, '#7c3aed')
        pushLog(`☠️ Você sofre ${lost} de dano contínuo (${dotLabels.join(' + ')})`)
        setHp(prev => Math.max(1, prev - dot))
        // Anima o card a cada tique do DoT (veneno/sangramento) — antes o dano
        // acontecia sem nenhum efeito visível. Prioriza o veneno quando os dois
        // estão ativos (só cabe uma aura por vez no slot de battleEvent).
        // Atrasado pro FINAL do turno (STATUS_FX_DELAY): tickPlayerTurn() roda LOGO
        // depois do pushBattleEvent('resolve') do golpe do jogador — a aura de status
        // é grande e dura até 1500ms, então precisa esperar o golpe (investida+impacto,
        // até ~1400ms nas habilidades mais longas) terminar de vez antes de aparecer,
        // senão ela visualmente engole a animação do golpe (bug reportado 2026-07-13).
        later(() => pushBattleEvent({ kind: 'status', actorId: character.id, action: pfx.poisoned ? 'poison' : 'bleed' }), STATUS_FX_DELAY)
      }
    }
    // expira buffs/debuffs do jogador e reduz recarga das habilidades
    setCombatFx(prev => {
      const n: CombatFx = { ...prev, cd: { ...prev.cd } }
      if (n.dmgDealtTurns > 0 && --n.dmgDealtTurns <= 0) n.dmgDealtMult = 1
      if (n.dmgTakenTurns > 0 && --n.dmgTakenTurns <= 0) n.dmgTakenMult = 1
      if (n.enemyDmgTurns > 0 && --n.enemyDmgTurns <= 0) n.enemyDmgMult = 1
      if (n.evadeBuffTurns > 0 && --n.evadeBuffTurns <= 0) n.evadeBuff = 0
      // Sangramento NÃO expira sozinho — permanente igual o veneno, só sai com Bandagem de Linho.
      for (const k in n.cd) if (n.cd[k] > 0) n.cd[k]--
      return n
    })
  }, [showBanner, pushLog, pushFloat, effMaxHp, pushBattleEvent, character.id, later])

  // Levers do MONSTRO (classe desconhecida → fallback): poder/armadura dos stats
  // escalados, K pelo nível. Espelha o derive do socket-server e o dungeon-sim.
  const monsterLevers = (m: ScaledMonster): Levers => {
    const S = m.level / MAX_LEVEL_REF + 0.5 // K pela escala do NÍVEL (= sim/socket)
    return { power: m.attack, armor: m.defense, hp: m.maxHp, evade: m.evade, K: K50 * S, scale: m.scale ?? S }
  }
  // Poder efetivo do golpe do monstro = poder do lever × multiplicador do tipo.
  const monsterPowerFor = (m: ScaledMonster, kind: AttackKind) => monsterLevers(m).power * ATTACKS[kind].powerMult

  // ---------- Iniciativa ----------
  // Os 2 dados rolam JUNTOS (dual, no centro sob o "VS") — sem esperar um pelo
  // outro. O giro mínimo do dado (1100ms) já dá tempo de sobra pra animação.
  const handleInitiativeRoll = () => {
    if (hasRolled) return
    setHasRolled(true)
    const mine = mkResult(20, 0)
    const theirs = mkResult(20, 0)
    setPanelResult(mine)
    setDiceResults(prev => ({ ...prev, [monsterRef.current?.id ?? MONSTER_ID]: theirs }))
    later(() => {
      setStage('busy')
      setPanelResult(null)
      setHasRolled(false)
      const playerFirst = mine.total >= theirs.total
      showBanner(playerFirst ? '⚡' : '😈', playerFirst ? 'Você começa!' : `${monsterRef.current?.name} começa!`)
      // Limpa JUNTO com a troca de stage — senão o resultado do adversário fica
      // "solto" (mini-dado) em cima do card dele até este later separado disparar.
      setDiceResults({})
      later(() => {
        if (playerFirst) {
          setCurrentTurnId(character.id)
          setStage('playerSelect')
        } else {
          startEnemyPhase()
        }
      }, 600)
    }, 1700) // dado crava aos 1100ms (MIN_SPIN_MS); folga de ~600ms pra dar pra ver o resultado
  }

  // A iniciativa rola sozinha assim que o combate começa — sem clique, os 2 dados já
  // giram juntos no centro (igual ao PvP). Independe do piloto automático (`auto`).
  useEffect(() => {
    if (phase === 'combat' && stage === 'initiative' && !hasRolled) handleInitiativeRoll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage, hasRolled])

  // ---------- Turno do jogador (Especial exige transformação, igual ao PvP) ----------
  const choosePlayerAttack = (kind: AttackKind) => {
    if (ATTACKS[kind].requiresTransform && !transform) {
      showBanner('🔒', 'O Especial só pode ser usado transformado!')
      return
    }
    if (kind === 'weapon' && !unlocks.classAttack) {
      // No automático: nunca trava o turno — cai pro Golpe grátis.
      if (auto) {
        choosePlayerAttack('basic')
        return
      }
      showBanner('🔒', 'Aprenda o Ataque de Classe na árvore de habilidades!')
      return
    }
    const atkMp = kind === 'weapon' ? effWeaponMp : ATTACKS[kind].mp
    if (mp < atkMp) {
      showBanner('🔵', `MP insuficiente para ${ATTACKS[kind].label}! (${atkMp}🔵)`)
      return
    }
    setPendingAttack(kind)
    setPanelResult(null)
    setHasRolled(false)
    setStage('playerRoll')
  }

  const handlePlayerAttackRoll = () => {
    const m = monsterRef.current
    if (!m || hasRolled || !pendingAttack) return
    setHasRolled(true)
    // SÓ O JOGADOR ROLA: o dado visível vira um multiplicador de sorte no dano (sem
    // disputa nenhuma — o monstro esquiva por % pura, nunca rola).
    const sides = pendingAttack === 'weapon' ? effWeaponDie : PVE_DIE[pendingAttack]
    const atk = mkResult(sides, 0)
    setPanelResult(atk)
    later(() => resolvePlayerAttack(atk), 1700)
  }

  const resolvePlayerAttack = (atk: DiceResult) => {
    const m = monsterRef.current
    if (!m || !pendingAttack) return
    const atkDef = ATTACKS[pendingAttack]
    setStage('busy')
    setPanelResult(null)
    setHasRolled(false)
    const kindUsed = pendingAttack
    setPendingAttack(null)
    const effMp = kindUsed === 'weapon' ? effWeaponMp : atkDef.mp
    const effSides = kindUsed === 'weapon' ? effWeaponDie : PVE_DIE[kindUsed]

    // Custo de MP do ataque (arma/especial) — sem regen passivo no combate.
    if (effMp > 0) setMp(prev => Math.max(0, prev - effMp))

    const mLev = monsterLevers(m)
    // 👁️ Visão Aguçada (ignoreEvadeNext) força o acerto — fura a esquiva do monstro.
    const pfx = combatFxRef.current
    const outcome = computePlayerOutcome(atk.roll, effSides, playerPowerFor(kindUsed), mLev, pfx.ignoreEvadeNext)
    if (pfx.ignoreEvadeNext) setCombatFx(prev => ({ ...prev, ignoreEvadeNext: false }))

    // 🐉 Buff de dano causado (Uivo/Foco do Cosmo) — só amplifica se o golpe acertou.
    // 🏆 Capstone de crítico (critBonusMult) amplifica só o golpe crítico.
    const critMult = outcome.crit ? unlocks.passives.critBonusMult : 1
    const outDmg = outcome.hit ? Math.max(1, Math.round(outcome.damage * pfx.dmgDealtMult * critMult)) : 0

    pushBattleEvent({
      kind: 'resolve',
      attackerId: character.id,
      defenderId: m.id,
      action: kindUsed,
      defenseAction: 'none',
      hit: outcome.hit,
      damage: outDmg,
      isCritical: outcome.crit,
    })

    later(() => setDiceResults({}), 1500)

    // Log: UMA linha por golpe — só o jogador rola (dado-como-plus: a rolagem
    // multiplica o dano; o monstro esquiva por % pura, sem dado).
    if (!outcome.hit) pushLog(`💨 d${outcome.sides}=${outcome.atkRoll} — ${m.name} ${defenseVerb()}! (evasão ${Math.round(mLev.evade * 100)}%)`)
    else if (outcome.crit) pushLog(`💥 d${outcome.sides}=${outcome.atkRoll} CRÍTICO! ${outDmg} de dano em ${m.name}`)
    else pushLog(`${atkDef.icon} d${outcome.sides}=${outcome.atkRoll} → ${outDmg} de dano em ${m.name}`)

    const newHp = Math.max(0, m.hp - outDmg)
    // Sincroniza o HP no alvo ativo E na entrada do pacote (roster mostra a barra certa).
    later(() => {
      setMonster(prev => (prev && prev.id === m.id ? { ...prev, hp: newHp } : prev))
      setPack(prev => prev.map(x => (x.id === m.id ? { ...x, hp: newHp } : x)))
      packRef.current = packRef.current.map(x => (x.id === m.id ? { ...x, hp: newHp } : x))
    }, 500)
    tickPlayerTurn()
    if (newHp <= 0) {
      // Espera o STATUS_FX_DELAY (1700ms) render antes de encerrar o combate.
      later(() => onMonsterKilled({ ...m, hp: 0 }), 2000)
      return
    }
    // Vez dos inimigos: TODOS os vivos atacam 1x cada.
    later(() => startEnemyPhase(), 2000)
  }

  // ---------- Aplicar efeito UTILITÁRIO de uma habilidade ----------
  const applyUtil = (def: SpecialDef) => {
    const e = def.effect
    if (def.heal) {
      const h = Math.round(effMaxHp * def.heal)
      setHp(prev => Math.min(effMaxHp, prev + h))
      pushFloat(`+${h} ❤️`, '#2ecc71')
      return
    }
    setCombatFx(prev => {
      const n: CombatFx = { ...prev }
      if (e?.selfDmgTaken) { n.dmgTakenMult = e.selfDmgTaken.mult; n.dmgTakenTurns = e.selfDmgTaken.turns }
      if (e?.selfDmgDealt) { n.dmgDealtMult = e.selfDmgDealt.mult; n.dmgDealtTurns = e.selfDmgDealt.turns }
      if (e?.enemyDmgDealt) { n.enemyDmgMult = e.enemyDmgDealt.mult; n.enemyDmgTurns = e.enemyDmgDealt.turns }
      if (e?.selfEvade) { n.evadeBuff = e.selfEvade.value; n.evadeBuffTurns = e.selfEvade.turns }
      if (e?.ignoreEvadeNext) n.ignoreEvadeNext = true
      if (e?.amplifyNext) n.amplifyNext = e.amplifyNext
      if (e?.counterNext) n.counterNext = true
      return n
    })
  }

  // ---------- Usar uma HABILIDADE de forma (consome o turno) ----------
  // BUFF (util): aplica direto, SEM rolagem, mas gasta o turno.
  // DANO (dmg): vai para a ROLAGEM (d20 visível) — o MP/recarga só saem ao resolver.
  const useAbility = (def: SpecialDef) => {
    const m = monsterRef.current
    if (!m || stage !== 'playerSelect' || !transformRef.current) return
    if (def.id === 'stunning_blow' && !unlocks.stunningBlow) {
      showBanner('🔒', 'Aprenda o Golpe Atordoante na árvore de habilidades!')
      return
    }
    if (def.kind === 'util' && !unlocks.formBuff) {
      showBanner('🔒', 'Aprenda o buff da forma na árvore de habilidades!')
      return
    }
    const fx = combatFxRef.current
    if ((fx.cd[def.id] || 0) > 0) { showBanner('⏳', `${def.name} em recarga (${fx.cd[def.id]})`); return }
    const mpCost = def.cost.mp || 0
    if (mp < mpCost) { showBanner('🔵', `MP insuficiente para ${def.name} (${mpCost}🔵)`); return }

    if (def.kind === 'util') {
      setStage('busy'); setPendingAttack(null); setPendingAbility(null); setHasRolled(false)
      if (mpCost > 0) setMp(prev => Math.max(0, prev - mpCost))
      setCombatFx(prev => ({ ...prev, cd: { ...prev.cd, [def.id]: def.cd } }))
      applyUtil(def)
      pushBattleEvent({ kind: 'buff', actorId: character.id, action: def.id })
      pushLog(`${def.name}: ${def.desc}`)
      showBanner('✨', def.name)
      tickPlayerTurn()
      // Espera o STATUS_FX_DELAY (1700ms) render antes de avançar de fase.
      later(() => startEnemyPhase(), 2000)
      return
    }

    // DANO: abre a rolagem do dado próprio da habilidade (d20). Resolve em resolveAbility.
    setPendingAttack(null)
    setPendingAbility(def)
    setPanelResult(null)
    setHasRolled(false)
    setStage('playerRoll')
  }

  // Rola o dado (d20) da habilidade de dano em espera e resolve o golpe (direto, sem disputa).
  const handleAbilityRoll = () => {
    const def = pendingAbility
    if (!def || hasRolled || !monsterRef.current) return
    setHasRolled(true)
    const sides = def.die ?? 20
    const atk = mkResult(sides, 0)
    setPanelResult(atk)
    later(() => resolveAbility(def, atk.roll), 1700)
  }

  const resolveAbility = (def: SpecialDef, roll: number) => {
    const m = monsterRef.current
    if (!m) return
    setStage('busy'); setPanelResult(null); setHasRolled(false); setPendingAbility(null)
    const fx = combatFxRef.current
    const mpCost = def.cost.mp || 0
    if (mpCost > 0) setMp(prev => Math.max(0, prev - mpCost))
    setCombatFx(prev => ({ ...prev, cd: { ...prev.cd, [def.id]: def.cd }, ...(prev.amplifyNext !== 1 ? { amplifyNext: 1 } : {}) }))

    // dano DIRETO (sem disputa de esquiva, como no PvP) — usa a rolagem já animada.
    const mLev = monsterLevers(m)
    const hit = resolveSpecialHit(def, playerLevers.power, { armor: mLev.armor, K: mLev.K }, { amplify: fx.amplifyNext, outMult: fx.dmgDealtMult, forcedRoll: roll })
    // 🏆 Capstone de crítico (critBonusMult) amplifica só o golpe crítico.
    const dmg = hit.crit ? Math.max(1, Math.round(hit.damage * unlocks.passives.critBonusMult)) : hit.damage
    const mfx = (monsterFxRef.current[m.id] ||= { dots: [], immobilizeTurns: 0 })
    if (def.dot) mfx.dots.push({ dmg: Math.max(1, Math.round(m.maxHp * def.dot.frac)), turns: def.dot.turns, label: def.dot.label })
    if (def.immobilizeRoll && hit.maxRoll >= def.immobilizeRoll) {
      // 👑 Chefe resiste ao atordoamento — o gate de progressão do boss fica intocado.
      if (m.isBoss) {
        pushLog(`👑 ${m.name} RESISTE ao atordoamento! (rolou ${hit.maxRoll})`)
      } else {
        mfx.immobilizeTurns = 1
        pushLog(`🌟 ${m.name} foi IMOBILIZADO! (rolou ${hit.maxRoll})`)
        later(() => pushBattleEvent({ kind: 'status', actorId: m.id, action: 'stun' }), STATUS_FX_DELAY)
      }
    }
    const newHp = Math.max(0, m.hp - dmg)
    // action = id da habilidade (dragon_breath, super_nova...) → animação própria na arena
    pushBattleEvent({ kind: 'resolve', attackerId: character.id, defenderId: m.id, action: def.id, defenseAction: 'none', hit: true, damage: dmg, isCritical: hit.crit })
    pushLog(`${def.name} (d${def.die ?? 20}=${roll}): ${dmg} de dano${hit.crit ? ' CRÍTICO' : ''} em ${m.name}`)
    showBanner('💥', def.name)
    later(() => {
      setMonster(prev => (prev && prev.id === m.id ? { ...prev, hp: newHp } : prev))
      setPack(prev => prev.map(x => (x.id === m.id ? { ...x, hp: newHp } : x)))
      packRef.current = packRef.current.map(x => (x.id === m.id ? { ...x, hp: newHp } : x))
    }, 400)
    tickPlayerTurn()
    // Fases seguintes esperam o STATUS_FX_DELAY (1700ms) render antes de avançar.
    if (newHp <= 0) { later(() => onMonsterKilled({ ...m, hp: 0 }), 2000); return }
    later(() => startEnemyPhase(), 2000)
  }

  // ---------- FASE INIMIGA: todos atacam 1x cada, em sequência ----------
  // Monta a fila com todos os inimigos VIVOS e dispara o primeiro ataque.
  const startEnemyPhase = () => {
    // ☠️ DoT (sangramento/esmagamento/queimadura): cada inimigo afetado sofre no início
    // da fase. Piso de 1 HP (o DoT não mata sozinho — o jogador desfere o golpe final).
    const fxMap = monsterFxRef.current
    packRef.current.forEach(m => {
      const mfx = fxMap[m.id]
      if (!mfx?.dots?.length || m.hp <= 0) return
      let total = 0
      for (const d of mfx.dots) { total += d.dmg; d.turns-- }
      mfx.dots = mfx.dots.filter(d => d.turns > 0)
      const nh = Math.max(1, m.hp - total)
      if (total > 0) {
        pushLog(`☠️ ${m.name} sofre ${m.hp - nh} de dano contínuo`)
        m.hp = nh
        setMonster(prev => (prev && prev.id === m.id ? { ...prev, hp: nh } : prev))
        setPack(prev => prev.map(x => (x.id === m.id ? { ...x, hp: nh } : x)))
      }
    })
    const living = packRef.current.filter(m => m.hp > 0)
    if (living.length === 0) { backToPlayerTurn(); return }
    enemyQueueRef.current = living.map(m => m.id)
    nextEnemyAttack()
  }

  // Próximo atacante da fila telegrafa seu golpe; se a fila acabou, volta ao jogador.
  const nextEnemyAttack = () => {
    let next: ScaledMonster | undefined
    while (enemyQueueRef.current.length > 0) {
      const id = enemyQueueRef.current.shift()!
      const cand = packRef.current.find(m => m.id === id && m.hp > 0)
      if (!cand) continue
      // 🤗 Abraço do Urso: inimigo imobilizado perde o turno
      const mfx = monsterFxRef.current[cand.id]
      if (mfx && mfx.immobilizeTurns > 0) { mfx.immobilizeTurns--; pushLog(`🚫 ${cand.name} está imobilizado e perde o turno!`); continue }
      next = cand; break
    }
    if (!next) { backToPlayerTurn(); return }
    setAttacker(next)
    attackerRef.current = next
    setFocusEnemyId(next.id) // traz o atacante pra frente
    monsterTelegraph()
  }

  // Fim da fase inimiga → devolve o turno ao jogador (foco volta pro alvo escolhido).
  // 🌿 Raízes Rasteiras (stun): se o jogador está preso, perde a vez e a fase inimiga
  // recomeça direto — espelha o immobilizeTurns que o jogador já aplica nos monstros.
  const backToPlayerTurn = () => {
    setAttacker(null)
    attackerRef.current = null
    setFocusEnemyId(monsterRef.current?.id ?? null)
    if (combatFxRef.current.stunTurns > 0) {
      setCombatFx(prev => ({ ...prev, stunTurns: prev.stunTurns - 1 }))
      pushLog('🌿 Você está preso pelas raízes e perde o turno!')
      showBanner('🌿', 'Imobilizado!')
      pushBattleEvent({ kind: 'status', actorId: character.id, action: 'stun' })
      later(() => startEnemyPhase(), 1400)
      return
    }
    setCurrentTurnId(character.id)
    setStage('playerSelect')
  }

  // ---------- Telegrafia do ATACANTE atual ----------
  const monsterTelegraph = () => {
    const m = attackerRef.current
    if (!m) return
    setCurrentTurnId(m.id)
    // Bosses preferem golpes fortes; só quem tem habilidade especial pode usá-la.
    const r = Math.random()
    const kind: AttackKind = m.isBoss
      ? (r < 0.35 ? 'basic' : r < 0.7 ? 'weapon' : 'special')
      : m.hasSpecial
        ? (r < 0.5 ? 'basic' : r < 0.8 ? 'weapon' : 'special')
        : (r < 0.55 ? 'basic' : 'weapon')
    // 🐍 Golpe SECUNDÁRIO nomeado (ex: Presas Envenenadas) — rola com chance própria,
    // independente do kind sorteado acima; se proc, narra pelo nome e aplica o efeito
    // em resolveMonsterAttack (só se o golpe efetivamente acertar).
    const special = monsterSpecialEffect(m.name)
    const proc = !!special && Math.random() < special.chance
    pendingMonsterEffectRef.current = proc ? special! : null
    // Rótulo do golpe pela ÓTICA do monstro (o ATTACKS.label é o nome dos botões do jogador).
    const foeLabel = proc ? special!.name : (kind === 'basic' ? 'Golpe' : kind === 'special' ? 'Golpe Especial' : 'Golpe Forte')
    showBanner(m.emoji, proc ? `${m.name} usa ${foeLabel}!` : `${m.name} desfere um ${foeLabel}!`, 1800)
    // O monstro ataca AUTOMÁTICO (sem clique/dado do jogador): resolve sozinho e segue pro
    // próximo da fila. A reação do jogador é uma defesa OCULTA (calculada, não rolada).
    setStage('busy')
    later(() => resolveMonsterAttack(kind), 850)
  }

  // ---------- Usar consumível (mapa e combate) ----------
  const useConsumable = (c: DungeonConsumable) => {
    if (c.qty <= 0) return
    const inCombatTurn = phase === 'combat' && stage === 'playerSelect'
    const isBuff = c.atk > 0 || c.def > 0 || c.dodge > 0
    // 🪶 Poção de Reviver: nunca se usa manualmente — é consumida sozinha ao cair.
    if (c.revive > 0) {
      showBanner('🪶', 'Guardada: age sozinha se você cair em combate')
      return
    }
    // 💪 Buff de combate: só faz sentido durante uma luta (dura N turnos).
    if (isBuff && phase !== 'combat') {
      showBanner('⚔️', 'Use durante um combate')
      return
    }
    const hpFull = hpRef.current >= effMaxHp
    const mpFull = mp >= character.maxMp
    if ((c.hp > 0 && c.mp === 0 && hpFull) || (c.mp > 0 && c.hp === 0 && mpFull)) {
      showBanner('✋', 'Recurso já está cheio')
      return
    }
    // 🧉 Antídoto: só consome se houver veneno pra curar (não desperdiça o item à toa).
    if (c.cure === 'poison' && !combatFxRef.current.poisoned) {
      showBanner('✋', 'Você não está envenenado')
      return
    }
    // 🩹 Bandagem de Linho: idem para o sangramento.
    if (c.cure === 'bleed' && !combatFxRef.current.bleeding) {
      showBanner('✋', 'Você não está sangrando')
      return
    }
    // Buffs mapeados nos combatFx que as habilidades de forma já usam. O +1 nos turnos
    // compensa o tickPlayerTurn imediato abaixo (usar item consome o turno).
    if (isBuff) {
      const turns = (c.buffTurns || 3) + (inCombatTurn ? 1 : 0)
      setCombatFx(prev => ({
        ...prev,
        ...(c.atk > 0 ? { dmgDealtMult: 1 + c.atk / 25, dmgDealtTurns: turns } : {}),
        ...(c.def > 0 ? { dmgTakenMult: Math.max(0.5, 1 - c.def / 25), dmgTakenTurns: turns } : {}),
        ...(c.dodge > 0 ? { evadeBuff: c.dodge / 100, evadeBuffTurns: turns } : {}),
      }))
      pushBattleEvent({ kind: 'buff', actorId: character.id, action: 'potion' })
      pushFloat(
        c.atk > 0 ? `+${c.atk} ⚔️` : c.def > 0 ? `+${c.def} 🛡️` : `+${c.dodge}% 💨`,
        '#f59e0b'
      )
    }
    if (c.hp > 0) {
      const gain = Math.min(effMaxHp, hpRef.current + c.hp) - hpRef.current
      setHp(prev => Math.min(effMaxHp, prev + c.hp))
      if (gain > 0) pushFloat(`+${gain} ❤️`, '#2ecc71')
    }
    if (c.mp > 0) {
      setMp(prev => Math.min(character.maxMp, prev + c.mp))
      pushFloat(`+${c.mp} 🔮`, '#3b82f6')
    }
    if (c.cure === 'poison') {
      setCombatFx(prev => ({ ...prev, poisoned: false, poisonDmg: 0 }))
      pushFloat('Curado ✨', '#22d3ee')
    }
    if (c.cure === 'bleed') {
      setCombatFx(prev => ({ ...prev, bleeding: false, bleedFrac: 0 }))
      pushFloat('Estancado 🩹', '#f87171')
    }
    pushLog(`🧪 Usou ${c.name}`)
    showBanner(c.icon, `${c.name} usada!`)

    // baixa otimista + persistência
    setConsumables(prev => prev.map(x => (x.id === c.id ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0))
    fetch(`/api/character/${character.id}/use-consumable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: c.id }),
    }).catch(() => {})

    setShowItems(false)

    // No combate, usar item consome o turno do jogador → vez dos inimigos (todos atacam).
    if (inCombatTurn) {
      setStage('busy')
      tickPlayerTurn()
      later(() => startEnemyPhase(), 1400)
    }
  }

  // O monstro ataca automaticamente; a reação do jogador é uma ESQUIVA OCULTA (calculada,
  // sem clique nem dado e sem custo de stamina). O bloqueio foi removido — o log às vezes
  // narra a esquiva como "defesa" só pra dar sabor (lore).
  const resolveMonsterAttack = (kind: AttackKind) => {
    const m = attackerRef.current
    if (!m) return
    setStage('busy')

    // O MONSTRO não rola nada (dano sai dos stats dele, com variação pequena sem dado).
    // O JOGADOR, defendendo, ainda "rola" (oculto/calculado): número máximo do dado =
    // esquiva total garantida, senão esquiva por % pura — ver resolveMonsterHit.
    const sides = PVE_DIE[kind]
    const def = mkResult(sides, 0)

    const mLev = monsterLevers(m)
    // 🌬️ Voo Veloz (Águia): buff de evasão temporário soma na esquiva do jogador.
    const pfxDef = combatFxRef.current
    // 🌬️ Passo Lateral/Reflexos de Batalha (evadeBonus): passiva permanente da árvore.
    const effEvade = Math.min(0.95, playerLevers.evade + (pfxDef.evadeBuffTurns > 0 ? pfxDef.evadeBuff : 0) + unlocks.passives.evadeBonus)
    const outcome = computeMonsterOutcome(
      sides, monsterPowerFor(m, kind),
      { armor: playerLevers.armor, K: playerLevers.K, evade: effEvade },
      def.roll,
    )
    // 🐍 Golpe secundário telegrafado (ver monsterTelegraph): só se aplica se o golpe acertou.
    const proc = pendingMonsterEffectRef.current
    pendingMonsterEffectRef.current = null
    const procDmgMult = proc && outcome.hit && proc.effect === 'damage' ? (proc.dmgMult ?? 1) : 1

    // 🐉 Escamas (-dano recebido) + Rugido (-dano do inimigo). Contra-ataque ao esquivar.
    const dfx = combatFxRef.current
    // 🛡️ Baluarte (selfDmgTakenMult): passiva permanente da árvore, empilha com o buff temporário.
    const inDmg = outcome.hit ? Math.max(1, Math.round(outcome.damage * dfx.dmgTakenMult * dfx.enemyDmgMult * procDmgMult * unlocks.passives.selfDmgTakenMult)) : 0

    pushBattleEvent({
      kind: 'resolve',
      attackerId: m.id,
      defenderId: character.id,
      action: kind,
      defenseAction: 'none',
      hit: outcome.hit,
      damage: inDmg,
      isCritical: outcome.crit,
    })

    // Log: UMA linha por golpe — o monstro NÃO rola (dano sai dos stats dele); a sua
    // esquiva é % pura calculada por baixo, então só o desfecho aparece. A exceção é a
    // rolagem oculta máxima (esquiva total garantida), que merece destaque.
    if (!outcome.hit) {
      pushLog(outcome.defRoll >= outcome.sides
        ? `✨ ESQUIVA TOTAL! Você evitou o golpe de ${m.name} (rolagem máxima)`
        : `💨 Você ${defenseVerb()} o golpe de ${m.name}! (0 de dano)`)
    } else {
      pushLog(`🩸 ${m.name} causou ${inDmg} de dano em você`)
    }
    if (!outcome.hit && dfx.counterNext) {
      const counter = Math.max(1, Math.round((outcome.damage || monsterPowerFor(m, kind)) * 0.5))
      const mfx = (monsterFxRef.current[m.id] ||= { dots: [], immobilizeTurns: 0 })
      const mhp = Math.max(0, m.hp - counter)
      pushLog(`↩️ Contra-ataque! ${counter} de dano em ${m.name}`)
      later(() => { setMonster(prev => (prev && prev.id === m.id ? { ...prev, hp: mhp } : prev)); setPack(prev => prev.map(x => (x.id === m.id ? { ...x, hp: mhp } : x))); packRef.current = packRef.current.map(x => (x.id === m.id ? { ...x, hp: mhp } : x)) }, 400)
      void mfx
      setCombatFx(prev => ({ ...prev, counterNext: false }))
    }
    const newHp = Math.max(0, hpRef.current - inDmg)
    // Aplicação RELATIVA (não o `newHp` absoluto): entre agora e os 500ms daqui,
    // nada mais deve mexer no HP, mas se mexer (cura, DoT), a atualização funcional
    // compõe certo em vez de sobrescrever — mesma classe de bug do tique de veneno.
    later(() => setHp(prev => Math.max(0, prev - inDmg)), 500)
    if (newHp <= 0) {
      // 🪶 Poção de Reviver: consumida SOZINHA ao cair — volta com % do HP máx e a
      // luta continua (fase inimiga segue). É o que sustenta o farm automático.
      const reviver = consumables.find(x => x.revive > 0 && x.qty > 0)
      if (reviver) {
        const back = Math.max(1, Math.round(effMaxHp * (reviver.revive / 100)))
        setConsumables(prev => prev.map(x => (x.id === reviver.id ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0))
        fetch(`/api/character/${character.id}/use-consumable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: reviver.id }),
        }).catch(() => {})
        later(() => {
          setHp(back)
          showBanner('🪶', `${reviver.name}! Você volta à luta com ${back} HP`, 2600)
          pushLog(`🪶 ${reviver.name} te trouxe de volta (${back} HP)!`)
          pushFloat(`+${back} 🪶`, '#fbbf24')
        }, 1000)
        later(() => nextEnemyAttack(), 2400)
        return
      }
      later(() => {
        setCombatEnded(true)
        setWinnerId(m.id)
        later(() => handleDefeat(), 2200)
      }, 1400)
      return
    }
    // 🐍 Aplica o status do golpe secundário (só se acertou e o jogador segue de pé).
    // O evento 'status' anima o card do jogador (bolhas de veneno/gotas/estrelas) DEPOIS
    // do impacto do golpe — por isso o atraso de STATUS_FX_DELAY (o slot de battleEvent
    // é único; sem esperar o golpe terminar de vez, a aura do status o engole).
    if (proc && outcome.hit) {
      if (proc.effect === 'poison' && !dfx.poisoned) {
        setCombatFx(prev => ({ ...prev, poisoned: true, poisonDmg: proc.poisonDmg ?? 4 }))
        later(() => pushBattleEvent({ kind: 'status', actorId: character.id, action: 'poison' }), STATUS_FX_DELAY)
        pushLog(`☠️ ${proc.name} te envenenou! Perde ${proc.poisonDmg ?? 4} HP por turno até usar um Antídoto.`)
        showBanner('☠️', 'Envenenado!')
      } else if (proc.effect === 'bleed' && !dfx.bleeding) {
        setCombatFx(prev => ({ ...prev, bleeding: true, bleedFrac: proc.bleedFrac ?? 0.04 }))
        later(() => pushBattleEvent({ kind: 'status', actorId: character.id, action: 'bleed' }), STATUS_FX_DELAY)
        pushLog(`🩸 ${proc.name} abriu um corte! Você está sangrando até usar uma Bandagem de Linho.`)
      } else if (proc.effect === 'stun') {
        setCombatFx(prev => ({ ...prev, stunTurns: prev.stunTurns + (proc.stunTurns ?? 1) }))
        later(() => pushBattleEvent({ kind: 'status', actorId: character.id, action: 'stun' }), STATUS_FX_DELAY)
        pushLog(`💫 ${proc.name} te atordoou! Você perde o próximo turno.`)
      } else if (proc.effect === 'damage') {
        pushLog(`💥 ${proc.name}! Um golpe brutal.`)
      }
    }
    // Próximo inimigo da fila ataca; se acabou a fila, volta ao jogador.
    // Espera o STATUS_FX_DELAY (1700ms) render antes de passar pro próximo atacante.
    later(() => nextEnemyAttack(), 2100)
  }

  // ---------- Abate de um monstro do pacote ----------
  // Cada abate é reportado ao SERVIDOR (outcome 'kill'): ele credita gold+XP daquele
  // bicho e, quando o pacote inteiro cai (cleared), rola o espólio do nó e avança o
  // cursor. Se ainda há inimigos vivos, troca pro mais fraco e o duelo continua.
  const onMonsterKilled = async (m: ScaledMonster) => {
    // Remove o abatido do pacote (estado + ref) antes de escolher o próximo alvo.
    const remaining = packRef.current.filter(x => x.id !== m.id && x.hp > 0)
    const willClear = remaining.length === 0
    // Se é o ÚLTIMO do pacote, NÃO esvazia `pack` ainda — isso faria a arena trocar
    // da cascata compacta pro card solo (maior) no meio da animação de queda, dando
    // a impressão de "morre, levanta maior, morre de novo". `pack` só some lá embaixo,
    // junto com `setMonster(null)`, no cleanup final (2800ms).
    if (!willClear) {
      packRef.current = remaining
      setPack(remaining)
    }
    // Só "encerra" o combate visualmente quando o nó limpa; senão o duelo segue.
    if (willClear) { setCombatEnded(true); setWinnerId(character.id) }
    killedIdsRef.current.push(m.id)

    // Abate no MEIO do pacote: ZERO rede — o crédito real vem na chamada única de
    // desfecho do nó (clear/retreat/lose com killedIds). A UI segue otimista com
    // os valores que o próprio servidor rolou pro nó (m.goldReward/m.xpReward);
    // drops por abate agora aparecem juntos no card do clear.
    if (!willClear) {
      encounterXpRef.current += m.xpReward
      encounterKillGoldRef.current += m.goldReward
      setTotals(prev => ({ ...prev, gold: prev.gold + m.goldReward, xp: prev.xp + m.xpReward, kills: prev.kills + 1 }))
      pushLog(`🏆 Você derrotou ${m.emoji} ${m.name}! +${m.goldReward} 💰 +${m.xpReward} XP`)
      const next = weakestOf(remaining)
      showBanner('🗡️', `${m.name} caiu! Restam ${remaining.length}.`, 1800)
      if (next) { setMonster(next); monsterRef.current = next }
      later(() => {
        setDiceResults({})
        setPanelResult(null)
        setHasRolled(false)
        setPendingAttack(null)
        startEnemyPhase()
      }, 1200)
      return
    }

    // ÚLTIMO abate: UMA chamada resolve o nó inteiro no servidor (gold+XP de todos
    // os abates, drops por abate, espólio do nó, desgaste, level-up).
    // Retentativas — crítico no abate do BOSS: se essa chamada falhar (rede
    // instável) e o cliente seguir como se tivesse dado certo, a run fica
    // 'active'/pendente no banco e o auto-restart seguinte trava com "personagem
    // já em uso" (o /start vê o lock antigo vivo).
    const postKill = async (attempts: number): Promise<{ res: Response; data: CombatResponse } | null> => {
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch('/api/dungeon/run/combat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: runIdRef.current, outcome: 'clear', killedIds: killedIdsRef.current }),
          })
          const data: CombatResponse = await res.json().catch(() => ({} as CombatResponse))
          if (res.ok) return { res, data }
          if (res.status === 409) return { res, data } // já resolvido noutro request — não insiste
        } catch { /* rede instável: tenta de novo */ }
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500))
      }
      return null
    }

    let grant: CombatGrant | null = null
    const outcome = await postKill(m.isBoss ? 4 : 3)
    // 409 com status 'finished' = um retry chegou DEPOIS do clear ter aterrissado:
    // o crédito já aconteceu — trata como vitória (sem grant, valores otimistas),
    // em vez de cair no branch de abandono/aviso.
    const alreadyLanded = !!outcome && !outcome.res.ok && outcome.res.status === 409 && outcome.data.status === 'finished'
    if (outcome?.res.ok) {
      const data = outcome.data
      grant = data.granted ?? null
      // ⚔️ Desgaste debitado pelo servidor neste abate: atualiza o gear vivo da
      // run (peça que quebra para de contribuir já no próximo golpe) e avisa.
      if (data.equipmentWear?.length) {
        const wearBySlot = new Map(data.equipmentWear.map((w) => [w.slot, w]))
        setEquipList((prev) => prev.map((eq: any) => {
          const w = wearBySlot.get(eq.slot)
          return w ? { ...eq, durability: w.durability, maxDurability: w.maxDurability } : eq
        }))
        for (const w of data.equipmentWear) {
          if (w.justBroke) {
            pushLog(`💔 ${w.name} QUEBROU! Sem bônus até reparar no ferreiro.`)
            showBanner('💔', `${w.name} quebrou!`, 2600)
          } else if (w.durability <= 15 && !wearWarnedRef.current.has(w.slot)) {
            wearWarnedRef.current.add(w.slot)
            pushLog(`⚠️ ${w.name} está quase quebrando (${w.durability}/${w.maxDurability}).`)
          }
        }
      }
      if (data.leveledUp) {
        setLeveledUpThisRun(true)
        // Efeito de level up: HP e MP voltam ao cheio + flash brilhante na tela.
        // (o servidor já restaurou os recursos no banco ao subir de nível.)
        const reachedLevel = data.newLevel ?? null
        // Atualiza o nível VIVO já (não só no `later`) — o próximo combate desta
        // run precisa ver o nível novo nos levers/card, mesmo antes do flash.
        if (reachedLevel != null) setCharLevel(reachedLevel)
        later(() => {
          setHp(effMaxHp)
          setMp(character.maxMp)
          setLevelUpFlash(reachedLevel)
          showBanner('⭐', reachedLevel ? `Nível ${reachedLevel}! HP e MP restaurados` : 'Subiu de nível! HP e MP restaurados', 3200)
          pushLog('🎉 Você SUBIU DE NÍVEL! HP e MP restaurados por completo.')
          later(() => setLevelUpFlash(null), 2600)
        }, 1500)
      }
    } else if (m.isBoss && !alreadyLanded) {
      // O SERVIDOR nunca confirmou o abate do boss: não finge vitória local aqui.
      // Encerra a run explicitamente (libera o lock) para o próximo /start não travar,
      // e avisa o jogador em vez de seguir para o auto-restart sem confirmação.
      if (runIdRef.current) {
        fetch('/api/dungeon/run/abandon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: runIdRef.current }),
        }).catch(() => {})
      }
      pushLog('⚠️ Sem confirmação do servidor para a vitória contra o chefe.')
      showBanner('⚠️', 'Falha de conexão ao encerrar a masmorra. Recompensas do boss podem não ter sido creditadas — volte a entrar.', 4200, { sticky: true })
      setAuto(false)
      setPhase('summary')
      return
    }

    // O grant cobre o NÓ INTEIRO; os abates anteriores já entraram otimistas —
    // aplica só o DELTA do último abate (pode vir menor se o teto diário de gold
    // clipou; o servidor é a autoridade).
    const killGold = grant ? grant.killGold - encounterKillGoldRef.current : m.goldReward
    const xp = grant ? grant.xp - encounterXpRef.current : m.xpReward
    const loot: NodeLoot = grant?.loot ?? { gold: 0, drops: [] }
    encounterXpRef.current += xp
    encounterKillGoldRef.current += killGold

    setTotals(prev => ({ ...prev, gold: prev.gold + killGold, xp: prev.xp + xp, kills: prev.kills + 1 }))
    pushLog(`🏆 Você derrotou ${m.emoji} ${m.name}! +${Math.max(0, killGold)} 💰 +${Math.max(0, xp)} XP`)

    // Nó LIMPO: espólio do nó + avanço (boss → fim da run).
    showLoot(loot, grant?.skippedDrops, grant?.roll ?? lootRollRef.current)
    later(() => {
      setMonster(null)
      setPack([])
      packRef.current = []
      setCombatEnded(false)
      // Sempre volta pra fase 'explore' — é ela que hospeda o overlay do lootCard
      // (inclusive pro boss agora, ver abaixo); dismissLootCard decide o que vem
      // a seguir (avançar a trilha ou finishRun, se era o boss).
      setPhase('explore')
      if (!m.isBoss) {
        showNarration(nextIsBoss
          ? 'A trilha termina adiante. Você sente um olhar antigo cravado em você...'
          : TRANSITIONS[tokenIdx % TRANSITIONS.length])
      }

      // Card de vitória mostra o TOTAL do nó (soma de todos os abates) + espólio do nó —
      // inclui o BOSS: antes o boss pulava direto pro resumo final sem passar por aqui,
      // então um drop raro nunca ganhava a moldura/brilho de destaque.
      const nodeXp = encounterXpRef.current
      const totalGold = encounterKillGoldRef.current + loot.gold
      const hasGear = loot.drops.some(d => d.kind === 'item' || d.kind === 'stone')

      const effects: EffectChip[] = []
      if (nodeXp > 0) effects.push({ kind: 'stat', text: `+${nodeXp} ⭐ XP` })
      if (totalGold > 0) effects.push({ kind: 'stat', text: `+${totalGold} 💰` })
      // Drops do nó + o que caiu dos abates intermediários do pacote. Pedra de
      // aprimoramento e RARE+ ganham destaque (moldura dourada + brilho) no card.
      const isHighlight = (d: LootDrop) =>
        d.kind === 'stone' || ['RARE', 'EPIC', 'LEGENDARY'].includes(String(d.rarity ?? '').toUpperCase())
      const allDrops = [...encounterDropsRef.current, ...loot.drops]
      const hasRare = allDrops.some(isHighlight)
      for (const d of allDrops) effects.push({
        kind: 'item',
        name: d.name,
        emoji: d.emoji,
        label: d.enhancement ? `${d.name} +${d.enhancement}` : d.name,
        rarity: d.rarity,
        highlight: isHighlight(d),
      })
      encounterDropsRef.current = []

      const def: DungeonEventDef = {
        kind: hasGear ? 'item' : 'gold',
        min: 0,
        max: 0,
        icon: hasRare ? '💎' : m.isBoss ? '👑' : hasGear ? '🌟' : '🏆',
        title: hasRare ? 'Espólio Raro!' : m.isBoss ? `${dungeon.name} conquistada!` : 'Espólio da Vitória',
        description: hasGear
          ? `${m.emoji} ${m.name} foi derrotado e deixou cair seus pertences.`
          : `${m.emoji} ${m.name} foi derrotado.`,
      }
      // Boss: o card some via dismissLootCard (botão ou auto-pilot), que só então
      // dispara finishRun(true) — garante que o jogador VÊ o brilho do drop raro
      // antes de seguir para o resumo/re-run automático.
      if (m.isBoss) bossVictoryPendingRef.current = true
      setLootCard({ def, text: def.description, effects, luckRoll: grant?.roll ?? lootRollRef.current })
    }, 2800)
  }

  // 🔁 Re-run: o pai remonta a run do zero (mesma masmorra/herói), preservando o
  // estado do piloto. Precisa de stamina para ao menos o 1º passo (nó menor).
  // Aguarda o POST que encerra a run atual aterrissar antes de remontar — senão o
  // /start da nova run vê a antiga ainda 'active' (lock vivo) e devolve 409.
  const endRunPromiseRef = useRef<Promise<unknown> | null>(null)
  const canRerun = !!onRestart && stamina >= MINOR_STEP_COST
  const restartRun = async () => {
    if (!onRestart) { exitRun(); return }
    try { await endRunPromiseRef.current } catch { /* segue mesmo assim */ }
    onRestart({ hp: effMaxHp, mp: character.maxMp, stamina, level: charLevel, leveledUp: leveledUpThisRun, auto })
  }

  // Aplica a resposta do DESFECHO da run (retreat/lose): o servidor acabou de
  // creditar os abates reportados — mostra os drops, corrige gold/XP pro valor
  // autoritativo (teto diário pode ter clipado) e registra quebra/level-up.
  const applyEndGrant = (data: CombatResponse) => {
    const grant = data.granted
    if (!grant) return
    const goldDelta = grant.killGold - encounterKillGoldRef.current
    const xpDelta = grant.xp - encounterXpRef.current
    encounterKillGoldRef.current = grant.killGold
    encounterXpRef.current = grant.xp
    if (goldDelta !== 0 || xpDelta !== 0) {
      setTotals(prev => ({ ...prev, gold: prev.gold + goldDelta, xp: prev.xp + xpDelta }))
    }
    if (grant.loot.drops.length > 0) showLoot(grant.loot, grant.skippedDrops, grant.roll ?? lootRollRef.current)
    for (const w of data.equipmentWear ?? []) {
      if (w.justBroke) pushLog(`💔 ${w.name} QUEBROU! Sem bônus até reparar no ferreiro.`)
    }
    if (data.leveledUp) {
      setLeveledUpThisRun(true)
      if (data.newLevel != null) setCharLevel(data.newLevel)
      pushLog('🎉 Você SUBIU DE NÍVEL!')
    }
  }

  // RECUAR: sai do combate em SEGURANÇA. Os abates do pacote atual ainda NÃO
  // foram creditados (protocolo por nó) — vão em `killedIds` pro servidor creditar
  // ao encerrar. É a saída do early-game: matou o que dava conta e volta com XP.
  const handleRetreat = () => {
    if (combatEnded) return
    setCombatEnded(true)
    setAuto(false)
    if (runIdRef.current) {
      endRunPromiseRef.current = fetch('/api/dungeon/run/combat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current, outcome: 'retreat', killedIds: killedIdsRef.current }),
      }).then(async (res) => {
        if (!res.ok) return
        applyEndGrant(await res.json().catch(() => ({} as CombatResponse)))
      }).catch(() => {})
    }
    pushLog('🏃 Você recua em segurança, levando o que conquistou.')
    showBanner('🏃', 'Recuo seguro — XP e espólio dos abates preservados.', 2600)
    later(() => {
      setMonster(null)
      setPack([])
      packRef.current = []
      setPhase('summary')
    }, 1300)
  }

  // DERROTA: avisa o servidor, que credita os abates reportados e encerra a run.
  // A tela oferece Sair e Re-run; no piloto automático o Re-run é escolhido sozinho
  // (enquanto houver stamina) — sem stamina, volta ao mapa como antes.
  const handleDefeat = () => {
    setPhase('defeat')
    if (runIdRef.current) {
      endRunPromiseRef.current = fetch('/api/dungeon/run/combat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runIdRef.current, outcome: 'lose', killedIds: killedIdsRef.current }),
      }).then(async (res) => {
        if (!res.ok) return
        applyEndGrant(await res.json().catch(() => ({} as CombatResponse)))
      }).catch(() => {})
    }
    if (auto) {
      later(() => { if (onRestart && stamina >= MINOR_STEP_COST) restartRun(); else exitRun() }, 3200)
    }
  }

  // Encerra a run no servidor ao sair no meio. Saindo DURANTE um combate com
  // abates ainda não creditados, sai via 'retreat' com os killedIds — o servidor
  // credita antes de fechar; fora de combate, abandono simples como antes.
  const closeRunOnServer = () => {
    if (!runIdRef.current) return
    const uncredited = phase === 'combat' && !combatEnded && killedIdsRef.current.length > 0
    endRunPromiseRef.current = (uncredited
      ? fetch('/api/dungeon/run/combat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: runIdRef.current, outcome: 'retreat', killedIds: killedIdsRef.current }),
        })
      : fetch('/api/dungeon/run/abandon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: runIdRef.current }),
        })
    ).catch(() => {})
  }

  const finishRun = async (bossDefeated: boolean) => {
    setPhase('summary')
    // Sair no meio (sem boss): encerra a sessão no servidor (creditando abates
    // pendentes, se saiu do meio de um combate).
    if (!bossDefeated) closeRunOnServer()
    if (bossDefeated) {
      pushLog(`👑 ${dungeon.name} conquistada!`)
      // Piloto automático: boss vencido também reinicia a run (farm contínuo até a stamina acabar).
      if (auto) {
        later(() => { if (onRestart && stamina >= MINOR_STEP_COST) restartRun(); else exitRun() }, 3600)
      }
    }
  }

  // Fecha o card de espólio (botão "Continuar a jornada" ou auto-pilot). Se era o
  // espólio do BOSS, só agora dispara finishRun(true) — o jogador chegou a ver o
  // destaque/brilho do drop raro antes de seguir pro resumo/re-run automático.
  const dismissLootCard = () => {
    setLootCard(null)
    if (bossVictoryPendingRef.current) {
      bossVictoryPendingRef.current = false
      finishRun(true)
    }
  }

  const exitRun = () => {
    // Garante o encerramento da sessão no servidor ao sair (creditando abates
    // pendentes, se saiu do meio de um combate).
    closeRunOnServer()
    // HP e MP voltam ao cheio entre runs — só a stamina (orçamento diário) é consumida.
    onExit({ hp: effMaxHp, mp: character.maxMp, stamina, leveledUp: leveledUpThisRun })
  }

  // ---------- Painel de dados da arena ----------
  const dicePanel = useMemo(() => {
    if (phase !== 'combat') return null
    if (stage === 'initiative') {
      const foe = monsterRef.current
      const theirs = foe ? diceResults[foe.id] : undefined
      // Empate favorece o jogador (mesmo critério do handleInitiativeRoll: mine >= theirs).
      const resultBanner = panelResult && theirs
        ? panelResult.total >= theirs.total ? 'Você começa!' : `${foe?.name} começa!`
        : null
      return {
        visible: true,
        diceType: 20,
        hasRolled,
        label: '⚡ Iniciativa! Quem começa?',
        onRoll: handleInitiativeRoll,
        myResult: panelResult,
        waitingForOpponent: false,
        dual: true,
        opponentResult: theirs,
        resultBanner,
      }
    }
    if (stage === 'playerRoll' && pendingAbility) {
      const sides = pendingAbility.die ?? 20
      return {
        visible: true,
        diceType: sides,
        hasRolled,
        label: `${pendingAbility.name} — role o d${sides}!`,
        onRoll: handleAbilityRoll,
        myResult: panelResult,
        waitingForOpponent: false,
      }
    }
    if (stage === 'playerRoll' && pendingAttack) {
      const atk = ATTACKS[pendingAttack]
      const sides = PVE_DIE[pendingAttack]
      const label = pendingAttack === 'weapon' ? `${atk.icon} ${classAtkName}` : `${atk.icon} ${atk.label}`
      return {
        visible: true,
        diceType: sides,
        hasRolled,
        label: `${label} — role o d${sides}!`,
        onRoll: handlePlayerAttackRoll,
        myResult: panelResult,
        waitingForOpponent: false,
      }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage, hasRolled, panelResult, diceResults, pendingAttack, pendingAbility, classAtkName, stamina, mp])

  // Rola o dado sozinho assim que o jogador escolhe um golpe/habilidade — não precisa
  // mais clicar no dado, só no ataque. Vale mesmo fora do piloto automático.
  useEffect(() => {
    if (phase !== 'combat' || stage !== 'playerRoll' || hasRolled || combatEnded || exitConfirm) return
    const t = setTimeout(() => {
      if (pendingAbility) handleAbilityRoll()
      else handlePlayerAttackRoll()
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage, hasRolled, combatEnded, exitConfirm, pendingAbility, pendingAttack])

  // ---------- Piloto automático ----------
  // Dano "típico" estimado de um golpe (core × pior sorte do dado). Serve só pro piloto
  // decidir se vale gastar MP — o dano real ainda sai do luck multiplicativo (resolveHit).
  const estDamage = (kind: AttackKind) => playerPowerFor(kind) * LUCK_LO

  // Melhor golpe DISPONÍVEL e pagável agora, sem desperdiçar MP num monstro quase morto:
  // Golpe (grátis) se já deve derrubar; senão Ataque de Classe só se a árvore desbloqueou.
  const autoPickAttack = (): AttackKind => {
    const foeHp = monsterRef.current?.hp ?? Infinity
    if (foeHp <= estDamage('basic')) return 'basic'
    if (unlocks.classAttack && mp >= effWeaponMp) return 'weapon'
    return 'basic'
  }

  // Dano de referência do piloto: o melhor ataque básico/classe realmente liberado.
  const autoRefDamage = () =>
    estDamage(unlocks.classAttack ? 'weapon' : 'basic')

  // Specials da forma filtradas como no menu manual (só o que a árvore já treinou).
  const autoFormSpecials = (form: TransformationType): SpecialDef[] =>
    getFormSpecials(form)
      .filter(def => {
        if (def.id === 'stunning_blow') return unlocks.stunningBlow
        if (def.kind === 'util') return unlocks.formBuff
        return true // assinatura: sempre disponível transformado
      })
      .map(def => applyRankPatch(def, unlocks, form))

  // Poção mais "justa" pro déficit: a MAIOR que restaura sem desperdiçar; se todas
  // passam do buraco, a menor disponível. Só restauradores puros (nada de buff/revive).
  const pickPotion = (kind: 'hp' | 'mp', deficit: number): DungeonConsumable | null => {
    const amt = (c: DungeonConsumable) => (kind === 'hp' ? c.hp : c.mp)
    const pool = consumables.filter(c => c.qty > 0 && amt(c) > 0 && c.revive === 0 && c.atk === 0 && c.def === 0 && c.dodge === 0)
    if (pool.length === 0) return null
    const fits = pool.filter(c => amt(c) <= deficit)
    if (fits.length > 0) return fits.reduce((a, b) => (amt(b) > amt(a) ? b : a))
    return pool.reduce((a, b) => (amt(b) < amt(a) ? b : a))
  }

  // Lê o estágio da máquina de estados do combate e dispara a MESMA ação que o jogador
  // faria. Cada etapa muda o stage (ou hasRolled), então o efeito reage à próxima sem
  // disparo duplo. Pequenos atrasos mantêm as animações visíveis.
  useEffect(() => {
    if (!auto || phase !== 'combat' || combatEnded || exitConfirm) return
    let cancelled = false
    const fire = (fn: () => void, ms: number) => {
      const t = setTimeout(() => { if (!cancelled) fn() }, ms)
      return () => { cancelled = true; clearTimeout(t) }
    }

    if (stage === 'playerSelect') return fire(() => {
      const alive = packRef.current.filter(m => m.hp > 0)
      const refDmg = autoRefDamage()
      // Consumíveis automáticos (se o switch estiver ligado):
      if (autoConsumables) {
        // 1) Cura de emergência: HP baixo + poção de vida no inventário.
        if (hpRef.current <= effMaxHp * 0.35 && hpRef.current < effMaxHp) {
          const potion = pickPotion('hp', effMaxHp - hpRef.current)
          if (potion) { useConsumable(potion); return }
        }
        // 2) Repõe MP só quando o Ataque de Classe está liberado e ainda não cabe no MP atual.
        if (unlocks.classAttack && mp < effWeaponMp && mp < character.maxMp) {
          const mPotion = pickPotion('mp', character.maxMp - mp)
          if (mPotion) { useConsumable(mPotion); return }
        }
      }
      // O combate NÃO gasta stamina (tudo custa MP); a stamina é só o orçamento diário de runs.
      // 3) Transforma (1× por luta) — mas só se o PACOTE ainda tem luta pela frente (não
      // desperdiça a transformação num resto de encontro que cai em 1-2 golpes baratos).
      const packHp = alive.reduce((sum, m) => sum + m.hp, 0)
      if (!transform && !transformedThisFightRef.current && transformForms.length > 0 && packHp > refDmg * 2) {
        const cfg = TRANSFORMATION_CONFIG[transformForms[0]]
        if (cfg && mp >= cfg.cost.mp) { activateTransform(transformForms[0]); return }
      }
      // 4) Transformado: usa a HABILIDADE DE DANO da forma (d20) se pagável e fora da
      // recarga — mas NUNCA em quem já cai com o melhor golpe liberado: o especial vai no
      // inimigo mais FORTE que ainda aguenta; o quase-morto é finalizado com golpe barato.
      if (transform) {
        const specials = autoFormSpecials(transform.type)
        const dmgAbility = specials.find(d => d.kind === 'dmg')
        const dmgCd = dmgAbility ? (combatFxRef.current.cd[dmgAbility.id] || 0) : 0
        if (dmgAbility && dmgCd === 0 && mp >= (dmgAbility.cost.mp || 0)) {
          const worthy = alive.filter(m => m.hp > refDmg)
          if (worthy.length > 0) {
            const strongest = worthy.reduce((best, m) => (m.hp > best.hp ? m : best))
            if (strongest.id !== monsterRef.current?.id) setActiveTarget(strongest.id)
            useAbility(dmgAbility)
            return
          }
          // Nenhum alvo "merece" o especial — guarda o MP e cai pros golpes baratos.
        } else if (dmgAbility && packHp > refDmg * 2) {
          // 4b) Dano em recarga numa luta ainda longa: aproveita o turno com o UTILITÁRIO
          // da forma (buff/cura) — só se a árvore já liberou (autoFormSpecials filtra).
          const fx = combatFxRef.current
          const util = specials.find(d => d.kind === 'util')
          const utilCd = util ? (fx.cd[util.id] || 0) : 0
          const buffActive = fx.dmgDealtTurns > 0 || fx.dmgTakenTurns > 0 || fx.evadeBuffTurns > 0
          const utilUseful = util?.heal ? hpRef.current < effMaxHp * 0.85 : !buffActive
          if (util && utilCd === 0 && utilUseful && mp >= (util.cost.mp || 0) + (dmgAbility.cost.mp || 0)) {
            useAbility(util)
            return
          }
        }
      }
      // 5) Golpes baratos: foca o inimigo MAIS FRACO vivo do pacote (atualiza o ref de
      // forma síncrona) e ataca com o melhor golpe liberado/pagável sem desperdiçar MP.
      const weak = weakestOf(packRef.current)
      if (weak && weak.id !== monsterRef.current?.id) setActiveTarget(weak.id)
      choosePlayerAttack(autoPickAttack())
    }, 650)

    // playerRoll já rola sozinho (ver efeito acima), mesmo fora do piloto automático.

    // A fase inimiga resolve sozinha (defesa oculta) — o piloto não precisa reagir a ela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, autoConsumables, exitConfirm, phase, stage, hasRolled, combatEnded, mp, stamina, transform, transformCd, transformedThisFight, pendingAbility, consumables, effMaxHp])

  // Piloto de EXPLORAÇÃO: anda na trilha, confirma loot/eventos e entra nos combates.
  // Para com segurança quando falta stamina (evita laço de avanços negados).
  useEffect(() => {
    if (!auto || phase !== 'explore' || exitConfirm) return
    if (moving || exploreRolling || walkBusy) return
    let cancelled = false
    const fire = (fn: () => void, ms: number) => {
      const t = setTimeout(() => { if (!cancelled) fn() }, ms)
      return () => { cancelled = true; clearTimeout(t) }
    }

    // Reabastecer HP/MP com poções FORA de combate (não gasta turno): usado antes de
    // avançar E antes de entrar num combate (boss/emboscada) — entra o mais cheio
    // possível. Uma poção por vez; o efeito re-dispara até encher (>= 90%) ou acabarem
    // as poções. Só com o switch de consumíveis ligado.
    const refillPotion = (): DungeonConsumable | null => {
      if (!autoConsumables) return null
      if (hp < effMaxHp * 0.9) {
        const potion = pickPotion('hp', effMaxHp - hp)
        if (potion) return potion
      }
      if (mp < character.maxMp * 0.9) {
        const mPotion = pickPotion('mp', character.maxMp - mp)
        if (mPotion) return mPotion
      }
      return null
    }

    // 1) Espólio da vitória aberto → confirmar (fica mais tempo na tela pra dar
    // pra ver o que dropou e, se quiser, desligar o automático a tempo).
    if (lootCard) return fire(() => dismissLootCard(), 3000)
    // 2) Card de evento aberto → lutar (monstro) ou seguir (achado).
    if (eventCard) {
      const group = eventCard.monsters ?? (eventCard.monster ? [eventCard.monster] : null)
      // Vai ter luta: bebe poção ANTES de entrar (o card espera; uma por vez).
      const potion = group ? refillPotion() : null
      if (potion) return fire(() => useConsumable(potion), 450)
      return fire(() => {
        if (group) startCombat(group)
        else dismissEvent()
      }, 1000)
    }
    // 3) Covil do boss → reabastece primeiro, depois enfrenta.
    if (atBoss) {
      const potion = refillPotion()
      if (potion) return fire(() => useConsumable(potion), 450)
      return fire(() => startCombat(
        serverPackRef.current ??
        serverMonsterRef.current ??
        scaleMonster(dungeon.boss, dungeon, charLevel, { tier: dungeon.rooms, isMain: true, isBoss: true }, combatClass, tier)
      ), 1100)
    }
    if (!runReady) return

    // 4) Reabastece antes de avançar na trilha.
    const potion = refillPotion()
    if (potion) return fire(() => useConsumable(potion), 450)

    // 5) Seguir a trilha — mas só se a stamina cobre o próximo passo.
    if (stamina < stepCost(tokenIdx + 1)) {
      setAuto(false)
      showBanner('😮‍💨', 'Stamina insuficiente — piloto desligado. Ela volta +2 a cada 15 min ocioso.', 3200)
      return
    }
    return fire(advance, 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, autoConsumables, exitConfirm, phase, moving, walkBusy, exploreRolling, lootCard, eventCard, atBoss, tokenIdx, runReady, stamina, hp, mp, consumables])

  // ============================================================
  // RENDER
  // ============================================================

  const ResourceBar = ({ icon, value, max, gradient }: { icon: string; value: number; max: number; gradient: string }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-xs">{icon}</span>
      <div className="w-16 sm:w-32 h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="text-[10px] text-white/80 font-mono w-11 sm:w-14">{value}/{max}</span>
    </div>
  )

  // 🔒 Herói em uso em outra aba: tela de bloqueio (anti-duplicata de run).
  if (blocked) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-black grid place-items-center px-6">
        <div className="absolute inset-0 opacity-40"><DungeonBackdrop theme={dungeon.id} /></div>
        <div
          className="relative w-full max-w-sm rounded-2xl p-6 text-center"
          style={{
            background: 'linear-gradient(180deg, rgba(30,30,63,0.96), rgba(15,15,35,0.98))',
            border: `1px solid ${dungeon.accentSoft}`,
            boxShadow: `0 24px 60px -12px ${dungeon.accentSoft}`,
          }}
        >
          <div className="text-5xl mb-3">🔒</div>
          <h3 className="text-xl font-black text-white mb-2">Herói em uso</h3>
          <p className="text-sm text-textsec leading-snug mb-5">{blocked}</p>
          <button
            onClick={() => onExit({ hp: effMaxHp, mp: character.maxMp, stamina })}
            className="w-full py-3 rounded-lg font-black text-white text-sm transition-transform active:scale-[0.98] hover:scale-[1.02]"
            style={{ background: `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accentSoft})` }}
          >
            Voltar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden overscroll-none touch-pan-y bg-black">
      {/* Cenário temático — full-screen. Em combate Floresta: battle BG cinematográfico.
          Na exploração com WalkScene o mapa é a própria cena. */}
      <div className="absolute inset-0">
        <DungeonBackdrop
          theme={dungeon.id}
          imageUrl={phase === 'combat' ? (backgroundImageUrl || DUNGEON_BATTLE_BG[dungeon.id]) : undefined}
          imageOverlayOpacity={backgroundImageOverlay}
        />
      </div>

      {/* ✨ Flash de SUBIU DE NÍVEL — explosão dourada sobre toda a tela */}
      <AnimatePresence>
        {levelUpFlash !== null && (
          <motion.div
            key="levelup-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-[60] grid place-items-center pointer-events-none"
          >
            {/* Brilho radial pulsante */}
            <motion.div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(circle at center, rgba(253,224,71,0.45) 0%, rgba(253,224,71,0.12) 35%, transparent 70%)' }}
              animate={{ opacity: [0, 1, 0.6, 0] }}
              transition={{ duration: 2.4, times: [0, 0.2, 0.6, 1] }}
            />
            {/* Raios brilhantes girando */}
            <motion.div
              className="absolute w-[140vmax] h-[140vmax]"
              style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(253,224,71,0.18) 12deg, transparent 24deg, transparent 36deg, rgba(253,224,71,0.18) 48deg, transparent 60deg)' }}
              initial={{ rotate: 0, opacity: 0 }}
              animate={{ rotate: 90, opacity: [0, 0.8, 0] }}
              transition={{ duration: 2.4, ease: 'easeOut' }}
            />
            <motion.div
              initial={{ scale: 0.3, opacity: 0, y: 20 }}
              animate={{ scale: [0.3, 1.15, 1], opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              className="relative text-center"
            >
              <motion.div
                className="text-7xl sm:text-8xl mb-2 drop-shadow-[0_0_30px_rgba(253,224,71,0.9)]"
                animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.15, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              >
                ⭐
              </motion.div>
              <div className="text-yellow-200 font-black text-3xl sm:text-5xl tracking-wide drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                SUBIU DE NÍVEL!
              </div>
              {levelUpFlash > 0 && (
                <div className="text-amber-300 font-black text-xl sm:text-2xl mt-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  Nível {levelUpFlash}
                </div>
              )}
              <div className="text-emerald-200 font-bold text-sm sm:text-base mt-2 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
                ❤️ HP e 🔮 MP restaurados!
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="relative h-full flex flex-col"
        style={{ ['--dgn' as string]: dungeon.accent, ['--dgn-soft' as string]: dungeon.accentSoft }}
        animate={trapShake ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* ---------- Header ---------- */}
        <div className="relative z-20 flex-shrink-0 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-black/50 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl sm:text-2xl">{dungeon.emoji}</span>
            <div className="min-w-0">
              <h2 className="text-white font-black text-sm sm:text-base truncate">{dungeon.name}</h2>
              <div className="flex items-center gap-1">
                {Array.from({ length: dungeon.rooms }).map((_, i) => {
                  const done = i + 1 <= mainsDone
                  const current = i + 1 === curTier && !isBossRoom
                  return (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full ${done ? 'bg-green-400' : current ? 'animate-pulse' : 'bg-white/20'}`}
                      style={current ? { backgroundColor: dungeon.accent } : undefined}
                    />
                  )
                })}
                <span className={`text-[11px] ml-0.5 ${isBossRoom ? 'animate-pulse' : 'opacity-40'}`}>👑</span>
                <span className="text-[10px] text-white/60 ml-1.5">
                  {isBossRoom ? 'Covil do Boss' : tokenIdx === 0 ? 'Entrada' : `Sala ${curTier}/${dungeon.rooms}`}
                </span>
              </div>
            </div>
          </div>

          {/* Stats do topo: só na trilha. Em combate a arena já mostra o HP dos lutadores. */}
          {phase !== 'combat' && (
            <div className="hidden sm:flex flex-col gap-0.5">
              <ResourceBar icon="❤️" value={hp} max={effMaxHp} gradient="from-red-600 to-rose-400" />
              <ResourceBar icon="🔮" value={mp} max={character.maxMp} gradient="from-blue-600 to-cyan-400" />
              <ResourceBar icon="⚡" value={stamina} max={character.maxStamina} gradient="from-yellow-600 to-amber-300" />
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <div className="text-right text-[10px] text-white/80 leading-tight">
              {/* Ouro: só o farmado NESTA run (deixa claro quanto rendeu a masmorra). */}
              <div title="Ouro farmado nesta masmorra">💰 {totals.gold}</div>
              {/* XP: a do personagem (já somada à da run) sobre a do próximo nível —
                  mostra quanto falta p/ subir. Ex.: 1452/3000 XP. */}
              <div title={`Progresso de XP para o próximo nível${totals.xp > 0 ? ` (+${totals.xp} nesta run)` : ''}`}>
                ⭐ {(character.experience ?? 0) + totals.xp}
                {character.nextLevelExperience ? `/${character.nextLevelExperience}` : ''} XP
                {totals.xp > 0 && <span className="text-purple-300"> +{totals.xp}</span>}
              </div>
            </div>
            {(phase === 'explore' || phase === 'combat') && (
              <button
                onClick={() => setExitConfirm(true)}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-colors"
                title={phase === 'combat' ? 'Abandonar a batalha e sair (mantém recompensas)' : 'Sair da masmorra (mantém recompensas)'}
              >
                🚪 {phase === 'combat' ? 'Fugir' : 'Sair'}
              </button>
            )}
          </div>
        </div>

        {/* Barras de recurso no mobile — só na trilha; em combate a arena mostra o HP. */}
        {phase !== 'combat' && (
          <div className="sm:hidden flex-shrink-0 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-3 py-1.5 bg-black/40 border-b border-white/10 relative z-20">
            <ResourceBar icon="❤️" value={hp} max={character.maxHp} gradient="from-red-600 to-rose-400" />
            <ResourceBar icon="🔮" value={mp} max={character.maxMp} gradient="from-blue-600 to-cyan-400" />
            <ResourceBar icon="⚡" value={stamina} max={character.maxStamina} gradient="from-yellow-600 to-amber-300" />
          </div>
        )}

        {/* Área de conteúdo abaixo do header (e barras mobile): WalkScene + fases */}
        <div className="relative flex-1 min-h-0 flex flex-col">
        {/* ============================================================ */}
        {/* WALK SCENE (Anterra treadmill) — só na exploração; combate usa battle BG */}
        {/* ============================================================ */}
        {useWalkScene && phase === 'explore' && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <WalkScene
              dungeonId={dungeon.id}
              accent={dungeon.accent}
              mode={walkMode}
              nodeIndex={tokenIdx}
              pathPoints={trailPoints}
              avatar={character.avatar}
              trailMarks={walkTrailMarks}
              nextIsBoss={nextIsBoss}
              onApproachComplete={handleWalkApproachComplete}
            />
          </div>
        )}

        {/* ---------- Banner central ---------- */}
        <div className="absolute top-20 inset-x-0 flex justify-center z-40 pointer-events-none px-4">
          <AnimatePresence>
            {banner && (
              <motion.div
                key={banner.key}
                initial={{ y: -25, opacity: 0, scale: 0.85 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -15, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className={`bg-black/80 backdrop-blur-md border rounded-2xl px-5 py-2.5 shadow-2xl flex items-center ${banner.sticky ? 'pointer-events-auto' : ''}`}
                style={{ borderColor: dungeon.accentSoft, boxShadow: `0 0 30px ${dungeon.accentSoft}` }}
              >
                <span className="text-lg mr-2">{banner.icon}</span>
                <span className="text-white font-bold text-sm sm:text-base">{banner.text}</span>
                {banner.sticky && (
                  <button
                    onClick={() => setBanner(prev => (prev?.key === banner.key ? null : prev))}
                    className="ml-3 text-white/50 hover:text-white text-base leading-none"
                    aria-label="Fechar aviso"
                  >
                    ✕
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---------- Painel de consumíveis (mapa e combate) ---------- */}
        {showItems && (
          <div className="absolute inset-0 z-50 grid place-items-center px-5" onClick={() => setShowItems(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-sm rounded-2xl p-5 border border-white/15 bg-[#12122a]/95 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-white text-lg">🧪 Consumíveis</h3>
                <div className="flex gap-3 text-xs font-combat">
                  <span className="text-emerald-400">❤️ {Math.round(hp)}/{effMaxHp}</span>
                  <span className="text-blue-400">🔮 {mp}/{character.maxMp}</span>
                </div>
              </div>
              {consumables.length === 0 ? (
                <p className="text-textsec text-sm text-center py-6">Nenhum consumível restaurador no inventário.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {consumables.map(c => {
                    const hpFull = hp >= effMaxHp
                    const mpFull = mp >= character.maxMp
                    const isBuff = c.atk > 0 || c.def > 0 || c.dodge > 0
                    const disabled =
                      (c.hp > 0 && c.mp === 0 && hpFull) ||
                      (c.mp > 0 && c.hp === 0 && mpFull) ||
                      (c.hp > 0 && c.mp > 0 && hpFull && mpFull) ||
                      (c.cure === 'poison' && !combatFx.poisoned) ||
                      (c.cure === 'bleed' && !combatFx.bleeding) ||
                      (isBuff && phase !== 'combat') ||
                      c.revive > 0
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-8 h-8 shrink-0 inline-flex items-center justify-center text-xl">
                            <ItemThumb name={c.name} emoji={c.icon} className="text-xl" />
                          </span>
                          <div className="min-w-0">
                            <div className="text-white text-sm font-bold truncate">
                              {c.name} <span className="text-textsec font-normal">×{c.qty}</span>
                            </div>
                            <div className="text-textsec text-[11px]">
                              {c.hp > 0 ? `+${c.hp} ❤️` : ''}{c.hp > 0 && c.mp > 0 ? ' • ' : ''}{c.mp > 0 ? `+${c.mp} 🔮` : ''}
                              {c.cure === 'poison' ? 'Cura veneno' : ''}
                              {c.cure === 'bleed' ? 'Estanca sangramento' : ''}
                              {c.atk > 0 ? `+${c.atk} ⚔️ por ${c.buffTurns || 3} turnos` : ''}
                              {c.def > 0 ? `+${c.def} 🛡️ por ${c.buffTurns || 3} turnos` : ''}
                              {c.dodge > 0 ? `+${c.dodge}% 💨 por ${c.buffTurns || 3} turnos` : ''}
                              {c.revive > 0 ? `Revive com ${c.revive}% do HP — age sozinha ao cair` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => useConsumable(c)}
                          disabled={disabled}
                          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-40 transition-transform active:scale-95"
                          style={{ background: 'linear-gradient(90deg,#2ecc71,#16a34a)' }}
                        >
                          Usar
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {phase === 'combat' && (
                <p className="text-textsec/70 text-[10px] text-center mt-2">No combate, usar um item consome seu turno.</p>
              )}
              <button
                onClick={() => setShowItems(false)}
                className="mt-3 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* ---------- Confirmação de saída (PAUSA a run + log de espólio) ---------- */}
        <AnimatePresence>
          {exitConfirm && (
            <motion.div
              key="exit-confirm"
              className="absolute inset-0 z-[60] grid place-items-center px-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* backdrop opaco: esconde a batalha/trilha enquanto o jogador decide */}
              <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
              <motion.div
                initial={{ scale: 0.85, y: 24, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="relative w-full max-w-sm rounded-2xl p-5 sm:p-6 text-center"
                style={{
                  background: 'linear-gradient(180deg, rgba(30,30,63,0.96), rgba(15,15,35,0.98))',
                  border: `1px solid ${dungeon.accentSoft}`,
                  boxShadow: `0 24px 60px -12px ${dungeon.accentSoft}`,
                }}
              >
                <div className="text-4xl mb-2">🚪</div>
                <h3 className="text-xl font-black text-white mb-1">
                  {phase === 'combat' ? 'Fugir da batalha?' : 'Sair da masmorra?'}
                </h3>
                <p className="text-xs text-textsec leading-snug mb-4">
                  A run será encerrada. Tudo que você já ganhou está salvo — a stamina se restaura sozinha (+2 a cada 15 min ocioso).
                </p>

                {/* Log do espólio da run até agora (ouro/XP + itens com ícone real) */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-3 mb-4 text-left">
                  <div className="flex items-center justify-between text-[11px] font-bold mb-2">
                    <span className="text-amber-300">💰 {totals.gold}</span>
                    <span className="text-purple-300">⭐ {totals.xp} XP</span>
                    <span className="text-red-300">⚔️ {totals.kills}</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-textsec/70 font-bold mb-1.5">
                    Espólio coletado {totals.items.length > 0 ? `(${totals.items.length})` : ''}
                  </div>
                  {totals.items.length === 0 ? (
                    <p className="text-textsec/70 text-xs py-2 text-center">Nenhum item coletado ainda.</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {(() => {
                        const agg = new Map<string, { name: string; emoji: string; label: string; qty: number }>()
                        for (const it of totals.items) {
                          const cur = agg.get(it.label)
                          if (cur) cur.qty += 1
                          else agg.set(it.label, { ...it, qty: 1 })
                        }
                        return Array.from(agg.values()).map((it, i) => (
                          <div key={`${it.label}-${i}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
                            <span className="w-6 h-6 inline-flex items-center justify-center shrink-0">
                              <ItemThumb name={it.name} emoji={it.emoji} className="text-lg" />
                            </span>
                            <span className="text-white text-xs font-bold truncate flex-1">{it.label}</span>
                            {it.qty > 1 && <span className="text-textsec text-[11px] font-mono shrink-0">×{it.qty}</span>}
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setExitConfirm(false)}
                    className="flex-1 py-3 rounded-lg font-bold text-white text-sm bg-white/10 hover:bg-white/20 border border-white/20 transition-colors active:scale-[0.98]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { setExitConfirm(false); finishRun(false) }}
                    className="flex-1 py-3 rounded-lg font-black text-white text-sm transition-transform active:scale-[0.98] hover:scale-[1.02]"
                    style={{ background: 'linear-gradient(90deg, #e94560, #b91c1c)', boxShadow: '0 0 20px rgba(233,69,96,0.4)' }}
                  >
                    🚪 {phase === 'combat' ? 'Fugir' : 'Sair'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================================ */}
        {/* FASE: EXPLORAÇÃO */}
        {/* ============================================================ */}
        {phase === 'explore' && (
          <div className="flex-1 flex flex-col min-h-0 relative z-10">
            {/* ---------- MAPA: WalkScene (fundo) ou trilha SVG clássica ---------- */}
            <main className="relative flex-1 min-h-0">
              {!useWalkScene && (
                <>
                  <MapAmbient backgroundImageUrl={DUNGEON_RUN_MAP_BG[dungeon.id]} />
                  <div className="absolute inset-0 mx-auto max-w-md pointer-events-none">
                    <div className="relative h-full pointer-events-auto">
                      <MapTrail points={trailPoints} progress={tokenIdx / LAST} />
                      {trailPoints.map((pt, idx) => (
                        <MapNode
                          key={idx}
                          pt={pt}
                          state={nodeState(idx)}
                          revealed={nodeEvents[idx]}
                          accent={dungeon.accent}
                          bossName={dungeon.boss.name}
                        />
                      ))}
                      <PlayerToken point={trailPoints[tokenIdx]} moving={moving} avatar={character.avatar} />
                    </div>
                  </div>
                </>
              )}

              <div className="absolute inset-0 mx-auto max-w-md pointer-events-none">
                <div className="relative h-full pointer-events-auto">
                {/* números flutuantes (ganhos/perdas) */}
                <div className="absolute left-1/2 top-3 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-20">
                  {floats.map(f => (
                    <span
                      key={f.id}
                      className="float-num font-combat font-black text-lg"
                      style={{ color: f.color, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                    >
                      {f.label}
                    </span>
                  ))}
                </div>

              {/* selo de progresso */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-[10px] uppercase tracking-[0.2em] text-textsec/70 font-bold pointer-events-none">
                {atBoss
                  ? 'Covil do Chefe'
                  : tokenIdx === 0
                    ? `Entrada • ${dungeon.rooms} salas`
                    : atMainNode
                      ? `⚔️ Sala ${curTier} de ${dungeon.rooms}`
                      : `A caminho da sala ${curTier} de ${dungeon.rooms}`}
              </div>

              {/* overlay: dado rolando */}
              <DiceOverlay rolling={exploreRolling} result={exploreResult} />

              {/* dialog: o Mestre narra — abre junto da rolagem / dos beats da história */}
              <NarrationDialog text={narration} open={narrationOpen} onClose={() => setNarrationOpen(false)} />

              {/* overlays: evento / boss / loot */}
              <AnimatePresence>
                {lootCard && (
                  <motion.div
                    key="loot-overlay"
                    className="absolute inset-0 z-30 grid place-items-center px-5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
                    <motion.div
                      initial={{ scale: 0.4, y: 40, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0, y: 20 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                      className="relative w-full max-w-sm rounded-2xl p-6 text-center"
                      style={{
                        background: 'linear-gradient(180deg, rgba(30,30,63,0.92), rgba(15,15,35,0.96))',
                        border: `1px solid ${dungeon.accentSoft}`,
                        boxShadow: `0 24px 60px -12px ${dungeon.accentSoft}, 0 0 40px ${dungeon.accentSoft}`,
                        backdropFilter: 'blur(20px)',
                      }}
                    >
                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 240, damping: 12, delay: 0.08 }}
                        className="text-6xl mb-2 mt-1 inline-block"
                        style={{ filter: `drop-shadow(0 0 18px ${dungeon.accentSoft})` }}
                      >
                        {lootCard.def.icon}
                      </motion.div>

                      <h3 className="text-2xl font-black mb-1.5" style={{ color: dungeon.accent }}>{lootCard.def.title}</h3>
                      {/* Badge da sorte do nó: fecha o loop d20 → qualidade do espólio. */}
                      {lootCard.luckRoll != null && (
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1 mb-2 rounded-full border text-xs font-bold font-combat ${
                            lootCard.luckRoll >= 20
                              ? 'border-amber-400/70 text-amber-300 bg-amber-400/10'
                              : lootCard.luckRoll >= 14
                              ? 'border-emerald-400/60 text-emerald-300 bg-white/5'
                              : 'border-white/20 text-textsec bg-white/5'
                          }`}
                        >
                          🎲 Sorte {lootCard.luckRoll}
                          {lootCard.luckRoll >= 20 ? ' — espólio máximo!' : lootCard.luckRoll >= 14 ? ' — boa fortuna' : ''}
                        </div>
                      )}
                      {lootCard.text && <p className="text-sm text-textsec leading-snug mb-4">{lootCard.text}</p>}

                      <EffectChipList effects={lootCard.effects} />

                      <button
                        onClick={dismissLootCard}
                        className="w-full py-3.5 rounded-lg font-bold text-white text-base transition-transform active:scale-[0.98] hover:scale-[1.02]"
                        style={{ background: `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accent}aa)`, boxShadow: `0 0 22px ${dungeon.accentSoft}` }}
                      >
                        Continuar a jornada →
                      </button>
                    </motion.div>
                  </motion.div>
                )}

                {eventCard && !lootCard && (
                  <motion.div
                    key="event-overlay"
                    className="absolute inset-0 z-30 grid place-items-center px-5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
                    <motion.div
                      initial={{ scale: 0.4, y: 40, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0, y: 20 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                      className="relative w-full max-w-sm rounded-2xl p-6 text-center"
                      style={{
                        background: 'linear-gradient(180deg, rgba(30,30,63,0.92), rgba(15,15,35,0.96))',
                        border: `1px solid ${eventCard.def.kind === 'trap' ? 'rgba(248,113,113,0.4)'
                          : eventCard.def.kind === 'monster' ? 'rgba(231,76,60,0.4)'
                          : eventCard.def.kind === 'blessing' ? 'rgba(253,230,138,0.4)'
                          : dungeon.accentSoft}`,
                        boxShadow: `0 24px 60px -12px ${dungeon.accentSoft}, 0 0 40px ${dungeon.accentSoft}`,
                        backdropFilter: 'blur(20px)',
                      }}
                    >
                      {exploreResult && (
                        <div
                          className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-background border text-xs font-combat font-bold"
                          style={{ borderColor: dungeon.accentSoft, color: dungeon.accent }}
                        >
                          🎲 d20 → {exploreResult.roll}
                        </div>
                      )}

                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 240, damping: 12, delay: 0.08 }}
                        className="mb-2 mt-1 inline-flex items-center justify-center"
                        style={{ filter: `drop-shadow(0 0 18px ${dungeon.accentSoft})` }}
                      >
                        {eventCard.monsters && eventCard.monsters.length > 1 ? (
                          <span className="flex items-end justify-center gap-2">
                            {eventCard.monsters.map((mm, i) => (
                              <span
                                key={mm.id}
                                className={i === 1 ? 'block w-24 h-24 sm:w-28 sm:h-28' : 'block w-16 h-16 sm:w-20 sm:h-20 opacity-90'}
                              >
                                <MonsterThumb name={mm.name} image={mm.image} emoji={mm.emoji} className="text-4xl" />
                              </span>
                            ))}
                          </span>
                        ) : eventCard.monster ? (
                          <span className="block w-28 h-28 sm:w-32 sm:h-32">
                            <MonsterThumb
                              name={eventCard.monster.name}
                              image={eventCard.monster.image}
                              emoji={eventCard.monster.emoji}
                              className="text-6xl"
                            />
                          </span>
                        ) : (
                          <span className="text-6xl">{eventCard.def.icon}</span>
                        )}
                      </motion.div>

                      <h3 className="text-2xl font-black mb-1.5" style={{ color: dungeon.accent }}>{eventCard.def.title}</h3>
                      {eventCard.text && <p className="text-sm text-textsec leading-snug mb-4">{eventCard.text}</p>}

                      <EffectChipList effects={eventCard.effects} />

                      {eventCard.monster ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => startCombat(eventCard.monsters ?? eventCard.monster!)}
                            className="flex-1 py-3.5 rounded-lg font-black text-white text-lg transition-transform active:scale-[0.98] hover:scale-[1.02] inline-flex items-center justify-center gap-2"
                            style={{ background: 'linear-gradient(90deg, #e74c3c, #b91c1c)', boxShadow: '0 0 24px rgba(231,76,60,0.45)' }}
                          >
                            ⚔️ Lutar!
                          </button>
                          <button
                            onClick={() => { setAuto(true); startCombat(eventCard.monsters ?? eventCard.monster!) }}
                            title="Resolver a luta no automático (o piloto joga os turnos por você)"
                            className="shrink-0 px-4 py-3.5 rounded-lg font-black text-white text-sm transition-transform active:scale-[0.98] hover:scale-[1.02] inline-flex items-center justify-center gap-1.5"
                            style={{ background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)', boxShadow: '0 0 24px rgba(59,130,246,0.4)' }}
                          >
                            ⚡ Auto
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={dismissEvent}
                          className="w-full py-3.5 rounded-lg font-bold text-white text-base transition-transform active:scale-[0.98] hover:scale-[1.02]"
                          style={{ background: `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accent}aa)`, boxShadow: `0 0 22px ${dungeon.accentSoft}` }}
                        >
                          Continuar a jornada →
                        </button>
                      )}
                    </motion.div>
                  </motion.div>
                )}

                {atBoss && !eventCard && !lootCard && (
                  <motion.div
                    key="boss-overlay"
                    className="absolute inset-0 z-30 grid place-items-center px-5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px]" />
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="relative w-full max-w-sm rounded-2xl p-7 text-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(180deg, rgba(60,8,40,0.92), rgba(15,8,20,0.97))',
                        border: '1px solid rgba(231,76,60,0.5)',
                        boxShadow: '0 30px 70px -10px rgba(231,76,60,0.5), 0 0 60px rgba(231,76,60,0.35)',
                      }}
                    >
                      <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 2.5, repeat: Infinity }}
                        style={{ background: 'radial-gradient(circle at 50% 35%, rgba(231,76,60,0.25), transparent 60%)' }}
                      />
                      <div className="relative">
                        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-error">⚠ O Chefe Desperta</span>
                        <motion.div
                          animate={{ scale: [1, 1.06, 1], rotate: [0, -2, 2, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                          className="my-3 inline-flex items-center justify-center"
                          style={{ filter: 'drop-shadow(0 0 26px rgba(231,76,60,0.7))' }}
                        >
                          <span className="block w-32 h-32 sm:w-36 sm:h-36">
                            <MonsterThumb
                              name={dungeon.boss.name}
                              image={dungeon.boss.image}
                              emoji={dungeon.boss.emoji}
                              className="text-7xl"
                            />
                          </span>
                        </motion.div>
                        <h2 className="text-3xl font-black text-white leading-none">{dungeon.boss.name}</h2>
                        <p className="text-sm text-error/90 font-bold uppercase tracking-wider mt-1 mb-5">{dungeon.boss.title}</p>
                        <button
                          onClick={() => startCombat(serverPackRef.current ?? serverMonsterRef.current ?? scaleMonster(dungeon.boss, dungeon, charLevel, { tier: dungeon.rooms, isMain: true, isBoss: true }, combatClass, tier))}
                          className="w-full py-4 rounded-lg font-black text-white text-lg inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98] hover:scale-[1.02]"
                          style={{ background: 'linear-gradient(90deg, #e94560, #b91c1c)', boxShadow: '0 0 28px rgba(233,69,96,0.5)' }}
                        >
                          👑 Enfrentar o Chefe
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
                </div>
              </div>

              {/* ---------- AÇÃO: flutua por cima do mapa (não empurra mais a área
                  do mapa pra cima) — barra compacta numa linha só. ---------- */}
              <footer
                className="absolute inset-x-0 bottom-0 z-[35] px-4 pt-8 pointer-events-none"
                style={{
                  paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
                  background: 'linear-gradient(180deg, transparent, rgba(8,8,10,0.55) 45%, rgba(8,8,10,0.82))',
                }}
              >
                <div className="pointer-events-auto">
                  {/* Dica única no início da run (some sozinha após ~30s). */}
                  <AnimatePresence>
                    {tipVisible && (
                      <motion.div
                        initial={{ opacity: 0, y: 5, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 8 }}
                        exit={{ opacity: 0, y: -5, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.35 }}
                        className="mx-auto max-w-md flex items-center justify-center overflow-hidden"
                      >
                        <div className="flex items-center gap-2 rounded-xl border border-amber-300/15 bg-amber-500/5 px-3 py-1.5 text-left">
                          <span className="shrink-0 text-base leading-none">{TIPS[tipIdx].icon}</span>
                          <span className="text-[11px] leading-snug text-amber-100/80">
                            <span className="font-bold text-amber-200/90">Dica: </span>
                            {TIPS[tipIdx].text}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Barra única: sair, piloto automático, poções (manual + auto), seguir */}
                  <div className="mx-auto max-w-md flex items-center gap-1.5">
                    <button
                      onClick={() => setExitConfirm(true)}
                      disabled={exploreRolling || walkBusy}
                      title="Sair da masmorra (mantém recompensas)"
                      className="shrink-0 w-11 h-11 grid place-items-center rounded-xl border border-white/10 bg-black/50 backdrop-blur-xl text-textsec hover:text-white hover:border-white/25 transition-colors active:scale-95 disabled:opacity-40"
                    >
                      🚪
                    </button>
                    <button
                      onClick={() => setAuto(a => !a)}
                      title={auto ? 'Desligar o piloto automático' : 'Farm visual: deixa a aba aberta — anda, coleta e luta sozinho'}
                      className={`shrink-0 w-11 h-11 grid place-items-center rounded-xl border text-lg transition-colors active:scale-95 ${
                        auto
                          ? 'bg-blue-600/90 border-blue-300/60 text-white shadow-lg shadow-blue-900/40'
                          : 'bg-black/50 border-white/10 text-textsec hover:text-white hover:border-white/25'
                      }`}
                    >
                      ⚡
                    </button>
                    {auto && (
                      <button
                        onClick={() => setAutoConsumables(v => !v)}
                        title={autoConsumables ? 'O piloto usa poções de HP/MP — clique para desligar' : 'O piloto NÃO usa poções — clique para ligar'}
                        className={`shrink-0 w-11 h-11 grid place-items-center rounded-xl border transition-colors active:scale-95 relative ${
                          autoConsumables
                            ? 'bg-emerald-600/85 border-emerald-300/60 text-white'
                            : 'bg-black/50 border-white/10 text-white/50 hover:text-white'
                        }`}
                      >
                        💊
                        <span className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ${autoConsumables ? 'bg-emerald-200' : 'bg-white/25'}`} />
                      </button>
                    )}
                    <button
                      onClick={() => { loadConsumables(); setShowItems(true) }}
                      disabled={exploreRolling || walkBusy}
                      title="Usar consumível (HP/MP)"
                      className="shrink-0 w-11 h-11 grid place-items-center rounded-xl border border-white/10 bg-black/50 backdrop-blur-xl text-textsec hover:text-white hover:border-white/25 transition-colors active:scale-95 disabled:opacity-40 relative"
                    >
                      🧪
                      {consumables.length > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-[9px] font-black grid place-items-center text-white">
                          {consumables.reduce((n, c) => n + c.qty, 0)}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={
                        atBoss
                          ? () => startCombat(serverPackRef.current ?? serverMonsterRef.current ?? scaleMonster(dungeon.boss, dungeon, charLevel, { tier: dungeon.rooms, isMain: true, isBoss: true }, combatClass, tier))
                          : advance
                      }
                      disabled={exploreRolling || walkBusy || !!eventCard || !!lootCard}
                      className="flex-1 h-11 rounded-xl font-black text-sm sm:text-base text-white inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:scale-[1.01] disabled:opacity-50 disabled:cursor-wait disabled:hover:scale-100"
                      style={{
                        background: atBoss
                          ? 'linear-gradient(90deg, #e94560, #b91c1c)'
                          : nextMainNode
                            ? 'linear-gradient(90deg, #f39c12, #b45309)'
                            : `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accent}aa)`,
                        boxShadow: atBoss ? '0 0 26px rgba(233,69,96,0.5)' : nextMainNode ? '0 0 26px rgba(243,156,18,0.45)' : `0 0 26px ${dungeon.accentSoft}`,
                      }}
                    >
                      {exploreRolling || walkBusy
                        ? walkMode === 'scroll'
                          ? '🌲 Vasculhando...'
                          : walkMode === 'approach'
                            ? '👀 Aproximando...'
                            : '...'
                        : atBoss
                          ? '⚔️ Enfrentar o Chefe'
                          : nextIsBoss
                            ? '👑 Aproximar-se do covil'
                            : nextMainNode
                              ? `⚔️ Sala ${trailPoints[tokenIdx + 1]?.tier}`
                              : '🎲 Seguir a trilha'}
                    </button>
                  </div>
                </div>
              </footer>
            </main>

            {/* ---------- LOG DE FARM: itens coletados na run (persiste por node) ---------- */}
            {/* Diferente dos floats (que somem), aqui o drop de cada node FICA — o jogador */}
            {/* vê tudo que farmou. Ouro/XP ficam só no topo; aqui são só os itens. */}
            {totals.items.length > 0 && (
              <div className="flex-shrink-0 px-4 z-20">
                <div className="mx-auto max-w-md flex items-center gap-1.5 overflow-x-auto py-1.5">
                  <span className="shrink-0 text-sm pr-0.5" title="Itens farmados nesta run">🎒</span>
                  {(() => {
                    const agg = new Map<string, { name: string; emoji: string; label: string; qty: number }>()
                    for (const it of totals.items) {
                      const cur = agg.get(it.label)
                      if (cur) cur.qty += 1
                      else agg.set(it.label, { ...it, qty: 1 })
                    }
                    return Array.from(agg.values()).map((it, i) => (
                      <div
                        key={`${it.label}-${i}`}
                        title={it.qty > 1 ? `${it.label} ×${it.qty}` : it.label}
                        className="relative shrink-0 w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center"
                      >
                        <ItemThumb name={it.name} emoji={it.emoji} className="text-lg" />
                        {it.qty > 1 && (
                          <span className="absolute -bottom-1 -right-1 px-0.5 rounded bg-black/85 border border-white/15 text-[8px] font-mono font-bold text-white leading-none">
                            ×{it.qty}
                          </span>
                        )}
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* FASE: COMBATE — com WalkScene fica overlay in-loco no mapa */}
        {/* ============================================================ */}
        {phase === 'combat' && monster && (
          <div className="flex-1 flex flex-col min-h-0 relative z-10">
            <BattleScene
              className="flex-1 min-h-[280px]"
              left={playerFighter}
              right={monsterFighter}
              rightGroup={packFighters}
              hideEnemyBars={isPack}
              enemyHpOnly
              focusEnemyId={focusEnemyId}
              brightenEnemyImage

              currentTurnId={currentTurnId}
              winnerId={winnerId}
              combatEnded={combatEnded}
              event={battleEvent}
              diceResults={diceResults}
              dicePanel={dicePanel}
              backdrop={null}
            />

            {/* Roster do pacote (só com >1 inimigo): clique para escolher o alvo no seu
                turno. O ativo fica destacado; os outros fustigam com chip leve por rodada. */}
            {pack.length > 1 && !combatEnded && (
              <div className="flex-shrink-0 bg-black/55 border-t border-white/5 px-3 sm:px-6 py-1.5">
                <div className="mx-auto max-w-2xl flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-[10px] text-white/45 font-bold mr-0.5">Alvo:</span>
                  {pack.map(mm => {
                    const active = mm.id === monster?.id
                    const canTarget = stage === 'playerSelect' && !active
                    return (
                      <button
                        key={mm.id}
                        onClick={() => canTarget && setActiveTarget(mm.id)}
                        disabled={!canTarget}
                        title={canTarget ? `Focar ${mm.name}` : active ? 'Alvo atual' : 'Escolha o alvo no seu turno'}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg border transition-all ${
                          active
                            ? 'bg-red-600/30 border-red-400/70'
                            : canTarget
                              ? 'bg-white/5 border-white/15 hover:border-white/40 hover:scale-105 cursor-pointer'
                              : 'bg-white/5 border-white/10 opacity-70 cursor-default'
                        }`}
                      >
                        <span className="w-7 h-7 inline-flex items-center justify-center shrink-0">
                          <MonsterThumb name={mm.name} image={mm.image} emoji={mm.emoji} className="text-base" />
                        </span>
                        {/* Só nome/foco — o HP agora vive no card da arena (sem duplicar). */}
                        <span className="text-[11px] font-bold text-white/80 leading-none">{active ? '🎯 ' : ''}{mm.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Log de combate (estilo RiPG): mostra a conta dos dados e o dano resultante */}
            <div className="flex-shrink-0 bg-black/60 border-t border-white/5 px-3 sm:px-6 py-1.5">
              <div className="mx-auto max-w-2xl h-[54px] overflow-y-auto overscroll-contain flex flex-col justify-end gap-0.5 font-mono text-[11px] leading-tight text-white/65">
                {log.slice(-4).map((line, i) => (
                  <div key={`${log.length}-${i}`} className="break-words last:text-white/90">{line}</div>
                ))}
              </div>
            </div>

            {/* Barra de ações do combate — altura ESTÁVEL entre os estados (botões ↔
                "rolando" ↔ "resolvendo"), senão a arena inteira pula a cada turno.
                Os toggles do piloto têm uma LINHA própria (antes eram absolute no canto
                e sobrepunham os botões de ataque no celular). */}
            <div
              className="relative flex-shrink-0 bg-black/70 backdrop-blur-md border-t border-white/10 px-3 sm:px-6 pt-1.5 flex flex-col"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              {/* Toggle do piloto automático (+ switch de poções) — liga/desliga a qualquer momento */}
              <div className="h-9 flex items-center justify-end gap-1.5">
                {!combatEnded && (
                  <>
                    {auto && (
                      <button
                        onClick={() => setAutoConsumables(v => !v)}
                        title={autoConsumables ? 'O piloto usa poções de HP/MP — clique para desligar' : 'O piloto NÃO usa poções — clique para ligar'}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-black border transition-colors ${
                          autoConsumables
                            ? 'bg-emerald-600/85 border-emerald-300/60 text-white'
                            : 'bg-white/5 border-white/15 text-white/50 hover:text-white'
                        }`}
                      >
                        🧪 {autoConsumables ? 'ON' : 'OFF'}
                      </button>
                    )}
                    <button
                      onClick={() => setAuto(a => !a)}
                      title={auto ? 'Desligar o piloto automático' : 'Ligar farm visual (aba aberta — joga os turnos por você)'}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black border transition-colors ${
                        auto
                          ? 'bg-blue-600/90 border-blue-300/60 text-white shadow-lg shadow-blue-900/50'
                          : 'bg-white/5 border-white/15 text-white/60 hover:text-white hover:border-white/30'
                      }`}
                    >
                      {auto ? '⚡ Auto ON' : '⚡ Auto'}
                    </button>
                  </>
                )}
              </div>
              <div className="min-h-[56px] flex items-center justify-center">
              {combatEnded ? (
                <div className="text-white/70 text-sm font-bold animate-pulse">
                  {winnerId === character.id ? '🏆 Vitória! Coletando recompensas...' : '💀 Derrotado...'}
                </div>
              ) : stage === 'playerSelect' ? (
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  {/* 🌳 Submenu único "⚔️ Ataque": Golpe + Ataque de Classe (se a árvore já
                      desbloqueou) + specials da forma (filtradas por unlock, com ranks
                      aplicados). Nível 1 sem nó nenhum comprado = só Golpe aparece. */}
                  {(() => {
                    const formSpecials = transform
                      ? getFormSpecials(transform.type)
                          .filter(def => {
                            if (def.id === 'stunning_blow') return unlocks.stunningBlow
                            if (def.kind === 'util') return unlocks.formBuff
                            return true // especial assinatura: sempre disponível transformado
                          })
                          .map(def => applyRankPatch(def, unlocks, transform.type))
                      : []
                    const options: { key: string; label: string; sub: string; locked: boolean; onPick: () => void; tone: 'basic' | 'weapon' | 'ability' }[] = [
                      {
                        key: 'basic', label: ATTACKS.basic.label, tone: 'basic', locked: mp < ATTACKS.basic.mp,
                        sub: `d${PVE_DIE.basic} • grátis`, onPick: () => choosePlayerAttack('basic'),
                      },
                      ...(unlocks.classAttack ? [{
                        key: 'weapon', label: classAtkName, tone: 'weapon' as const, locked: mp < effWeaponMp,
                        sub: `d${effWeaponDie} • ${effWeaponMp} MP`, onPick: () => choosePlayerAttack('weapon'),
                      }] : []),
                      ...formSpecials.map(def => {
                        const cd = combatFx.cd[def.id] || 0
                        const mpCost = def.cost.mp || 0
                        return {
                          key: def.id, label: def.name, tone: 'ability' as const, locked: cd > 0 || mp < mpCost,
                          sub: cd > 0 ? `recarga ${cd}` : `${def.kind === 'dmg' ? `d${def.die ?? 20}·` : ''}${mpCost}MP`,
                          onPick: () => useAbility(def),
                        }
                      }),
                    ]
                    return (
                      <div className="relative">
                        <button
                          onClick={() => setShowAttackMenu(v => !v)}
                          className="px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap transition-all shadow-lg bg-gradient-to-r from-red-700 to-red-500 hover:scale-105"
                        >
                          ⚔️ Ataque
                        </button>
                        {showAttackMenu && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-64 bg-black/90 backdrop-blur-md border border-white/15 rounded-xl p-2 shadow-2xl space-y-1">
                            {options.map(opt => (
                              <button
                                key={opt.key}
                                onClick={() => { setShowAttackMenu(false); opt.onPick() }}
                                disabled={opt.locked}
                                title={opt.locked ? 'Indisponível — MP/recarga insuficiente' : undefined}
                                className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg transition-colors ${
                                  opt.locked ? 'opacity-40 cursor-not-allowed bg-white/5' : 'bg-white/10 hover:bg-white/20'
                                }`}
                              >
                                <span className="font-bold text-white text-xs">{opt.label}</span>
                                <span className="text-[10px] text-white/60">{opt.sub}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Transformação (apenas raças com formas) — custa só MP */}
                  {transformForms.length > 0 && (
                    <div className="relative">
                      {transform ? (
                        <div className="px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap bg-gradient-to-r from-fuchsia-700 to-purple-600 shadow-lg shadow-purple-900/50">
                          {activeTransformCfg?.name}
                          <span className="ml-1.5 text-[10px] opacity-75 font-semibold">{transform.turns} turno(s)</span>
                        </div>
                      ) : (() => {
                        const single = transformForms.length === 1 ? TRANSFORMATION_CONFIG[transformForms[0]] : null
                        // 🐉 Transformação é 1× POR LUTA.
                        const disabled = transformedThisFight || (!!single && mp < single.cost.mp)
                        return (
                          <>
                            <button
                              onClick={() => {
                                if (transformedThisFight) return
                                if (single) activateTransform(transformForms[0])
                                else setShowFormPicker(v => !v)
                              }}
                              disabled={disabled}
                              title={transformedThisFight ? 'Transformação já usada nesta luta (1× por luta)' : single ? `${single.cost.mp} MP • ${single.duration} turnos` : `${transformForms.length} formas disponíveis`}
                              className={`px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap transition-all shadow-lg ${
                                disabled
                                  ? 'bg-gray-700/60 opacity-50 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-fuchsia-700 to-purple-600 hover:scale-105'
                              }`}
                            >
                              {transformedThisFight ? 'Transf. usada' : 'Transformar'}
                              {!transformedThisFight && (
                                <span className="ml-1.5 text-[10px] opacity-75 font-semibold">
                                  {single ? `${single.cost.mp}MP` : `${transformForms.length} formas`}
                                </span>
                              )}
                            </button>

                            {showFormPicker && !single && (
                              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-60 bg-black/90 backdrop-blur-md border border-white/15 rounded-xl p-2 shadow-2xl space-y-1">
                                {transformForms.map(t => {
                                  const cfg = TRANSFORMATION_CONFIG[t]
                                  const dis = mp < cfg.cost.mp
                                  return (
                                    <button
                                      key={t}
                                      onClick={() => activateTransform(t)}
                                      disabled={dis}
                                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                                        dis ? 'opacity-40 cursor-not-allowed bg-white/5' : 'bg-white/10 hover:bg-white/20'
                                      }`}
                                    >
                                      <span className="font-bold text-white text-xs">{cfg.name}</span>
                                      <span className="block text-[10px] text-white/60">{cfg.cost.mp}🔮 • {cfg.duration} turnos</span>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* Usar consumível (consome o turno) */}
                  <button
                    onClick={() => { loadConsumables(); setShowItems(true) }}
                    title="Poções de HP/MP — usar gasta o turno"
                    className="px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap transition-all shadow-lg bg-gradient-to-r from-emerald-700 to-green-600 hover:scale-105"
                  >
                    Item
                  </button>

                  {/* Recuar: sai em segurança mantendo XP/espólio dos abates. Não no boss. */}
                  {!monster?.isBoss && (
                    <button
                      onClick={handleRetreat}
                      title="Recuar em segurança — você mantém o XP e o espólio dos inimigos já derrotados."
                      className="px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap transition-all shadow-lg bg-gradient-to-r from-slate-600 to-slate-500 hover:scale-105"
                    >
                      Recuar
                    </button>
                  )}
                </div>
              ) : stage === 'initiative' || stage === 'playerRoll' ? (
                <div className="text-white/60 text-xs sm:text-sm font-bold">
                  🎲 {hasRolled ? 'Rolando...' : 'Clique no dado na arena para rolar!'}
                </div>
              ) : (
                <div className="text-white/50 text-xs sm:text-sm font-bold animate-pulse">⚔️ Resolvendo ação...</div>
              )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* FASE: RESUMO (vitória / saída) */}
        {/* ============================================================ */}
        {phase === 'summary' && (
          <div className="flex-1 flex items-center justify-center px-4">
            <motion.div
              initial={{ scale: 0.8, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              className="text-center bg-black/80 backdrop-blur-md border-2 rounded-3xl px-8 sm:px-12 py-8 max-w-md shadow-2xl"
              style={{ borderColor: dungeon.accent, boxShadow: `0 0 60px ${dungeon.accentSoft}` }}
            >
              <motion.div
                className="text-6xl mb-3"
                animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2.4 }}
              >
                🏆
              </motion.div>
              <h3 className="text-white font-black text-2xl mb-1">{dungeon.name}</h3>
              <p className="text-white/60 text-xs mb-5">Expedição concluída!</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white/5 border border-white/15 rounded-xl py-2.5">
                  <div className="text-amber-300 font-black text-lg">{totals.gold}</div>
                  <div className="text-white/50 text-[10px]">💰 Ouro</div>
                </div>
                <div className="bg-white/5 border border-white/15 rounded-xl py-2.5">
                  <div className="text-purple-300 font-black text-lg">{totals.xp}</div>
                  <div className="text-white/50 text-[10px]">⭐ XP</div>
                </div>
                <div className="bg-white/5 border border-white/15 rounded-xl py-2.5">
                  <div className="text-red-300 font-black text-lg">{totals.kills}</div>
                  <div className="text-white/50 text-[10px]">⚔️ Vitórias</div>
                </div>
              </div>

              {totals.items.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                  {(() => {
                    // Agrupa por item (como no inventário): 1 slot por tipo + badge de quantidade,
                    // em vez de 1 chip por drop — evita estourar o card com pickups repetidos.
                    const agg = new Map<string, { name: string; emoji: string; label: string; qty: number }>()
                    for (const it of totals.items) {
                      const cur = agg.get(it.label)
                      if (cur) cur.qty += 1
                      else agg.set(it.label, { ...it, qty: 1 })
                    }
                    return Array.from(agg.values()).map((it, i) => (
                      <div
                        key={`${it.label}-${i}`}
                        title={it.qty > 1 ? `${it.label} ×${it.qty}` : it.label}
                        className="relative shrink-0 w-9 h-9 rounded-lg bg-white/5 border border-white/15 grid place-items-center"
                      >
                        <ItemThumb name={it.name} emoji={it.emoji} className="text-lg" />
                        {it.qty > 1 && (
                          <span className="absolute -bottom-1 -right-1 px-0.5 rounded bg-black/85 border border-white/15 text-[8px] font-mono font-bold text-white leading-none">
                            ×{it.qty}
                          </span>
                        )}
                      </div>
                    ))
                  })()}
                </div>
              )}

              {leveledUpThisRun && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="mb-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-3 py-2"
                >
                  <div className="text-yellow-300 font-black text-sm">🎉 Você subiu de nível!</div>
                  <div className="text-yellow-200/80 text-[11px]">Há pontos de atributo esperando para serem distribuídos.</div>
                </motion.div>
              )}

              {auto && canRerun && (
                <div className="text-emerald-300/90 text-[11px] font-bold mb-3 animate-pulse">
                  🤖 Farm visual: refazendo a run (mantenha a aba aberta)…
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {canRerun && (
                  <button
                    onClick={restartRun}
                    className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 shadow-lg transition-all hover:scale-105"
                  >
                    🔁 Nova run
                  </button>
                )}
                <button
                  onClick={exitRun}
                  className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-600 hover:to-teal-500 shadow-lg transition-all hover:scale-105"
                >
                  🏠 Voltar ao mapa
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ============================================================ */}
        {/* FASE: DERROTA */}
        {/* ============================================================ */}
        {phase === 'defeat' && (
          <div className="flex-1 flex items-center justify-center px-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 16 }}
              className="text-center bg-black/85 backdrop-blur-md border-2 border-red-900 rounded-3xl px-8 sm:px-12 py-8 max-w-md shadow-2xl shadow-red-950/60"
            >
              <div className="text-6xl mb-3">💀</div>
              <h3 className="text-red-400 font-black text-2xl mb-2">Você caiu...</h3>
              <p className="text-white/60 text-xs mb-4">
                Você não perde nada: todo o XP, ouro e itens ganhos ficam guardados. Volte mais forte — a stamina se restaura sozinha (+2 a cada 15 min, após 15 min sem gastar).
              </p>
              <div className="text-white/70 text-xs mb-5">
                💰 {totals.gold} ouro • ⭐ {totals.xp} XP • 📦 {totals.items.length} itens — tudo salvo
              </div>
              {auto && canRerun && (
                <div className="text-emerald-300/90 text-[11px] font-bold mb-3 animate-pulse">
                  🤖 Farm visual: refazendo a run (mantenha a aba aberta)…
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {canRerun && (
                  <button
                    onClick={restartRun}
                    className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-600 hover:to-teal-500 shadow-lg transition-all hover:scale-105"
                  >
                    🔁 Refazer a run
                  </button>
                )}
                <button
                  onClick={exitRun}
                  className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-stone-700 to-stone-600 hover:from-stone-600 hover:to-stone-500 shadow-lg transition-all hover:scale-105"
                >
                  🏠 Voltar ao mapa
                </button>
              </div>
            </motion.div>
          </div>
        )}
        </div>
      </motion.div>
    </div>
  )
}
