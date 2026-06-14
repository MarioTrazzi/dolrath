'use client'

import React from 'react'
import { motion } from 'framer-motion'
import type { ItemVisualCategory } from '@/lib/itemVisuals'

// ============================================================
// Cenários animados dos cards da loja (camadas CSS/SVG + partículas)
// Mesmo estilo dos cards de masmorra (DungeonBackdrop): gradientes em
// camadas, silhuetas SVG e partículas com motion. Cada categoria de
// item tem uma identidade própria. Posições fixas evitam mismatch de
// hidratação.
// ============================================================

interface BackdropProps {
  category: ItemVisualCategory
}

function Particle({
  x, y, size, color, duration, delay, drift = 12,
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

// ---------- Armas: Forja Carmesim ----------
function WeaponBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-red-950 via-rose-950/80 to-stone-950" />
      {/* Brasa da fornalha */}
      <motion.div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-16 bg-orange-500/25 blur-2xl rounded-[100%]"
        animate={{ opacity: [0.4, 0.85, 0.4] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      />
      {/* Bigorna + lâminas cruzadas */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/5 opacity-90" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax meet">
        {/* lâminas cruzadas ao fundo */}
        <g stroke="#7f1d1d" strokeWidth="4" strokeLinecap="round" opacity="0.7">
          <line x1="70" y1="105" x2="130" y2="35" />
          <line x1="130" y1="105" x2="70" y2="35" />
        </g>
        {/* bigorna */}
        <g fill="#1c1917">
          <path d="M64,86 H136 L128,98 H72 Z" />
          <rect x="86" y="98" width="28" height="16" />
          <path d="M80,80 H150 L138,90 H80 Z" />
        </g>
      </svg>
      {/* Faíscas subindo */}
      <Particle x="40%" y="70%" size={3} color="#fb923c" duration={2.6} delay={0} drift={20} />
      <Particle x="56%" y="60%" size={2} color="#fca5a5" duration={3.0} delay={0.7} drift={24} />
      <Particle x="48%" y="78%" size={3} color="#f97316" duration={2.2} delay={1.3} drift={18} />
      <Particle x="64%" y="72%" size={2} color="#fbbf24" duration={3.4} delay={0.4} drift={22} />
    </>
  )
}

// ---------- Arcano: Cajados ----------
function ArcaneBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-violet-950 via-purple-950 to-slate-950" />
      {/* Nebulosa arcana */}
      <motion.div
        className="absolute top-2 right-3 w-20 h-20 bg-fuchsia-500/20 blur-2xl rounded-full"
        animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      />
      {/* Círculo rúnico girando */}
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
      {/* Motas mágicas */}
      <Particle x="24%" y="40%" size={3} color="#c084fc" duration={4.5} delay={0} drift={10} />
      <Particle x="70%" y="50%" size={2} color="#e9d5ff" duration={5.2} delay={1.2} drift={8} />
      <Particle x="50%" y="34%" size={2} color="#a855f7" duration={4.0} delay={2.0} drift={12} />
      <Particle x="38%" y="60%" size={3} color="#d8b4fe" duration={5.6} delay={0.6} drift={9} />
    </>
  )
}

// ---------- Proteção: Aço ----------
function ArmorBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950 via-sky-950/80 to-slate-950" />
      {/* Raios de luz fria sobre o aço */}
      <div className="absolute top-0 left-[28%] w-16 h-full bg-gradient-to-b from-sky-200/10 to-transparent -skew-x-12 blur-sm" />
      <div className="absolute top-0 right-[24%] w-10 h-full bg-gradient-to-b from-blue-100/10 to-transparent skew-x-12 blur-sm" />
      {/* Brasão / escudo de placas */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/5 opacity-90" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax meet">
        <path d="M100,30 L150,46 V78 Q150,104 100,116 Q50,104 50,78 V46 Z" fill="#0f172a" stroke="#1e3a8a" strokeWidth="3" />
        <path d="M100,30 V116" stroke="#1e40af" strokeWidth="2" opacity="0.6" />
        <path d="M62,52 H138" stroke="#1e40af" strokeWidth="2" opacity="0.5" />
        {/* rebite brilhante */}
        <circle cx="100" cy="60" r="4" fill="#60a5fa" opacity="0.8" />
      </svg>
      {/* Brilho do rebite */}
      <motion.div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 w-14 h-14 bg-sky-400/20 blur-xl rounded-full"
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
      />
      <Particle x="32%" y="42%" size={2} color="#93c5fd" duration={5.0} delay={0} drift={8} />
      <Particle x="68%" y="50%" size={2} color="#bfdbfe" duration={5.6} delay={1.5} drift={6} />
    </>
  )
}

// ---------- Couro: Oficina ----------
function LeatherBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-orange-950 via-amber-950/70 to-stone-950" />
      {/* Calor de lamparina */}
      <motion.div
        className="absolute top-3 right-6 w-12 h-12 bg-amber-400/25 blur-xl rounded-full"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      />
      {/* Costura em couro */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/5 opacity-90" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax meet">
        {/* peça de couro */}
        <path d="M44,116 Q40,70 70,58 Q100,46 130,58 Q160,70 156,116 Z" fill="#3a2412" />
        <path d="M44,116 Q40,70 70,58 Q100,46 130,58 Q160,70 156,116 Z" fill="none" stroke="#7c4a1e" strokeWidth="2" />
        {/* linha de costura tracejada */}
        <path d="M60,108 Q56,74 80,66 Q100,58 120,66 Q144,74 140,108" fill="none" stroke="#d6a85f" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
      </svg>
      <Particle x="34%" y="48%" size={2} color="#fbbf24" duration={4.4} delay={0} drift={12} />
      <Particle x="64%" y="42%" size={2} color="#d6a85f" duration={5.0} delay={1.0} drift={10} />
      <Particle x="50%" y="56%" size={2} color="#fcd34d" duration={4.0} delay={1.8} drift={14} />
    </>
  )
}

// ---------- Joias: Tesouro Dourado ----------
function JewelryBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-yellow-900/90 via-amber-950 to-stone-950" />
      {/* Aura dourada */}
      <motion.div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-16 bg-amber-400/25 blur-2xl rounded-[100%]"
        animate={{ opacity: [0.45, 0.9, 0.45] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      />
      {/* Gema central facetada */}
      <motion.svg
        className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-20"
        viewBox="0 0 80 100"
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
      >
        <polygon points="40,8 64,34 40,92 16,34" fill="#fde68a" opacity="0.85" />
        <polygon points="40,8 64,34 40,46 16,34" fill="#fffbeb" opacity="0.9" />
        <polygon points="16,34 40,46 40,92" fill="#fbbf24" opacity="0.8" />
        <polygon points="64,34 40,46 40,92" fill="#f59e0b" opacity="0.8" />
      </motion.svg>
      {/* Moedas empilhadas */}
      <svg className="absolute bottom-0 left-3 w-16 h-12 opacity-80" viewBox="0 0 80 60">
        <ellipse cx="26" cy="50" rx="22" ry="7" fill="#b45309" />
        <ellipse cx="26" cy="44" rx="22" ry="7" fill="#d97706" />
        <ellipse cx="26" cy="38" rx="22" ry="7" fill="#f59e0b" />
      </svg>
      <svg className="absolute bottom-0 right-3 w-14 h-10 opacity-80" viewBox="0 0 70 50">
        <ellipse cx="35" cy="42" rx="20" ry="6" fill="#b45309" />
        <ellipse cx="35" cy="36" rx="20" ry="6" fill="#f59e0b" />
      </svg>
      {/* Cintilações */}
      <Particle x="30%" y="36%" size={3} color="#fef3c7" duration={2.4} delay={0} drift={6} />
      <Particle x="66%" y="44%" size={2} color="#fde68a" duration={2.8} delay={0.6} drift={5} />
      <Particle x="50%" y="28%" size={3} color="#fffbeb" duration={2.0} delay={1.2} drift={7} />
      <Particle x="40%" y="52%" size={2} color="#fcd34d" duration={3.0} delay={1.8} drift={5} />
    </>
  )
}

// ---------- Consumíveis: Alquimia ----------
function ConsumableBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-green-950 to-teal-950" />
      {/* Vapor da poção */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 w-16 h-16 bg-emerald-300/15 blur-2xl rounded-[100%]"
        animate={{ y: [0, -10, 0], opacity: [0.3, 0.6, 0.3] }}
        transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
      />
      {/* Frasco de poção */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-3/5 opacity-95" viewBox="0 0 200 120" preserveAspectRatio="xMidYMax meet">
        {/* corpo do frasco */}
        <path d="M86,42 H114 V58 L130,96 Q132,116 110,116 H90 Q68,116 70,96 L86,58 Z" fill="#052e2b" stroke="#10b981" strokeWidth="2" />
        {/* líquido */}
        <path d="M76,86 L124,86 Q126,116 110,116 H90 Q74,116 76,86 Z" fill="#10b981" opacity="0.75" />
        {/* rolha */}
        <rect x="88" y="32" width="24" height="12" rx="3" fill="#1c1917" />
      </svg>
      {/* Bolhas subindo dentro do frasco */}
      <Particle x="48%" y="84%" size={3} color="#6ee7b7" duration={2.6} delay={0} drift={14} />
      <Particle x="53%" y="88%" size={2} color="#a7f3d0" duration={2.2} delay={0.8} drift={12} />
      <Particle x="50%" y="80%" size={2} color="#34d399" duration={3.0} delay={1.4} drift={16} />
    </>
  )
}

export default function ItemCardBackdrop({ category }: BackdropProps) {
  switch (category) {
    case 'weapon':
      return <WeaponBackdrop />
    case 'arcane':
      return <ArcaneBackdrop />
    case 'armor':
      return <ArmorBackdrop />
    case 'leather':
      return <LeatherBackdrop />
    case 'jewelry':
      return <JewelryBackdrop />
    case 'consumable':
      return <ConsumableBackdrop />
    default:
      return <ConsumableBackdrop />
  }
}
