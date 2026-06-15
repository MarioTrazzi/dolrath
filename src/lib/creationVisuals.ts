// ============================================================
// Identidade visual de Raças e Classes (tela de Criação)
// - Cada raça/classe tem cor de destaque (accent) + tema de cenário
//   animado (CreationCardBackdrop), no mesmo estilo dos cards da loja
//   e das masmorras.
// ============================================================

export type CreationTheme =
  // raças
  | 'draconiano' | 'metamorfo' | 'humano' | 'elfo'
  // classes
  | 'warrior' | 'rogue' | 'mage' | 'monk'

export interface CreationVisualDef {
  theme: CreationTheme
  emoji: string
  /** Cor de destaque (hex) para bordas/brilhos/botões */
  accent: string
  /** Versão suave (rgba) para sombras/glow */
  accentSoft: string
  /** Texto Tailwind para chips/realces */
  chipText: string
  /** Fundo Tailwind para chips */
  chipBg: string
}

export const CREATION_VISUALS: Record<CreationTheme, CreationVisualDef> = {
  // ---------- Raças ----------
  draconiano: {
    theme: 'draconiano',
    emoji: '🐉',
    accent: '#ef4444',
    accentSoft: 'rgba(239,68,68,0.35)',
    chipText: 'text-red-300',
    chipBg: 'bg-red-500/20',
  },
  metamorfo: {
    theme: 'metamorfo',
    emoji: '🐺',
    accent: '#22c55e',
    accentSoft: 'rgba(34,197,94,0.35)',
    chipText: 'text-emerald-300',
    chipBg: 'bg-emerald-500/20',
  },
  humano: {
    theme: 'humano',
    emoji: '⚔️',
    accent: '#f59e0b',
    accentSoft: 'rgba(245,158,11,0.4)',
    chipText: 'text-amber-300',
    chipBg: 'bg-amber-500/20',
  },
  elfo: {
    theme: 'elfo',
    emoji: '🧝',
    accent: '#22d3ee',
    accentSoft: 'rgba(34,211,238,0.35)',
    chipText: 'text-cyan-300',
    chipBg: 'bg-cyan-500/20',
  },
  // ---------- Classes ----------
  warrior: {
    theme: 'warrior',
    emoji: '⚔️',
    accent: '#ef4444',
    accentSoft: 'rgba(239,68,68,0.35)',
    chipText: 'text-red-300',
    chipBg: 'bg-red-500/20',
  },
  rogue: {
    theme: 'rogue',
    emoji: '🏹',
    accent: '#10b981',
    accentSoft: 'rgba(16,185,129,0.35)',
    chipText: 'text-emerald-300',
    chipBg: 'bg-emerald-500/20',
  },
  mage: {
    theme: 'mage',
    emoji: '🧙',
    accent: '#a855f7',
    accentSoft: 'rgba(168,85,247,0.35)',
    chipText: 'text-purple-300',
    chipBg: 'bg-purple-500/20',
  },
  monk: {
    theme: 'monk',
    emoji: '✊',
    accent: '#f59e0b',
    accentSoft: 'rgba(245,158,11,0.4)',
    chipText: 'text-amber-300',
    chipBg: 'bg-amber-500/20',
  },
}

const FALLBACK: CreationVisualDef = {
  theme: 'humano',
  emoji: '✨',
  accent: '#a855f7',
  accentSoft: 'rgba(168,85,247,0.35)',
  chipText: 'text-purple-300',
  chipBg: 'bg-purple-500/20',
}

/** Resolve a definição visual a partir do id de raça/classe */
export function getCreationVisual(id?: string | null): CreationVisualDef {
  if (!id) return FALLBACK
  return CREATION_VISUALS[id as CreationTheme] ?? FALLBACK
}
