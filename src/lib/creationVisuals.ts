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

// Nomes de exibição (PT) → tema visual, para resolver a identidade a
// partir dos traits da NFT (que guardam nomes, não ids).
const NAME_TO_THEME: Record<string, CreationTheme> = {
  humano: 'humano',
  draconiano: 'draconiano',
  metamorfo: 'metamorfo',
  elfo: 'elfo',
  guerreiro: 'warrior',
  ladino: 'rogue',
  mago: 'mage',
  monge: 'monk',
  warrior: 'warrior',
  rogue: 'rogue',
  mage: 'mage',
  monk: 'monk',
}

/** Resolve a definição visual a partir de um id OU de um nome de exibição */
export function resolveCreationVisual(idOrName?: string | null): CreationVisualDef {
  if (!idOrName) return FALLBACK
  const key = String(idOrName).toLowerCase().trim()
  const theme = NAME_TO_THEME[key]
  if (theme) return CREATION_VISUALS[theme]
  return CREATION_VISUALS[idOrName as CreationTheme] ?? FALLBACK
}

export interface BlendedVisual {
  raceVisual: CreationVisualDef
  classVisual: CreationVisualDef
  /** Tema do cenário animado de fundo (usa a raça) */
  backdropTheme: CreationTheme
  /** Gradiente diagonal misturando raça → classe */
  gradient: string
  /** Cor de borda combinada (raça) */
  borderColor: string
  /** Glow para box-shadow misturando raça + classe */
  glow: string
}

/**
 * Mescla as identidades visuais de raça e classe num único conjunto de
 * estilos (gradiente, borda e glow) usado nos cards e na ficha do dashboard.
 */
export function getBlendedVisual(
  raceIdOrName?: string | null,
  classIdOrName?: string | null
): BlendedVisual {
  const raceVisual = resolveCreationVisual(raceIdOrName)
  const classVisual = resolveCreationVisual(classIdOrName)
  return {
    raceVisual,
    classVisual,
    backdropTheme: raceVisual.theme,
    gradient: `linear-gradient(135deg, ${raceVisual.accent}, ${classVisual.accent})`,
    borderColor: raceVisual.accent,
    glow: `0 0 28px ${raceVisual.accentSoft}, 0 0 44px ${classVisual.accentSoft}`,
  }
}
