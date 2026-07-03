'use client'

import React from 'react'
import { motion } from 'framer-motion'

// ============================================================
// Cenário animado da Câmara do Tesouro (tela de Inventário).
// Mesmo estilo visual das masmorras/arena (DungeonBackdrop,
// ArenaBackdrop): gradientes em camadas, silhuetas SVG, brilhos
// e partículas com motion. Posições fixas para evitar mismatch
// de hidratação.
// ============================================================

function Particle({
  x, y, size, color, duration, delay, drift = 16,
}: {
  x: string; y: string; size: number; color: string
  duration: number; delay: number; drift?: number
}) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none hidden sm:block"
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

export default function VaultBackdrop() {
  return (
    <>
      {/* Penumbra quente da câmara subterrânea */}
      <div className="absolute inset-0 bg-gradient-to-b from-stone-900 via-amber-950/80 to-yellow-950" />

      {/* Lanterna/tocha iluminando o centro */}
      <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-amber-400/25 blur-3xl" />

      {/* Brilho dourado do tesouro subindo do chão */}
      <div className="absolute bottom-0 inset-x-0 h-2/3 bg-gradient-to-t from-yellow-600/30 via-amber-700/15 to-transparent" />

      {/* Arcos e prateleiras do cofre de pedra */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/4 opacity-90" viewBox="0 0 800 320" preserveAspectRatio="none">
        {/* Parede de fundo */}
        <rect x="0" y="100" width="800" height="220" fill="#1a1410" />
        {/* Arcos abobadados */}
        <g fill="#0e0a07">
          <path d="M70,210 v-50 a50,50 0 0 1 100,0 v50 z" />
          <path d="M330,210 v-60 a70,70 0 0 1 140,0 v60 z" />
          <path d="M630,210 v-50 a50,50 0 0 1 100,0 v50 z" />
        </g>
        {/* Prateleiras / nichos */}
        <g fill="#241a12">
          <rect x="40" y="226" width="720" height="12" />
          <rect x="40" y="252" width="720" height="14" />
        </g>
        {/* Pilha de tesouro no chão */}
        <path d="M250,320 Q300,250 400,255 Q510,250 560,320 Z" fill="#3a2c12" />
      </svg>

      {/* Brilho dos montes de moedas */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-72 h-20 bg-yellow-400/20 blur-2xl rounded-[100%]" />
      <motion.div
        className="absolute bottom-4 left-[34%] w-24 h-10 bg-amber-300/25 blur-xl rounded-[100%]"
        animate={{ opacity: [0.4, 0.85, 0.4] }}
        transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-4 right-[34%] w-24 h-10 bg-amber-300/25 blur-xl rounded-[100%]"
        animate={{ opacity: [0.85, 0.4, 0.85] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 0.8 }}
      />

      {/* Poeira / fagulhas douradas flutuando */}
      <Particle x="16%" y="40%" size={3} color="#fbbf24" duration={4.6} delay={0} drift={22} />
      <Particle x="30%" y="52%" size={2} color="#fde68a" duration={5.4} delay={1.0} drift={18} />
      <Particle x="46%" y="34%" size={3} color="#facc15" duration={4.0} delay={1.8} drift={26} />
      <Particle x="60%" y="50%" size={2} color="#fbbf24" duration={5.0} delay={0.6} drift={20} />
      <Particle x="74%" y="38%" size={3} color="#fde68a" duration={4.4} delay={2.2} drift={24} />
      <Particle x="86%" y="54%" size={2} color="#facc15" duration={5.6} delay={1.4} drift={16} />
    </>
  )
}
