'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import type { DungeonId } from '@/lib/dungeonAdventures'

interface ImageBackdropProps {
  /** Path to the background image (relative to /public/) */
  src: string
  /** Optional overlay opacity for better readability (0-1) */
  overlayOpacity?: number
  /** Optional subtle version for smaller displays */
  subtle?: boolean
  /** Show animated particles (fireflies) */
  showParticles?: boolean
  /** Theme drives particle colors to match each dungeon biome */
  theme?: DungeonId
}

type ParticleDef = {
  x: string
  y: string
  size: number
  color: string
  duration: number
  delay: number
  drift?: number
}

const THEME_PARTICLES: Record<DungeonId, ParticleDef[]> = {
  floresta: [
    { x: '18%', y: '45%', size: 4, color: '#fbbf24', duration: 3.4, delay: 0 },
    { x: '32%', y: '62%', size: 3, color: '#fde68a', duration: 4.2, delay: 0.8 },
    { x: '58%', y: '50%', size: 4, color: '#fbbf24', duration: 3.8, delay: 1.5 },
    { x: '74%', y: '64%', size: 3, color: '#fde68a', duration: 4.6, delay: 0.4 },
    { x: '86%', y: '42%', size: 3, color: '#fbbf24', duration: 3.2, delay: 2.1 },
    { x: '44%', y: '70%', size: 4, color: '#fde68a', duration: 5.0, delay: 1.0 },
  ],
  caverna: [
    { x: '25%', y: '35%', size: 3, color: '#67e8f9', duration: 4.5, delay: 0, drift: 8 },
    { x: '50%', y: '28%', size: 2, color: '#a78bfa', duration: 5.2, delay: 1.2, drift: 6 },
    { x: '70%', y: '40%', size: 3, color: '#67e8f9', duration: 4.0, delay: 2.0, drift: 8 },
    { x: '38%', y: '55%', size: 2, color: '#c084fc', duration: 4.8, delay: 0.6, drift: 10 },
    { x: '82%', y: '48%', size: 3, color: '#67e8f9', duration: 5.4, delay: 1.5, drift: 7 },
  ],
  pantano: [
    { x: '30%', y: '55%', size: 5, color: '#38bdf8', duration: 5.5, delay: 0, drift: 20 },
    { x: '62%', y: '48%', size: 4, color: '#4ade80', duration: 6.2, delay: 1.8, drift: 24 },
    { x: '80%', y: '60%', size: 4, color: '#38bdf8', duration: 5.0, delay: 3.0, drift: 18 },
    { x: '45%', y: '88%', size: 3, color: '#86efac', duration: 3.0, delay: 0.5, drift: 10 },
    { x: '55%', y: '90%', size: 2, color: '#86efac', duration: 2.6, delay: 1.4, drift: 8 },
  ],
  ruinas: [
    { x: '22%', y: '50%', size: 3, color: '#f59e0b', duration: 4.4, delay: 0, drift: 26 },
    { x: '40%', y: '62%', size: 2, color: '#c084fc', duration: 5.2, delay: 1.2, drift: 30 },
    { x: '58%', y: '46%', size: 3, color: '#f59e0b', duration: 4.8, delay: 2.2, drift: 22 },
    { x: '76%', y: '58%', size: 2, color: '#c084fc', duration: 5.8, delay: 0.6, drift: 28 },
    { x: '48%', y: '38%', size: 2, color: '#a855f7', duration: 4.0, delay: 1.6, drift: 18 },
  ],
}

function Particle({
  x, y, size, color, duration, delay, drift = 14,
}: ParticleDef) {
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

export default function ImageBackdrop({ 
  src, 
  overlayOpacity = 0.3, 
  subtle = false,
  showParticles = true,
  theme = 'floresta',
}: ImageBackdropProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const particles = THEME_PARTICLES[theme] ?? THEME_PARTICLES.floresta

  return (
    <>
      {/* Fallback enquanto a imagem carrega */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-green-950 to-stone-950" />

      {/* Background — cobre o cenário inteiro (object-cover corta as bordas se
          a proporção da arte diferir da viewport) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Battle backdrop"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: subtle ? 'brightness(0.7) blur(2px)' : 'brightness(0.85)',
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 0.3s ease-in',
        }}
        onLoad={() => setIsLoaded(true)}
        onError={(e) => {
          console.error('[ImageBackdrop] Erro ao carregar imagem:', src, e)
          setIsLoaded(true)
        }}
      />

      {/* Dark overlay for better text/UI readability */}
      <div
        className="absolute inset-0 bg-black pointer-events-none"
        style={{ opacity: overlayOpacity }}
      />

      {/* Optional gradient overlay for extra depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/20 pointer-events-none" />

      {/* Animated particles (fireflies / wisps / arcane dust) */}
      {showParticles && !subtle && particles.map((p, i) => (
        <Particle key={i} {...p} />
      ))}
    </>
  )
}
