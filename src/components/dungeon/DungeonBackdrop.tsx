'use client'

import React from 'react'
import { motion } from 'framer-motion'
import type { DungeonId } from '@/lib/dungeonAdventures'
import ImageBackdrop from '@/components/dungeon/ImageBackdrop'

// ============================================================
// Cenários animados das masmorras (camadas CSS/SVG + partículas)
// Seguem o estilo visual da arena (gradientes em camadas, brilhos,
// decorações com motion). Posições fixas para evitar mismatch de
// hidratação.
// ============================================================

interface BackdropProps {
  theme: DungeonId
  /** Versão discreta para usar dentro de cards de seleção */
  subtle?: boolean
  /** Optional path to a custom background image (relative to /public/) */
  imageUrl?: string
  /** Overlay opacity for image backdrops (0-1) */
  imageOverlayOpacity?: number
}

function Particle({
  x, y, size, color, duration, delay, drift = 14,
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
      animate={{ y: [0, -drift, 0], opacity: [0.25, 0.95, 0.25] }}
      transition={{ repeat: Infinity, duration, delay, ease: 'easeInOut' }}
    />
  )
}

// ---------- Floresta Sombria ----------
function FlorestaBackdrop({ subtle }: { subtle?: boolean }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-green-950 to-stone-950" />
      {/* Luar atravessando a copa */}
      <div className="absolute top-3 left-1/4 w-12 h-12 rounded-full bg-emerald-100/60 blur-[3px] shadow-[0_0_40px_rgba(209,250,229,0.4)]" />
      <div className="absolute top-0 left-[30%] w-24 h-full bg-gradient-to-b from-emerald-100/10 to-transparent -skew-x-12 blur-sm" />
      {/* Silhuetas de árvores */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-2/3 opacity-80" viewBox="0 0 800 300" preserveAspectRatio="none">
        <polygon points="40,300 90,90 140,300" fill="#021a0e" />
        <polygon points="120,300 170,40 230,300" fill="#03210f" />
        <polygon points="620,300 680,60 740,300" fill="#03210f" />
        <polygon points="700,300 760,110 800,300" fill="#021a0e" />
        <rect x="0" y="280" width="800" height="20" fill="#01130a" />
      </svg>
      {!subtle && (
        <>
          <Particle x="18%" y="45%" size={4} color="#fbbf24" duration={3.4} delay={0} />
          <Particle x="32%" y="62%" size={3} color="#fde68a" duration={4.2} delay={0.8} />
          <Particle x="58%" y="50%" size={4} color="#fbbf24" duration={3.8} delay={1.5} />
          <Particle x="74%" y="64%" size={3} color="#fde68a" duration={4.6} delay={0.4} />
          <Particle x="86%" y="42%" size={3} color="#fbbf24" duration={3.2} delay={2.1} />
          <Particle x="44%" y="70%" size={4} color="#fde68a" duration={5.0} delay={1.0} />
        </>
      )}
      {/* Neblina baixa */}
      <div className="absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-emerald-900/40 to-transparent" />
    </>
  )
}

// ---------- Caverna de Cristal ----------
function CavernaBackdrop({ subtle }: { subtle?: boolean }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950" />
      {/* Estalactites */}
      <svg className="absolute inset-x-0 top-0 w-full h-1/3 opacity-90" viewBox="0 0 800 120" preserveAspectRatio="none">
        <polygon points="0,0 800,0 800,18 740,16 700,70 670,16 580,20 545,55 515,18 420,22 390,95 355,20 250,18 215,60 185,16 90,20 60,80 30,16 0,20" fill="#0b1023" />
      </svg>
      {/* Cristais brilhantes */}
      <motion.svg
        className="absolute bottom-0 left-[6%] w-20 h-28"
        viewBox="0 0 80 110"
        animate={subtle ? undefined : { opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      >
        <polygon points="20,110 10,60 25,20 38,55 34,110" fill="#22d3ee" opacity="0.75" />
        <polygon points="46,110 40,70 55,40 66,75 62,110" fill="#a78bfa" opacity="0.7" />
      </motion.svg>
      <motion.svg
        className="absolute bottom-0 right-[8%] w-24 h-32"
        viewBox="0 0 90 120"
        animate={subtle ? undefined : { opacity: [1, 0.6, 1] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 1 }}
      >
        <polygon points="25,120 12,55 32,10 46,60 40,120" fill="#67e8f9" opacity="0.7" />
        <polygon points="58,120 50,80 68,50 80,85 74,120" fill="#c084fc" opacity="0.65" />
      </motion.svg>
      {/* Brilhos dos cristais */}
      <div className="absolute bottom-10 left-[8%] w-16 h-16 rounded-full bg-cyan-400/20 blur-xl" />
      <div className="absolute bottom-12 right-[10%] w-20 h-20 rounded-full bg-purple-400/20 blur-xl" />
      {!subtle && (
        <>
          <Particle x="25%" y="35%" size={3} color="#67e8f9" duration={4.5} delay={0} drift={8} />
          <Particle x="50%" y="28%" size={2} color="#a78bfa" duration={5.2} delay={1.2} drift={6} />
          <Particle x="70%" y="40%" size={3} color="#67e8f9" duration={4.0} delay={2.0} drift={8} />
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/6 bg-gradient-to-t from-indigo-950/80 to-transparent" />
    </>
  )
}

// ---------- Pântano Maldito ----------
function PantanoBackdrop({ subtle }: { subtle?: boolean }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-stone-950 via-emerald-950 to-lime-950/90" />
      {/* Lua doentia */}
      <div className="absolute top-4 right-10 w-10 h-10 rounded-full bg-lime-100/50 blur-[2px] shadow-[0_0_30px_rgba(217,249,157,0.35)]" />
      {/* Árvore retorcida */}
      <svg className="absolute bottom-0 left-[4%] w-36 h-48 opacity-90" viewBox="0 0 140 190">
        <path d="M70,190 L64,120 Q60,95 38,82 M64,120 Q68,90 96,72 M64,120 L66,60 Q66,40 52,28 M66,60 Q70,42 88,34"
          stroke="#0c1208" strokeWidth="11" fill="none" strokeLinecap="round" />
      </svg>
      {/* Água do pântano */}
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-lime-900/50 via-emerald-900/30 to-transparent" />
      {/* Névoa em camadas */}
      <motion.div
        className="absolute bottom-6 inset-x-0 h-14 bg-emerald-100/10 blur-2xl rounded-[100%]"
        animate={subtle ? undefined : { x: [-25, 25, -25] }}
        transition={{ repeat: Infinity, duration: 9, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-14 inset-x-10 h-10 bg-lime-100/10 blur-2xl rounded-[100%]"
        animate={subtle ? undefined : { x: [20, -20, 20] }}
        transition={{ repeat: Infinity, duration: 11, ease: 'easeInOut' }}
      />
      {!subtle && (
        <>
          {/* Fogos-fátuos */}
          <Particle x="30%" y="55%" size={5} color="#38bdf8" duration={5.5} delay={0} drift={20} />
          <Particle x="62%" y="48%" size={4} color="#4ade80" duration={6.2} delay={1.8} drift={24} />
          <Particle x="80%" y="60%" size={4} color="#38bdf8" duration={5.0} delay={3.0} drift={18} />
          {/* Bolhas subindo */}
          <Particle x="45%" y="88%" size={3} color="#86efac" duration={3.0} delay={0.5} drift={10} />
          <Particle x="55%" y="90%" size={2} color="#86efac" duration={2.6} delay={1.4} drift={8} />
        </>
      )}
    </>
  )
}

// ---------- Ruínas Arcanas ----------
function RuinasBackdrop({ subtle }: { subtle?: boolean }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-stone-950 via-amber-950/60 to-purple-950" />
      {/* Colunas partidas */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/5 opacity-90" viewBox="0 0 800 260" preserveAspectRatio="none">
        <g fill="#171310">
          <rect x="60" y="60" width="44" height="200" />
          <rect x="50" y="48" width="64" height="16" rx="3" />
          <rect x="660" y="100" width="44" height="160" />
          <rect x="650" y="88" width="64" height="16" rx="3" />
          <polygon points="240,260 240,140 262,120 284,150 284,260" />
          <rect x="0" y="244" width="800" height="16" />
        </g>
        {/* Runas na coluna */}
        <g fill="#a855f7" opacity="0.55">
          <circle cx="82" cy="110" r="3.5" />
          <rect x="76" y="140" width="12" height="3" rx="1.5" />
          <circle cx="682" cy="150" r="3.5" />
          <rect x="676" y="180" width="12" height="3" rx="1.5" />
        </g>
      </svg>
      {/* Brilho arcano */}
      <motion.div
        className="absolute bottom-16 left-1/2 -translate-x-1/2 w-40 h-16 bg-purple-500/15 blur-2xl rounded-[100%]"
        animate={subtle ? undefined : { opacity: [0.4, 0.9, 0.4] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      />
      {!subtle && (
        <>
          {/* Brasas/poeira arcana flutuando */}
          <Particle x="22%" y="50%" size={3} color="#f59e0b" duration={4.4} delay={0} drift={26} />
          <Particle x="40%" y="62%" size={2} color="#c084fc" duration={5.2} delay={1.2} drift={30} />
          <Particle x="58%" y="46%" size={3} color="#f59e0b" duration={4.8} delay={2.2} drift={22} />
          <Particle x="76%" y="58%" size={2} color="#c084fc" duration={5.8} delay={0.6} drift={28} />
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 h-1/6 bg-gradient-to-t from-stone-950/90 to-transparent" />
    </>
  )
}

export default function DungeonBackdrop({ 
  theme, 
  subtle, 
  imageUrl,
  imageOverlayOpacity = 0.3,
}: BackdropProps) {
  // Use custom image backdrop if provided
  if (imageUrl) {
    return <ImageBackdrop src={imageUrl} overlayOpacity={imageOverlayOpacity} subtle={subtle} />
  }

  // Fall back to themed SVG backdrops
  switch (theme) {
    case 'floresta':
      return <FlorestaBackdrop subtle={subtle} />
    case 'caverna':
      return <CavernaBackdrop subtle={subtle} />
    case 'pantano':
      return <PantanoBackdrop subtle={subtle} />
    case 'ruinas':
      return <RuinasBackdrop subtle={subtle} />
    default:
      return <FlorestaBackdrop subtle={subtle} />
  }
}
