'use client'

import React from 'react'
import { motion } from 'framer-motion'
import type { CreationTheme } from '@/lib/creationVisuals'

// ============================================================
// Cenários animados de Raças e Classes (cards e prévias da Criação).
// Mesmo estilo dos demais backdrops (DungeonBackdrop, ItemCardBackdrop):
// gradientes em camadas, silhuetas SVG e partículas com motion.
// Posições fixas evitam mismatch de hidratação.
// ============================================================

interface BackdropProps {
  theme: CreationTheme
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
      animate={{ y: [0, -drift, 0], opacity: [0.2, 0.9, 0.2] }}
      transition={{ repeat: Infinity, duration, delay, ease: 'easeInOut' }}
    />
  )
}

// ============================== RAÇAS ==============================

// ---------- Draconiano: Caldeira Vulcânica ----------
function DraconianoBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-red-950 via-orange-950/70 to-stone-950" />
      {/* Brilho da lava */}
      <motion.div
        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-40 h-16 bg-orange-500/30 blur-2xl rounded-[100%]"
        animate={{ opacity: [0.4, 0.9, 0.4] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      />
      {/* Asa de dragão */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-2/3 opacity-80" viewBox="0 0 200 130" preserveAspectRatio="xMidYMax meet">
        <path d="M30,130 Q60,70 110,55 Q95,75 120,80 Q100,92 130,98 Q104,110 150,116 L150,130 Z" fill="#1a0a08" />
        <path d="M30,130 Q60,70 110,55" fill="none" stroke="#7f1d1d" strokeWidth="2" opacity="0.7" />
      </svg>
      {/* Picos vulcânicos */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-1/3 opacity-90" viewBox="0 0 200 70" preserveAspectRatio="none">
        <polygon points="0,70 50,24 90,70" fill="#120705" />
        <polygon points="120,70 165,30 200,70" fill="#170806" />
      </svg>
      <Particle x="30%" y="64%" size={3} color="#fb923c" duration={2.6} delay={0} drift={26} />
      <Particle x="52%" y="56%" size={2} color="#fca5a5" duration={3.2} delay={0.7} drift={30} />
      <Particle x="46%" y="72%" size={3} color="#f97316" duration={2.2} delay={1.3} drift={22} />
      <Particle x="68%" y="62%" size={2} color="#fbbf24" duration={3.0} delay={0.4} drift={28} />
    </>
  )
}

// ---------- Metamorfo: Floresta Enluarada ----------
function MetamorfoBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-green-950 to-stone-950" />
      {/* Lua cheia */}
      <div className="absolute top-3 right-6 w-14 h-14 rounded-full bg-emerald-100/70 blur-[2px] shadow-[0_0_40px_rgba(209,250,229,0.5)]" />
      {/* Lobo uivando */}
      <svg className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-24 opacity-90" viewBox="0 0 120 100" preserveAspectRatio="xMidYMax meet">
        <path d="M60,100 L48,60 Q44,46 50,30 L42,16 L54,24 L60,10 L66,24 L78,16 L70,30 Q76,46 72,60 L60,100 Z" fill="#04140c" />
      </svg>
      {/* Silhuetas de árvores */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-1/2 opacity-80" viewBox="0 0 200 80" preserveAspectRatio="none">
        <polygon points="10,80 26,20 42,80" fill="#031a0e" />
        <polygon points="160,80 178,26 196,80" fill="#031a0e" />
      </svg>
      <Particle x="24%" y="50%" size={3} color="#6ee7b7" duration={3.6} delay={0} />
      <Particle x="40%" y="62%" size={2} color="#a7f3d0" duration={4.2} delay={0.8} />
      <Particle x="74%" y="54%" size={3} color="#4ade80" duration={3.8} delay={1.5} />
    </>
  )
}

// ---------- Humano: Reino Dourado ----------
function HumanoBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-amber-900/90 via-yellow-950/80 to-stone-950" />
      {/* Sol nascente */}
      <motion.div
        className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-amber-300/30 blur-2xl"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      />
      {/* Torres do castelo + estandartes */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/5 opacity-90" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax meet">
        <g fill="#1c1305">
          <rect x="36" y="46" width="26" height="74" />
          <polygon points="32,46 66,46 49,30" />
          <rect x="138" y="46" width="26" height="74" />
          <polygon points="134,46 168,46 151,30" />
          <rect x="80" y="64" width="40" height="56" />
          <polygon points="76,64 124,64 100,46" />
        </g>
        {/* Estandartes */}
        <g fill="#f59e0b" opacity="0.8">
          <path d="M49,52 h10 v14 l-5,-4 -5,4 Z" />
          <path d="M151,52 h10 v14 l-5,-4 -5,4 Z" />
        </g>
      </svg>
      <Particle x="30%" y="44%" size={3} color="#fcd34d" duration={4.0} delay={0} drift={12} />
      <Particle x="62%" y="40%" size={2} color="#fde68a" duration={4.6} delay={1.0} drift={10} />
      <Particle x="48%" y="52%" size={2} color="#fbbf24" duration={3.6} delay={1.8} drift={14} />
    </>
  )
}

// ---------- Elfo: Bosque Etéreo ----------
function ElfoBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-teal-950 via-cyan-950 to-emerald-950" />
      {/* Aura luminosa */}
      <motion.div
        className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full bg-cyan-300/20 blur-3xl"
        animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      />
      {/* Árvore ancestral brilhante */}
      <svg className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-28 opacity-85" viewBox="0 0 120 100" preserveAspectRatio="xMidYMax meet">
        <path d="M60,100 L56,52 Q52,38 38,30 M56,52 Q60,36 80,28 M56,52 L58,24 Q58,14 48,8"
          stroke="#0a3d33" strokeWidth="6" fill="none" strokeLinecap="round" />
        <circle cx="48" cy="8" r="7" fill="#67e8f9" opacity="0.55" />
        <circle cx="80" cy="28" r="8" fill="#5eead4" opacity="0.5" />
        <circle cx="38" cy="30" r="6" fill="#67e8f9" opacity="0.5" />
      </svg>
      <Particle x="26%" y="42%" size={3} color="#67e8f9" duration={4.5} delay={0} drift={10} />
      <Particle x="50%" y="34%" size={2} color="#a5f3fc" duration={5.2} delay={1.2} drift={8} />
      <Particle x="72%" y="48%" size={3} color="#5eead4" duration={4.0} delay={2.0} drift={12} />
      <Particle x="38%" y="58%" size={2} color="#67e8f9" duration={5.6} delay={0.6} drift={9} />
    </>
  )
}

// ============================== CLASSES ==============================

// ---------- Warrior: Forja de Guerra ----------
function WarriorBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-red-950 via-rose-950/80 to-stone-950" />
      <motion.div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-16 bg-orange-500/25 blur-2xl rounded-[100%]"
        animate={{ opacity: [0.4, 0.85, 0.4] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      />
      {/* Escudo com espadas cruzadas */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/5 opacity-90" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax meet">
        <g stroke="#7f1d1d" strokeWidth="4" strokeLinecap="round" opacity="0.7">
          <line x1="72" y1="108" x2="128" y2="40" />
          <line x1="128" y1="108" x2="72" y2="40" />
        </g>
        <path d="M100,40 L138,52 V80 Q138,104 100,116 Q62,104 62,80 V52 Z" fill="#1a0f0d" stroke="#991b1b" strokeWidth="2.5" />
      </svg>
      <Particle x="40%" y="68%" size={3} color="#fb923c" duration={2.6} delay={0} drift={20} />
      <Particle x="58%" y="60%" size={2} color="#fca5a5" duration={3.0} delay={0.7} drift={24} />
      <Particle x="50%" y="74%" size={3} color="#f97316" duration={2.2} delay={1.3} drift={18} />
    </>
  )
}

// ---------- Rogue: Beco das Sombras ----------
function RogueBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-stone-950 to-slate-950" />
      {/* Lua minguante */}
      <div className="absolute top-3 right-6 w-12 h-12 rounded-full bg-emerald-100/30 blur-[2px] shadow-[0_0_28px_rgba(167,243,208,0.3)]" />
      <div className="absolute top-3 right-4 w-12 h-12 rounded-full bg-slate-950" />
      {/* Adaga */}
      <svg className="absolute bottom-2 left-1/2 -translate-x-1/2 w-12 h-24 opacity-80" viewBox="0 0 40 90" preserveAspectRatio="xMidYMax meet">
        <polygon points="20,4 26,40 20,52 14,40" fill="#0f3d2e" stroke="#10b981" strokeWidth="1.5" />
        <rect x="10" y="52" width="20" height="5" rx="2" fill="#052e23" />
        <rect x="17" y="57" width="6" height="26" rx="2" fill="#052e23" />
      </svg>
      {/* Fumaça/veneno */}
      <Particle x="30%" y="52%" size={4} color="#34d399" duration={5.5} delay={0} drift={20} />
      <Particle x="62%" y="46%" size={3} color="#6ee7b7" duration={6.0} delay={1.5} drift={24} />
      <Particle x="48%" y="60%" size={3} color="#10b981" duration={5.0} delay={2.4} drift={18} />
    </>
  )
}

// ---------- Mage: Santuário Arcano ----------
function MageBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-violet-950 via-purple-950 to-slate-950" />
      <motion.div
        className="absolute top-2 right-3 w-20 h-20 bg-fuchsia-500/20 blur-2xl rounded-full"
        animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      />
      {/* Círculo rúnico */}
      <motion.svg
        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-28 h-28 opacity-50"
        viewBox="0 0 100 100"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 30, ease: 'linear' }}
      >
        <circle cx="50" cy="50" r="40" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="6 6" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="#c084fc" strokeWidth="1" strokeDasharray="3 8" />
        <polygon points="50,16 79,67 21,67" fill="none" stroke="#d8b4fe" strokeWidth="1" />
        <polygon points="50,84 21,33 79,33" fill="none" stroke="#d8b4fe" strokeWidth="1" />
      </motion.svg>
      {/* Orbe flutuante */}
      <motion.div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-fuchsia-400/40 blur-md"
        animate={{ y: [0, -8, 0], opacity: [0.6, 1, 0.6] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      />
      <Particle x="24%" y="40%" size={3} color="#c084fc" duration={4.5} delay={0} drift={10} />
      <Particle x="70%" y="50%" size={2} color="#e9d5ff" duration={5.2} delay={1.2} drift={8} />
      <Particle x="50%" y="34%" size={2} color="#a855f7" duration={4.0} delay={2.0} drift={12} />
    </>
  )
}

// ---------- Monk: Templo do Ki ----------
function MonkBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-amber-900/80 via-orange-950/70 to-stone-950" />
      {/* Aura de Ki pulsante */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-amber-400/25 blur-2xl"
        animate={{ opacity: [0.4, 0.85, 0.4], scale: [0.9, 1.1, 0.9] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      />
      {/* Anéis de energia girando */}
      <motion.svg
        className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-24 opacity-60"
        viewBox="0 0 100 100"
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 24, ease: 'linear' }}
      >
        <circle cx="50" cy="50" r="38" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="10 8" />
        <circle cx="50" cy="50" r="26" fill="none" stroke="#fcd34d" strokeWidth="1" strokeDasharray="4 6" />
      </motion.svg>
      {/* Pagode / portal */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-2/5 opacity-85" viewBox="0 0 200 60" preserveAspectRatio="none">
        <g fill="#1c1206">
          <rect x="54" y="20" width="10" height="40" />
          <rect x="136" y="20" width="10" height="40" />
          <polygon points="40,20 160,20 100,2" />
          <rect x="36" y="20" width="128" height="6" />
        </g>
      </svg>
      <Particle x="32%" y="46%" size={3} color="#fcd34d" duration={3.8} delay={0} drift={16} />
      <Particle x="64%" y="42%" size={2} color="#fde68a" duration={4.4} delay={1.0} drift={14} />
      <Particle x="50%" y="54%" size={3} color="#fbbf24" duration={3.4} delay={1.8} drift={18} />
    </>
  )
}

export default function CreationCardBackdrop({ theme }: BackdropProps) {
  switch (theme) {
    case 'draconiano': return <DraconianoBackdrop />
    case 'metamorfo': return <MetamorfoBackdrop />
    case 'humano': return <HumanoBackdrop />
    case 'elfo': return <ElfoBackdrop />
    case 'warrior': return <WarriorBackdrop />
    case 'rogue': return <RogueBackdrop />
    case 'mage': return <MageBackdrop />
    case 'monk': return <MonkBackdrop />
    default: return <MageBackdrop />
  }
}
