'use client'

import React from 'react'
import { motion } from 'framer-motion'

// ============================================================
// Cenário animado do Bazar de Dolrath (tela da Loja). Mesmo estilo
// dos demais backdrops (DungeonBackdrop, ArenaBackdrop,
// VaultBackdrop, KeepBackdrop): gradientes em camadas, silhuetas
// SVG, brilhos e partículas com motion. Posições fixas para evitar
// mismatch de hidratação.
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
      animate={{ y: [0, -drift, 0], opacity: [0.2, 0.85, 0.2] }}
      transition={{ repeat: Infinity, duration, delay, ease: 'easeInOut' }}
    />
  )
}

// Lanterna pendurada que balança suavemente
function Lantern({ x, delay = 0 }: { x: string; delay?: number }) {
  return (
    <motion.div
      className="absolute top-0 origin-top"
      style={{ left: x }}
      animate={{ rotate: [-4, 4, -4] }}
      transition={{ repeat: Infinity, duration: 5, delay, ease: 'easeInOut' }}
    >
      <div className="w-px h-16 bg-stone-700 mx-auto" />
      <div className="w-5 h-7 rounded-md bg-amber-400/70 shadow-[0_0_18px_rgba(251,191,36,0.7)]" />
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-amber-400/20 blur-xl" />
    </motion.div>
  )
}

export default function BazaarBackdrop() {
  return (
    <>
      {/* Entardecer quente sobre o mercado */}
      <div className="absolute inset-0 bg-gradient-to-b from-orange-950 via-amber-900/70 to-stone-900" />

      {/* Sol poente */}
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-orange-400/25 blur-3xl" />

      {/* Toldos das barracas do bazar */}
      <svg className="absolute inset-x-0 top-0 w-full h-2/5 opacity-90" viewBox="0 0 800 200" preserveAspectRatio="none">
        {/* Telhados / toldos listrados em arco */}
        <g>
          <path d="M40,150 Q120,80 200,150 Z" fill="#7c2d12" opacity="0.85" />
          <path d="M220,150 Q300,80 380,150 Z" fill="#9a3412" opacity="0.85" />
          <path d="M400,150 Q480,80 560,150 Z" fill="#7c2d12" opacity="0.85" />
          <path d="M580,150 Q660,80 740,150 Z" fill="#9a3412" opacity="0.85" />
        </g>
      </svg>

      {/* Silhueta de telhados/cidade ao fundo */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/5 opacity-90" viewBox="0 0 800 240" preserveAspectRatio="none">
        <g fill="#1c1410">
          <rect x="40" y="120" width="120" height="120" />
          <polygon points="40,120 100,80 160,120" />
          <rect x="220" y="100" width="140" height="140" />
          <polygon points="220,100 290,60 360,100" />
          <rect x="430" y="130" width="120" height="110" />
          <polygon points="430,130 490,90 550,130" />
          <rect x="610" y="105" width="140" height="135" />
          <polygon points="610,105 680,65 750,105" />
        </g>
        <rect x="0" y="226" width="800" height="14" fill="#0f0b08" />
      </svg>

      {/* Brilho quente subindo do chão do mercado */}
      <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-amber-700/25 via-orange-800/12 to-transparent" />

      {/* Lanternas penduradas */}
      <Lantern x="18%" delay={0} />
      <Lantern x="50%" delay={0.8} />
      <Lantern x="82%" delay={1.4} />

      {/* Fagulhas / poeira dourada */}
      <Particle x="24%" y="48%" size={3} color="#fbbf24" duration={4.6} delay={0} drift={22} />
      <Particle x="40%" y="58%" size={2} color="#fdba74" duration={5.4} delay={1.0} drift={18} />
      <Particle x="58%" y="44%" size={3} color="#facc15" duration={4.0} delay={1.8} drift={26} />
      <Particle x="74%" y="56%" size={2} color="#fbbf24" duration={5.0} delay={0.6} drift={20} />
    </>
  )
}
