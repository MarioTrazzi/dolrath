'use client'

// Chips compactos de status vital + poder total, reaproveitados no card do
// dashboard e no seletor de personagem ("card de switch") das páginas de
// Coleta e Fazenda. "Poder total" = soma bruta str+def+int+agi (mesma leitura
// simples usada nos sims de balance) — não é o poder ponderado por classe do
// combatModel, só um resumo rápido para comparar personagens no card.

export interface CharacterVitals {
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  stamina: number
  maxStamina: number
  power: number
}

export function computePower(baseStats: any): number {
  if (!baseStats) return 0
  const str = Number(baseStats.str) || 0
  const def = Number(baseStats.def) || 0
  const int = Number(baseStats.int) || 0
  const agi = Number(baseStats.agi) || 0
  return str + def + int + agi
}

function Chip({ emoji, value, max, tone }: { emoji: string; value: number; max?: number; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${tone}`}>
      {emoji} {Math.round(value)}
      {typeof max === 'number' ? <span className="opacity-60">/{Math.round(max)}</span> : null}
    </span>
  )
}

export function CharacterStatChips({
  vitals,
  size = 'sm',
}: {
  vitals: CharacterVitals
  size?: 'sm' | 'xs'
}) {
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-[11px]'
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${textSize} text-white/70`}>
      <Chip emoji="❤️" value={vitals.hp} max={vitals.maxHp} tone="text-red-300/90" />
      <Chip emoji="🔮" value={vitals.mp} max={vitals.maxMp} tone="text-blue-300/90" />
      <Chip emoji="⚡" value={vitals.stamina} max={vitals.maxStamina} tone="text-amber-300/90" />
      <Chip emoji="💪" value={vitals.power} tone="text-fuchsia-300/90" />
    </div>
  )
}
