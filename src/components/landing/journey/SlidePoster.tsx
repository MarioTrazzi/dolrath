'use client'

// Placeholder leve exibido enquanto o chunk do slide carrega
// (os slides pesados — BattleScene, DungeonMap — entram via next/dynamic).

export interface SlideMeta {
  n: number
  emoji: string
  label: string
  sub: string
}

export default function SlidePoster({ meta }: { meta: SlideMeta }) {
  return (
    <div className="relative h-full w-full grid place-items-center overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 30%, rgba(233,69,96,0.08), transparent 70%), radial-gradient(70% 50% at 50% 100%, rgba(124,58,237,0.1), transparent 65%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-3 text-center px-6">
        <span className="text-5xl animate-pulse">{meta.emoji}</span>
        <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary/80">
          Etapa {meta.n}
        </span>
        <span className="text-lg font-bold text-white">{meta.label}</span>
        <span className="text-xs text-textsec">{meta.sub}</span>
      </div>
    </div>
  )
}
