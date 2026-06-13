'use client'

import React from 'react'
import { motion } from 'framer-motion'

// ============================================================
// Cenário animado do Salão do Castelo (tela do Dashboard / base
// do herói). Mesmo estilo dos demais backdrops (DungeonBackdrop,
// ArenaBackdrop, VaultBackdrop): gradientes em camadas, silhuetas
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
      className="absolute rounded-full pointer-events-none"
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

// Estandarte real pendurado na parede
function Banner({ x, color, delay = 0 }: { x: string; color: string; delay?: number }) {
  return (
    <motion.svg
      className="absolute top-0 w-14 h-40"
      style={{ left: x }}
      viewBox="0 0 56 160"
      animate={{ rotate: [-1.2, 1.2, -1.2] }}
      transition={{ repeat: Infinity, duration: 6, delay, ease: 'easeInOut' }}
    >
      <path d="M6,0 H50 V120 L28,140 L6,120 Z" fill={color} opacity="0.55" />
      <circle cx="28" cy="56" r="11" fill="#fde68a" opacity="0.5" />
    </motion.svg>
  )
}

export default function KeepBackdrop() {
  return (
    <>
      {/* Penumbra real do grande salão */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-900" />

      {/* Luz do vitral entrando pelo alto */}
      <div className="absolute top-[6%] left-1/2 -translate-x-1/2 w-96 h-72 bg-indigo-400/15 blur-3xl rounded-[100%]" />
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-amber-300/20 blur-3xl" />

      {/* Colunas e arcos do salão */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/4 opacity-90" viewBox="0 0 800 320" preserveAspectRatio="none">
        <rect x="0" y="90" width="800" height="230" fill="#0d1023" />
        {/* Arco central (trono) */}
        <path d="M320,250 v-90 a80,80 0 0 1 160,0 v90 z" fill="#070914" />
        {/* Colunas laterais */}
        <g fill="#0a0d1c">
          <rect x="60" y="110" width="48" height="210" />
          <rect x="170" y="110" width="48" height="210" />
          <rect x="582" y="110" width="48" height="210" />
          <rect x="692" y="110" width="48" height="210" />
        </g>
        {/* Tapete vermelho até o trono */}
        <polygon points="360,320 440,320 410,250 390,250" fill="#3a0d12" />
        {/* Piso */}
        <rect x="0" y="306" width="800" height="14" fill="#0a0c18" />
      </svg>

      {/* Brilho do trono */}
      <motion.div
        className="absolute bottom-16 left-1/2 -translate-x-1/2 w-44 h-20 bg-amber-400/15 blur-2xl rounded-[100%]"
        animate={{ opacity: [0.4, 0.9, 0.4] }}
        transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
      />

      {/* Estandartes reais */}
      <Banner x="14%" color="#7c3aed" delay={0} />
      <Banner x="80%" color="#b91c1c" delay={1.5} />

      {/* Brasas de tochas flutuando */}
      <Particle x="20%" y="46%" size={3} color="#fbbf24" duration={4.6} delay={0} drift={22} />
      <Particle x="34%" y="56%" size={2} color="#a78bfa" duration={5.4} delay={1.0} drift={18} />
      <Particle x="50%" y="40%" size={3} color="#fde68a" duration={4.0} delay={1.8} drift={26} />
      <Particle x="66%" y="54%" size={2} color="#818cf8" duration={5.0} delay={0.6} drift={20} />
      <Particle x="80%" y="44%" size={3} color="#fbbf24" duration={4.4} delay={2.2} drift={24} />

      <div className="absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-slate-950/90 to-transparent" />
    </>
  )
}
