'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'

interface ImageBackdropProps {
  /** Path to the background image (relative to /public/) */
  src: string
  /** Optional overlay opacity for better readability (0-1) */
  overlayOpacity?: number
  /** Optional subtle version for smaller displays */
  subtle?: boolean
  /** Show animated particles (fireflies) */
  showParticles?: boolean
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

export default function ImageBackdrop({ 
  src, 
  overlayOpacity = 0.3, 
  subtle = false,
  showParticles = true,
}: ImageBackdropProps) {
  const [isLoaded, setIsLoaded] = useState(false)

  return (
    <>
      {/* Fallback enquanto a imagem carrega */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950 via-green-950 to-stone-950" />

      {/* Background — cobre o cenário inteiro (object-cover corta as bordas se
          a proporção da arte diferir da viewport) */}
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

      {/* Animated particles (fireflies) */}
      {showParticles && !subtle && (
        <>
          <Particle x="18%" y="45%" size={4} color="#fbbf24" duration={3.4} delay={0} />
          <Particle x="32%" y="62%" size={3} color="#fde68a" duration={4.2} delay={0.8} />
          <Particle x="58%" y="50%" size={4} color="#fbbf24" duration={3.8} delay={1.5} />
          <Particle x="74%" y="64%" size={3} color="#fde68a" duration={4.6} delay={0.4} />
          <Particle x="86%" y="42%" size={3} color="#fbbf24" duration={3.2} delay={2.1} />
          <Particle x="44%" y="70%" size={4} color="#fde68a" duration={5.0} delay={1.0} />
        </>
      )}
    </>
  )
}
