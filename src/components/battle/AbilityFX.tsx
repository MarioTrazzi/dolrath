'use client'

/**
 * 🎬 Efeitos visuais POR HABILIDADE na arena (PvE + PvP).
 *
 * Dois tipos de overlay, sempre `absolute inset-0` sobre o card do lutador:
 *   • ImpactFX  — golpe ACERTANDO o defensor (Bola de Fogo = projétil + explosão,
 *                 Golpe Triplo = 3 impactos rápidos, Sopro de Fogo = parede de chamas...);
 *   • AuraFX    — efeito no PRÓPRIO card (buffs de forma, cura, veneno/sangramento/stun,
 *                 transformação).
 * Há ainda DodgeFX (esquiva) e CritFX (crítico), aplicados por cima do impacto.
 *
 * `resolveActionFx` traduz o `action` do BattleEvent (id da habilidade ou basic/weapon/
 * special) + a classe do atacante no efeito certo. Classe não reconhecida = MONSTRO
 * (garras). O PvP manda o id da habilidade direto do servidor; o PvE manda `def.id`.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { normalizeCombatClass } from '@/lib/combatModel'

export type ImpactKind =
  | 'punch' | 'triple' | 'fireball' | 'stealth' | 'charge'
  | 'firebreath' | 'bite' | 'spiral' | 'cosmic' | 'nova'
  | 'claw' | 'clawStrong' | 'generic'

export type AuraKind =
  | 'shield' | 'ironskin' | 'fury' | 'wind' | 'heal' | 'focus'
  | 'poison' | 'bleed' | 'stun' | 'transform'

/** Duração de cada impacto (ms) — o BattleScene desmonta o overlay depois disso. */
export const IMPACT_MS: Record<ImpactKind, number> = {
  punch: 550, triple: 850, fireball: 950, stealth: 750, charge: 850,
  firebreath: 1100, bite: 950, spiral: 950, cosmic: 1050, nova: 950,
  claw: 650, clawStrong: 850, generic: 450,
}

export const AURA_MS: Record<AuraKind, number> = {
  shield: 1300, ironskin: 1300, fury: 1300, wind: 1100, heal: 1300,
  focus: 1200, poison: 1500, bleed: 1500, stun: 1500, transform: 1500,
}

// Habilidades de DANO das formas → impacto próprio.
const SPECIAL_IMPACT: Record<string, ImpactKind> = {
  dragon_breath: 'firebreath',
  bite_bleeding: 'bite',
  unstoppable_charge: 'charge',
  ascending_spiral: 'spiral',
  cosmo_burst: 'cosmic',
  super_nova: 'nova',
}

// Habilidades de BUFF das formas → aura no conjurador.
const BUFF_AURA: Record<string, AuraKind> = {
  dragon_scales: 'shield',
  bear_guard: 'ironskin',
  wild_fury: 'fury',
  eagle_swift: 'wind',
  meditation: 'heal',
  hyperfocus: 'focus',
}

// Ataque de Classe (weapon, d8) → identidade visual da classe.
const CLASS_IMPACT: Record<string, ImpactKind> = {
  warrior: 'charge',   // Investida Pesada
  rogue: 'stealth',    // Ataque Furtivo
  mage: 'fireball',    // Bola de Fogo
  monk: 'triple',      // Golpe Triplo
}

export type ActionFx = { impact: ImpactKind } | { aura: AuraKind }

/**
 * Resolve o efeito visual de um `action` de BattleEvent. `attackerClass` decide o
 * Ataque de Classe; classe não reconhecida (Monstro/Boss) vira garras.
 */
export function resolveActionFx(action: string | undefined, attackerClass: string | null | undefined): ActionFx {
  const a = String(action || '')
  if (BUFF_AURA[a]) return { aura: BUFF_AURA[a] }
  if (SPECIAL_IMPACT[a]) return { impact: SPECIAL_IMPACT[a] }

  const cls = normalizeCombatClass(attackerClass)
  const isMonster = !cls
  // Aliases do PvP antigo (light/heavy/special_attack) + modelo enxuto (basic/weapon/special)
  if (a === 'basic' || a === 'light_attack') return { impact: isMonster ? 'claw' : 'punch' }
  if (a === 'weapon' || a === 'heavy_attack') return { impact: isMonster ? 'claw' : (CLASS_IMPACT[cls!] || 'generic') }
  if (a === 'special' || a === 'special_attack') return { impact: isMonster ? 'clawStrong' : 'cosmic' }
  return { impact: 'generic' }
}

// ============================================================
// Peças reutilizáveis
// ============================================================

/** Anel de choque expandindo a partir do centro. */
function Ring({ color, delay = 0, duration = 0.5, from = 0.2, to = 1.7, border = 4 }: {
  color: string; delay?: number; duration?: number; from?: number; to?: number; border?: number
}) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{ width: 90, height: 90, border: `${border}px solid ${color}`, boxShadow: `0 0 18px ${color}` }}
      initial={{ scale: from, opacity: 0.9 }}
      animate={{ scale: to, opacity: 0 }}
      transition={{ delay, duration, ease: 'easeOut' }}
    />
  )
}

/** Clarão que toma o card inteiro (flash de crítico/nova). */
function Flash({ color, delay = 0, duration = 0.4, peak = 0.75 }: { color: string; delay?: number; duration?: number; peak?: number }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-2xl"
      style={{ background: color }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, peak, 0] }}
      transition={{ delay, duration, times: [0, 0.3, 1] }}
    />
  )
}

/** Risco de corte atravessando o card. */
function Slash({ color, angle, delay = 0, thickness = 3, distance = 90 }: {
  color: string; angle: number; delay?: number; thickness?: number; distance?: number
}) {
  return (
    <motion.div
      className="absolute"
      style={{ rotate: angle, width: '130%', height: thickness, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, boxShadow: `0 0 8px ${color}` }}
      initial={{ x: -distance, opacity: 0 }}
      animate={{ x: distance, opacity: [0, 1, 1, 0] }}
      transition={{ delay, duration: 0.28, ease: 'easeIn' }}
    />
  )
}

/** Emoji-partícula com trajetória própria. */
function Particle({ children, x = 0, y = 0, toX = 0, toY = 0, delay = 0, duration = 0.7, size = 'text-2xl', spin = 0 }: {
  children: React.ReactNode; x?: number; y?: number; toX?: number; toY?: number
  delay?: number; duration?: number; size?: string; spin?: number
}) {
  return (
    <motion.span
      className={`absolute ${size} drop-shadow-[0_0_8px_rgba(0,0,0,0.6)]`}
      initial={{ x, y, scale: 0.4, opacity: 0, rotate: 0 }}
      animate={{ x: toX || x, y: toY || y, scale: [0.4, 1.15, 1], opacity: [0, 1, 0], rotate: spin }}
      transition={{ delay, duration, ease: 'easeOut' }}
    >
      {children}
    </motion.span>
  )
}

/** Impacto pontual (emoji que estoura e some). */
function Pop({ children, x = 0, y = 0, delay = 0, size = 'text-4xl', duration = 0.4 }: {
  children: React.ReactNode; x?: number; y?: number; delay?: number; size?: string; duration?: number
}) {
  return (
    <motion.span
      className={`absolute ${size}`}
      style={{ filter: 'drop-shadow(0 0 10px rgba(255,180,0,0.9))' }}
      initial={{ x, y, scale: 0, opacity: 0 }}
      animate={{ x, y, scale: [0, 1.35, 1], opacity: [0, 1, 0] }}
      transition={{ delay, duration, ease: 'easeOut' }}
    >
      {children}
    </motion.span>
  )
}

const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
    {children}
  </div>
)

// ============================================================
// Impactos (no card do DEFENSOR)
// ============================================================

export function ImpactFX({ kind, side }: { kind: ImpactKind; side: 'left' | 'right' }) {
  // Direção de onde o golpe VEM: quem apanha à direita é atingido vindo da esquerda.
  const from = side === 'right' ? -1 : 1

  switch (kind) {
    case 'punch': // 👊 Golpe básico: soco único + onda curta
      return (
        <Overlay>
          <Ring color="rgba(255,255,255,0.7)" duration={0.4} to={1.3} />
          <Pop size="text-4xl">👊</Pop>
        </Overlay>
      )

    case 'triple': // 👊👊👊 Golpe Triplo do monge: 3 impactos bem rápidos em pontos diferentes
      return (
        <Overlay>
          <Pop x={-22} y={-16} delay={0} size="text-3xl" duration={0.32}>💥</Pop>
          <Pop x={18} y={4} delay={0.14} size="text-3xl" duration={0.32}>💥</Pop>
          <Pop x={-4} y={22} delay={0.28} size="text-4xl" duration={0.36}>💥</Pop>
          <Ring color="rgba(255,210,90,0.8)" delay={0.3} duration={0.45} />
          <Particle x={20} y={-20} toX={44} toY={-38} delay={0.3} size="text-sm">✦</Particle>
          <Particle x={-24} y={10} toX={-46} toY={26} delay={0.32} size="text-sm">✦</Particle>
        </Overlay>
      )

    case 'fireball': { // 🔥 Bola de Fogo: projétil voando até o alvo + explosão
      return (
        <Overlay>
          <motion.div
            className="absolute w-9 h-9 rounded-full flex items-center justify-center text-xl"
            style={{ background: 'radial-gradient(circle, #ffd54a 10%, #ff7a1a 55%, rgba(200,30,0,0) 75%)', boxShadow: '0 0 22px #ff7a1a' }}
            initial={{ x: from * 130, y: -14, scale: 0.6, opacity: 0 }}
            animate={{ x: 0, y: 0, scale: 1, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.3, ease: 'easeIn' }}
          >
            🔥
          </motion.div>
          <Flash color="radial-gradient(circle, rgba(255,140,30,0.55), transparent 70%)" delay={0.28} duration={0.5} peak={1} />
          <Ring color="rgba(255,130,20,0.85)" delay={0.28} duration={0.5} />
          <Pop delay={0.28} size="text-5xl">💥</Pop>
          <Particle x={0} y={0} toX={-34} toY={-30} delay={0.3} duration={0.55}>🔥</Particle>
          <Particle x={0} y={0} toX={36} toY={-22} delay={0.32} duration={0.55}>🔥</Particle>
          <Particle x={0} y={0} toX={8} toY={-44} delay={0.34} duration={0.55} size="text-lg">🔥</Particle>
        </Overlay>
      )
    }

    case 'firebreath': // 🐉 Sopro de Fogo: parede de chamas varrendo o card + brasas
      return (
        <Overlay>
          <Flash color="linear-gradient(0deg, rgba(255,100,10,0.5), rgba(255,190,40,0.25))" duration={1.0} peak={1} />
          {[0, 1, 2, 3, 4].map(i => (
            <Particle
              key={i}
              x={-36 + i * 18} y={46} toX={-36 + i * 18 + (i % 2 ? 8 : -8)} toY={-40 - (i % 3) * 12}
              delay={0.06 * i} duration={0.75} size={i === 2 ? 'text-4xl' : 'text-3xl'}
            >
              🔥
            </Particle>
          ))}
          {[0, 1, 2].map(i => (
            <motion.span
              key={`ember-${i}`}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{ background: '#ffb020', boxShadow: '0 0 6px #ff8000' }}
              initial={{ x: -20 + i * 22, y: 40, opacity: 0 }}
              animate={{ y: -55, opacity: [0, 1, 0] }}
              transition={{ delay: 0.25 + i * 0.12, duration: 0.7, ease: 'easeOut' }}
            />
          ))}
        </Overlay>
      )

    case 'stealth': // 🗡️ Ataque Furtivo: sombra rápida + 2 cortes cruzados
      return (
        <Overlay>
          <Flash color="rgba(30,20,60,0.55)" duration={0.55} peak={1} />
          <Slash color="#e8e8ff" angle={-35} delay={0.08} />
          <Slash color="#c0c0ff" angle={30} delay={0.24} />
          <Pop x={10} y={-6} delay={0.3} size="text-3xl" duration={0.35}>🗡️</Pop>
        </Overlay>
      )

    case 'charge': // 💥 Investida (Pesada/Imparável): impacto bruto + poeira + onda de choque
      return (
        <Overlay>
          <Ring color="rgba(255,255,255,0.85)" duration={0.55} to={2} border={5} />
          <Ring color="rgba(255,170,60,0.7)" delay={0.1} duration={0.55} to={1.6} />
          <Pop size="text-5xl">💥</Pop>
          <Particle x={-28} y={42} toX={-52} toY={34} duration={0.6} size="text-2xl">💨</Particle>
          <Particle x={28} y={42} toX={52} toY={34} delay={0.06} duration={0.6} size="text-2xl">💨</Particle>
        </Overlay>
      )

    case 'bite': // 🩸 Mordida Sangrenta: cortes vermelhos + sangue escorrendo
      return (
        <Overlay>
          <Slash color="#ff3040" angle={-28} thickness={4} />
          <Slash color="#d01030" angle={-16} delay={0.12} thickness={4} />
          <Pop y={-8} delay={0.1} size="text-4xl" duration={0.4}>🐺</Pop>
          {[0, 1, 2].map(i => (
            <Particle key={i} x={-16 + i * 16} y={-4} toX={-16 + i * 16} toY={42} delay={0.25 + i * 0.09} duration={0.6} size="text-lg">
              🩸
            </Particle>
          ))}
        </Overlay>
      )

    case 'spiral': // 🌀 Espiral Ascendente: vórtice girando + rajadas subindo
      return (
        <Overlay>
          <motion.span
            className="absolute text-6xl"
            style={{ filter: 'drop-shadow(0 0 14px rgba(120,200,255,0.9))' }}
            initial={{ scale: 0.3, rotate: 0, opacity: 0, y: 30 }}
            animate={{ scale: [0.3, 1.3, 1.1], rotate: 480, opacity: [0, 1, 0], y: -25 }}
            transition={{ duration: 0.85, ease: 'easeOut' }}
          >
            🌀
          </motion.span>
          <Ring color="rgba(140,210,255,0.8)" delay={0.15} duration={0.6} />
          <Particle x={22} y={20} toX={34} toY={-38} delay={0.2} duration={0.6} size="text-lg" spin={200}>🪶</Particle>
          <Particle x={-24} y={16} toX={-36} toY={-30} delay={0.3} duration={0.6} size="text-lg" spin={-160}>🪶</Particle>
        </Overlay>
      )

    case 'cosmic': // 🌌 Explosão de Cosmo: estrelas convergindo e estourando
      return (
        <Overlay>
          <Flash color="radial-gradient(circle, rgba(90,60,200,0.5), transparent 70%)" duration={0.9} peak={1} />
          {[[-40, -30], [42, -24], [-34, 34], [38, 30]].map(([px, py], i) => (
            <Particle key={i} x={px} y={py} toX={0} toY={0} delay={0.05 * i} duration={0.35} size="text-base">✨</Particle>
          ))}
          <Pop delay={0.4} size="text-5xl" duration={0.5}>🌌</Pop>
          <Ring color="rgba(170,120,255,0.9)" delay={0.42} duration={0.55} to={1.9} />
        </Overlay>
      )

    case 'nova': // 💥 Super Nova: clarão dourado total + anéis de luz
      return (
        <Overlay>
          <Flash color="rgba(255,250,220,0.95)" duration={0.5} peak={1} />
          <Ring color="rgba(255,220,90,0.95)" delay={0.12} duration={0.6} to={2.2} border={6} />
          <Ring color="rgba(255,255,255,0.9)" delay={0.22} duration={0.6} to={1.7} />
          <Pop delay={0.15} size="text-5xl">💥</Pop>
          <Particle x={0} y={0} toX={-40} toY={-36} delay={0.25} size="text-lg">✨</Particle>
          <Particle x={0} y={0} toX={42} toY={-30} delay={0.28} size="text-lg">✨</Particle>
        </Overlay>
      )

    case 'claw': // 🐾 Garra de monstro: 3 riscos paralelos
      return (
        <Overlay>
          <Slash color="#ff5050" angle={-40} thickness={3} distance={70 * from} />
          <Slash color="#ff3030" angle={-40} delay={0.07} thickness={3} distance={70 * from} />
          <Slash color="#d02020" angle={-40} delay={0.14} thickness={3} distance={70 * from} />
        </Overlay>
      )

    case 'clawStrong': // 😈 Golpe especial de monstro/boss: garras + eco sombrio
      return (
        <Overlay>
          <Flash color="rgba(120,20,60,0.45)" duration={0.6} peak={1} />
          <Slash color="#ff4060" angle={-38} thickness={5} distance={80 * from} />
          <Slash color="#ff2040" angle={-24} delay={0.1} thickness={5} distance={80 * from} />
          <Ring color="rgba(255,60,90,0.8)" delay={0.2} duration={0.5} />
          <Pop delay={0.18} size="text-4xl">💢</Pop>
        </Overlay>
      )

    case 'generic':
    default:
      return (
        <Overlay>
          <motion.span
            initial={{ opacity: 0, scale: 0.4, rotate: -25 }}
            animate={{ opacity: [0, 1, 0], scale: 1.3, rotate: 15 }}
            transition={{ duration: 0.35 }}
            className="text-6xl drop-shadow-[0_0_12px_rgba(255,200,0,0.9)]"
          >
            💥
          </motion.span>
        </Overlay>
      )
  }
}

// ============================================================
// Auras (no card do PRÓPRIO conjurador/afetado)
// ============================================================

export function AuraFX({ kind, color }: { kind: AuraKind; color?: string }) {
  switch (kind) {
    case 'shield': // 🛡️ Escama de Dragão: bolha âmbar pulsando
    case 'ironskin': { // 🛡️ Pele de Ferro: bolha metálica
      const c = kind === 'shield' ? 'rgba(255,160,60,0.9)' : 'rgba(190,200,215,0.9)'
      return (
        <Overlay>
          <motion.div
            className="absolute inset-1 rounded-2xl"
            style={{ border: `3px solid ${c}`, boxShadow: `0 0 20px ${c}, inset 0 0 24px ${c.replace('0.9', '0.25')}` }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: [0.7, 1.06, 1], opacity: [0, 1, 0.85, 0] }}
            transition={{ duration: 1.2, times: [0, 0.25, 0.7, 1] }}
          />
          <Pop y={-6} size="text-4xl" duration={0.8}>🛡️</Pop>
        </Overlay>
      )
    }

    case 'fury': // 😤 Fúria Selvagem: aura vermelha + chamas subindo
      return (
        <Overlay>
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{ background: 'radial-gradient(circle at 50% 70%, rgba(255,60,30,0.45), transparent 70%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.2 }}
          />
          <Particle x={-24} y={40} toX={-28} toY={-30} duration={0.8} size="text-xl">🔥</Particle>
          <Particle x={20} y={44} toX={26} toY={-24} delay={0.15} duration={0.8} size="text-xl">🔥</Particle>
          <Pop y={-10} delay={0.2} size="text-4xl" duration={0.7}>😤</Pop>
        </Overlay>
      )

    case 'wind': // 🌬️ Voo Veloz: rajadas horizontais de vento
      return (
        <Overlay>
          {[-22, 0, 22].map((y, i) => (
            <motion.div
              key={i}
              className="absolute h-[3px] w-[110%] rounded-full"
              style={{ y, background: 'linear-gradient(90deg, transparent, rgba(210,240,255,0.95), transparent)' }}
              initial={{ x: 90, opacity: 0 }}
              animate={{ x: -90, opacity: [0, 1, 0] }}
              transition={{ delay: i * 0.12, duration: 0.5, ease: 'easeIn' }}
            />
          ))}
          <Pop x={26} y={-24} delay={0.25} size="text-3xl" duration={0.7}>🌬️</Pop>
        </Overlay>
      )

    case 'heal': // 💚 Meditação/cura: brilho verde + faíscas subindo
      return (
        <Overlay>
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{ background: 'radial-gradient(circle at 50% 60%, rgba(60,220,130,0.4), transparent 70%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.2 }}
          />
          {[[-26, 0], [0, 0.15], [24, 0.3]].map(([px, d], i) => (
            <Particle key={i} x={px as number} y={38} toX={px as number} toY={-36} delay={d as number} duration={0.85} size="text-xl">
              ✨
            </Particle>
          ))}
        </Overlay>
      )

    case 'focus': // ✨ Hyperfoco: anéis dourados convergindo
      return (
        <Overlay>
          <motion.div
            className="absolute rounded-full"
            style={{ width: 130, height: 130, border: '3px solid rgba(255,215,80,0.9)', boxShadow: '0 0 16px rgba(255,200,60,0.8)' }}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 0.5, opacity: [0, 1, 0] }}
            transition={{ duration: 0.6, ease: 'easeIn' }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{ width: 130, height: 130, border: '2px solid rgba(255,255,255,0.85)' }}
            initial={{ scale: 1.9, opacity: 0 }}
            animate={{ scale: 0.4, opacity: [0, 1, 0] }}
            transition={{ delay: 0.2, duration: 0.6, ease: 'easeIn' }}
          />
          <Pop delay={0.5} size="text-4xl" duration={0.6}>✨</Pop>
        </Overlay>
      )

    case 'poison': // ☠️ Envenenado: bolhas verdes + névoa
      return (
        <Overlay>
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{ background: 'radial-gradient(circle at 50% 80%, rgba(80,200,60,0.45), transparent 75%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.4 }}
          />
          {[[-20, 0], [12, 0.2], [-2, 0.4]].map(([px, d], i) => (
            <motion.span
              key={i}
              className="absolute w-2.5 h-2.5 rounded-full"
              style={{ x: px as number, background: 'rgba(120,230,80,0.9)', boxShadow: '0 0 8px rgba(90,220,60,0.9)' }}
              initial={{ y: 40, opacity: 0, scale: 0.5 }}
              animate={{ y: -34, opacity: [0, 1, 0], scale: 1.1 }}
              transition={{ delay: d as number, duration: 0.9, ease: 'easeOut' }}
            />
          ))}
          <Pop y={-8} delay={0.3} size="text-4xl" duration={0.8}>☠️</Pop>
        </Overlay>
      )

    case 'bleed': // 🩸 Sangrando: gotas caindo + vinheta vermelha
      return (
        <Overlay>
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{ boxShadow: 'inset 0 0 28px rgba(220,30,40,0.75)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.4 }}
          />
          {[[-18, 0], [14, 0.2], [0, 0.4]].map(([px, d], i) => (
            <Particle key={i} x={px as number} y={-10} toX={px as number} toY={44} delay={d as number} duration={0.7} size="text-lg">
              🩸
            </Particle>
          ))}
        </Overlay>
      )

    case 'stun': // 💫 Atordoado: estrelas orbitando no topo do card
      return (
        <Overlay>
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="absolute text-xl"
              style={{ top: 6 }}
              initial={{ x: 0, opacity: 0 }}
              animate={{ x: [0, 26, 0, -26, 0], opacity: [0, 1, 1, 1, 0], rotate: 360 }}
              transition={{ delay: i * 0.25, duration: 1.2, ease: 'easeInOut' }}
            >
              💫
            </motion.span>
          ))}
          <Pop y={-14} size="text-3xl" duration={0.9}>🌿</Pop>
        </Overlay>
      )

    case 'transform': { // 🐉 Transformação: explosão de energia na cor da forma
      const c = color || '#c084fc'
      return (
        <Overlay>
          <Flash color={`radial-gradient(circle, ${c}66, transparent 70%)`} duration={0.9} peak={1} />
          <Ring color={c} duration={0.7} to={2.1} border={5} />
          <Ring color="rgba(255,255,255,0.9)" delay={0.18} duration={0.7} to={1.6} />
          {[[-34, -20], [36, -26], [-26, 30], [30, 26]].map(([px, py], i) => (
            <Particle key={i} x={0} y={0} toX={px} toY={py} delay={0.15 + i * 0.05} duration={0.7} size="text-lg">✨</Particle>
          ))}
        </Overlay>
      )
    }

    default:
      return null
  }
}

// ============================================================
// Esquiva + Crítico
// ============================================================

/** Linhas de velocidade na direção da esquiva + rastro de vento. */
export function DodgeFX({ side }: { side: 'left' | 'right' }) {
  const dir = side === 'left' ? -1 : 1
  return (
    <Overlay>
      {[-18, 2, 22].map((y, i) => (
        <motion.div
          key={i}
          className="absolute h-[2.5px] w-24 rounded-full"
          style={{ y, background: 'linear-gradient(90deg, transparent, rgba(160,235,255,0.95), transparent)' }}
          initial={{ x: -dir * 40, opacity: 0 }}
          animate={{ x: dir * 70, opacity: [0, 1, 0] }}
          transition={{ delay: i * 0.06, duration: 0.4, ease: 'easeOut' }}
        />
      ))}
      <Particle x={dir * 30} y={14} toX={dir * 55} toY={10} duration={0.5} size="text-2xl">💨</Particle>
    </Overlay>
  )
}

/** Estouro dourado de acerto CRÍTICO por trás do número de dano. */
export function CritFX() {
  return (
    <Overlay>
      <Flash color="rgba(255,240,180,0.55)" duration={0.35} peak={1} />
      <motion.span
        className="absolute text-6xl"
        style={{ filter: 'drop-shadow(0 0 16px rgba(255,200,40,1))' }}
        initial={{ scale: 0.2, rotate: -30, opacity: 0 }}
        animate={{ scale: [0.2, 1.5, 1.2], rotate: 15, opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        ✴️
      </motion.span>
      <Ring color="rgba(255,210,60,0.95)" duration={0.55} to={2} border={5} />
    </Overlay>
  )
}
