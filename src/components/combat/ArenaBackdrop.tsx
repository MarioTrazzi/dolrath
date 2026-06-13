'use client'

import React from 'react'
import { motion } from 'framer-motion'

// ============================================================
// Cenário animado da Arena de Combate PvP.
// Segue o mesmo estilo visual das masmorras (DungeonBackdrop):
// gradientes em camadas, silhuetas SVG, brilhos e partículas com
// motion. Posições fixas para evitar mismatch de hidratação.
// ============================================================

function Particle({
  x, y, size, color, duration, delay, drift = 16,
}: {
  x: string; y: string; size: number; color: string
  duration: number; delay: number; drift?: number
}) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: `0 0 ${size * 2.5}px ${color}`,
      }}
      animate={{ y: [0, -drift, 0], opacity: [0.2, 0.9, 0.2] }}
      transition={{ repeat: Infinity, duration, delay, ease: 'easeInOut' }}
    />
  )
}

// Tocha acesa nas paredes do coliseu
function Torch({ x, delay = 0 }: { x: string; delay?: number }) {
  return (
    <div className="absolute bottom-1/3" style={{ left: x }}>
      {/* Suporte */}
      <div className="w-1.5 h-10 bg-stone-800 rounded-full" />
      {/* Chama */}
      <motion.div
        className="absolute -top-4 left-1/2 -translate-x-1/2 w-5 h-9 rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 70%, #fef08a, #f59e0b 45%, #dc2626 80%, transparent)',
          filter: 'blur(1px)',
        }}
        animate={{ scaleY: [1, 1.18, 0.95, 1.1, 1], opacity: [0.85, 1, 0.9, 1, 0.85] }}
        transition={{ repeat: Infinity, duration: 1.6, delay, ease: 'easeInOut' }}
      />
      {/* Brilho da tocha */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-amber-500/20 blur-xl" />
    </div>
  )
}

export default function ArenaBackdrop() {
  return (
    <>
      {/* Céu de fim de tarde sobre a arena */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-900 via-rose-900/70 to-amber-950" />

      {/* Sol baixo / poente no horizonte */}
      <div className="absolute top-[8%] left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-amber-400/30 blur-3xl" />

      {/* Halo de poeira/luz central */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[85%] h-72 bg-amber-500/25 blur-3xl rounded-[100%]" />

      {/* Brilho quente subindo do chão da arena */}
      <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-orange-700/30 via-amber-800/15 to-transparent" />

      {/* Arquibancadas / paredes do coliseu */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/4 opacity-90" viewBox="0 0 800 320" preserveAspectRatio="none">
        {/* Parede de fundo em arcos */}
        <g fill="#1c1410">
          <rect x="0" y="120" width="800" height="200" />
        </g>
        <g fill="#0f0b08">
          {/* Arcos */}
          <path d="M60,200 v-40 a40,40 0 0 1 80,0 v40 z" />
          <path d="M200,200 v-40 a40,40 0 0 1 80,0 v40 z" />
          <path d="M340,200 v-40 a40,40 0 0 1 80,0 v40 z" />
          <path d="M480,200 v-40 a40,40 0 0 1 80,0 v40 z" />
          <path d="M620,200 v-40 a40,40 0 0 1 80,0 v40 z" />
        </g>
        {/* Degraus da arquibancada */}
        <g fill="#241a13">
          <rect x="0" y="208" width="800" height="14" />
          <rect x="0" y="230" width="800" height="16" />
          <rect x="0" y="254" width="800" height="18" />
        </g>
        {/* Chão de areia */}
        <rect x="0" y="272" width="800" height="48" fill="#3b2a1c" />
      </svg>

      {/* Tochas acesas */}
      <Torch x="12%" delay={0} />
      <Torch x="50%" delay={0.5} />
      <Torch x="86%" delay={0.9} />

      {/* Brasas subindo */}
      <Particle x="18%" y="55%" size={4} color="#fbbf24" duration={3.6} delay={0} drift={28} />
      <Particle x="30%" y="62%" size={3} color="#f59e0b" duration={4.4} delay={0.8} drift={32} />
      <Particle x="48%" y="50%" size={4} color="#fde68a" duration={3.8} delay={1.4} drift={26} />
      <Particle x="62%" y="60%" size={3} color="#fbbf24" duration={4.8} delay={0.4} drift={30} />
      <Particle x="76%" y="52%" size={4} color="#f59e0b" duration={3.4} delay={2.0} drift={24} />
      <Particle x="88%" y="64%" size={3} color="#fde68a" duration={5.0} delay={1.0} drift={34} />

      {/* Poeira da arena subindo do chão */}
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-stone-950/90 via-amber-950/20 to-transparent" />
    </>
  )
}
