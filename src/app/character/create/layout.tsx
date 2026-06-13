import CreationBackdrop from '@/components/character/CreationBackdrop'

// Layout da rota de criação de personagem: injeta o cenário arcano
// animado atrás de qualquer estado da página (loading, login,
// carteira, pagamento, formulário) sem precisar repetir em cada return.
export default function CreateCharacterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed inset-0 z-0">
        <CreationBackdrop />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  )
}
