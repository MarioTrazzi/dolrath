'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BattleScene, { BattleEvent, DiceResult, EquipmentMap, FighterView } from '@/components/battle/BattleScene'
import CombatShell, { type CombatAttackOption } from '@/components/battle/CombatShell'
import { splitCardEmoji, type CombatCard } from '@/components/battle/CardHand'
import DungeonBackdrop from '@/components/dungeon/DungeonBackdrop'
import { buildTrailPoints, NarrationDialog, DiceOverlay } from '@/components/dungeon/DungeonMap'
import WalkScene, { WALK_SCROLL_MS, type WalkMode, type WalkTrailMark } from '@/components/dungeon/WalkScene'
import DungeonScene from '@/components/dungeon/scene/DungeonScene'
import { useT } from '@/lib/i18n/I18nProvider'
import { useIdleScheduler } from '@/hooks/useIdleScheduler'
import { generateSceneMap } from '@/lib/dungeonScene/generateMap'
import { dungeonSceneEnabled } from '@/lib/dungeonScene/enabled'
import { planNodeContents, type SpotContent } from '@/lib/dungeonScene/nodeContents'
import type { MapSpot } from '@/lib/dungeonScene/types'
import { buildWalkPathPoints, DUNGEON_BATTLE_BG } from '@/lib/walkSceneAssets'
import { FREE_RESTORE_MAX_LEVEL, restoreCost } from '@/lib/restoreCost'
import {
  DungeonDef,
  DungeonEventDef,
  DungeonEventKind,
  type DungeonId,
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
import { specialDisplayName, classAttackDisplayName } from '@/lib/weaponFlavor'
import { applyEnhancementToStats } from '@/lib/enhancementSystem'
import { isBroken, isLowDurability, wearFor } from '@/lib/durability'
import { getLevelInfo } from '@/lib/experienceSystem'
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
  /** 🪙 Ouro na carteira do personagem — usado para prever a taxa da Alquimista entre runs. */
  gold?: number
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
  onExit: (updates: {
    hp: number
    mp: number
    stamina: number
    leveledUp?: boolean
    /**
     * ⚗️ Motivo da saída, quando NÃO foi o jogador que pediu. Hoje só
     * 'no-gold-restore': o farm automático parou porque faltou ouro para a
     * Alquimista — o mapa precisa saber para explicar e oferecer o botão de pagar
     * (o banner desta tela morre junto com o componente).
     */
    stopped?: 'no-gold-restore'
    /** Ouro que faltava para a restauração, quando `stopped === 'no-gold-restore'`. */
    restoreNeeded?: number
  }) => void
  /** Re-run: o pai remonta a run do zero (mesma masmorra). */
  onRestart?: (updates: { hp: number; mp: number; stamina: number; level?: number; experience?: number; leveledUp?: boolean; auto: boolean; restorePaid?: number; gold?: number }) => void
  /** @deprecated A run é sempre automática; mantido só por compatibilidade com o pai. */
  initialAuto?: boolean
  /**
   * ⚗️ Taxa que a Alquimista cobrou ANTES desta run (farm automático). O pai a
   * devolve no re-run só para o log da run nova abrir com a conta — sem isto a
   * cobrança acontecia no instante em que o componente era desmontado e o
   * jogador nunca via para onde o ouro tinha ido.
   */
  restorePaid?: number
  /** Optional custom background image for battles (path relative to /public/) */
  backgroundImageUrl?: string
  /** Overlay opacity for custom background image (0-1, default 0.3) */
  backgroundImageOverlay?: number
  /**
   * 🃏 Modo carta: as ações viram uma mão de cartas no lugar do flyout "⚔️ Ataque".
   * Puramente visual — as mesmas ações, dados, custos e gates de sempre.
   * Ausente ⇒ decide pela URL (`?cards=1` liga), e o padrão é o menu de hoje.
   * A /dev/dungeon-mock passa `cards` explícito para testar sem depender da query.
   */
  cards?: boolean
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
  { icon: '💊', text: 'A run joga sozinha — use o botão de poções para ligar ou desligar o uso automático de HP/MP entre os nós.' },
  { icon: '✨', text: 'Salas principais (⚔️) têm monstro garantido e o melhor espólio — os bosses guardam os itens raros.' },
  { icon: '🎒', text: 'Com o freio da mochila ligado, a run encerra sozinha quando o inventário enche — nada de queimar stamina por espólio que se perde.' },
]

const MONSTER_ID = 'dungeon-monster'

// Atraso (ms) antes de animar um efeito de status (veneno/sangramento/atordoamento)
// que ocorre JUNTO com um golpe. Precisa ser maior que a investida+impacto mais longos
// (habilidades como Sopro/Cosmo chegam a ~1680ms) pra aura não engolir a animação do golpe.
const STATUS_FX_DELAY = 1700

interface ResolvedEvent {
  def: DungeonEventDef
  monster?: ScaledMonster
  /** Pacote completo do encontro (1..3): quem entra em beginEncounter. */
  monsters?: ScaledMonster[]
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
  /** O servidor absorveu o `resolve` enviado? Só então o cliente pode descartá-lo. */
  resolved?: boolean
  skippedDrops?: LootDrop[]
  /** Espólio JÁ ROLADO pelo servidor: drops por abate (id do monstro → drops). */
  killDrops?: Record<string, LootDrop[]>
  /** Espólio do nó — só é pago se o pacote inteiro cair. */
  nodeLoot?: NodeLoot | null
  error?: string
}
/**
 * Retorno do helper que fala com o /step. NUNCA rejeita — mesmo padrão do
 * `loadImage` da cena: como a promessa pode ficar em voo sem ninguém esperando
 * (prefetch durante a caminhada), uma rejeição solta viraria unhandled rejection.
 * `status: 0` = falha de rede (o fetch nem chegou a responder).
 */
type StepOutcome =
  | { ok: true; data: StepResponse }
  | { ok: false; status: number; data?: StepResponse }
/**
 * O /step em voo para um nó. `settled` existe para o flash de encontro NÃO
 * aparecer quando não há espera nenhuma: se a resposta já chegou antes do herói
 * encostar no bicho, a arena abre sem piscar.
 */
interface StepPrefetch {
  dest: number
  promise: Promise<StepOutcome>
  settled: boolean
}
/** Desfecho de um nó de combate, entregue de carona no /step seguinte (ou no /finish). */
interface NodeResolve {
  nodeIdx: number
  outcome: 'clear' | 'retreat' | 'lose'
  killedIds: string[]
}
/** Resposta do /finish — o crédito autoritativo da run inteira. */
interface FinishResponse {
  finished?: boolean
  gold?: number
  xp?: number
  drops?: LootDrop[]
  skippedDrops?: LootDrop[]
  kills?: number
  bossDefeated?: boolean
  leveledUp?: boolean
  newLevel?: number
  equipmentWear?: EquipmentWear[]
  /** ⚡ Só vem quando o flush estornou o passo de um nó que ficou por jogar. */
  stamina?: number
  error?: string
  status?: string
}
interface EquipmentWear {
  slot: string
  name: string
  durability: number
  maxDurability: number
  justBroke: boolean
}

// Efeito de um consumível a partir dos stats do catálogo: restauração (hp/mp),
// cura de status, buffs temporários de combate e revive (auto ao cair).
function consumableEffect(stats: any): {
  hp: number; mp: number; cure: string | null
  atk: number; def: number; dodge: number; buffTurns: number
  revive: number; stamina: number
} {
  const s = stats || {}
  // 🛡️ `shieldAmount` (Núcleo de Adamantite) entra como bônus de DEFESA: é um buff
  // de dano recebido por N turnos, exatamente o que `defenseBonus` já move. Sem
  // este mapa o item saía com todos os efeitos zerados e o cinto o descartava —
  // o jogador tinha um LENDÁRIO na mochila que nunca aparecia na masmorra.
  const shield = Number(s.shieldAmount) || 0
  return {
    hp: Number(s.healAmount) || 0,
    mp: Number(s.manaAmount) || 0,
    cure: s.cure || null,
    atk: Number(s.attackBonus) || 0,
    def: (Number(s.defenseBonus) || 0) || (shield > 0 ? Math.round(shield / 20) : 0),
    dodge: Number(s.dodgeBonus) || 0,
    buffTurns: Number(s.duration) || 0,
    revive: Number(s.reviveHpPercent) || 0,
    // ⚡ Stamina NÃO é aplicada no cliente (é servidor-autoritativa, ver
    // regenAndPersist): quem bebe é a rota /api/inventory/use-item e a run só
    // ressincroniza o número que ela devolve.
    stamina: Number(s.staminaAmount ?? s.stamina_restore) || 0,
  }
}
function consumableIcon(stats: any): string {
  const e = consumableEffect(stats)
  if (e.revive) return '🪶'
  if (e.stamina && !e.hp && !e.mp) return '⚡'
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
  stamina: number
}

// Item coletado durante a run (guarda o nome para a arte real /items/<slug>.webp).
interface RunItem {
  name: string
  emoji: string
  label: string
}

// Mesma linguagem visual de raridade usada na landing (DolrathLanding.tsx RARITY_FRAME),
// replicada aqui para os cards de loot da masmorra não terem que importar a landing inteira.
const LOOT_RARITY_RING: Record<string, { ring: string; glow: string; text: string }> = {
  COMMON:    { ring: 'border-zinc-400/50',    glow: 'rgba(161,161,170,0.35)', text: 'text-zinc-300' },
  UNCOMMON:  { ring: 'border-emerald-400/60', glow: 'rgba(52,211,153,0.45)',  text: 'text-emerald-300' },
  RARE:      { ring: 'border-sky-400/60',     glow: 'rgba(56,189,248,0.5)',   text: 'text-sky-300' },
  EPIC:      { ring: 'border-fuchsia-400/70', glow: 'rgba(232,121,249,0.55)', text: 'text-fuchsia-300' },
  LEGENDARY: { ring: 'border-amber-400/70',   glow: 'rgba(251,191,36,0.6)',   text: 'text-amber-300' },
}

// Drop de destaque (pedra de aprimoramento ou raridade RARE+): o único espólio
// que ainda ganha um aviso na tela — só o ícone, sem card — o resto vai direto
// pra bag sem interromper a run.
function isHighlightDrop(d: { kind: string; rarity?: string }): boolean {
  return d.kind === 'stone' || ['RARE', 'EPIC', 'LEGENDARY'].includes(String(d.rarity ?? '').toUpperCase())
}

// Miniatura do item: usa a arte /item-art/<slug>.webp e cai no emoji se a imagem falhar
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
        // Estado de desgaste vai junto: o tile do combate marca quebrado/quase quebrando.
        durability: typeof eq.durability === 'number' ? eq.durability : null,
        maxDurability: typeof eq.maxDurability === 'number' ? eq.maxDurability : null,
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
// esquiva por %; depois bloqueio passivo por DEF.
function computeMonsterOutcome(
  sides: number,
  power: number,
  player: { armor: number; K: number; evade: number; block?: number },
  forcedDefRoll?: number,
): Outcome & { blocked?: boolean } {
  const r = resolveMonsterHit({ power, sides, defender: player, forcedDefRoll })
  return { hit: !r.avoided, damage: r.damage, crit: false, sides, atkRoll: 0, defRoll: r.defRoll, blocked: r.blocked }
}

// Lore do log: esquiva ou "defesa" (bloqueio passivo também narra como defesa).
function defenseVerb(blocked?: boolean): string {
  if (blocked) return 'bloqueou'
  return Math.random() < 0.3 ? 'defendeu' : 'esquivou'
}

/** Largura máxima da arena de combate na tela grande. */
const COMBAT_MAX_W = 1280
/** Duração da investida da câmera até o corte para a arena. */
const COMBAT_INTRO_MS = 420
/** Zoom da INVESTIDA ao entrar no combate (sem card de emboscada). */
const ZOOM_CHARGE = 2.4
/**
 * Flash de encontro: EXATAMENTE 3 piscadas, uma vez só. Antes isto era um ciclo
 * de 700ms com `repeat: Infinity` — o número de piscadas virava a latência do
 * /step (3s de rede = ~12 piscadas), e era isso que atordoava. Agora o flash tem
 * fim próprio; quem cobre uma espera mais longa é o overlay calmo (`stepSlow`).
 */
const FLASH_MS = 560
/**
 * Carência antes de DESENHAR qualquer aviso de espera. Na maioria das saídas o
 * /finish já aterrissou (o jogador passou segundos lendo o resumo) e sair é
 * instantâneo — sem esta carência o spinner piscaria por um frame em toda saída
 * e em todo ciclo do farm automático, que é exatamente a sensação de travado que
 * o aviso deveria matar.
 */
const LEAVING_GRACE_MS = 200
/**
 * Quanto o overlay de saída espera antes de admitir que está demorando. O /finish
 * normal aterrissa bem abaixo disto; passar daqui já é rede ruim ou invocação
 * fria, e aí o texto precisa pedir para NÃO fechar a aba (o retry ainda salva).
 */
const LEAVING_SLOW_MS = 4000
/** Teto de largura da exploração alargada (`wideExplore`) — bem aquém do teto
 * do combate: ainda é mapa, não arena, e o mundo gerado (ver generateMap.ts)
 * é uma trilha estreita — alargar demais só exporia vazio nas pontas. */
const EXPLORE_WIDE_MAX_W = 720
/**
 * ⏱️ Watchdog da caminhada — ver o efeito que os usa.
 *
 * Aba OCULTA: o loop de animação da cena não corre, então ninguém avisa que o
 * herói chegou. A espera é curta só para dar chance de a chegada visual ganhar
 * a corrida caso a aba volte nesse instante.
 * Aba VISÍVEL: rede de segurança para a caminhada que nunca chega (um /step
 * que falhou deixa o nó marcado como alcançado na cena, e ela não reemite).
 * Folgado de propósito — o maior salto entre nós dá ~4s em linha reta e o
 * caminho real contorna a mata, então um valor apertado cortaria caminhada
 * legítima e resolveria o nó com o herói ainda a meio da trilha.
 */
const HIDDEN_ARRIVE_MS = 300
const STUCK_ARRIVE_MS = 20000

/**
 * 📱 Moldura da run — a EXPLORAÇÃO é mobile-first em qualquer tela; o COMBATE não.
 *
 * Na trilha, no celular a moldura ocupa tudo e nada muda. Na tela grande, em vez
 * de esticar na largura sem mais (o que arruinava o enquadramento da cena, cujo
 * zoom saía SÓ da largura), ela roda numa caixa central e a arte da masmorra —
 * a MESMA imagem do card em /dungeons — preenche a sobra, desfocada e
 * escurecida de propósito: é ambiente, não conteúdo.
 *
 * `wideExplore` (cena nova, `DungeonScene`) afrouxa essa caixa de 9:16 pra 3:4
 * até `EXPLORE_WIDE_MAX_W` — só funciona porque o `basePpu` da cena agora tira
 * o zoom do MÍNIMO entre largura e altura (ver WORLD_UNITS_TALL_REF em
 * DungeonScene.tsx): em retrato normal as duas leituras empatam (zero mudança
 * no celular), e só na caixa mais larga que 9:16 a largura extra vira MATA
 * NOVA visível nas laterais em vez de zoom. Sem `wideExplore` (WalkScene, as
 * outras 3 masmorras) a caixa continua 9:16 — aquele zoom ainda é
 * width-only, alargar lá SÓ daria zoom.
 *
 * Conta do tamanho: com aspect-ratio definido + altura fixa + max-width, a
 * largura usada é min(altura × proporção, teto, largura do pai). Num
 * 390×844 (retrato/9:16) dá 475 > 390 → 390×844, tela cheia sem tarja —
 * `wideExplore` não muda nada aqui, seja qual for a proporção, o celular
 * sempre esbarra no teto de largura do pai primeiro. Num 1440×900 com
 * `wideExplore`: 900×0.75=675 < 720 (teto) → 675×900.
 *
 * `wide` (combate) larga de vez: a arena é uma tela de batalha, não um mapa —
 * não tem zoom preso à largura pra proteger, e no desktop ela merece o
 * espaço. De quebra, os `sm:` de CombatShell/BattleScene (que olham a
 * VIEWPORT, não a moldura) voltam a bater com a largura real. No celular
 * `wide` é idêntico ao retrato: a viewport já é mais estreita que o teto.
 *
 * A troca de geometria acontece debaixo do flash preto da investida (ver
 * `combatIntro`), então não há transição a animar aqui.
 *
 * Aqui é `h-full` (não o `100dvh` da bancada /dev): dentro de um `fixed
 * inset-0` é por definição a mesma caixa, sem o descompasso de 1-3px que o
 * 100dvh do Safari iOS produz enquanto a barra de endereço anima.
 */
function RunFrame({
  dungeonId,
  wide,
  wideExplore,
  frameRef,
  children,
}: {
  dungeonId: DungeonId
  /** Combate: solta o retrato e ocupa a tela (até COMBAT_MAX_W). */
  wide?: boolean
  /** Exploração na cena nova: afrouxa 9:16 → 3:4 até EXPLORE_WIDE_MAX_W. */
  wideExplore?: boolean
  frameRef?: React.Ref<HTMLDivElement>
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden overscroll-none touch-pan-y bg-black flex items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center scale-110 blur-lg opacity-45"
        style={{ backgroundImage: `url(${DUNGEON_BATTLE_BG[dungeonId]})` }}
      />
      <div aria-hidden className="absolute inset-0 bg-black/55" />
      <div
        ref={frameRef}
        className="relative h-full overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 sm:rounded-2xl"
        style={
          wide
            ? { width: '100%', maxWidth: COMBAT_MAX_W }
            : wideExplore
              ? { aspectRatio: '3 / 4', maxWidth: EXPLORE_WIDE_MAX_W }
              : { aspectRatio: '9 / 16', maxWidth: '100%' }
        }
      >
        {children}
      </div>
    </div>
  )
}

export default function DungeonRun({ 
  dungeon, 
  character, 
  tier = 1, 
  onExit, 
  onRestart, 
  initialAuto: _initialAuto,
  restorePaid,
  backgroundImageUrl,
  backgroundImageOverlay = 0.3,
  cards,
}: DungeonRunProps) {
  // i18n: `t` era usado em tickPlayerTurn sem existir no escopo — quando a
  // transformação acabava em combate, o ReferenceError derrubava a run inteira.
  const t = useT()
  // 🃏 Modo carta. Sem a prop, quem manda é `?cards=1` na URL — lido só no efeito para
  // não divergir do HTML do servidor (a primeira pintura é sempre o menu de hoje).
  const [urlCards, setUrlCards] = useState(false)
  useEffect(() => {
    if (cards !== undefined) return
    setUrlCards(new URLSearchParams(window.location.search).get('cards') === '1')
  }, [cards])
  const cardsMode = cards ?? urlCards
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
  // ❤️ HP e MP SOBREVIVEM à run: entramos com a mesma FRAÇÃO que ficou salva no
  // banco quando o herói saiu da anterior. Voltar ao cheio é serviço da
  // Alquimista (grátis até o nível 6, pago daí em diante) — ou poção.
  //
  // Fração, não valor absoluto: o teto da run (`effMaxHp`) inclui gear e passivas
  // da árvore, e a coluna do banco guarda só o pool base. Trocar de equipamento
  // entre runs mudaria o teto e um valor cru entraria torto.
  const poolPct = (current: number, max: number) =>
    Number.isFinite(max) && max > 0 ? Math.min(1, Math.max(0, current / max)) : 1
  const [hp, setHp] = useState(() => {
    const max = character.maxHp + equipmentPower(character.equipment).hp
    return Math.max(1, Math.round(max * poolPct(character.hp, character.maxHp)))
  })
  const [mp, setMp] = useState(() =>
    Math.max(0, Math.round(effMaxMp * poolPct(character.mp, character.maxMp)))
  )
  const [stamina, setStamina] = useState(character.stamina)
  // Espelho da stamina: o /finish pode DEVOLVER o passo de um nó que ficou por
  // jogar, e o log precisa do valor de antes para dizer quanto voltou.
  const staminaRef = useRef(stamina)
  staminaRef.current = stamina
  const hpRef = useRef(hp)
  hpRef.current = hp
  // Espelho do MP: `closeRunOnServer` precisa do valor no INSTANTE do envio
  // (inclusive no `pagehide`, fora do ciclo de render).
  const mpRef = useRef(mp)
  mpRef.current = mp
  // Nível VIVO da run: a prop `character` fica congelada no valor de quando a run
  // montou — um level up mid-run precisa atualizar este estado (não `character.level`)
  // para refletir no combate seguinte (levers, card de batalha, escala do monstro).
  const [charLevel, setCharLevel] = useState(character.level)
  useEffect(() => { setCharLevel(character.level) }, [character.id, character.level])
  // Espelho em ref do nível e do XP ganho na run: a previsão de level up roda
  // logo depois de um setTotals, e o state ainda não teria andado.
  const charLevelRef = useRef(character.level)
  charLevelRef.current = Math.max(charLevelRef.current, charLevel)
  const runXpRef = useRef(0)
  // XP total VIVO da run: começa na prop (congelada no mount) e soma o que o
  // /finish confirmar. Sem isto, um re-run (farm automático) remonta com
  // `character.experience` desatualizado — só `level` era propagado — e a
  // PREVISÃO local de level up (checkLocalLevelUp) do run seguinte parte de uma
  // base de XP errada.
  const charExperienceRef = useRef(character.experience ?? 0)

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
  //
  // Duas apresentações, e só duas: a CENA explorável (mata sólida + bolsões) onde
  // já existe tileset, e a esteira WalkScene no resto. O zigzag SVG que já foi o
  // terceiro caminho morreu — `walkSceneEnabled` era `Boolean(id)`, ou seja
  // sempre verdadeiro, então o `!useWalkScene && !useScene` que o desenhava era
  // uma contradição e nunca renderizou.
  const useScene = dungeonSceneEnabled(dungeon.id)
  const useWalkScene = !useScene
  // Seed do layout: sorteado 1x por mount (lazy) — estável a run inteira
  // (combate/re-render não re-embaralham o mapa), novo a cada run.
  const [layoutSeed] = useState(
    () => `${dungeon.id}:${Date.now().toString(36)}:${Math.floor(Math.random() * 0xffffffff).toString(36)}`
  )
  /**
   * Id da run — a seed COMPARTILHADA com o servidor. Chega no /start e é o que
   * permite ao cliente montar a planta dos nós (quem é monstro, qual bicho e
   * quantos) sem perguntar nada à rede.
   */
  const [runId, setRunId] = useState<string | null>(null)
  // A trilha SVG/treadmill continua existindo mesmo na cena: ela é a fonte de
  // `kind`/`tier` por nó (usada no header, no custo de stamina e no boss).
  const trailPoints = useMemo(
    () =>
      useWalkScene
        ? buildWalkPathPoints(dungeon.rooms, dungeon.minorNodes, layoutSeed)
        : buildTrailPoints(dungeon.rooms, dungeon.minorNodes),
    [dungeon.rooms, dungeon.minorNodes, useWalkScene, layoutSeed]
  )
  const LAST = trailPoints.length - 1
  const [tokenIdx, setTokenIdx] = useState(0)
  // Espelho em ref: onMonsterKilled roda dentro de um `later()` e precisa do nó
  // CORRENTE para carimbar o desfecho (o servidor casa esse índice com o pending).
  const tokenIdxRef = useRef(0)
  tokenIdxRef.current = tokenIdx
  const [moving, setMoving] = useState(false)
  /** Walk: idle → scroll (vasculhar) → approach (avistou ?) → resolve. */
  const [walkMode, setWalkMode] = useState<WalkMode>('idle')
  const [walkTrailMarks, setWalkTrailMarks] = useState<WalkTrailMark[]>([])
  const walkBusy = walkMode === 'scroll' || walkMode === 'approach' || moving
  const walkStepLockRef = useRef(false)

  // ---------- Cena explorável ----------
  // O mapa nasce da seed da run (mesma run ⇒ mesmo mapa mesmo se remontar).
  const sceneMap = useMemo(
    () => (useScene ? generateSceneMap(dungeon.id, layoutSeed) : null),
    [useScene, dungeon.id, layoutSeed]
  )
  /**
   * Nó que o herói está procurando. Fica igual a `tokenIdx` enquanto ele espera
   * no bolsão; `advance()` empurra pro próximo e a cena caminha até lá sozinha.
   */
  const [sceneTarget, setSceneTarget] = useState(0)
  /**
   * 🌀 Pedido de teletransporte do herói na cena.
   *
   * Com a aba em segundo plano o loop de animação não corre e os nós são
   * resolvidos "às cegas" (ver o watchdog da caminhada). Quando o jogador
   * volta, o herói está desenhado lá atrás: em vez de fazê-lo atravessar o
   * mapa correndo, ele é plantado no nó lógico atual. `seq` é o selo — o mesmo
   * nó pode precisar de dois warps ao longo de uma run.
   */
  const [warpTo, setWarpTo] = useState<{ node: number; seq: number } | null>(null)
  const warpSeqRef = useRef(0)
  /** A cena está dessincronizada porque um nó foi resolvido sem animação. */
  const headlessResolvedRef = useRef(false)
  /**
   * O que há em CADA nó, sabido desde a entrada na masmorra.
   *
   * Isto era preenchido nó a nó com o que o /step devolvia — antes o servidor
   * sorteava monstro-vs-achado na hora, então o mapa não tinha como mostrar
   * nada além de um "?" até o herói chegar lá. Agora o arranjo inteiro sai de
   * `planDungeonRun`, semeado pelo `runId`: o SERVIDOR roda a mesma função, e é
   * isso que garante que o bicho pintado no mapa é o bicho da luta.
   *
   * A seed é o runId, não o `layoutSeed` — este é local e só desenha a
   * geometria do mapa, aquele é o que os dois lados compartilham.
   */
  const sceneContents = useMemo(
    () =>
      useScene && sceneMap && runId
        ? planNodeContents(sceneMap, runId)
        : new Map<number, SpotContent>(),
    [useScene, sceneMap, runId]
  )
  /**
   * 🖼️ Aquece o RETRATO de combate dos bichos da masmorra.
   *
   * A arena usa uma arte diferente da folha de sprite do mapa (`monster.image`,
   * um `<img>` cru no card) — e ela só era pedida quando `phase` virava
   * 'combat'. Ou seja: dentro do corte de 420ms da investida, começando do zero.
   * O card podia abrir vazio, empilhando latência exatamente onde acabamos de
   * tirar. A masmorra tem 4 espécies + chefe, então dá para aquecer tudo.
   *
   * Deliberadamente FORA do gate `sceneReady` (que espera chão/sprites do mapa):
   * isto é oportunista e não pode segurar a entrada na masmorra.
   */
  useEffect(() => {
    if (!useScene) return
    const arts = [...dungeon.monsters, dungeon.boss]
      .map(m => m.image || monsterImagePath(m.name))
      .filter((src, i, all) => all.indexOf(src) === i)
    // Guardados em variável só para o GC não recolher a imagem antes do onload.
    const imgs = arts.map(src => {
      const img = new Image()
      img.decoding = 'async'
      img.src = src
      return img
    })
    return () => { imgs.forEach(img => { img.src = '' }) }
  }, [useScene, dungeon])
  /**
   * Nós JÁ LIMPOS — não "nós em que já pisei".
   *
   * A cena usa isto para parar de desenhar o bando (e para apagar o marcador do
   * nó). Enquanto era `tokenIdx + 1`, o nó em que o herói acabava de chegar já
   * entrava na lista: `setTokenIdx(dest)` roda em `finishWalkStep` ANTES do
   * `setFocusNode(dest)`, então o bicho sumia do mapa exatamente no frame em que
   * a câmera fechava nele — a câmera enquadrava chão vazio e o jogador entrava
   * na luta sem nunca ver quem ia enfrentar.
   *
   * Agora o nó de combate só é limpo quando a luta acaba; o de achado, na hora em
   * que o servidor resolve.
   */
  const [clearedNodes, setClearedNodes] = useState<number[]>([])
  const markNodeCleared = useCallback((idx: number) => {
    setClearedNodes(prev => (prev.includes(idx) ? prev : [...prev, idx]))
  }, [])
  const sceneVisited = useMemo(
    () => Array.from(new Set([...Array.from({ length: tokenIdx }, (_, i) => i), ...clearedNodes])),
    [tokenIdx, clearedNodes]
  )
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
  const [floats, setFloats] = useState<
    { id: number; label: string; color: string; item?: { name: string; emoji: string; rarity?: string } }[]
  >([])
  // Consumíveis do inventário do personagem (usáveis no mapa e no combate)
  const [consumables, setConsumables] = useState<DungeonConsumable[]>([])
  /**
   * 🧪 Cinto em REF — mesma razão de `hpRef`/`packRef`/`combatFxRef`.
   *
   * A cadeia de turnos é agendada por `later()`, então quem lê o STATE lê o valor
   * congelado no render que agendou. O auto-revive (ver `resolveMonsterAttack`) e o
   * piloto de consumíveis rodam nessas cadeias: sem o ref, uma poção comprada/bebida
   * há menos de um render — ou um `loadConsumables()` que só resolveu agora — deixa a
   * lista defasada e o item deixa de ser usado sem nenhum aviso.
   */
  const consumablesRef = useRef<DungeonConsumable[]>([])
  consumablesRef.current = consumables
  const [showItems, setShowItems] = useState(false)
  const atBoss = tokenIdx === LAST
  const nextIsBoss = tokenIdx === LAST - 1
  const nextMainNode = trailPoints[tokenIdx + 1]?.kind === 'main'
  // Progresso por SALA PRINCIPAL (os nós menores não contam como "sala").
  const curTier = trailPoints[tokenIdx]?.tier || 0
  const atMainNode = trailPoints[tokenIdx]?.kind === 'main'
  const mainsDone = trailPoints.reduce((n, p, i) => n + (p.kind === 'main' && i < tokenIdx ? 1 : 0), 0)
  const stepCost = (idx: number): number => {
    const pt = trailPoints[idx]
    if (pt?.kind === 'boss') return BOSS_STEP_COST
    if (pt?.kind === 'main') return MAIN_STEP_COST
    return MINOR_STEP_COST
  }

  // ---------- Exploração ----------
  const [exploreRolling, setExploreRolling] = useState(false)
  // 🎬 Cena pronta: o DungeonScene avisa (onReady) quando chão + sprites do bioma
  // + herói terminam de carregar. Até lá, o d20 gira como LOADING na 1ª entrada e
  // o passo fica segurado — mata o quadro meio-desenhado (pop-in de sprite) que
  // dava a sensação de "não renderizou direito". Os nós seguintes já usam o zoom
  // cinematográfico da chegada; este loading é só para a entrada.
  const [sceneReady, setSceneReady] = useState(false)
  /**
   * A espera pelo /step passou de "longa demais para piscar". O flash de encontro
   * dá 3 piscadas e ACABA; se depois disso a resposta ainda não chegou (rede
   * ruim, invocação fria), a tela troca o branco por uma espera CALMA. Estrobo
   * indefinido era o que atordoava.
   */
  const [stepSlow, setStepSlow] = useState(false)
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
  // 🎯 Ids dos monstros abatidos no PACOTE atual. NENHUM abate toca a rede: o
  // desfecho do nó viaja de carona no /step seguinte (pendingResolveRef) ou no
  // /finish, se a run acabar aqui.
  const killedIdsRef = useRef<string[]>([])
  // 📮 Desfecho do nó ainda não entregue ao servidor. É o que transforma "uma
  // chamada por luta" em "nenhuma": o próximo passo já leva isto no corpo.
  const pendingResolveRef = useRef<NodeResolve | null>(null)
  // 🎁 Espólio que o servidor JÁ rolou para o nó atual (veio no /step): drops por
  // abate e o espólio do nó (só pago se o pacote limpar). É daqui que sai o card
  // de vitória, instantâneo e sem rede.
  const killDropsRef = useRef<Record<string, LootDrop[]>>({})
  const nodeLootRef = useRef<NodeLoot | null>(null)
  // 🎒 Slots livres previstos. A mochila só é escrita no /finish, então o cliente
  // projeta o que não vai caber com a MESMA ordem de prioridade do servidor
  // (pedra → gear → resto). O /finish devolve o veredito real no resumo.
  const freeSlotsRef = useRef<number | null>(null)
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
  // RUN SEMPRE AUTOMÁTICA na EXPLORAÇÃO: o piloto anda, coleta e confirma sozinho.
  const [auto] = useState(true)
  const autoRef = useRef(true)
  autoRef.current = auto
  // 🤖 FARM AUTOMÁTICO (idle): refaz a run sozinho ao terminar e, entre uma e
  // outra, PAGA a restauração da Alquimista. É o caminho da conveniência — quem
  // prefere administrar poções e recuar na hora certa desliga isto e gasta muito
  // menos ouro. Ligado por padrão (comportamento de antes), mas agora visível e
  // desligável: nada que gaste o ouro do jogador sozinho pode ficar escondido.
  const [autoFarm, setAutoFarm] = useState(true)
  // O re-run automático é agendado com alguns segundos de atraso (para o jogador
  // ler o resumo). Nesse intervalo ele ainda pode desligar o farm — por isso o
  // callback adiado lê o REF, não a variável congelada no render que o agendou.
  const autoFarmRef = useRef(true)
  autoFarmRef.current = autoFarm
  // Piloto do COMBATE: liga por padrão (mesma experiência de antes), mas o jogador
  // pode desligar (⚡ Auto ON/OFF na barra de combate) para escolher alvo/ataque na mão.
  // Persistidos no localStorage pela MESMA razão de `stopWhenFull` (abaixo): o farm
  // automático REMONTA o componente a cada run, então sem isto o "eu desliguei" do
  // jogador voltava a ligar sozinho na run seguinte.
  const [autoCombat, setAutoCombat] = useState(() => {
    try { return localStorage.getItem('dgn_auto_combat') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('dgn_auto_combat', autoCombat ? '1' : '0') } catch { /* modo privado */ }
  }, [autoCombat])
  // Uso automático de poções entre nós e em combate (cura, antídoto/bandagem, buff).
  const [autoConsumables, setAutoConsumables] = useState(() => {
    try { return localStorage.getItem('dgn_auto_potion') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('dgn_auto_potion', autoConsumables ? '1' : '0') } catch { /* modo privado */ }
  }, [autoConsumables])
  /**
   * 🎒 Encerrar a run quando a mochila encher. Mesma família das poções
   * automáticas: uma conveniência LIGADA por padrão, visível e desligável na
   * barra. Sem slot livre o espólio vira pó e a stamina continua saindo — parar
   * é quase sempre o que o jogador queria, e quem farma só ouro/XP desliga.
   *
   * Persistido no localStorage porque o farm automático REMONTA o componente a
   * cada run: sem isto, o "desliguei" do jogador voltaria a ligar sozinho na run
   * seguinte (mesmo caminho do índice das dicas).
   */
  const [stopWhenFull, setStopWhenFull] = useState(() => {
    try { return localStorage.getItem('dgn_stop_full') !== '0' } catch { return true }
  })
  const stopWhenFullRef = useRef(true)
  stopWhenFullRef.current = stopWhenFull
  useEffect(() => {
    try { localStorage.setItem('dgn_stop_full', stopWhenFull ? '1' : '0') } catch { /* modo privado */ }
  }, [stopWhenFull])
  // Diálogo de confirmação ao sair: PAUSA a run (o piloto não age enquanto aberto).
  const [exitConfirm, setExitConfirm] = useState(false)
  /**
   * 🛑 Freio de mão da run, em REF de propósito.
   *
   * `exitConfirm` só chega nas guardas no próximo render — e o piloto agenda o
   * passo por `setTimeout`, então um avanço já marcado escapava pela janela e a
   * masmorra seguia andando (e entrando em combate) atrás do card. O ref é
   * escrito no mesmo clique que abre o diálogo, antes de qualquer re-render.
   */
  const stopRequestedRef = useRef(false)
  /**
   * ⏳ "Sair ao fim da luta": o combate segue NORMAL (nada de pausar atrás do
   * backdrop — o jogador leva o espólio inteiro do encontro) e a run encerra na
   * vitória, sem dar mais um passo. Mesmo espírito do "aguardar último ciclo"
   * da Coleta.
   */
  const stopAfterFightRef = useRef(false)
  const [stopAfterFight, setStopAfterFight] = useState(false)
  /** O freio que encerrou a run foi a MOCHILA CHEIA (muda os textos e mata o farm). */
  const bagFullStopRef = useRef(false)
  const [bagFullStop, setBagFullStop] = useState(false)
  /** Havia um /step JÁ PAGO em voo quando o freio foi puxado (texto do card). */
  const [stopCaughtPaidStep, setStopCaughtPaidStep] = useState(false)
  /**
   * ⏳ Espera do /finish, que é a ÚNICA escrita da run inteira: uma transação com
   * orçamento de 20s no servidor, ainda por cima reenviada com backoff. Quem
   * aguarda essa promessa (`exitRun`, `restartRun`) ficava segundos sem mudar
   * nada na tela, e o clique em "Voltar ao mapa" parecia não ter pegado.
   *
   *  • `leaving`      — o jogador já pediu para sair E estamos aguardando
   *  • `showLeaving`  — o mesmo, passada a carência: só ISTO desenha o overlay
   *  • `leavingSlow`  — passou do razoável; o texto escala em vez de só girar
   *  • `finishPending`— o POST está no ar, com ou sem alguém esperando por ele
   *  • `showSaving`   — o mesmo, passada a carência: só ISTO desenha a pílula
   */
  const [leaving, setLeaving] = useState<null | 'exit' | 'rerun'>(null)
  const [showLeaving, setShowLeaving] = useState(false)
  const [leavingSlow, setLeavingSlow] = useState(false)
  const [finishPending, setFinishPending] = useState(false)
  const [showSaving, setShowSaving] = useState(false)
  /**
   * Encontro que chegou com o freio puxado: o nó foi pago e resolvido, mas a
   * arena não abre atrás do card. Cancelar entra nesta luta — sem isto o
   * `pending` do servidor seria reenviado no passo seguinte e o combate
   * aconteceria no nó errado.
   */
  const caughtEncounterRef = useRef<ScaledMonster[] | null>(null)
  const battleEventCounter = useRef(0)
  // d20 de sorte do nó atual (define a qualidade do loot pós-combate)
  const lootRollRef = useRef(12)
  // finishWalkStep é useCallback estável e roda antes da declaração de beginEncounter —
  // o ref aponta sempre para a versão atual.
  const beginEncounterRef = useRef<(group: ScaledMonster[] | ScaledMonster) => void>(() => {})

  // ---------- Sessão SERVIDOR-AUTORITATIVA ----------
  // O servidor é dono do RNG e do crédito de gold/xp/loot. O cliente guarda só
  // o runId e o monstro que o servidor rolou para o nó atual (para o combate).
  const runIdRef = useRef<string | null>(null)
  const [runReady, setRunReady] = useState(false)
  /**
   * ⚡ Start OTIMISTA: o herói começa a caminhar assim que a cena monta, sem
   * esperar o /start. A primeira caminhada leva ~1.5s — tempo de sobra para a
   * sessão abrir — e é só na CHEGADA ao nó que o /step precisa do runId. Quem
   * espera é esta promessa, dentro de finishWalkStep, e não o jogador olhando
   * uma tela parada.
   */
  const runReadyPromiseRef = useRef<Promise<void> | null>(null)
  /**
   * ⏱️ /step JÁ EM VOO para o nó de destino, disparado quando a CAMINHADA COMEÇA.
   *
   * Antes disto o pedido saía na CHEGADA ao bolsão — o pior instante possível: o
   * herói plantava os pés e a rede inteira (~7 idas ao Postgres) acontecia com o
   * jogador olhando. Era a "travada". A caminhada dura segundos; a latência cabe
   * folgada debaixo dela.
   *
   * Só é seguro porque o corpo do /step já está completo no primeiro passo: o
   * desfecho do nó anterior (`pendingResolveRef`) é gravado no último abate, e a
   * fase só volta para 'explore' depois disso.
   *
   * 🚪 Sair no MEIO da caminhada (o /step em voo cruza com o /finish) é benigno,
   * nas duas ordens — vale registrar, porque parece um bug e não é:
   *  • /step grava antes → o /finish vê `pending` do nó SEGUINTE, então o
   *    `resolve` que o cliente manda não casa e é ignorado; mas o nó já entrou no
   *    `accrued` pelo próprio /step. Creditado uma vez.
   *  • /finish credita antes → ele mesmo resolve o `pending` a partir do
   *    `resolve` do corpo. O /step atrasado pode escrever num run já 'abandoned',
   *    mas não mexe no `status`, e `flushStaleRuns` só drena run 'active' — logo
   *    aquele `accrued` nunca é recreditado.
   * Sobrava a stamina cobrada por um nó que o jogador não chegou a jogar (4/8/6,
   * não 1): hoje o próprio /finish a ESTORNA — nó pendente sem nenhum abate
   * devolve o passo (ver `staminaRefund` em flushRunRewards).
   */
  const stepPrefetchRef = useRef<StepPrefetch | null>(null)
  /**
   * Maior nó cujo /step já foi RECLAMADO por algum caminho de chegada.
   *
   * Passaram a existir dois: a chegada visual (o rAF da cena) e o watchdog que
   * resolve o nó quando o rAF não corre. O /step só é idempotente em nó de
   * COMBATE — em nó de ACHADO ele avança o cursor e cobra stamina de novo. Esta
   * reserva monotônica é o que impede o débito dobrado.
   */
  const stepClaimRef = useRef(-1)
  // Herói já em uso em outra aba (lock vivo): bloqueia a run com um aviso.
  const [blocked, setBlocked] = useState<string | null>(null)
  // Só o BOSS usa estes refs (o encontro comum extrai o monstro direto do
  // retorno de applyServerEvent) — nunca escrever aqui fora do branch
  // `data.type === 'boss'` em advance(), senão o botão de lutar com o chefe
  // pode pegar um monstro errado.
  const serverMonsterRef = useRef<ScaledMonster | null>(null)
  const serverPackRef = useRef<ScaledMonster[] | null>(null)
  const startedRef = useRef(false)

  // ---------- Largura da MOLDURA (não da viewport) ----------
  // Na TRILHA o `sm:` do Tailwind mente dentro do RunFrame: numa tela de 1440px
  // ele está ativo, mas a moldura retrato tem ~506px. Sem container queries no
  // projeto (tailwind.config.js: plugins: []), medimos a moldura e decidimos em
  // JS. (Em combate a moldura acompanha a viewport, então lá o `sm:` já bate.)
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameW, setFrameW] = useState(0)
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth))
    ro.observe(el)
    setFrameW(el.clientWidth)
    return () => ro.disconnect()
  }, [blocked])
  /** Moldura larga o bastante para o HUD de desktop (coluna de barras no header). */
  const wideFrame = frameW >= 560

  // ---------- 🎥 Aproximação da câmera (entrada em combate) ----------
  // Sem card de emboscada nem d20 de exploração: o /step responde "monstro" e a
  // câmera já investe direto (2.4×, focusNode no vulto) — INVESTIDA única, sem a
  // pausa de REVELAÇÃO de antes. O corte pra arena vem em COMBAT_INTRO_MS.
  // Enquanto a investida roda, a cena segue VISÍVEL (phase ainda é 'explore') e
  // PAUSADA — sem o pause o herói voltaria a andar por baixo do zoom.
  const [combatIntro, setCombatIntro] = useState(false)
  const [encounterZoom, setEncounterZoom] = useState(1)
  const [focusNode, setFocusNode] = useState<number | null>(null)
  // Acessibilidade: quem pediu menos movimento fica com o fade seco de antes.
  // Em ref porque finishWalkStep é um useCallback de deps fixas — como state ele
  // ficaria congelado no valor da montagem.
  const reducedMotionRef = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => { reducedMotionRef.current = mq.matches }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  /** Volta o enquadramento ao normal (a cena está escondida, então não aparece). */
  const resetEncounterCamera = useCallback(() => {
    setEncounterZoom(1)
    setFocusNode(null)
  }, [])

  // ---------- Transformação (local, por combate) ----------
  const transformForms = useMemo(() => getRaceTransformations(character.race), [character.race])
  const [transform, setTransform] = useState<{ type: TransformationType; turns: number } | null>(null)
  const [transformCd, setTransformCd] = useState(0)
  // 🐉 Transformação é 1× POR LUTA: trava após o primeiro uso até o próximo combate.
  const [transformedThisFight, setTransformedThisFight] = useState(false)
  const transformedThisFightRef = useRef(false)
  transformedThisFightRef.current = transformedThisFight
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
  // Agendamento pelo relógio idle: em aba oculta o Chrome estrangula os timers
  // da página (1 disparo/min), e como TODO o combate, o auto-revive e o re-run
  // automático passam por aqui, a run inteira arrastava. Trocar só este motor
  // conserta as ~50 chamadas a `later()` de uma vez. Ver lib/idleClock.
  // A lista de timers pendentes saiu junto: o `dispose()` do agendador (no
  // unmount do hook) já cancela tudo, e a lista antiga só crescia — nunca tinha
  // splice, então uma run longa de farm acumulava milhares de ids.
  const { later, hiddenRef, onVisible } = useIdleScheduler()

  // 3 piscadas duram FLASH_MS; passou disso sem resposta, a espera vira calma.
  // Timer próprio (não o `later`, que só limpa na desmontagem) para que uma
  // resposta rápida cancele a troca em vez de deixá-la disparar depois.
  useEffect(() => {
    if (!exploreRolling) {
      setStepSlow(false)
      return
    }
    const t = setTimeout(() => setStepSlow(true), FLASH_MS)
    return () => clearTimeout(t)
  }, [exploreRolling])

  // Mesma escada para a saída, com um degrau a mais na frente: a carência (nada
  // pisca numa saída instantânea), o overlay, e por fim o texto que admite a
  // demora — senão o jogador fecha a aba achando que o jogo morreu, quando o
  // retry do /finish ainda salvaria a run.
  useEffect(() => {
    if (!leaving) {
      setShowLeaving(false)
      setLeavingSlow(false)
      return
    }
    const show = setTimeout(() => setShowLeaving(true), LEAVING_GRACE_MS)
    const slow = setTimeout(() => setLeavingSlow(true), LEAVING_SLOW_MS)
    return () => { clearTimeout(show); clearTimeout(slow) }
  }, [leaving])

  // A pílula do resumo tem a mesma carência: um /finish rápido não deve empurrar
  // os botões para baixo por 200ms e voltar.
  useEffect(() => {
    if (!finishPending) {
      setShowSaving(false)
      return
    }
    const t = setTimeout(() => setShowSaving(true), LEAVING_GRACE_MS)
    return () => clearTimeout(t)
  }, [finishPending])

  const pushLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-40), msg])
  }, [])

  // Número flutuante sobre o mapa (efeito de ganho/perda)
  const pushFloat = useCallback((label: string, color: string) => {
    const id = Math.random()
    setFloats(prev => [...prev, { id, label, color }])
    later(() => setFloats(prev => prev.filter(f => f.id !== id)), 1500)
  }, [later])

  // Aviso de drop raro+: só o ícone flutua na tela (sem card, sem descrição) —
  // o item cai na bag do rodapé de qualquer forma, isto é só o "brilho" do momento.
  const pushItemFloat = useCallback((name: string, emoji: string, rarity?: string) => {
    const id = Math.random()
    setFloats(prev => [...prev, { id, label: '', color: '', item: { name, emoji, rarity } }])
    later(() => setFloats(prev => prev.filter(f => f.id !== id)), 1700)
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

  /**
   * 🎒 Freio da mochila cheia — chamado na entrada da run e depois de TODO
   * espólio (é `predictSkipped` quem gasta os slots previstos).
   *
   * Não corta nada no meio: reaproveita o "sair ao fim da luta", então a luta em
   * andamento termina normal (o espólio dela já foi contado) e a run encerra sem
   * pagar um nó novo — quem barra o /step seguinte é a guarda do `advance`.
   * Desliga o farm automático junto: re-rodar de mochila cheia é o pior dos dois
   * mundos (paga a Alquimista e perde o espólio inteiro).
   */
  const maybeStopForFullBag = useCallback(() => {
    if (!stopWhenFullRef.current || bagFullStopRef.current) return
    if (freeSlotsRef.current == null || freeSlotsRef.current > 0) return
    bagFullStopRef.current = true
    stopAfterFightRef.current = true
    setBagFullStop(true)
    setStopAfterFight(true)
    autoFarmRef.current = false
    setAutoFarm(false)
    showBanner('🎒', 'Mochila cheia — a run encerra aqui para não perder mais espólio.', 4200, { sticky: true })
  }, [showBanner])

  // Abre a sessão no servidor (uma vez). O servidor valida posse + gating e
  // passa a ser dono do RNG/recompensas. A caminhada até o 1º nó já começa em
  // paralelo — quem espera o runId é o /step, na chegada (runReadyPromiseRef).
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    runReadyPromiseRef.current = (async () => {
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
        setRunId(data.runId)
        if (typeof data.stamina === 'number') setStamina(data.stamina)
        // Ponto de partida da previsão de mochila cheia (a escrita real só acontece
        // no /finish, então o cliente precisa saber quantos slots sobravam).
        if (typeof data.inventoryUsed === 'number' && typeof data.inventorySlots === 'number') {
          freeSlotsRef.current = Math.max(0, data.inventorySlots - data.inventoryUsed)
        }
        setRunReady(true)
        // Inventário já cheio ao ENTRAR. Com o freio ligado a run nem chega a dar
        // o primeiro passo (o `advance` fecha antes de gastar stamina); desligado,
        // segue como sempre foi — avisando que o espólio vai se perder.
        if (data.inventoryFull) {
          if (stopWhenFullRef.current) {
            // Sem atraso de propósito: o piloto dispara o primeiro `advance` ~800ms
            // depois de montar, e o freio precisa estar armado ANTES disso — senão
            // a run ainda paga um nó que não podia guardar nada.
            maybeStopForFullBag()
          } else {
            later(() => showBanner('🎒', 'Inventário cheio — itens encontrados não serão coletados. Abra espaço e saia para farmar de novo.', 3600, { sticky: true }), 400)
          }
        }
      } catch {
        showBanner('⚠️', 'Sem conexão com o servidor')
      }
    })()
  }, [character.id, dungeon.id, showBanner, later, maybeStopForFullBag])

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
    // Cadeia auto-reagendada pelo relógio idle, não `setInterval`: em aba oculta
    // o intervalo cru cairia para 1 disparo/min e a run passaria por morta na
    // janela de vida do servidor (ver RUN_LIVE_WINDOW_MS) — aí o /start seguinte,
    // inclusive o do re-run automático, a abandonaria.
    let cancel: (() => void) | null = null
    const loop = () => { void beat(); cancel = later(loop, 20000) }
    cancel = later(loop, 20000)
    return () => { stop = true; cancel?.() }
  }, [runReady, phase, later])

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
      // 🔧 Manutenção: o drop caiu porque uma peça EQUIPADA está gasta. Sem dizer
      // isso, o jogador vê "mais um material" e não liga o espólio ao conserto.
      const maintTag = d.reason === 'spare'
        ? ' 🔧 (reposição)'
        : d.reason === 'maintenance' && d.forItem
        ? ` 🔧 (repara ${d.forItem})`
        : ''
      const label = (d.enhancement ? `${d.name} +${d.enhancement}` : d.name) + maintTag
      if (skippedNames.has(d.name)) {
        pushLog(`🚫 Inventário cheio — ${label} foi perdido!`)
        continue
      }
      setTotals(prev => ({ ...prev, items: [...prev.items, { name: d.name, emoji: d.emoji, label }] }))
      pushLog(`${dicePrefix}${d.emoji} ${label}`)
      // Raro+/pedra: pisca o ícone na tela — o resto cai na bag sem aviso nenhum.
      if (isHighlightDrop(d)) pushItemFloat(d.name, d.emoji, d.rarity)
    }
    if (skippedDrops && skippedDrops.length > 0) {
      showBanner('🎒', 'Inventário cheio! Alguns itens não foram coletados.', 3600, { sticky: true })
    }
  }, [pushFloat, pushItemFloat, pushLog, showBanner])

  // Carrega os consumíveis restauradores (HP/MP) do inventário do personagem.
  const loadConsumables = useCallback(async () => {
    try {
      const res = await fetch(`/api/store/inventory?characterId=${character.id}`)
      if (!res.ok) return
      const data = await res.json()
      const list: DungeonConsumable[] = (Array.isArray(data) ? data : [])
        // O que entra no cinto se decide pelo que o item FAZ, não por `battleUsable`:
        // essa flag carrega DOIS sentidos no catálogo e filtrar por ela cegamente
        // apagava as poções de revive do cinto (bug do auto-revive, 2026-08).
        .filter((row: any) => {
          if (row?.item?.type !== 'CONSUMABLE' || row.quantity <= 0) return false
          const s = row.item.stats || {}
          // 🪶 Revive entra SEMPRE: nela `battleUsable:false` quer dizer "não se usa
          // na mão", não "fica fora do combate" — é justo o que age sozinho ao cair.
          if (Number(s.reviveHpPercent) > 0) return true
          // 🍳 Comida da Culinária (Pão cura FORA de combate; o buff dos pratos entra
          // pelos levers) e insumo de fazenda (Ração): fora do cinto da run.
          if (s.foodBuff || s.farmFeed) return false
          return s.battleUsable !== false
        })
        .map((row: any) => {
          const e = consumableEffect(row.item.stats)
          return {
            id: row.item.id, name: row.item.name, hp: e.hp, mp: e.mp, qty: row.quantity,
            icon: consumableIcon(row.item.stats), cure: e.cure,
            atk: e.atk, def: e.def, dodge: e.dodge, buffTurns: e.buffTurns, revive: e.revive,
            stamina: e.stamina,
          }
        })
        .filter((c: DungeonConsumable) => c.hp > 0 || c.mp > 0 || !!c.cure || c.atk > 0 || c.def > 0 || c.dodge > 0 || c.revive > 0 || c.stamina > 0)
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
  // ⚗️ Conta da Alquimista do re-run: o farm automático paga a restauração no
  // instante em que a run ANTERIOR é desmontada, então o log dela nunca chegava
  // aos olhos do jogador. Abre a run nova dizendo quanto custou entrar inteiro.
  useEffect(() => {
    if (!runReady || !restorePaid || restorePaid <= 0) return
    pushLog(`⚗️ A Alquimista restaurou sua vida e mana por ${restorePaid} 🪙 antes desta run.`)
    showBanner('⚗️', `Restauração paga: ${restorePaid} 🪙`, 2600)
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
  // ⚔️ Arma equipada: tempera o NOME dos golpes (Explosão de Cosmo + arco = Flecha Cósmica)
  // e, no BattleScene, a animação. Só flavor — nada de dano/custo muda com ela.
  const weaponType = useMemo(
    () => equipList.find((e: any) => e?.slot === 'WEAPON')?.item?.type as string | undefined,
    [equipList],
  )
  const specialName = useCallback(
    (def: SpecialDef) => specialDisplayName(def, weaponType),
    [weaponType],
  )
  // Nome do ATAQUE DE CLASSE (o `weapon`, d8) por classe — Ataque Furtivo/Bola de Fogo/etc.
  const classAtkName = useMemo(
    () => classAttackDisplayName(character.class, weaponType, classAttackName(character.class)),
    [character.class, weaponType],
  )
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
    // Card enxuto: só barras HP/MP/STA — sem pills ATK/DEF/STR.
  }), [character, charLevel, hp, mp, stamina, transform, effMaxHp, effMaxMp, equipList])

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
    }))
  }, [pack, isPack, monster?.id, dungeon.name])

  // ============================================================
  // EXPLORAÇÃO — mapa de trilha de nós
  // ============================================================

  // Monta o card do nó a partir do que o SERVIDOR resolveu (monstro e espólio já
  // rolados). Nenhum RNG acontece aqui no cliente; o CRÉDITO acontece no /finish.
  const applyServerEvent = (data: StepResponse, atIdx: number): ResolvedEvent => {
    lootRollRef.current = data.roll ?? 12
    // Espólio pré-rolado do encontro: é daqui que o card de vitória sai sem rede.
    killDropsRef.current = data.killDrops ?? {}
    nodeLootRef.current = data.nodeLoot ?? null

    if (data.type === 'monster' && (data.monsters?.length || data.monster)) {
      const ev = dungeon.events.find(e => e.kind === 'monster')!
      const group = data.monsters?.length ? data.monsters : [data.monster!]
      const scaled = group[0]
      const many = group.length > 1
      pushLog(
        many
          ? `${ev.icon} ${ev.title} ${group.length} inimigos aparecem!`
          : `${ev.icon} ${ev.title} ${scaled.emoji} ${scaled.name} apareceu!`
      )
      return { def: ev, monster: scaled, monsters: group }
    }

    // Daqui para baixo o nó NÃO é combate (a única saída antecipada acima é a do
    // monstro): resolveu, limpou. Nó de combate só é marcado quando a luta acaba
    // — ver o `later()` da vitória.
    markNodeCleared(atIdx)

    // Achado — o servidor rolou o espólio e guardou no acumulado da run; aqui só
    // exibimos. O crédito na mochila acontece no /finish.
    const loot: NodeLoot = data.loot ?? { gold: 0, drops: [] }

    // ⛲ Fonte revitalizadora: restaura HP e MP cheios (sem espólio neste nó), sem
    // card — só a cura e o log, a jornada segue sozinha (ver narrateArrivalAt).
    if (loot.fountain) {
      setHp(effMaxHp)
      setMp(character.maxMp)
      pushFloat('HP/MP cheios! ⛲', '#34d399')
      pushLog('⛲ Você encontra uma fonte revitalizadora — HP e MP restaurados!')
      return { def: { kind: 'blessing', min: 0, max: 0, icon: '⛲', title: '', description: '' } }
    }

    // showLoot já joga ouro/itens na bag + float do raro+; sem gear/ouro, o log
    // registra a ambientação pra não ficar totalmente mudo (sem card na tela).
    showLoot(loot, predictSkipped(loot.drops), data.roll)
    maybeStopForFullBag()

    const hasGear = loot.drops.some(d => d.kind === 'item' || d.kind === 'stone')
    const anyDrop = loot.drops.length > 0 || loot.gold > 0
    const roll = data.roll ?? 12
    const tier = roll <= 5 ? 'low' : roll <= 13 ? 'mid' : 'high'
    const icon = hasGear ? '🌟' : anyDrop ? '✨' : '🍃'
    const flavor = !anyDrop
      ? dungeon.ambience[Math.floor(Math.random() * dungeon.ambience.length)]
      : tier === 'high'
        ? 'A sorte sorri: você vasculha e encontra algo valioso.'
        : tier === 'mid'
          ? 'Entre folhas e pedras, você recolhe o que dá.'
          : 'Pouca coisa — mas nada se perde.'
    pushLog(flavor)
    const revealKind: DungeonEventKind = hasGear ? 'item' : anyDrop ? 'gold' : 'nothing'

    return { def: { kind: revealKind, min: 0, max: 0, icon, title: '', description: '' } }
  }

  /**
   * A ida ao /step, isolada para poder sair ANTES da chegada ao nó (ver
   * `stepPrefetchRef`). Não toca em estado de UI: quem decide o que fazer com o
   * desfecho é sempre `finishWalkStep`, na chegada. Nunca rejeita.
   */
  const runStep = useCallback(async (): Promise<StepOutcome> => {
    // Start otimista: a caminhada até este nó começou junto com o /start. Se ele
    // ainda não aterrissou, é AQUI que se espera — a latência da entrada já foi
    // gasta andando.
    if (!runIdRef.current && runReadyPromiseRef.current) {
      await runReadyPromiseRef.current
    }
    if (!runIdRef.current) return { ok: false, status: 0 }
    try {
      const res = await fetch('/api/dungeon/run/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 📮 O desfecho do nó anterior vai de CARONA: é isto que faz o fim de
        // luta não ter chamada própria — ele viaja escondido atrás da caminhada.
        body: JSON.stringify({ runId: runIdRef.current, resolve: pendingResolveRef.current ?? undefined }),
      })
      const data: StepResponse = await res.json()
      return res.ok ? { ok: true, data } : { ok: false, status: res.status, data }
    } catch {
      return { ok: false, status: 0 }
    }
  }, [])

  /**
   * Dispara o /step do nó de destino ASSIM QUE A CAMINHADA COMEÇA. Chamado por
   * `advance()` no modo cena; `finishWalkStep` colhe a promessa na chegada.
   */
  const prefetchStep = useCallback((dest: number) => {
    if (stepPrefetchRef.current?.dest === dest) return
    const entry: StepPrefetch = { dest, settled: false, promise: Promise.resolve({ ok: false, status: 0 }) }
    entry.promise = runStep().then(out => {
      entry.settled = true
      return out
    })
    stepPrefetchRef.current = entry
  }, [runStep])

  // Botão principal: treadmill (scroll → approach → /step) ou path clássico.
  const finishWalkStep = useCallback(async (dest: number) => {
    if (walkStepLockRef.current) return
    // Reserva do nó: dedup entre a chegada visual (rAF) e o watchdog de aba
    // oculta. O lock acima só barra concorrência; esta reserva barra a
    // repetição SEQUENCIAL, que é o que custaria stamina em nó de achado.
    // Depois do lock, senão uma chamada barrada pelo lock deixaria o nó
    // reservado sem nunca executá-lo — e a run travaria de vez.
    if (dest <= stepClaimRef.current) return
    stepClaimRef.current = dest
    walkStepLockRef.current = true

    // Promessa já em voo desde o primeiro passo (cena). Se ela JÁ assentou não há
    // espera nenhuma a mascarar — e piscar aí seria um blip branco em todo nó.
    // Sem prefetch (modo clássico/esteira, ou destino dessincronizado) o pedido
    // sai agora, como antes, e aí sim o flash cobre a viagem.
    const inflight = stepPrefetchRef.current?.dest === dest ? stepPrefetchRef.current : null
    if (!inflight?.settled) setExploreRolling(true)
    const outcome = inflight ? await inflight.promise : await runStep()
    stepPrefetchRef.current = null

    // Só descarta o desfecho quando o servidor CONFIRMA que o absorveu. Num
    // desencontro de nó (aba atrasada) ele volta `resolved: false` e o
    // desfecho fica guardado para a próxima tentativa em vez de sumir.
    if (outcome.data?.resolved) pendingResolveRef.current = null

    if (!outcome.ok) {
      setExploreRolling(false)
      setWalkMode('idle')
      setMoving(false)
      walkStepLockRef.current = false
      // Devolve a reserva: o nó NÃO foi consumido, então a próxima tentativa
      // (watchdog ou nova chegada) precisa poder pedi-lo de novo.
      stepClaimRef.current = dest - 1
      // status 0 = falha de rede, ou runId que nunca chegou (nada a avisar aqui:
      // o /start já reclama por conta própria).
      if (outcome.status === 0 && !runIdRef.current) return
      if (outcome.status === 400) showBanner('😮‍💨', `${outcome.data?.error || 'Stamina insuficiente'} — ela volta +2 a cada 15 min ocioso`)
      else if (outcome.status === 0) showBanner('⚠️', 'Sem conexão com o servidor')
      else showBanner('⚠️', outcome.data?.error || 'Falha ao avançar')
      return
    }
    const data = outcome.data

    if (typeof data.stamina === 'number') setStamina(data.stamina)
    setTokenIdx(dest)
    setWalkMode('idle')
    setMoving(false)
    walkStepLockRef.current = false
    setExploreRolling(false)

    // Combate / chefe: sem card de emboscada e sem d20 de exploração — câmera
    // investe e entra direto na arena (a sorte do espólio é o d20 de iniciativa).
    if (data.type === 'boss' || data.type === 'monster') {
      let group: ScaledMonster[]
      if (data.type === 'boss') {
        if (data.monster) serverMonsterRef.current = data.monster
        serverPackRef.current = data.monsters?.length ? data.monsters : data.monster ? [data.monster] : null
        lootRollRef.current = data.roll ?? 20
        killDropsRef.current = data.killDrops ?? {}
        nodeLootRef.current = data.nodeLoot ?? null
        showNarration('A trilha desemboca no covil. O ar treme... algo antigo se ergue.')
        pushLog(`👑 Você chegou ao covil de ${dungeon.boss.name}...`)
        group = serverPackRef.current ?? (data.monster ? [data.monster] : [])
        setWalkTrailMarks(prev => {
          const aged = prev.map(m => ({ ...m, age: m.age + 1 })).filter(m => m.age < 5)
          return [{ id: dest, age: 0, emoji: '👑' }, ...aged]
        })
      } else {
        const resolved = applyServerEvent(data, dest)
        const emoji = resolved.def.icon || '⚔️'
        setWalkTrailMarks(prev => {
          const aged = prev.map(m => ({ ...m, age: m.age + 1 })).filter(m => m.age < 5)
          return [{ id: dest, age: 0, emoji: typeof emoji === 'string' ? emoji : '⚔️' }, ...aged]
        })
        group = resolved.monsters ?? (resolved.monster ? [resolved.monster] : [])
      }
      if (useScene && !reducedMotionRef.current) setFocusNode(dest)
      if (group.length > 0) {
        // 🛑 Freio puxado durante a caminhada: este nó JÁ foi pago (o /step sai na
        // saída do nó anterior), mas a arena NÃO abre atrás do card. O bicho fica
        // à espera no bolsão: cancelar entra na luta, sair deixa o `pending` no
        // servidor e o /finish estorna a stamina do nó que não foi jogado.
        if (stopRequestedRef.current) {
          caughtEncounterRef.current = group
          setStopCaughtPaidStep(true)
        } else {
          beginEncounterRef.current(group)
        }
      }
      return
    }

    // Achado / fonte: sem d20 na tela, sem card — o espólio (bag+float) e a cura
    // da fonte já aconteceram dentro de applyServerEvent; só segue a jornada.
    // Com o freio puxado, este nó ainda assim CONTA (pagou, levou o espólio) —
    // não há estorno, então o card não pode prometer stamina de volta.
    if (stopRequestedRef.current) setStopCaughtPaidStep(false)
    const resolved = applyServerEvent(data, dest)
    const emoji = resolved.def.icon || '❔'
    setWalkTrailMarks(prev => {
      const aged = prev.map(m => ({ ...m, age: m.age + 1 })).filter(m => m.age < 5)
      return [{ id: dest, age: 0, emoji: typeof emoji === 'string' ? emoji : '❔' }, ...aged]
    })
    narrateArrivalAt(dest)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeon.boss.name, runStep])

  const handleWalkApproachComplete = useCallback(() => {
    if (walkMode !== 'approach') return
    const dest = tokenIdx + 1
    finishWalkStep(dest)
  }, [walkMode, tokenIdx, finishWalkStep])

  /**
   * Cena: o herói chegou ao bolsão do nó. Mesmo gatilho do approach da esteira —
   * quem resolve o nó continua sendo o /step no servidor.
   */
  const handleSceneReachSpot = useCallback(
    (spot: MapSpot) => {
      // Ref, não state: com o watchdog resolvendo nós fora do ciclo de render,
      // o `tokenIdx` de state fica um render atrás e deixaria passar uma
      // chegada já resolvida. (A guarda real é o `stepClaimRef`; esta é só o
      // curto-circuito barato.)
      if (spot.nodeIndex <= tokenIdxRef.current) return // já resolvido
      finishWalkStep(spot.nodeIndex)
    },
    [finishWalkStep]
  )

  const advance = async () => {
    if (stopRequestedRef.current) return // freio de mão: nenhum /step novo sai daqui
    if (phase !== 'explore' || exploreRolling || walkBusy || atBoss || combatIntro) return
    // ⏳ "Encerrar sem gastar um nó novo" (mochila cheia, ou pedido durante a
    // luta que acabou fora de combate): a run fecha AQUI, na fronteira em que
    // ainda não saiu /step nenhum — nada de stamina gasta para nada.
    if (stopAfterFightRef.current) { finishRun(false); return }
    // Na CENA a caminhada pode começar antes do /start aterrissar (start otimista):
    // quem espera o runId é o finishWalkStep, na chegada ao nó. Nos outros modos
    // o /step vem logo em seguida, então continua exigindo a sessão aberta.
    if (!startedRef.current) return
    if (!useScene && (!runReady || !runIdRef.current)) return
    // 1ª entrada: espera os assets da cena carregarem. O portão é puramente
    // ESTÉTICO (não ter o mapa pintado no primeiro passo), e a escotilha que o
    // abre é um setTimeout de 8s — que, estrangulado em aba oculta, viraria um
    // minuto parado no re-run automático. Com ninguém olhando, segue em frente.
    if (useScene && !sceneReady && !hiddenRef.current) return
    const dest = tokenIdx + 1

    // --- Cena: o herói caminha sozinho até o bolsão e avisa em onReachSpot ---
    if (useScene) {
      setMoving(true)
      setSceneTarget(dest)
      // ⏱️ O /step sai JUNTO com o primeiro passo, não na chegada: a latência
      // inteira passa a caber debaixo da caminhada. É isto que tira a travada.
      prefetchStep(dest)
      showNarration()
      return
    }

    // --- Walk: vasculhar lento → avistar ? → approach → /step ---
    if (useWalkScene) {
      setMoving(true)
      setWalkMode('scroll')
      showNarration()
      later(() => {
        setWalkMode('approach')
      }, WALK_SCROLL_MS)
      return
    }

    setExploreRolling(true)
    showNarration()
    let data: StepResponse
    try {
      const res = await fetch('/api/dungeon/run/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 📮 O desfecho do nó anterior vai de CARONA: é isto que faz o fim de
        // luta não ter chamada própria — ele viaja escondido atrás da caminhada.
        body: JSON.stringify({ runId: runIdRef.current, resolve: pendingResolveRef.current ?? undefined }),
      })
      data = await res.json()
      // Só descarta o desfecho quando o servidor CONFIRMA que o absorveu. Num
      // desencontro de nó (aba atrasada) ele volta `resolved: false` e o
      // desfecho fica guardado para a próxima tentativa em vez de sumir.
      if (data?.resolved) pendingResolveRef.current = null
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
    setExploreRolling(false)
    setTokenIdx(dest)

    // Combate / chefe: direto pra arena (sem d20 de exploração nem card).
    if (data.type === 'boss' || data.type === 'monster') {
      let group: ScaledMonster[]
      if (data.type === 'boss') {
        if (data.monster) serverMonsterRef.current = data.monster
        serverPackRef.current = data.monsters?.length ? data.monsters : data.monster ? [data.monster] : null
        lootRollRef.current = data.roll ?? 20
        killDropsRef.current = data.killDrops ?? {}
        nodeLootRef.current = data.nodeLoot ?? null
        showNarration('A trilha desemboca no covil. O ar treme... algo antigo se ergue.')
        pushLog(`👑 Você chegou ao covil de ${dungeon.boss.name}...`)
        group = serverPackRef.current ?? (data.monster ? [data.monster] : [])
      } else {
        const resolved = applyServerEvent(data, dest)
        group = resolved.monsters ?? (resolved.monster ? [resolved.monster] : [])
      }
      setMoving(false)
      if (group.length > 0) beginEncounterRef.current(group)
      return
    }

    // Achado / fonte: sem animação de dado, sem card — o espólio (bag+float) e a
    // cura da fonte já aconteceram dentro de applyServerEvent; só segue a jornada.
    setMoving(true)
    applyServerEvent(data, dest)
    later(() => setMoving(false), 425)
    later(() => narrateArrivalAt(dest), 80)
  }

  // Narração de transição ao chegar num nó (sem card) — usa o índice explícito
  // em vez do estado `tokenIdx` porque pode rodar antes do re-render aplicar o
  // `setTokenIdx(dest)` mais recente.
  const narrateArrivalAt = (idx: number) => {
    if (idx === LAST - 1) {
      showNarration('A trilha termina adiante. Você sente um olhar antigo cravado em você...')
    } else if (idx !== LAST) {
      showNarration(TRANSITIONS[idx % TRANSITIONS.length])
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
  //
  // NÃO chamar direto a partir da UI: o caminho normal é `beginEncounter`, que
  // roda a investida da câmera antes e chama isto no corte.
  const startCombat = (group: ScaledMonster[] | ScaledMonster) => {
    const list = (Array.isArray(group) ? group : [group]).filter(m => m.hp > 0)
    if (list.length === 0) return
    setCombatIntro(false)
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
    // Transformação reinicia a cada combate (e libera o uso único da luta)
    setTransform(null)
    setTransformCd(0)
    setTransformedThisFight(false)
    transformedThisFightRef.current = false
    setPendingAbility(null)
    setPhase('combat')
    setStage('initiative')
    pushLog(
      list.length > 1
        ? `⚔️ Combate contra ${list.length} inimigos começou! (foco: ${active.emoji} ${active.name})`
        : `⚔️ Combate contra ${active.emoji} ${active.name} começou!`
    )
  }

  /**
   * 🎥 INVESTIDA — o beat entre aceitar a luta e a arena aparecer.
   *
   * A câmera fecha em cima do vulto (o zoom da revelação já vinha em 1.45×),
   * a vinheta escurece até o preto e só então `startCombat` troca a fase. É
   * debaixo desse preto que a moldura larga o retrato e vira arena larga, então
   * o corte de geometria não aparece.
   *
   * Quem pediu menos movimento (prefers-reduced-motion) pula direto pro combate
   * com o fade de 300ms de sempre.
   */
  const beginEncounter = (group: ScaledMonster[] | ScaledMonster) => {
    const list = (Array.isArray(group) ? group : [group]).filter(m => m.hp > 0)
    if (list.length === 0) return
    if (phase === 'combat' || combatIntro) return
    // Aba oculta entra direto: a investida é cinema, e com ninguém olhando ela
    // é só latência morta no meio de uma run automática.
    if (reducedMotionRef.current || hiddenRef.current) { startCombat(list); return }
    setCombatIntro(true)
    setEncounterZoom(ZOOM_CHARGE)
    later(() => startCombat(list), COMBAT_INTRO_MS)
  }
  beginEncounterRef.current = beginEncounter

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
    // Explosão de energia na cor da forma sobre o card do jogador (a arena lê o
    // transformationType do FighterView, que já terá virado no próximo render).
    later(() => pushBattleEvent({ kind: 'transform', actorId: character.id }), 50)
    showBanner('✨', `${cfg.name} ativada! (${cfg.duration} turnos)`, 2800)
    pushLog(`✨ Você assumiu a ${cfg.name}!`)
  }

  // Avança os contadores de transformação ao fim de cada turno ofensivo do jogador
  const tickPlayerTurn = useCallback(() => {
    const tf = transformRef.current
    if (tf) {
      const remaining = tf.turns - 1
      if (remaining <= 0) {
        const cfg = TRANSFORMATION_CONFIG[tf.type]
        setTransform(null)
        setTransformCd(cfg.cooldown)
        showBanner('↩️', t('Transformation ended'))
        pushLog(t('↩️ Your transformation ended.'))
      } else {
        setTransform({ ...tf, turns: remaining })
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
    return { power: m.attack, armor: m.defense, hp: m.maxHp, evade: m.evade, block: 0, K: K50 * S, scale: m.scale ?? S }
  }
  // Poder efetivo do golpe do monstro = poder do lever × multiplicador do tipo.
  const monsterPowerFor = (m: ScaledMonster, kind: AttackKind) => monsterLevers(m).power * ATTACKS[kind].powerMult

  // ---------- Iniciativa (= sorte do combate / espólio) ----------
  // Um d20 gira no centro com o lootRoll do servidor; o monstro só mostra o
  // resultado parado (mini-dado) em cima do card. Empate favorece o jogador.
  const handleInitiativeRoll = () => {
    if (hasRolled) return
    setHasRolled(true)
    const luck = Math.max(1, Math.min(20, Math.floor(Number(lootRollRef.current)) || 10))
    const mine: DiceResult = { sides: 20, roll: luck, modifier: 0, total: luck }
    const theirs = mkResult(20, 0)
    setPanelResult(mine)
    setDiceResults(prev => ({ ...prev, [monsterRef.current?.id ?? MONSTER_ID]: theirs }))
    later(() => {
      setStage('busy')
      setPanelResult(null)
      setHasRolled(false)
      const playerFirst = mine.total >= theirs.total
      showBanner(
        playerFirst ? '⚡' : '😈',
        playerFirst
          ? `Você começa! · Sorte ${mine.total}`
          : `${monsterRef.current?.name} começa! · Sorte ${mine.total}`,
      )
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

  // Iniciativa rola sozinha ao entrar no combate (1 dado = sorte do espólio).
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
      if (autoCombat) {
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
    const shownName = specialName(def)
    if ((fx.cd[def.id] || 0) > 0) { showBanner('⏳', `${shownName} em recarga (${fx.cd[def.id]})`); return }
    const mpCost = def.cost.mp || 0
    if (mp < mpCost) { showBanner('🔵', `MP insuficiente para ${shownName} (${mpCost}🔵)`); return }

    if (def.kind === 'util') {
      setStage('busy'); setPendingAttack(null); setPendingAbility(null); setHasRolled(false)
      if (mpCost > 0) setMp(prev => Math.max(0, prev - mpCost))
      setCombatFx(prev => ({ ...prev, cd: { ...prev.cd, [def.id]: def.cd } }))
      applyUtil(def)
      pushBattleEvent({ kind: 'buff', actorId: character.id, action: def.id })
      pushLog(`${shownName}: ${def.desc}`)
      showBanner('✨', shownName)
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
    const shown = specialName(def)
    pushLog(`${shown} (d${def.die ?? 20}=${roll}): ${dmg} de dano${hit.crit ? ' CRÍTICO' : ''} em ${m.name}`)
    showBanner('💥', shown)
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
    /**
     * ⚡ Poção de Stamina: caminho PRÓPRIO, servidor-autoritativo.
     *
     * A stamina é o orçamento diário de runs e tem um relógio único no servidor
     * (`regenAndPersist`); somar no cliente como se faz com HP/MP criaria stamina
     * do nada. Então quem aplica é /api/inventory/use-item (que já lê
     * `staminaAmount` do catálogo) e a run só reancora no número que ele devolve.
     */
    if (c.stamina > 0 && c.hp === 0 && c.mp === 0) {
      setConsumables(prev => prev.map(x => (x.id === c.id ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0))
      setShowItems(false)
      showBanner('⚡', `${c.name} usada!`)
      fetch('/api/inventory/use-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: c.id, characterId: character.id }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (typeof data?.character?.stamina === 'number') {
            setStamina(data.character.stamina)
            pushLog(`⚡ ${c.name}: stamina ${data.character.stamina}`)
          }
        })
        .catch(() => {
          // Falhou no servidor: devolve a unidade ao cinto em vez de mentir.
          loadConsumables()
        })
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
      { armor: playerLevers.armor, K: playerLevers.K, evade: effEvade, block: playerLevers.block ?? 0 },
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
    } else if (outcome.blocked) {
      pushLog(`🛡️ Você bloqueou o golpe de ${m.name}! Sofreu ${inDmg} (armadura reforçada)`)
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
      const reviver = consumablesRef.current.find(x => x.revive > 0 && x.qty > 0)
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

  // ============================================================
  // PREVISÕES LOCAIS — o que antes vinha na resposta de cada luta
  //
  // O crédito da run acontece de uma vez só no /finish, então estes três efeitos
  // (desgaste, level up e mochila cheia) precisam aparecer na hora sem rede. Os
  // três são DETERMINÍSTICOS e usam as MESMAS funções puras do servidor, então a
  // previsão bate com o crédito final; o /finish continua sendo a autoridade e
  // reconcilia qualquer diferença na tela de resumo.
  // ============================================================

  /** O pacote atual tem chefe? (chefe dobra o desgaste, igual ao servidor.) */
  const packHadBoss = (last: ScaledMonster) =>
    !!last.isBoss || packRef.current.some(x => x.isBoss)

  /** Desgaste dos abates de UM nó — espelha wearFor() do /finish. */
  const applyLocalWear = (kills: number, boss: boolean) => {
    if (kills <= 0) return
    const weaponWear = wearFor('WEAPON', kills, boss, character.level)
    const gearWear = wearFor('ARMOR', kills, boss, character.level)
    setEquipList(prev => prev.map((eq: any) => {
      const before = Number(eq.durability)
      if (!Number.isFinite(before) || before <= 0) return eq
      const after = Math.max(0, before - (eq.slot === 'WEAPON' ? weaponWear : gearWear))
      if (after === before) return eq
      if (after === 0) {
        pushLog(`💔 ${eq.item?.name ?? 'Equipamento'} QUEBROU! Sem bônus até reparar no ferreiro.`)
        showBanner('💔', `${eq.item?.name ?? 'Equipamento'} quebrou!`, 2600)
      } else if (isLowDurability({ durability: after }) && !wearWarnedRef.current.has(eq.slot)) {
        wearWarnedRef.current.add(eq.slot)
        pushLog(`⚠️ ${eq.item?.name ?? 'Equipamento'} está quase quebrando (${after}/${eq.maxDurability}).`)
      }
      return { ...eq, durability: after }
    }))
  }

  /** Subiu de nível com o XP acumulado até agora? (curva de experienceSystem) */
  const checkLocalLevelUp = () => {
    const reachedLevel = getLevelInfo(charExperienceRef.current + runXpRef.current).level
    if (reachedLevel <= charLevelRef.current) return
    charLevelRef.current = reachedLevel
    setLeveledUpThisRun(true)
    // Nível VIVO já (não só no `later`): o próximo combate desta run precisa ver
    // o nível novo nos levers/card, mesmo antes do flash.
    setCharLevel(reachedLevel)
    later(() => {
      setHp(effMaxHp)
      setMp(character.maxMp)
      setLevelUpFlash(reachedLevel)
      showBanner('⭐', `Nível ${reachedLevel}! HP e MP restaurados`, 3200)
      pushLog('🎉 Você SUBIU DE NÍVEL! HP e MP restaurados por completo.')
      later(() => setLevelUpFlash(null), 2600)
    }, 1500)
  }

  /**
   * Quais drops NÃO vão caber na mochila. Espelha a ordem de prioridade do
   * servidor (pedra → gear → resto): com a mochila quase cheia, material não
   * pode roubar o slot da pedra.
   *
   * Contabilidade de slot igual à do servidor: EQUIPAMENTO nunca empilha (1 slot
   * por peça), consumível empilha numa linha só — então o 2º exemplar do mesmo
   * nome na run não gasta slot novo. O que o cliente NÃO sabe é se o nome já
   * tinha linha na mochila antes da run; nesse caso a conta erra para MENOS
   * espaço, o que só torna o aviso conservador. O /finish dá o veredito real.
   */
  const chargedNamesRef = useRef<Set<string>>(new Set())
  const predictSkipped = (drops: LootDrop[]): LootDrop[] => {
    if (drops.length === 0 || freeSlotsRef.current == null) return []
    const rank = (d: LootDrop) => (d.kind === 'stone' ? 0 : d.kind === 'item' ? 1 : 2)
    const ordered = [...drops].sort((a, b) => rank(a) - rank(b))
    const skipped: LootDrop[] = []
    for (const d of ordered) {
      const stacks = d.kind !== 'item' // só equipamento ocupa uma linha por peça
      if (stacks && chargedNamesRef.current.has(d.name)) continue // empilha: sem custo
      if (freeSlotsRef.current! > 0) {
        freeSlotsRef.current! -= 1
        if (stacks) chargedNamesRef.current.add(d.name)
      } else {
        skipped.push(d)
      }
    }
    return skipped
  }

  // ---------- Abate de um monstro do pacote ----------
  // NENHUM abate toca a rede: o espólio já veio rolado no /step e o desfecho do
  // nó viaja de carona no passo seguinte. Se ainda há inimigos vivos, troca pro
  // mais fraco e o duelo continua.
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

    // 💀 Drop por ABATE (já rolado pelo servidor no /step): entra no card do nó
    // junto com o espólio de limpar.
    encounterDropsRef.current.push(...(killDropsRef.current[m.id] ?? []))
    runXpRef.current += m.xpReward

    // Abate no MEIO do pacote: ZERO rede. A UI usa os valores que o próprio
    // servidor rolou pro nó (m.goldReward/m.xpReward); o crédito real acontece
    // no /finish, com o desfecho que este cliente vai reportar.
    if (!willClear) {
      encounterXpRef.current += m.xpReward
      encounterKillGoldRef.current += m.goldReward
      setTotals(prev => ({ ...prev, gold: prev.gold + m.goldReward, xp: prev.xp + m.xpReward, kills: prev.kills + 1 }))
      pushLog(`🏆 Você derrotou ${m.emoji} ${m.name}! +${m.goldReward} 💰 +${m.xpReward} XP`)
      checkLocalLevelUp()
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

    // ÚLTIMO abate: NÓ LIMPO, e ainda assim ZERO rede.
    //
    // Tudo que o nó rende já veio rolado pelo servidor no /step (killDrops +
    // nodeLoot), então o card de vitória sai instantâneo. O desfecho fica
    // guardado em `pendingResolveRef` e viaja de carona no próximo /step — ou no
    // /finish, se a run acabar aqui (boss, recuo, derrota, saída).
    pendingResolveRef.current = {
      nodeIdx: tokenIdxRef.current,
      outcome: 'clear',
      killedIds: [...killedIdsRef.current],
    }

    const killGold = m.goldReward
    const xp = m.xpReward
    const nodeLoot: NodeLoot = nodeLootRef.current ?? { gold: 0, drops: [] }
    encounterXpRef.current += xp
    encounterKillGoldRef.current += killGold

    setTotals(prev => ({ ...prev, gold: prev.gold + killGold, xp: prev.xp + xp, kills: prev.kills + 1 }))
    pushLog(`🏆 Você derrotou ${m.emoji} ${m.name}! +${killGold} 💰 +${xp} XP`)

    // ⚔️ Desgaste do gear: fórmula determinística (wearFor), a MESMA que o
    // servidor aplica no /finish — dá pra prever sem perguntar. Importa prever:
    // uma peça que quebra no meio da run precisa parar de somar bônus na hora.
    applyLocalWear(killedIdsRef.current.length, packHadBoss(m))

    // ⭐ Level up: previsto pela curva de XP compartilhada (experienceSystem). O
    // servidor recalcula do zero no /finish a partir do XP total, então isto é só
    // o brilho na tela — o valor final nunca depende do cliente.
    checkLocalLevelUp()

    // Espólio do nó = drops por abate (de todo o pacote) + o de limpar. O que
    // não couber na mochila é previsto com a mesma ordem do /finish.
    const nodeDrops = [...encounterDropsRef.current, ...nodeLoot.drops]
    encounterDropsRef.current = []
    const loot: NodeLoot = { ...nodeLoot, drops: nodeDrops }
    // Sem card de vitória: showLoot já jogou os itens na bag (e piscou o ícone
    // dos raro+ na tela) — o combate não trava esperando clique nenhum.
    showLoot(loot, predictSkipped(nodeDrops), lootRollRef.current)
    // 🎒 Encheu com o espólio DESTE nó: arma o freio agora, antes do `later`
    // abaixo — é ele que lê `stopAfterFightRef` e encerra a run na vitória.
    maybeStopForFullBag()
    later(() => {
      setMonster(null)
      setPack([])
      packRef.current = []
      setCombatEnded(false)
      // A câmera volta ao enquadramento normal AGORA, escondida atrás da
      // transição de volta pro 'explore' — o jogador nunca vê o zoom desfazer.
      resetEncounterCamera()
      // Bando abatido: só AQUI o nó de combate deixa de desenhar o bicho. Até
      // este ponto ele ficou rondando o bolsão embaixo do card do encontro e do
      // zoom de aproximação, que é o que o jogador precisa ver.
      markNodeCleared(tokenIdxRef.current)
      setPhase('explore')
      if (m.isBoss) {
        showBanner('👑', `${dungeon.name} conquistada!`, 2400)
        finishRun(true)
      } else if (stopAfterFightRef.current) {
        // ⏳ Pedido durante a luta: encerra AQUI, antes de a narração soltar o
        // piloto para o próximo nó. O espólio deste encontro já entrou.
        finishRun(false)
      } else {
        showNarration(nextIsBoss
          ? 'A trilha termina adiante. Você sente um olhar antigo cravado em você...'
          : TRANSITIONS[tokenIdx % TRANSITIONS.length])
      }
    }, 2800)
  }

  /**
   * HP/MP atuais na escala do BANCO (sem gear nem passivas), que é a escala em
   * que o pai guarda o personagem. Mesma conversão que o /finish faz no servidor
   * — assim o card do mapa e a coluna do banco contam a mesma história.
   */
  const exitPools = () => ({
    hp: Math.max(1, Math.round(character.maxHp * poolPct(hpRef.current, effMaxHp))),
    mp: Math.max(0, Math.round(character.maxMp * poolPct(mpRef.current, effMaxMp))),
  })

  /**
   * ⚗️ Paga a restauração da Alquimista entre duas runs do farm automático.
   *
   * O preço é decidido pelo SERVIDOR (lib/restoreCost.ts) — aqui só reportamos o
   * que foi cobrado. Devolve false quando não deu para restaurar (sem ouro ou
   * erro de rede): quem chama desliga o farm e volta ao mapa.
   */
  const payRestore = async (): Promise<{ ok: boolean; cost: number; gold?: number; needed?: number; noGold?: boolean }> => {
    try {
      const res = await fetch(`/api/character/${character.id}/restore`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        showBanner('⚗️', data?.error || 'A Alquimista não pôde restaurar você — farm encerrado.', 4200, { sticky: true })
        // Falta de ouro tem tratamento PRÓPRIO no mapa (aviso + botão de pagar);
        // qualquer outra falha volta em silêncio, sem acusar bolso vazio.
        // Mesmo formato de `lib/buyGold` ("…insuficiente… precisa de N 🪙"), lido
        // aqui na mão: aquele módulo arrasta a ethers inteira para o bundle da run.
        const msg = String(data?.error ?? '')
        const noGold = /insuficiente/i.test(msg) && /precisa de/i.test(msg)
        const needed = Number(msg.match(/precisa de\s+(\d+)/i)?.[1] ?? 0)
        return { ok: false, cost: 0, noGold, needed: noGold && needed > 0 ? needed : undefined }
      }
      if (data?.restored && data.cost > 0) {
        pushLog(`⚗️ A Alquimista restaurou sua vida e mana por ${data.cost} 🪙.`)
      } else if (data?.restored) {
        pushLog(`⚗️ A Alquimista restaurou sua vida e mana — cortesia até o nível ${FREE_RESTORE_MAX_LEVEL}.`)
      }
      return { ok: true, cost: data?.cost ?? 0, gold: typeof data?.characterGold === 'number' ? data.characterGold : undefined }
    } catch {
      showBanner('⚗️', 'Sem conexão com a Alquimista — farm encerrado.', 4200, { sticky: true })
      return { ok: false, cost: 0 }
    }
  }

  // 🔁 Re-run: o pai remonta a run do zero (mesma masmorra/herói), preservando o
  // estado do piloto. Precisa de stamina para ao menos o 1º passo (nó menor).
  // Aguarda o POST que encerra a run atual aterrissar antes de remontar — senão o
  // /start da nova run vê a antiga ainda 'active' (lock vivo) e devolve 409.
  const endRunPromiseRef = useRef<Promise<unknown> | null>(null)
  const canRerun = !!onRestart && stamina >= MINOR_STEP_COST
  const restartRun = async () => {
    if (!onRestart) { exitRun(); return }
    // ⏳ Mesma espera do exitRun (o /finish), mais o POST da Alquimista quando o
    // farm automático está ligado. São dois round-trips antes de a run remontar.
    setLeaving('rerun')
    // Run nova começa com o freio solto — os pedidos de parada valiam para a run
    // que acabou de fechar.
    stopRequestedRef.current = false
    stopAfterFightRef.current = false
    caughtEncounterRef.current = null
    bagFullStopRef.current = false
    setStopAfterFight(false)
    setBagFullStop(false)
    setStopCaughtPaidStep(false)
    // A ORDEM importa: o /finish persiste a fração de HP/MP E credita o ouro da
    // run. Só depois dele a Alquimista vê o estado certo (e o saldo certo).
    try { await endRunPromiseRef.current } catch { /* segue mesmo assim */ }

    // 🤖 Farm automático: paga a restauração antes de recomeçar. Sem ouro, o
    // farm se desliga e volta ao mapa — nada de re-rodar com o herói caído,
    // queimando stamina à toa.
    let pools = exitPools()
    let paid = 0
    let goldAfter: number | undefined
    if (autoFarmRef.current) {
      const restored = await payRestore()
      if (!restored.ok) {
        setAutoFarm(false)
        // Volta ao mapa CONTANDO o motivo: a tela que mostraria o banner some
        // junto com este componente (ver `onExit.stopped`).
        exitRun(restored.noGold ? { stopped: 'no-gold-restore', restoreNeeded: restored.needed } : undefined)
        return
      }
      paid = restored.cost
      goldAfter = restored.gold
      // Restaurado: o pai remonta com os pools cheios (escala do banco) e o
      // initializer da run volta a expandi-los com gear e passivas.
      pools = { hp: character.maxHp, mp: character.maxMp }
    }

    // Como no exitRun: baixa junto com a entrega ao pai, que remonta a run com
    // uma `key` nova (este componente inteiro sai de cena).
    setLeaving(null)
    onRestart({
      ...pools,
      // Ref, não o valor do render: o /finish aguardado acima pode ter estornado
      // o passo de um nó não jogado.
      stamina: staminaRef.current,
      level: charLevel,
      experience: charExperienceRef.current,
      leveledUp: leveledUpThisRun,
      auto,
      restorePaid: paid,
      gold: goldAfter,
    })
  }

  /**
   * Reconcilia a run com o crédito AUTORITATIVO do /finish.
   *
   * Durante a run tudo foi otimista (valores que o servidor rolou, mas ainda não
   * escreveu). Aqui aparecem as duas divergências possíveis — teto diário de ouro
   * e mochila cheia — na tela de resumo, que é onde elas fazem sentido, em vez de
   * no meio de uma luta.
   */
  const applyFinishGrant = (data: FinishResponse) => {
    // ⚡ Estorno do passo não jogado: o `exitRun` empacota a stamina da TELA para
    // o mapa, então sem espelhar aqui a ficha voltaria com o valor pré-estorno.
    if (typeof data.stamina === 'number') {
      const back = data.stamina - staminaRef.current
      // O ref é escrito AQUI, não só no render: quem sai (`exitRun`/`restartRun`)
      // lê logo depois do await do /finish, antes de o React ter recomposto.
      staminaRef.current = data.stamina
      setStamina(data.stamina)
      if (back > 0) pushLog(`⚡ ${back} de stamina devolvida — o nó não chegou a ser jogado.`)
    }
    const gold = data.gold ?? 0
    const optimisticGold = totalsRef.current.gold
    if (gold < optimisticGold) {
      pushLog(`💰 Teto diário de ouro atingido: a run rendeu ${gold} 💰 (de ${optimisticGold}).`)
      setTotals(prev => ({ ...prev, gold }))
    }
    const skipped = data.skippedDrops ?? []
    if (skipped.length > 0) {
      const names = new Set(skipped.map(d => d.name))
      setTotals(prev => ({ ...prev, items: prev.items.filter(i => !names.has(i.name)) }))
      for (const d of skipped) pushLog(`🚫 Inventário cheio — ${d.name} foi perdido!`)
      showBanner('🎒', `${skipped.length} item(ns) perdido(s): inventário cheio.`, 3600, { sticky: true })
    }
    // Nível: o /finish é quem decide de verdade. Reconcilia nos DOIS sentidos —
    // sem isto, uma previsão local otimista (checkLocalLevelUp, calculada sobre um
    // `character.experience` que pode estar desatualizado num re-run) podia deixar
    // "Você subiu de nível!" plantado na tela mesmo quando o servidor não confirmou,
    // e o jogador saía vendo a comemoração enquanto a ficha continuava no nível velho.
    if (data.newLevel != null) {
      setCharLevel(data.newLevel)
    }
    setLeveledUpThisRun(!!data.leveledUp)
    // O servidor somou `data.xp` ao XP que já existia — espelha aqui pro re-run
    // seguinte (restartRun) partir da base certa.
    charExperienceRef.current += data.xp ?? 0
  }

  /**
   * 🏁 Encerra a run no servidor — a ÚNICA chamada que escreve no personagem.
   *
   * Leva o desfecho do último nó (o que não teve /step seguinte para levá-lo de
   * carona) e devolve a promessa em `endRunPromiseRef`, que o re-run aguarda
   * antes de remontar: sem isso o /start seguinte veria o lock antigo vivo (409).
   */
  const finishSentRef = useRef(false)
  const closeRunOnServer = (reason: 'boss' | 'retreat' | 'lose') => {
    if (!runIdRef.current) return
    // UMA vez por run enquanto está EM VOO ou já entregue: os caminhos de saída se
    // sobrepõem (finishRun → exitRun, por exemplo). Se a entrega falhar de vez, a
    // flag volta a false lá embaixo — clicar "Sair" de novo tem que poder tentar.
    if (finishSentRef.current) return
    finishSentRef.current = true
    // Combate em andamento com abates não reportados: vira o desfecho final.
    if (!pendingResolveRef.current && killedIdsRef.current.length > 0 && phase === 'combat' && !combatEnded) {
      pendingResolveRef.current = {
        nodeIdx: tokenIdxRef.current,
        outcome: reason === 'lose' ? 'lose' : 'retreat',
        killedIds: [...killedIdsRef.current],
      }
    }
    // O desfecho do último nó vive SÓ aqui até o /finish confirmar — não pode ser
    // descartado antes da resposta, senão uma falha de entrega leva junto o nó
    // (que, no fim da run, é o boss inteiro).
    const resolve = pendingResolveRef.current ?? undefined
    // ❤️ HP/MP de saída viajam como FRAÇÃO do teto efetivo: o servidor converte
    // para a coluna (que não conhece gear nem passivas da árvore).
    const body = JSON.stringify({
      runId: runIdRef.current,
      reason,
      resolve,
      hpPct: poolPct(hpRef.current, effMaxHp),
      mpPct: poolPct(mpRef.current, effMaxMp),
    })
    const giveUp = () => {
      // Nada foi creditado: devolve o desfecho e destrava a flag pra uma próxima
      // tentativa (o botão de sair, ou o /start seguinte drenando a run órfã).
      pendingResolveRef.current = resolve ?? null
      finishSentRef.current = false
      showBanner('⚠️', 'Não deu para encerrar a run — o espólio será creditado na próxima entrada.', 4200, { sticky: true })
    }
    // Tenta até 3x com backoff. Sem isso, o auto-pilot (que espera esta promessa
    // antes de reabrir a run) achava que encerrou e já batia um /start novo — a run
    // antiga, ainda 'active' no servidor, se autobloqueava ("Herói em uso") sem
    // nenhuma outra aba de fato aberta.
    const attempt = (retriesLeft: number, waitMs: number): Promise<void> =>
      fetch('/api/dungeon/run/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        // Sobrevive ao unload da página: fechar a aba no meio do POST não cancela
        // mais o crédito da run.
        keepalive: true,
      })
        .then(async (res) => {
          // 409 = a run já foi encerrada (retry ou outra aba): o crédito aconteceu,
          // não há o que reconciliar.
          if (res.status === 409) { pendingResolveRef.current = null; return }
          if (!res.ok) {
            // 5xx é o caso REAL de perda (a transação do servidor deu rollback e
            // nada foi creditado) — tratar como sucesso mudo era o que fazia o
            // jogador sair da run sem XP, gold nem item e sem nenhum aviso.
            if (retriesLeft > 0) {
              await new Promise(r => setTimeout(r, waitMs))
              return attempt(retriesLeft - 1, waitMs * 2)
            }
            giveUp()
            return
          }
          pendingResolveRef.current = null
          applyFinishGrant((await res.json().catch(() => ({}))) as FinishResponse)
        })
        .catch(async () => {
          if (retriesLeft > 0) {
            await new Promise(r => setTimeout(r, waitMs))
            return attempt(retriesLeft - 1, waitMs * 2)
          }
          giveUp()
        })
    // A bandeira do POST em voo é levantada AQUI (e não em quem chama): o resumo
    // aparece antes de o crédito aterrissar, e é essa janela que a pílula
    // "salvando o espólio" explica.
    setFinishPending(true)
    // `attempt` nunca rejeita, e o `.finally` repassa a resolução — quem faz
    // `await endRunPromiseRef.current` continua vendo a mesma promessa de antes.
    endRunPromiseRef.current = attempt(3, 1000).finally(() => setFinishPending(false))
  }

  // 🔌 Saída "suja": fechar a aba, dar F5 ou navegar pela navbar não passa por
  // botão nenhum da run. Sem isto o desfecho do nó ATUAL (que no fim da run é o
  // boss inteiro) morria no browser, e a run só seria drenada — sem ele — na
  // entrada seguinte. O `keepalive` do fetch é o que faz o POST sobreviver ao
  // unload. No desmonte, `finishSentRef` já barra quem saiu pelo caminho normal.
  const closeRunRef = useRef(closeRunOnServer)
  closeRunRef.current = closeRunOnServer
  useEffect(() => {
    // `persisted` distingue a página que MORRE da que só vai para o bfcache.
    // Trocar de app no celular dispara `pagehide` com persisted=true — sem esta
    // checagem, mandar o jogo para segundo plano ENCERRAVA a run, que é o
    // oposto do que um jogo idle promete.
    const bail = (e: PageTransitionEvent) => { if (!e.persisted) closeRunRef.current('retreat') }
    window.addEventListener('pagehide', bail)
    return () => {
      window.removeEventListener('pagehide', bail)
      closeRunRef.current('retreat')
    }
  }, [])

  // RECUAR: sai do combate em SEGURANÇA, levando os abates já feitos. É a saída
  // do early-game: matou o que dava conta e volta com XP.
  const handleRetreat = () => {
    if (combatEnded) return
    setCombatEnded(true)
    closeRunOnServer('retreat')
    pushLog('🏃 Você recua em segurança, levando o que conquistou.')
    showBanner('🏃', 'Recuo seguro — XP e espólio dos abates preservados.', 2600)
    later(() => {
      setMonster(null)
      setPack([])
      packRef.current = []
      resetEncounterCamera()
      setPhase('summary')
    }, 1300)
  }

  // DERROTA: encerra a run creditando os abates feitos até cair.
  // A tela oferece Sair e Re-run; no piloto automático o Re-run é escolhido sozinho
  // (enquanto houver stamina) — sem stamina, volta ao mapa como antes.
  const handleDefeat = () => {
    setPhase('defeat')
    closeRunOnServer('lose')
    if (autoFarm) {
      later(() => {
        if (!autoFarmRef.current) return // desligou o farm enquanto lia o resumo
        if (onRestart && stamina >= MINOR_STEP_COST) restartRun(); else exitRun()
      }, 3200)
    }
  }

  /**
   * 🚪 Clique no Sair: FREIA a run e só depois abre o card. O ref vem antes do
   * `setState` de propósito — ver `stopRequestedRef`.
   */
  const requestStop = () => {
    stopRequestedRef.current = true
    // Passo já pago em voo (ou herói ainda a caminho do bolsão): o card avisa que
    // a stamina volta na saída, em vez de o jogador achar que perdeu.
    setStopCaughtPaidStep(Boolean(stepPrefetchRef.current) || walkBusy)
    setExitConfirm(true)
  }

  const cancelStop = () => {
    stopRequestedRef.current = false
    setStopCaughtPaidStep(false)
    setExitConfirm(false)
    // O nó já pago que ficou esperando: agora sim entra na arena.
    const caught = caughtEncounterRef.current
    caughtEncounterRef.current = null
    if (caught) later(() => beginEncounterRef.current(caught), 250)
  }

  /** ⏳ Deixa a luta terminar e encerra na vitória, sem gastar um nó novo. */
  const stopAfterThisFight = () => {
    stopAfterFightRef.current = true
    stopRequestedRef.current = false
    setStopAfterFight(true)
    setStopCaughtPaidStep(false)
    setExitConfirm(false)
    showBanner('⏳', 'A run encerra ao fim desta luta — sem gastar stamina num nó novo.', 3000)
  }

  const finishRun = async (bossDefeated: boolean) => {
    setPhase('summary')
    closeRunOnServer(bossDefeated ? 'boss' : 'retreat')
    if (bossDefeated) {
      pushLog(`👑 ${dungeon.name} conquistada!`)
      // Farm automático: boss vencido também reinicia a run (farm contínuo até a stamina acabar).
      if (autoFarm) {
        later(() => {
          if (!autoFarmRef.current) return // desligou o farm enquanto lia o resumo
          if (onRestart && stamina >= MINOR_STEP_COST) restartRun(); else exitRun()
        }, 3600)
      }
    }
  }

  const exitRun = async (reason?: { stopped?: 'no-gold-restore'; restoreNeeded?: number }) => {
    // ⏳ Overlay ANTES do await: o crédito da run pode levar segundos e sem isto
    // a tela ficava idêntica, como se o clique não tivesse pegado.
    setLeaving('exit')
    // Garante o encerramento da sessão no servidor ao sair (creditando abates
    // pendentes, se saiu do meio de um combate).
    closeRunOnServer('retreat')
    // Espera o /finish aterrissar antes de voltar ao mapa — senão o poll de
    // "herói em uso" da página de masmorras (mesmo padrão do restartRun acima)
    // ainda vê esta run como 'active' e mostra o aviso sobre o próprio herói
    // que acabou de sair (ex.: ao voltar ao mapa logo após a derrota).
    try { await endRunPromiseRef.current } catch { /* segue mesmo assim */ }
    // ❤️ HP e MP saem como ESTÃO (o /finish acabou de persistir a mesma fração):
    // o card do mapa mostra o herói machucado na hora, sem esperar refetch.
    // Stamina pelo REF: o /finish esperado logo acima pode ter devolvido o passo
    // de um nó que ficou por jogar, e o valor do render é anterior a isso.
    // Baixar a bandeira no MESMO tick do onExit: o pai desmonta a run em
    // seguida, então não há frame com o overlay já apagado por cima do resumo.
    setLeaving(null)
    onExit({ ...exitPools(), stamina: staminaRef.current, leveledUp: leveledUpThisRun, ...reason })
  }

  // 🤖 Interruptor do farm automático, mostrado nas telas de resumo e derrota.
  // Deixa explícito o custo da conveniência: refazer a run sozinho passa pela
  // Alquimista, e a Alquimista cobra (a partir do nível 7).
  // ⚗️ Conta prevista da Alquimista para o PRÓXIMO re-run: mesma função que o
  // servidor usa para cobrar (lib/restoreCost.ts), nos pools da escala do banco —
  // a mesma conversão do `exitPools`. Só previsão: quem cobra é a rota.
  const nextRestore = restoreCost({
    hp: Math.max(1, Math.round(character.maxHp * poolPct(hp, effMaxHp))),
    maxHp: character.maxHp,
    mp: Math.max(0, Math.round(character.maxMp * poolPct(mp, effMaxMp))),
    maxMp: character.maxMp,
    level: charLevel,
  })
  // Saldo previsto ao fim desta run: o ouro que o pai conhece MAIS o que a run
  // rendeu (o /finish credita tudo de uma vez, e o `character.gold` da prop só é
  // ressincronizado no re-run seguinte). Sem somar, o aviso de "sem ouro"
  // dispararia com o saldo de antes da run.
  const heroGold = character.gold != null ? character.gold + totals.gold : null
  const cantAffordRestore = heroGold !== null && nextRestore.cost > heroGold

  const farmToggle = (
    <div className="mb-3 flex flex-col items-center gap-1.5">
      {/* 🎒 O farm não se desligou sozinho por capricho: sem slot livre a próxima
          run só queimaria stamina (e o ouro da Alquimista) por espólio nenhum. */}
      {bagFullStop && (
        <div className="mb-1 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-[10px] leading-tight text-amber-100/85 max-w-[17rem]">
          🎒 A mochila encheu — a run parou aqui e o farm automático foi desligado.
          Libere espaço (ou compre slots) antes de voltar.
        </div>
      )}
      <button
        onClick={() => setAutoFarm(v => !v)}
        className={`px-4 py-1.5 rounded-lg text-[11px] font-black border transition-colors ${
          autoFarm
            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            : 'border-stone-600/60 bg-stone-800/60 text-stone-300 hover:bg-stone-700/60'
        }`}
      >
        {autoFarm ? '🤖 Farm automático: LIGADO' : '🤖 Farm automático: DESLIGADO'}
      </button>
      <div className="text-[10px] leading-tight text-white/45 max-w-[16rem]">
        {autoFarm
          ? charLevel > FREE_RESTORE_MAX_LEVEL
            ? 'Refaz a run sozinho e paga a Alquimista para restaurar vida e mana entre elas.'
            : `Refaz a run sozinho. A restauração é gratuita até o nível ${FREE_RESTORE_MAX_LEVEL}.`
          : 'Você refaz a run na mão, com a vida e a mana que sobraram.'}
      </div>
      {/* 💸 O preço da conveniência com NÚMERO: a cobrança acontece no instante em
          que esta tela sai de cena, então sem isto o ouro sumia sem explicação. */}
      {autoFarm && !nextRestore.free && !nextRestore.alreadyFull && (
        <div
          className={`rounded-lg border px-3 py-1.5 text-[10px] leading-tight max-w-[17rem] ${
            cantAffordRestore
              ? 'border-red-400/40 bg-red-500/10 text-red-200'
              : 'border-amber-300/30 bg-amber-500/10 text-amber-100/85'
          }`}
        >
          {cantAffordRestore
            ? `⚗️ Faltam ${nextRestore.cost - (heroGold ?? 0)} 🪙 para a Alquimista restaurar vida e mana (${nextRestore.cost} 🪙). Sem isso o farm para e volta ao mapa.`
            : `⚗️ A Alquimista vai cobrar ~${nextRestore.cost} 🪙 para você entrar inteiro na próxima run.`}
        </div>
      )}
    </div>
  )

  /**
   * ⏳ O resumo aparece na hora (o `finishRun` dispara o POST sem esperar), mas o
   * crédito ainda está viajando. Esta pílula preenche justamente essa janela —
   * é a explicação de por que o botão de sair, clicado agora, vai demorar.
   * Some sozinha quando o /finish aterrissa; quando alguém já está esperando por
   * ele (`leaving`), o overlay assume e a pílula sai de cena. Num /finish rápido
   * nem chega a aparecer (ver LEAVING_GRACE_MS).
   */
  const savingPill = showSaving && !leaving && (
    <div className="mb-3 flex justify-center">
      <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-black/75 px-3 py-1 text-[10px] font-bold text-amber-200 backdrop-blur-sm animate-pulse">
        ⏳ Salvando o espólio no servidor...
      </span>
    </div>
  )

  // ---------- Painel de dados da arena ----------
  const dicePanel = useMemo(() => {
    if (phase !== 'combat') return null
    if (stage === 'initiative') {
      const foe = monsterRef.current
      const theirs = foe ? diceResults[foe.id] : undefined
      // Empate favorece o jogador (mesmo critério do handleInitiativeRoll: mine >= theirs).
      const resultBanner = panelResult && theirs
        ? panelResult.total >= theirs.total
          ? `Você começa! · Sorte ${panelResult.total}`
          : `${foe?.name} começa! · Sorte ${panelResult.total}`
        : null
      return {
        visible: true,
        diceType: 20,
        hasRolled,
        label: '⚡ Iniciativa — sorte do combate!',
        onRoll: handleInitiativeRoll,
        myResult: panelResult,
        waitingForOpponent: false,
        dual: false,
        resultBanner,
      }
    }
    if (stage === 'playerRoll' && pendingAbility) {
      const sides = pendingAbility.die ?? 20
      return {
        visible: true,
        diceType: sides,
        hasRolled,
        label: `${specialName(pendingAbility)} — role o d${sides}!`,
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
  }, [phase, stage, hasRolled, panelResult, diceResults, pendingAttack, pendingAbility, classAtkName, specialName, stamina, mp])

  // Rola o dado sozinho assim que o jogador escolhe um golpe/habilidade — não precisa
  // mais clicar no dado, só no ataque. Vale mesmo fora do piloto automático.
  useEffect(() => {
    if (phase !== 'combat' || stage !== 'playerRoll' || hasRolled || combatEnded || exitConfirm) return
    return later(() => {
      if (pendingAbility) handleAbilityRoll()
      else handlePlayerAttackRoll()
    }, 400)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage, hasRolled, combatEnded, exitConfirm, pendingAbility, pendingAttack, later])

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

  /**
   * 💥 Dano que o PACOTE inteiro tende a causar numa rodada, pela mesma conta do
   * combate real (`computeMonsterOutcome` + os multiplicadores de `dfx`).
   *
   * O piloto curava em 35% do HP máximo fixo, mas o nó traz 1-3 monstros: uma
   * rodada inimiga inteira passa de 35% com folga, e o herói ia de meia-vida a
   * zero sem NUNCA voltar ao `playerSelect` para beber. O gatilho de cura precisa
   * olhar o que vem pela frente, não uma fração fixa.
   *
   * DETERMINÍSTICA de propósito (`rng: () => 0.5`, esquiva e bloqueio zerados):
   * é um limiar de SEGURANÇA, e um limiar não pode encolher porque a amostra deu
   * sorte. `resolveMonsterHit` sorteia a esquiva por `rng()`, então reaproveitar a
   * função com a evasão real devolveria 0 de dano sempre que o sorteio esquivasse —
   * o piloto acharia o pacote inofensivo justo quando ele não é. A conta aqui é
   * "e se todos acertarem", que é o cenário que mata.
   */
  const expectedIncomingRound = (): number => {
    const dfx = combatFxRef.current
    const half = () => 0.5
    const mult = dfx.dmgTakenMult * dfx.enemyDmgMult * unlocks.passives.selfDmgTakenMult
    return packRef.current
      .filter(m => m.hp > 0)
      .reduce((sum, m) => {
        const r = resolveMonsterHit({
          power: monsterPowerFor(m, 'basic'),
          sides: PVE_DIE.basic,
          defender: { armor: playerLevers.armor, K: playerLevers.K, evade: 0, block: 0 },
          forcedDefRoll: 1,
          rng: half,
        })
        return sum + Math.max(1, Math.round(r.damage * mult))
      }, 0)
  }

  /**
   * 💪 Poção de buff para uma luta que vale a pena (Força/Defesa/Agilidade/Tônico).
   *
   * Sem isto elas só se acumulavam na mochila: `pickPotion` só olha restauradores
   * e nenhum outro caminho automático as tocava.
   *
   * Duas regras que parecem detalhe e não são:
   *  • Buff PURO — quem também restaura (Sangue de Dragão: +15 ⚔️ e cura 9999) é
   *    cura de emergência, não buff de abertura; sai por `pickPotion`, no aperto.
   *  • A MAIS FRACA primeiro, ao contrário do resto: gastar o Tônico do Berserker
   *    num pacote comum enquanto a Poção de Força mofa na mochila é desperdício —
   *    a rara tem que sobrar para quando a fraca acabar.
   */
  const pickBuffPotion = (): DungeonConsumable | null => {
    const pool = consumablesRef.current.filter(
      c => c.qty > 0 && c.revive === 0 && c.hp === 0 && c.mp === 0 && (c.atk > 0 || c.def > 0 || c.dodge > 0)
    )
    if (pool.length === 0) return null
    // Ataque encurta a luta (é o que mais reduz dano tomado); depois defesa, depois esquiva.
    const weakest = (list: DungeonConsumable[], amt: (c: DungeonConsumable) => number) =>
      list.reduce((a, b) => (amt(b) < amt(a) ? b : a))
    const byAtk = pool.filter(c => c.atk > 0)
    if (byAtk.length > 0) return weakest(byAtk, c => c.atk)
    const byDef = pool.filter(c => c.def > 0)
    if (byDef.length > 0) return weakest(byDef, c => c.def)
    return weakest(pool, c => c.dodge)
  }

  /**
   * Poção mais "justa" pro déficit: a MAIOR que restaura sem desperdiçar; se todas
   * passam do buraco, a menor disponível.
   *
   * Buff junto não desqualifica (Sangue de Dragão cura 9999 E dá +15 ⚔️): excluí-lo
   * daqui e do `pickBuffPotion` deixava o item sem NENHUM caminho automático. A
   * regra do "maior que cabe" já o guarda naturalmente para o último caso — um
   * item que cura 9999 nunca "cabe" num buraco real.
   */
  const pickPotion = (kind: 'hp' | 'mp', deficit: number, pureOnly = false): DungeonConsumable | null => {
    const amt = (c: DungeonConsumable) => (kind === 'hp' ? c.hp : c.mp)
    // `pureOnly` é do reabastecimento NA TRILHA: fora de combate o `useConsumable`
    // recusa qualquer coisa com buff ("use durante um combate"), e o piloto ficaria
    // reoferecendo o mesmo item para sempre — a caminhada travava sem nenhum aviso.
    const pool = consumablesRef.current.filter(
      c => c.qty > 0 && amt(c) > 0 && c.revive === 0 && (!pureOnly || (c.atk === 0 && c.def === 0 && c.dodge === 0))
    )
    if (pool.length === 0) return null
    const fits = pool.filter(c => amt(c) <= deficit)
    if (fits.length > 0) return fits.reduce((a, b) => (amt(b) > amt(a) ? b : a))
    return pool.reduce((a, b) => (amt(b) < amt(a) ? b : a))
  }

  // Lê o estágio da máquina de estados do combate e dispara a MESMA ação que o jogador
  // faria. Cada etapa muda o stage (ou hasRolled), então o efeito reage à próxima sem
  // disparo duplo. Pequenos atrasos mantêm as animações visíveis.
  useEffect(() => {
    if (!autoCombat || phase !== 'combat' || combatEnded || exitConfirm) return
    let cancelled = false
    const fire = (fn: () => void, ms: number) => {
      const cancel = later(() => { if (!cancelled) fn() }, ms)
      return () => { cancelled = true; cancel() }
    }

    if (stage === 'playerSelect') return fire(() => {
      const alive = packRef.current.filter(m => m.hp > 0)
      const refDmg = autoRefDamage()
      // Consumíveis automáticos (se o switch estiver ligado):
      if (autoConsumables) {
        const fx = combatFxRef.current
        // 1) Corta o dano CONTÍNUO antes de qualquer coisa: veneno e sangramento são
        // permanentes pela RUN inteira (o FX0 não é reaplicado entre lutas e só o
        // Antídoto/Bandagem os limpam). Estancar vale mais que repor HP num balde
        // furado — sem isto, uma mordida no primeiro nó drenava a run até o fim.
        if (fx.poisoned) {
          const anti = consumablesRef.current.find(c => c.cure === 'poison' && c.qty > 0)
          if (anti) { useConsumable(anti); return }
        }
        if (fx.bleeding) {
          const band = consumablesRef.current.find(c => c.cure === 'bleed' && c.qty > 0)
          if (band) { useConsumable(band); return }
        }
        // 2) Cura de emergência: o gatilho é o MAIOR entre 35% do HP máximo e a rodada
        // que o pacote ainda tem para dar — ver expectedIncomingRound. O teto de 70%
        // é o freio: num pacote que bate mais forte que a barra inteira, sem ele o
        // piloto beberia TODO turno e nunca revidaria, torrando o estoque à toa.
        const danger = Math.min(effMaxHp * 0.7, Math.max(effMaxHp * 0.35, expectedIncomingRound()))
        if (hpRef.current <= danger && hpRef.current < effMaxHp) {
          const potion = pickPotion('hp', effMaxHp - hpRef.current)
          if (potion) { useConsumable(potion); return }
        }
        // 3) Repõe MP só quando o Ataque de Classe está liberado e ainda não cabe no MP atual.
        if (unlocks.classAttack && mp < effWeaponMp && mp < character.maxMp) {
          const mPotion = pickPotion('mp', character.maxMp - mp)
          if (mPotion) { useConsumable(mPotion); return }
        }
      }
      // O combate NÃO gasta stamina (tudo custa MP); a stamina é só o orçamento diário de runs.
      const packHp = alive.reduce((sum, m) => sum + m.hp, 0)
      // 4) 💪 Poção de buff numa luta que vale a pena — mesma leitura que decide a
      // transformação logo abaixo (`packHp > refDmg * 2`): num resto de encontro que
      // cai em 1-2 golpes o buff seria jogado fora. Uma por vez, e só se não houver
      // nenhum buff ativo (não empilha nem renova por cima do que ainda está de pé).
      if (autoConsumables && packHp > refDmg * 2) {
        const fx = combatFxRef.current
        const buffActive = fx.dmgDealtTurns > 0 || fx.dmgTakenTurns > 0 || fx.evadeBuffTurns > 0
        if (!buffActive) {
          const buff = pickBuffPotion()
          if (buff) { useConsumable(buff); return }
        }
      }
      // 5) Transforma (1× por luta) — mas só se o PACOTE ainda tem luta pela frente (não
      // desperdiça a transformação num resto de encontro que cai em 1-2 golpes baratos).
      if (!transform && !transformedThisFightRef.current && transformForms.length > 0 && packHp > refDmg * 2) {
        const cfg = TRANSFORMATION_CONFIG[transformForms[0]]
        if (cfg && mp >= cfg.cost.mp) { activateTransform(transformForms[0]); return }
      }
      // 6) Transformado: usa a HABILIDADE DE DANO da forma (d20) se pagável e fora da
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
          // 6b) Dano em recarga numa luta ainda longa: aproveita o turno com o UTILITÁRIO
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
      // 7) Golpes baratos: foca o inimigo MAIS FRACO vivo do pacote (atualiza o ref de
      // forma síncrona) e ataca com o melhor golpe liberado/pagável sem desperdiçar MP.
      const weak = weakestOf(packRef.current)
      if (weak && weak.id !== monsterRef.current?.id) setActiveTarget(weak.id)
      choosePlayerAttack(autoPickAttack())
    }, 650)

    // playerRoll já rola sozinho (ver efeito acima), mesmo fora do piloto automático.

    // A fase inimiga resolve sozinha (defesa oculta) — o piloto não precisa reagir a ela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCombat, autoConsumables, exitConfirm, phase, stage, hasRolled, combatEnded, mp, stamina, transform, transformCd, transformedThisFight, pendingAbility, consumables, effMaxHp])

  // Piloto de EXPLORAÇÃO: anda na trilha, confirma loot/eventos e entra nos combates.
  // Para com segurança quando falta stamina (evita laço de avanços negados).
  useEffect(() => {
    if (!auto || phase !== 'explore' || exitConfirm) return
    if (moving || exploreRolling || walkBusy || combatIntro) return
    let cancelled = false
    const fire = (fn: () => void, ms: number) => {
      const cancel = later(() => { if (!cancelled) fn() }, ms)
      return () => { cancelled = true; cancel() }
    }

    // Poções entre nós (após combate/loot, na trilha): reabastece HP/MP antes de
    // avançar. Uma por vez; o efeito re-dispara até encher (>= 90%) ou acabarem.
    const refillPotion = (): DungeonConsumable | null => {
      if (!autoConsumables) return null
      if (hp < effMaxHp * 0.9) {
        const potion = pickPotion('hp', effMaxHp - hp, true)
        if (potion) return potion
      }
      if (mp < character.maxMp * 0.9) {
        const mPotion = pickPotion('mp', character.maxMp - mp, true)
        if (mPotion) return mPotion
      }
      return null
    }

    // 1) Fallback: ainda no covil sem combate (ex.: race) → enfrenta.
    if (atBoss) {
      return fire(() => beginEncounter(
        serverPackRef.current ??
        serverMonsterRef.current ??
        scaleMonster(dungeon.boss, dungeon, charLevel, { tier: dungeon.rooms, isMain: true, isBoss: true }, combatClass, tier)
      ), 600)
    }
    if (!startedRef.current) return
    if (!useScene && !runReady) return

    // 2) Poções no caminho entre nós, depois avança.
    const potion = refillPotion()
    if (potion) return fire(() => useConsumable(potion), 450)

    if (stamina < stepCost(tokenIdx + 1)) {
      showBanner('😮‍💨', 'Stamina insuficiente para o próximo passo — ela volta +2 a cada 15 min ocioso.', 3200)
      return
    }
    return fire(advance, 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, autoConsumables, exitConfirm, phase, moving, walkBusy, exploreRolling, combatIntro, atBoss, tokenIdx, runReady, stamina, hp, mp, consumables, sceneReady])

  /**
   * 🚶 Cena explorável: a CAMINHADA é sempre automática.
   *
   * É a premissa de design da cena (ver o cabeçalho de DungeonScene): sem
   * controle manual não dá para contornar nós e correr até o chefe, e o cursor
   * do servidor nunca sai de sincronia. Só que o passo continuava preso no
   * botão — o herói ficava perambulando na entrada esperando um clique.
   *
   * Efeito SEPARADO do piloto ⚡ de propósito: o ⚡ também luta, bebe poção,
   * coleta e refaz a run. Este aqui só ANDA — combate, achado e chefe seguem
   * sendo decisão do jogador. Enquanto o ⚡ estiver ligado este fica calado,
   * senão os dois disparariam advance() em paralelo.
   */
  const autoWalkWarnedRef = useRef(false)

  useEffect(() => {
    if (!useScene) return
    if (auto) return // o ⚡ já cobre o passo
    // `blocked` só vira tela de bloqueio LÁ EMBAIXO, depois de todos os hooks:
    // sem esta guarda uma run travada em outra aba seguiria pisando o /step.
    if (blocked || exitConfirm || showItems) return
    if (phase !== 'explore') return
    if (walkBusy || exploreRolling || combatIntro) return // walkBusy já inclui `moving`
    if (atBoss) return
    // Start otimista: basta a sessão estar EM ABERTURA — o primeiro passo anda
    // enquanto o /start viaja (ver runReadyPromiseRef).
    if (!startedRef.current) return

    if (stamina < stepCost(tokenIdx + 1)) {
      // Parada segura, e o aviso sai UMA vez (o efeito re-roda a cada dep).
      if (!autoWalkWarnedRef.current) {
        autoWalkWarnedRef.current = true
        showBanner('😮‍💨', 'Stamina insuficiente para o próximo passo — ela volta +2 a cada 15 min ocioso.', 4000)
      }
      return
    }
    autoWalkWarnedRef.current = false

    // Primeiro passo mais lento: dá tempo de ler a narração de entrada.
    return later(() => { advance() }, tokenIdx === 0 ? 1500 : 700)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useScene, auto, blocked, exitConfirm, showItems, phase, walkBusy, exploreRolling,
      combatIntro, atBoss, runReady, stamina, tokenIdx, sceneReady])

  /**
   * ⏱️ WATCHDOG DA CAMINHADA — quem resolve o nó quando a animação não corre.
   *
   * O avanço LÓGICO (finishWalkStep) estava amarrado à chegada VISUAL
   * (onReachSpot, disparado só pelo requestAnimationFrame da cena). Aba em
   * segundo plano = rAF parado = `moving` travado em true = os pilotos abortando
   * no `walkBusy`, com a stamina do nó já debitada no servidor. Era o que
   * congelava a run inteira ao trocar de aba.
   *
   * Aqui o nó é resolvido sem esperar o desenho; a cena é ressincronizada quando
   * o jogador volta (ver `warpTo`). O `stepClaimRef` garante que só um dos dois
   * caminhos consuma o /step.
   */
  useEffect(() => {
    if (!useScene || phase !== 'explore') return
    if (!moving || sceneTarget <= tokenIdx) return
    if (blocked || exitConfirm || stopRequestedRef.current) return
    const dest = sceneTarget
    const wait = hiddenRef.current ? HIDDEN_ARRIVE_MS : STUCK_ARRIVE_MS
    return later(() => {
      if (tokenIdxRef.current >= dest) return // a chegada visual ganhou a corrida
      if (hiddenRef.current) headlessResolvedRef.current = true
      finishWalkStep(dest)
    }, wait)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useScene, phase, moving, sceneTarget, tokenIdx, blocked, exitConfirm, finishWalkStep, later])

  /**
   * 🌀 Voltou para a aba: planta o herói no nó que a lógica já alcançou.
   *
   * Sem isto ele atravessaria o mapa inteiro correndo atrás do atraso — e a
   * física da cena é clampada por frame (não faz catch-up), então seria uma
   * caminhada longa e sem sentido com o mundo já resolvido.
   */
  useEffect(() => onVisible(() => {
    if (!headlessResolvedRef.current) return
    headlessResolvedRef.current = false
    warpSeqRef.current += 1
    setWarpTo({ node: tokenIdxRef.current, seq: warpSeqRef.current })
  }), [onVisible])

  // ============================================================
  // RENDER
  // ============================================================

  const ResourceBar = ({ icon, value, max, gradient }: { icon: string; value: number; max: number; gradient: string }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-xs">{icon}</span>
      <div className="w-16 h-2.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="text-[10px] text-white/80 font-mono w-11">{value}/{max}</span>
    </div>
  )

  // 🔒 Herói em uso em outra aba: tela de bloqueio (anti-duplicata de run).
  if (blocked) {
    return (
      <RunFrame dungeonId={dungeon.id} frameRef={frameRef}>
        <div className="absolute inset-0 grid place-items-center px-6">
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
              onClick={() => onExit({ ...exitPools(), stamina })}
              className="w-full py-3 rounded-lg font-black text-white text-sm transition-transform active:scale-[0.98] hover:scale-[1.02]"
              style={{ background: `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accentSoft})` }}
            >
              Voltar
            </button>
          </div>
        </div>
      </RunFrame>
    )
  }

  return (
    <RunFrame dungeonId={dungeon.id} wide={phase === 'combat'} wideExplore={useScene} frameRef={frameRef}>
      {/* Cenário temático — preenche a MOLDURA. Em combate Floresta: battle BG
          cinematográfico. Na exploração com WalkScene o mapa é a própria cena. */}
      <div className="absolute inset-0">
        <DungeonBackdrop
          theme={dungeon.id}
          imageUrl={phase === 'combat' ? (backgroundImageUrl || DUNGEON_BATTLE_BG[dungeon.id]) : undefined}
          imageOverlayOpacity={backgroundImageOverlay}
        />
      </div>

      {/* 🎥 Investida — vinheta fechando até o preto. Cobre a tela INTEIRA (não só
          a moldura) porque é debaixo dela que a moldura troca de retrato para
          arena larga; se cobrisse só a moldura, o corte apareceria nas tarjas. */}
      <AnimatePresence>
        {combatIntro && (
          <motion.div
            key="combat-intro"
            className="fixed inset-0 z-[70] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeIn' }}
            style={{
              background:
                'radial-gradient(circle at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.9) 45%, #000 75%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* ⚡ Flash de ENCONTRO — 3 piscadas tipo Pokémon, UMA vez só.
          Hoje o /step já saiu junto com o primeiro passo (ver prefetchStep), e o
          flash só aparece quando a resposta ainda não assentou na chegada. Ele
          tem duração PRÓPRIA (FLASH_MS): antes o ciclo repetia infinitamente e a
          quantidade de piscadas era a latência da rede — o que atordoava. Se a
          espera passar disso, `stepSlow` assume logo abaixo. */}
      <AnimatePresence>
        {exploreRolling && useScene && !stepSlow && !reducedMotionRef.current && (
          <motion.div
            key="encounter-flash"
            className="fixed inset-0 z-[65] pointer-events-none bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0.04, 0.55, 0.04, 0.4, 0] }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: FLASH_MS / 1000, ease: 'linear' }}
          />
        )}
      </AnimatePresence>

      {/* 🕯️ Espera CALMA — as 3 piscadas acabaram e o /step ainda não voltou
          (rede ruim ou invocação fria). Aqui a resposta é escurecer e respirar,
          nunca continuar piscando: vinheta suave + um pulso lento. */}
      <AnimatePresence>
        {exploreRolling && useScene && stepSlow && (
          <motion.div
            key="step-slow"
            className="fixed inset-0 z-[65] pointer-events-none grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{
              background:
                'radial-gradient(circle at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 70%)',
            }}
          >
            <motion.span
              className="text-xs uppercase tracking-[0.3em] font-bold"
              style={{ color: dungeon.accentSoft }}
              animate={reducedMotionRef.current ? undefined : { opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              Algo se move...
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

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

          {/* Stats do topo: só na trilha, e só se a MOLDURA for larga (não a tela —
              ver wideFrame). Em combate a arena já mostra o HP dos lutadores. */}
          {phase !== 'combat' && wideFrame && (
            <div className="flex flex-col gap-0.5">
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
                onClick={requestStop}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-colors"
                title={phase === 'combat' ? 'Abandonar a batalha e sair (mantém recompensas)' : 'Sair da masmorra (mantém recompensas)'}
              >
                🚪 {phase === 'combat' ? 'Fugir' : 'Sair'}
              </button>
            )}
          </div>
        </div>

        {/* Barras de recurso na moldura estreita — só na trilha; em combate a arena mostra o HP. */}
        {phase !== 'combat' && !wideFrame && (
          <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-3 py-1.5 bg-black/40 border-b border-white/10 relative z-20">
            <ResourceBar icon="❤️" value={hp} max={character.maxHp} gradient="from-red-600 to-rose-400" />
            <ResourceBar icon="🔮" value={mp} max={character.maxMp} gradient="from-blue-600 to-cyan-400" />
            <ResourceBar icon="⚡" value={stamina} max={character.maxStamina} gradient="from-yellow-600 to-amber-300" />
          </div>
        )}

        {/* Área de conteúdo abaixo do header (e barras mobile): WalkScene + fases */}
        <div className="relative flex-1 min-h-0 flex flex-col">
        {/* ⏳ Aviso persistente do "sair ao fim da luta" — o jogador precisa
            lembrar que a run acaba aqui enquanto a batalha segue normal. */}
        {stopAfterFight && phase !== 'summary' && (
          <div className="absolute top-1.5 inset-x-0 z-30 flex justify-center pointer-events-none px-3">
            <div className="rounded-full border border-amber-300/40 bg-black/75 px-3 py-1 text-[10px] font-bold text-amber-200 backdrop-blur-sm">
              {bagFullStop
                ? '🎒 Mochila cheia — encerrando sem gastar stamina num nó novo'
                : '⏳ Encerrando ao fim desta luta — sem gastar stamina num nó novo'}
            </div>
          </div>
        )}
        {/* ============================================================ */}
        {/* WALK SCENE (Anterra treadmill) — só na exploração; combate usa battle BG */}
        {/* ============================================================ */}
        {/* A cena fica MONTADA a run inteira e só some de vista no combate: a
            posição do herói mora num ref dentro dela, então desmontar jogaria
            o herói de volta pra entrada a cada luta (e recarregaria o tileset).

            A caixa RETRATO abaixo é o que permite o combate alargar a moldura sem
            mexer na cena: o zoom dela sai da LARGURA do canvas (ppu = w/26), então
            se o canvas acompanhasse a moldura o mapa re-enquadrava a cada ida e
            volta do combate. Com aspect-ratio próprio, o canvas tem exatamente o
            mesmo tamanho a run inteira. */}
        {useScene && sceneMap && (
          <div
            className={`absolute inset-0 z-0 flex justify-center pointer-events-none transition-opacity duration-300 ${
              phase === 'explore' ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={phase !== 'explore'}
          >
            {/* Mesma proporção/teto do RunFrame (`wideExplore`) — senão sobra
                vão entre o DungeonBackdrop (que preenche o frame inteiro) e o
                canvas aqui dentro. */}
            <div className="relative h-full" style={{ aspectRatio: '3 / 4', maxWidth: EXPLORE_WIDE_MAX_W }}>
              <DungeonScene
                map={sceneMap}
                heroSprite={character.avatar}
                race={character.race}
                heroClass={character.class}
                contents={sceneContents}
                targetNode={sceneTarget}
                warpTo={warpTo}
                visitedNodes={sceneVisited}
                /* Congela fora da exploração e no que toma a tela. A narração do
                   Mestre fecha sozinha e não deve travar o passo a cada nó.
                   `combatIntro` é a investida: a cena está visível e o herói NÃO
                   pode continuar andando por baixo do zoom. NÃO inclui
                   `exploreRolling`: isso era só pro d20 de exploração (removido) —
                   deixar pausado durante o /step travava a cena (herói e bicho
                   congelados) no tempo de rede, sem indicador nenhum na tela. Sem
                   d20 pra mascarar, o herói perambula/o bicho ronda até a resposta
                   chegar, e a câmera investe (focusNode/combatIntro) de um mundo
                   já vivo — sem o corte seco. */
                paused={
                  phase !== 'explore' ||
                  combatIntro ||
                  // 🚪 Card de saída aberto = run CONGELADA. Sem isto o herói
                  // seguia andando atrás do backdrop, chegava ao bolsão e
                  // resolvia o nó (podendo cair em combate) com o card na tela.
                  exitConfirm
                }
                cinematicZoom={encounterZoom}
                focusNode={focusNode}
                onReachSpot={handleSceneReachSpot}
                onReady={() => setSceneReady(true)}
                className="w-full h-full"
              />
            </div>
          </div>
        )}

        {useWalkScene && phase === 'explore' && (
          <div className="absolute inset-0 z-0 flex justify-center pointer-events-none">
            <div className="relative h-full" style={{ aspectRatio: '9 / 16', maxWidth: '100%' }}>
              <WalkScene
                dungeonId={dungeon.id}
                accent={dungeon.accent}
                mode={walkMode}
                nodeIndex={tokenIdx}
                pathPoints={trailPoints}
                avatar={character.avatar}
                race={character.race}
                heroClass={character.class}
                trailMarks={walkTrailMarks}
                nextIsBoss={nextIsBoss}
                onApproachComplete={handleWalkApproachComplete}
              />
            </div>
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
                    const isStamina = c.stamina > 0 && c.hp === 0 && c.mp === 0
                    const disabled =
                      (c.hp > 0 && c.mp === 0 && hpFull) ||
                      (c.mp > 0 && c.hp === 0 && mpFull) ||
                      (c.hp > 0 && c.mp > 0 && hpFull && mpFull) ||
                      (isStamina && stamina >= character.maxStamina) ||
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
                              {isStamina ? `+${c.stamina} ⚡ stamina` : ''}
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
                  A run está pausada. Tudo que você já ganhou está salvo — a stamina se restaura sozinha (+2 a cada 15 min ocioso).
                  {stopCaughtPaidStep && (
                    <span className="block mt-1 text-amber-200/90">
                      ⚡ O passo em curso já foi cobrado — como você não vai jogar esse nó, a stamina volta ao sair.
                    </span>
                  )}
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

                {/* ⏳ Saída em combate sem desperdício: mesma escolha que a
                    Coleta oferece ("aguardar último ciclo"). Fugir agora larga o
                    espólio da luta; esperar o fim dela não custa nó nenhum. */}
                {phase === 'combat' && !stopAfterFight && (
                  <button
                    onClick={stopAfterThisFight}
                    className="w-full py-3 mb-2 rounded-lg font-bold text-white text-sm bg-amber-600/85 hover:bg-amber-500 border border-amber-300/40 transition-colors active:scale-[0.98]"
                  >
                    ⏳ Sair ao fim da luta
                  </button>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={cancelStop}
                    className="flex-1 py-3 rounded-lg font-bold text-white text-sm bg-white/10 hover:bg-white/20 border border-white/20 transition-colors active:scale-[0.98]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { setExitConfirm(false); finishRun(false) }}
                    className="flex-1 py-3 rounded-lg font-black text-white text-sm transition-transform active:scale-[0.98] hover:scale-[1.02]"
                    style={{ background: 'linear-gradient(90deg, #e94560, #b91c1c)', boxShadow: '0 0 20px rgba(233,69,96,0.4)' }}
                  >
                    🚪 {phase === 'combat' ? 'Fugir agora' : 'Sair'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- ⏳ Saindo: o /finish ainda está no ar ----------
            O crédito da run inteira é UMA transação (orçamento de 20s no
            servidor) e ainda é reenviada com backoff. Sem este card o clique em
            "Voltar ao mapa" não mudava NADA na tela por segundos e parecia
            travado. Fica acima do card de saída (z-[60]) e do flash de encontro
            (z-[65]), e captura o ponteiro de propósito: clicar de novo não
            adianta — a entrega já está em curso. */}
        <AnimatePresence>
          {showLeaving && (
            <motion.div
              key="leaving"
              className="absolute inset-0 z-[70] grid place-items-center px-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
              <div
                className="relative w-full max-w-xs rounded-2xl p-6 text-center"
                style={{
                  background: 'linear-gradient(180deg, rgba(30,30,63,0.96), rgba(15,15,35,0.98))',
                  border: `1px solid ${dungeon.accentSoft}`,
                  boxShadow: `0 24px 60px -12px ${dungeon.accentSoft}`,
                }}
              >
                <motion.div
                  className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-white/10"
                  style={{ borderTopColor: dungeon.accent }}
                  animate={reducedMotionRef.current ? undefined : { rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <h3 className="text-base font-black text-white mb-1">
                  {leaving === 'rerun' ? 'Preparando a próxima run...' : 'Salvando o espólio da run...'}
                </h3>
                <p className="text-[11px] leading-snug text-textsec">
                  Creditando ouro, XP e itens no seu herói.
                </p>
                {leavingSlow && (
                  <p className="mt-2 text-[11px] leading-snug text-amber-200/90">
                    Está demorando mais que o normal — não feche a aba, nada foi perdido.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================================ */}
        {/* FASE: EXPLORAÇÃO */}
        {/* ============================================================ */}
        {phase === 'explore' && (
          <div className="flex-1 flex flex-col min-h-0 relative z-10">
            {/* ---------- MAPA: cena ou WalkScene, ambas montadas ao fundo ---------- */}
            <main className="relative flex-1 min-h-0">
              <div className="absolute inset-0 mx-auto max-w-md pointer-events-none">
                <div className="relative h-full pointer-events-auto">
                {/* Números e ícones flutuantes (ganhos/perdas, drop de destaque).
                    NO CENTRO, e acima da narração de propósito: no topo eles
                    nasciam no mesmo `top-3` da NarrationDialog, que tem z maior —
                    o loot aparecia bem na hora em que o Mestre narra e ficava
                    escondido atrás do card. O centro é livre nesta fase (o
                    DiceOverlay só ocupa durante o boot da cena). */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none z-[46]">
                  {floats.map(f => f.item ? (
                    <div
                      key={f.id}
                      className={`float-num w-14 h-14 rounded-xl bg-black/40 border-2 grid place-items-center ${
                        (LOOT_RARITY_RING[f.item.rarity ?? 'RARE'] ?? LOOT_RARITY_RING.RARE).ring
                      }`}
                      style={{ boxShadow: `0 0 22px ${(LOOT_RARITY_RING[f.item.rarity ?? 'RARE'] ?? LOOT_RARITY_RING.RARE).glow}` }}
                    >
                      <ItemThumb name={f.item.name} emoji={f.item.emoji} className="text-3xl" />
                    </div>
                  ) : (
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
              {/* Inclui o boot da cena: o d20 gira como loading até os assets
                  carregarem (useScene && !sceneReady) — sem result, só girando. */}
              {/* Sem d20 de exploração: o overlay só cobre o carregamento inicial da cena. */}
              <DiceOverlay rolling={useScene && !sceneReady} result={null} />

              {/* dialog: o Mestre narra — abre junto da rolagem / dos beats da história */}
              <NarrationDialog text={narration} open={narrationOpen} onClose={() => setNarrationOpen(false)} />

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

                  {/* Barra: sair, poções ON/OFF, cinto, status do avanço (piloto sempre ligado) */}
                  <div className="mx-auto max-w-md flex items-center gap-1.5">
                    <button
                      onClick={requestStop}
                      /* Sem `disabled` de propósito: parar a run é justamente o
                         que se quer PODER fazer no meio da caminhada. */
                      title="Sair da masmorra (mantém recompensas)"
                      className="shrink-0 w-11 h-11 grid place-items-center rounded-xl border border-white/10 bg-black/50 backdrop-blur-xl text-textsec hover:text-white hover:border-white/25 transition-colors active:scale-95"
                    >
                      🚪
                    </button>
                    <button
                      onClick={() => setAutoConsumables(v => !v)}
                      title={autoConsumables ? 'Poções automáticas ON — clique para desligar' : 'Poções automáticas OFF — clique para ligar'}
                      className={`shrink-0 w-11 h-11 grid place-items-center rounded-xl border transition-colors active:scale-95 relative ${
                        autoConsumables
                          ? 'bg-emerald-600/85 border-emerald-300/60 text-white'
                          : 'bg-black/50 border-white/10 text-white/50 hover:text-white'
                      }`}
                    >
                      💊
                      <span className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ${autoConsumables ? 'bg-emerald-200' : 'bg-white/25'}`} />
                    </button>
                    <button
                      onClick={() => setStopWhenFull(v => !v)}
                      title={stopWhenFull
                        ? 'Encerrar a run quando a mochila encher — clique para desligar'
                        : 'A run segue mesmo de mochila cheia (o espólio se perde) — clique para ligar o freio'}
                      className={`shrink-0 w-11 h-11 grid place-items-center rounded-xl border transition-colors active:scale-95 relative ${
                        stopWhenFull
                          ? 'bg-amber-600/85 border-amber-300/60 text-white'
                          : 'bg-black/50 border-white/10 text-white/50 hover:text-white'
                      }`}
                    >
                      🎒
                      <span className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ${stopWhenFull ? 'bg-amber-200' : 'bg-white/25'}`} />
                    </button>
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
                      onClick={advance}
                      disabled={
                        exploreRolling || walkBusy || atBoss ||
                        (useScene && stamina < stepCost(tokenIdx + 1))
                      }
                      className="flex-1 h-11 rounded-xl font-black text-sm sm:text-base text-white inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] hover:scale-[1.01] disabled:opacity-50 disabled:cursor-wait disabled:hover:scale-100"
                      style={{
                        background: nextMainNode
                            ? 'linear-gradient(90deg, #f39c12, #b45309)'
                            : `linear-gradient(90deg, ${dungeon.accent}, ${dungeon.accent}aa)`,
                        boxShadow: nextMainNode ? '0 0 26px rgba(243,156,18,0.45)' : `0 0 26px ${dungeon.accentSoft}`,
                      }}
                    >
                      {/* Na cena a caminhada é automática: o botão vira "adiantar
                          o passo" em vez de ser o único jeito de andar. */}
                      {exploreRolling || walkBusy
                        ? useScene
                          ? '🚶 Explorando...'
                          : walkMode === 'scroll'
                            ? '🌲 Vasculhando...'
                            : walkMode === 'approach'
                              ? '👀 Aproximando...'
                              : '...'
                        : useScene && stamina < stepCost(tokenIdx + 1)
                            ? '😮‍💨 Sem stamina'
                            : nextIsBoss
                              ? '👑 Aproximar-se do covil'
                              : nextMainNode
                                ? `⚔️ Sala ${trailPoints[tokenIdx + 1]?.tier}`
                                : useScene
                                  ? '⏩ Avançar agora'
                                  : 'Seguir a trilha'}
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
        {/* FASE: COMBATE — shell compartilhado com PvP (CombatShell) */}
        {/* ============================================================ */}
        {phase === 'combat' && monster && (() => {
          const formSpecials = transform
            ? getFormSpecials(transform.type)
                .filter(def => {
                  if (def.id === 'stunning_blow') return unlocks.stunningBlow
                  if (def.kind === 'util') return unlocks.formBuff
                  return true
                })
                .map(def => applyRankPatch(def, unlocks, transform.type))
            : []
          const attackOptions: CombatAttackOption[] = [
            {
              key: 'basic',
              label: ATTACKS.basic.label,
              locked: mp < ATTACKS.basic.mp,
              sub: `d${PVE_DIE.basic} • grátis`,
              onPick: () => choosePlayerAttack('basic'),
            },
            ...(unlocks.classAttack
              ? [{
                  key: 'weapon',
                  label: classAtkName,
                  locked: mp < effWeaponMp,
                  sub: `d${effWeaponDie} • ${effWeaponMp} MP`,
                  onPick: () => choosePlayerAttack('weapon'),
                }]
              : []),
            ...formSpecials.map(def => {
              const cd = combatFx.cd[def.id] || 0
              const mpCost = def.cost.mp || 0
              return {
                key: def.id,
                label: specialName(def),
                locked: cd > 0 || mp < mpCost,
                sub: cd > 0 ? `recarga ${cd}` : `${def.kind === 'dmg' ? `d${def.die ?? 20}·` : ''}${mpCost}MP`,
                onPick: () => useAbility(def),
              }
            }),
          ]
          // 🃏 A MESMA lista, vestida de carta. Nada de novo é decidido aqui: o que é
          // jogável, o custo e o que acontece ao jogar continuam vindo do bloco acima —
          // a carta só acrescenta emoji, dado e o tom da moldura.
          const hand: CombatCard[] | undefined = cardsMode
            ? [
                {
                  key: 'basic',
                  name: ATTACKS.basic.label,
                  emoji: ATTACKS.basic.icon,
                  tone: 'basic',
                  die: PVE_DIE.basic,
                  costLabel: 'grátis',
                  effectLine: 'Ataque livre — não gasta MP.',
                  locked: mp < ATTACKS.basic.mp,
                  onPlay: () => choosePlayerAttack('basic'),
                },
                ...(unlocks.classAttack
                  ? [{
                      key: 'weapon',
                      name: classAtkName,
                      emoji: ATTACKS.weapon.icon,
                      tone: 'class' as const,
                      die: effWeaponDie,
                      costLabel: `${effWeaponMp}🔵`,
                      effectLine: 'O ataque de assinatura da sua classe.',
                      locked: mp < effWeaponMp,
                      lockReason: mp < effWeaponMp ? 'MP' : undefined,
                      onPlay: () => choosePlayerAttack('weapon'),
                    }]
                  : []),
                ...formSpecials.map(def => {
                  const cd = combatFx.cd[def.id] || 0
                  const mpCost = def.cost.mp || 0
                  const noMp = mp < mpCost
                  const { emoji, label } = splitCardEmoji(specialName(def), def.kind === 'util' ? '✨' : '💥')
                  return {
                    key: def.id,
                    name: label,
                    emoji,
                    tone: (def.kind === 'util' ? 'buff' : 'special') as CombatCard['tone'],
                    die: def.kind === 'util' ? undefined : def.die ?? 20,
                    costLabel: `${mpCost}🔵`,
                    effectLine: def.desc,
                    locked: cd > 0 || noMp,
                    lockReason: cd > 0 ? `recarga ${cd}` : noMp ? 'MP' : undefined,
                    onPlay: () => useAbility(def),
                  }
                }),
              ]
            : undefined
          const singleForm = transformForms.length === 1 ? TRANSFORMATION_CONFIG[transformForms[0]] : null
          const transformDisabled = transformedThisFight || (!!singleForm && mp < singleForm.cost.mp)

          return (
            <CombatShell
              logLines={log}
              showActions={!combatEnded && stage === 'playerSelect'}
              attackOptions={attackOptions}
              hand={hand}
              onOpenItems={() => { loadConsumables(); setShowItems(true) }}
              transform={
                transformForms.length > 0
                  ? {
                      available: true,
                      activeLabel: transform ? activeTransformCfg?.name : null,
                      activeTurnsHint: transform ? `${transform.turns} turno(s)` : undefined,
                      used: transformedThisFight && !transform,
                      disabled: transformDisabled,
                      title: transformedThisFight
                        ? 'Transformação já usada nesta luta (1× por luta)'
                        : singleForm
                          ? `${singleForm.cost.mp} MP • ${singleForm.duration} turnos`
                          : `${transformForms.length} formas disponíveis`,
                      buttonLabel: transformedThisFight ? 'Transf. usada' : 'Transformar',
                      costHint: !transformedThisFight
                        ? (singleForm ? `${singleForm.cost.mp}MP` : `${transformForms.length} formas`)
                        : undefined,
                      onClick: () => {
                        if (transformedThisFight) return
                        if (singleForm) activateTransform(transformForms[0])
                      },
                      forms: transformForms.length > 1
                        ? transformForms.map(t => {
                            const cfg = TRANSFORMATION_CONFIG[t]
                            return {
                              key: t,
                              label: cfg.name,
                              sub: `${cfg.cost.mp}🔮 • ${cfg.duration} turnos`,
                              locked: mp < cfg.cost.mp,
                              onPick: () => activateTransform(t),
                            }
                          })
                        : undefined,
                    }
                  : null
              }
              extraActions={
                !monster?.isBoss ? (
                  <button
                    type="button"
                    onClick={handleRetreat}
                    title="Recuar em segurança — você mantém o XP e o espólio dos inimigos já derrotados."
                    className="px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap transition-all shadow-lg bg-gradient-to-r from-slate-600 to-slate-500 hover:scale-105"
                  >
                    Recuar
                  </button>
                ) : null
              }
              toolbar={
                !combatEnded ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setAutoCombat(v => !v)}
                      title={autoCombat ? 'Desligar o piloto do combate — escolha alvo e ataque na mão' : 'Ligar o piloto do combate — joga os turnos por você'}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black border transition-colors ${
                        autoCombat
                          ? 'bg-blue-600/90 border-blue-300/60 text-white shadow-lg shadow-blue-900/50'
                          : 'bg-white/5 border-white/15 text-white/60 hover:text-white hover:border-white/30'
                      }`}
                    >
                      {autoCombat ? '⚡ Auto ON' : '⚡ Auto OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoConsumables(v => !v)}
                      title={autoConsumables ? 'Poções automáticas ON — clique para desligar' : 'Poções automáticas OFF — clique para ligar'}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black border transition-colors ${
                        autoConsumables
                          ? 'bg-emerald-600/85 border-emerald-300/60 text-white'
                          : 'bg-white/5 border-white/15 text-white/50 hover:text-white'
                      }`}
                    >
                      💊 {autoConsumables ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStopWhenFull(v => !v)}
                      title={stopWhenFull
                        ? 'Encerrar a run quando a mochila encher — clique para desligar'
                        : 'A run segue mesmo de mochila cheia (o espólio se perde) — clique para ligar o freio'}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black border transition-colors ${
                        stopWhenFull
                          ? 'bg-amber-600/85 border-amber-300/60 text-white'
                          : 'bg-white/5 border-white/15 text-white/50 hover:text-white'
                      }`}
                    >
                      🎒 {stopWhenFull ? 'ON' : 'OFF'}
                    </button>
                  </>
                ) : null
              }
              statusContent={
                combatEnded ? (
                  <div className="text-white/70 text-sm font-bold animate-pulse">
                    {winnerId === character.id ? '🏆 Vitória! Coletando recompensas...' : '💀 Derrotado...'}
                  </div>
                ) : stage === 'initiative' || stage === 'playerRoll' ? (
                  <div className="text-white/60 text-xs sm:text-sm font-bold">
                    🎲 {hasRolled ? 'Rolando...' : 'Clique no dado na arena para rolar!'}
                  </div>
                ) : (
                  <div className="text-white/50 text-xs sm:text-sm font-bold animate-pulse">⚔️ Resolvendo ação...</div>
                )
              }
              aboveLog={
                pack.length > 1 && !combatEnded ? (
                  <div className="flex-shrink-0 bg-black/55 border-t border-white/5 px-3 sm:px-6 py-1.5">
                    <div className="mx-auto max-w-2xl flex items-center justify-center gap-2 flex-wrap">
                      <span className="text-[10px] text-white/45 font-bold mr-0.5">Alvo:</span>
                      {pack.map(mm => {
                        const active = mm.id === monster?.id
                        const canTarget = stage === 'playerSelect' && !active
                        return (
                          <button
                            key={mm.id}
                            type="button"
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
                            <span className="text-[11px] font-bold text-white/80 leading-none">
                              {active ? '🎯 ' : ''}{mm.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null
              }
            >
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
                dicePanel={dicePanel}
                fighterDice={diceResults}
                backdrop={null}
              />
            </CombatShell>
          )
        })()}

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

              {autoFarm && canRerun && (
                <div className="text-emerald-300/90 text-[11px] font-bold mb-3 animate-pulse">
                  🤖 Farm visual: refazendo a run (mantenha a aba aberta)…
                </div>
              )}
              {savingPill}
              {farmToggle}
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {canRerun && (
                  <button
                    onClick={restartRun}
                    disabled={!!leaving}
                    className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 shadow-lg transition-all hover:scale-105 disabled:opacity-60 disabled:cursor-wait disabled:hover:scale-100"
                  >
                    🔁 Nova run
                  </button>
                )}
                <button
                  onClick={() => exitRun()}
                  disabled={!!leaving}
                  className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-600 hover:to-teal-500 shadow-lg transition-all hover:scale-105 disabled:opacity-60 disabled:cursor-wait disabled:hover:scale-100"
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
                Todo o XP, ouro e itens ganhos ficam guardados. Mas você sai daqui ferido:
                {charLevel > FREE_RESTORE_MAX_LEVEL
                  ? ' a Alquimista restaura vida e mana por um punhado de ouro — ou use suas poções.'
                  : ` a Alquimista restaura vida e mana de graça até o nível ${FREE_RESTORE_MAX_LEVEL}.`}
                {' '}A stamina se restaura sozinha (+2 a cada 15 min, após 15 min sem gastar).
              </p>
              <div className="text-white/70 text-xs mb-5">
                💰 {totals.gold} ouro • ⭐ {totals.xp} XP • 📦 {totals.items.length} itens — tudo salvo
              </div>
              {autoFarm && canRerun && (
                <div className="text-emerald-300/90 text-[11px] font-bold mb-3 animate-pulse">
                  🤖 Farm visual: refazendo a run (mantenha a aba aberta)…
                </div>
              )}
              {savingPill}
              {farmToggle}
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {canRerun && (
                  <button
                    onClick={restartRun}
                    disabled={!!leaving}
                    className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-600 hover:to-teal-500 shadow-lg transition-all hover:scale-105 disabled:opacity-60 disabled:cursor-wait disabled:hover:scale-100"
                  >
                    🔁 Refazer a run
                  </button>
                )}
                <button
                  onClick={() => exitRun()}
                  disabled={!!leaving}
                  className="px-8 py-3 rounded-xl font-black text-white text-sm bg-gradient-to-r from-stone-700 to-stone-600 hover:from-stone-600 hover:to-stone-500 shadow-lg transition-all hover:scale-105 disabled:opacity-60 disabled:cursor-wait disabled:hover:scale-100"
                >
                  🏠 Voltar ao mapa
                </button>
              </div>
            </motion.div>
          </div>
        )}
        </div>
      </motion.div>
    </RunFrame>
  )
}
