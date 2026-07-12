'use client'

import React from 'react'

interface ImageBackdropProps {
  /** Path to the background image (relative to /public/) */
  src: string
  /** Optional overlay opacity for better readability (0-1) */
  overlayOpacity?: number
  /** Optional subtle version for smaller displays */
  subtle?: boolean
}

export default function ImageBackdrop({ 
  src, 
  overlayOpacity = 0.3, 
  subtle = false 
}: ImageBackdropProps) {
  return (
    <>
      {/* Background image */}
      <img
        src={src}
        alt="Battle backdrop"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: subtle ? 'brightness(0.7) blur(2px)' : 'brightness(0.85)',
        }}
      />

      {/* Dark overlay for better text/UI readability */}
      <div
        className="absolute inset-0 bg-black pointer-events-none"
        style={{ opacity: overlayOpacity }}
      />

      {/* Optional gradient overlay for extra depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/20 pointer-events-none" />
    </>
  )
}
