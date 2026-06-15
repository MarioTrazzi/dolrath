'use client'

// ============================================================
// Silhueta de personagem para o fundo do painel de equipamentos
// (layout estilo Black Desert: slots em volta de uma figura central).
// Cor acompanha a identidade de raça/classe via prop `color`.
// ============================================================

interface PersonSilhouetteProps {
  color?: string
  className?: string
}

export default function PersonSilhouette({ color = '#a855f7', className = '' }: PersonSilhouetteProps) {
  return (
    <svg
      viewBox="0 0 120 240"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="silGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <g fill="url(#silGrad)" stroke={color} strokeOpacity="0.25" strokeWidth="1">
        {/* Cabeça */}
        <circle cx="60" cy="30" r="20" />
        {/* Tronco */}
        <path d="M40,54 Q60,48 80,54 L86,120 Q60,128 34,120 Z" />
        {/* Braço esquerdo */}
        <path d="M40,58 L24,70 L18,128 L30,130 L40,80 Z" />
        {/* Braço direito */}
        <path d="M80,58 L96,70 L102,128 L90,130 L80,80 Z" />
        {/* Perna esquerda */}
        <path d="M40,118 L36,210 L50,210 L58,124 Z" />
        {/* Perna direita */}
        <path d="M80,118 L84,210 L70,210 L62,124 Z" />
        {/* Pés */}
        <path d="M34,208 L52,208 L52,220 L34,220 Z" />
        <path d="M68,208 L86,208 L86,220 L68,220 Z" />
      </g>
    </svg>
  )
}
