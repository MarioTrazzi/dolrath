// Fundo atmosférico compartilhado pelo app (handoff Claude Design).
// Mesma identidade da landing — céu noturno de fantasia sombria —, porém
// discreto para não competir com o conteúdo das telas internas.
// Fixo atrás de tudo (-z-10), sem interação.
export function AppBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* gradiente base noturno */}
      <div className="absolute inset-0 bg-gradient-to-b from-secondary via-background to-background" />
      {/* glow roxo (lua/magia) */}
      <div
        className="absolute -top-48 left-1/2 -translate-x-1/2 w-[70rem] h-[42rem] rounded-full blur-3xl"
        style={{ background: 'rgba(147,51,234,0.12)' }}
      />
      {/* glow primário (brasa da arena) */}
      <div
        className="absolute -bottom-48 -right-40 w-[42rem] h-[42rem] rounded-full blur-3xl"
        style={{ background: 'rgba(233,69,96,0.10)' }}
      />
    </div>
  )
}
