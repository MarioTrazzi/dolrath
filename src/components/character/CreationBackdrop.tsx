'use client'

import React from 'react'
import { motion } from 'framer-motion'

// ============================================================
// Cenário animado da Câmara Arcana de Criação (tela de Criação de
// Personagem). Mesmo estilo dos demais backdrops (DungeonBackdrop,
// ArenaBackdrop, VaultBackdrop, KeepBackdrop, BazaarBackdrop):
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

export default function CreationBackdrop() {
  return (
    <>
      {/* Penumbra arcana da câmara */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-violet-950/80 to-indigo-950" />

      {/* Vórtice de luz acima do altar */}
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-96 h-80 bg-fuchsia-500/15 blur-3xl rounded-[100%]" />
      <div className="absolute top-[16%] left-1/2 -translate-x-1/2 w-44 h-44 rounded-full bg-cyan-400/15 blur-3xl" />

      {/* Círculo de invocação girando no chão */}
      <motion.svg
        className="absolute left-1/2 bottom-[6%] -translate-x-1/2 w-[520px] h-[520px] max-w-[90vw] opacity-40"
        viewBox="0 0 400 400"
        style={{ transformOrigin: '50% 50%' }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 60, ease: 'linear' }}
      >
        <circle cx="200" cy="200" r="190" fill="none" stroke="#a855f7" strokeWidth="1.5" opacity="0.6" />
        <circle cx="200" cy="200" r="150" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.5" strokeDasharray="6 10" />
        <circle cx="200" cy="200" r="110" fill="none" stroke="#a855f7" strokeWidth="1" opacity="0.5" />
        {/* Glifos triangulares */}
        <polygon points="200,30 95,360 305,360" fill="none" stroke="#c084fc" strokeWidth="1.2" opacity="0.5" />
        <polygon points="200,370 95,40 305,40" fill="none" stroke="#67e8f9" strokeWidth="1" opacity="0.45" />
        {/* Runas nos pontos cardeais */}
        <g fill="#e9d5ff" opacity="0.6">
          <circle cx="200" cy="18" r="4" />
          <circle cx="382" cy="200" r="4" />
          <circle cx="200" cy="382" r="4" />
          <circle cx="18" cy="200" r="4" />
        </g>
      </motion.svg>

      {/* Pulso de energia no centro do círculo */}
      <motion.div
        className="absolute left-1/2 bottom-[20%] -translate-x-1/2 w-40 h-40 rounded-full bg-fuchsia-500/20 blur-2xl"
        animate={{ opacity: [0.3, 0.8, 0.3], scale: [0.9, 1.1, 0.9] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      />

      {/* Pilares de pedra ao fundo */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-2/3 opacity-80" viewBox="0 0 800 300" preserveAspectRatio="none">
        <g fill="#0c0a1a">
          <rect x="70" y="40" width="40" height="260" />
          <rect x="60" y="28" width="60" height="16" rx="3" />
          <rect x="690" y="40" width="40" height="260" />
          <rect x="680" y="28" width="60" height="16" rx="3" />
        </g>
        {/* Runas nos pilares */}
        <g fill="#a855f7" opacity="0.5">
          <circle cx="90" cy="90" r="3" />
          <rect x="84" y="120" width="12" height="3" rx="1.5" />
          <circle cx="710" cy="110" r="3" />
          <rect x="704" y="140" width="12" height="3" rx="1.5" />
        </g>
      </svg>

      {/* Fagulhas mágicas flutuando */}
      <Particle x="22%" y="44%" size={3} color="#c084fc" duration={4.6} delay={0} drift={24} />
      <Particle x="36%" y="56%" size={2} color="#67e8f9" duration={5.4} delay={1.0} drift={20} />
      <Particle x="50%" y="38%" size={3} color="#e9d5ff" duration={4.0} delay={1.8} drift={28} />
      <Particle x="64%" y="52%" size={2} color="#a855f7" duration={5.0} delay={0.6} drift={22} />
      <Particle x="78%" y="42%" size={3} color="#67e8f9" duration={4.4} delay={2.2} drift={26} />

      <div className="absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-indigo-950/90 to-transparent" />
    </>
  )
}
