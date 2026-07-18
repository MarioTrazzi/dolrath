import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Casca comum das páginas legais (chumbo+ouro, pergaminho escuro). PÚBLICA.
export default function LegalShell({
  title,
  updatedAt,
  children,
}: {
  title: string
  updatedAt: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#0b0d12] text-slate-200">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-amber-300/80 hover:text-amber-200 transition-colors mb-8"
        >
          <ArrowLeft size={15} /> Voltar
        </Link>
        <h1 className="text-3xl font-bold text-white mb-1">{title}</h1>
        <p className="text-xs text-slate-500 mb-8">Última atualização: {updatedAt}</p>
        <div className="prose-legal flex flex-col gap-5 text-[15px] leading-relaxed text-slate-300">
          {children}
        </div>
        <footer className="mt-14 pt-6 border-t border-white/10 text-xs text-slate-500 flex flex-wrap gap-4">
          <Link href="/terms" className="hover:text-slate-300">Termos de Uso</Link>
          <Link href="/privacy" className="hover:text-slate-300">Privacidade</Link>
          <Link href="/disclaimer" className="hover:text-slate-300">Aviso de Risco</Link>
          <span className="ml-auto">© 2026 BDI — Black Dolrath Idle</span>
        </footer>
      </div>
    </div>
  )
}

export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-amber-200/90">{heading}</h2>
      {children}
    </section>
  )
}
