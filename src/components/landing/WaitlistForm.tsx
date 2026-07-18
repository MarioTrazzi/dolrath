'use client'

import { useState } from 'react'
import { Mail, CheckCircle2, Loader2 } from 'lucide-react'

// Pré-registro do lançamento mainnet. Quem entra ganha um título cosmético no
// go-live. Compacto de propósito: um input + botão, no visual chumbo+ouro.
export default function WaitlistForm({ source = 'landing', compact = false }: { source?: string; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state === 'sending' || state === 'done') return
    setState('sending')
    setMessage('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      })
      const json = await res.json().catch(() => null)
      if (res.ok) {
        setState('done')
        setMessage('Você está na lista! Avisaremos no lançamento — quem se inscreve antes ganha um título exclusivo.')
      } else {
        setState('error')
        setMessage(json?.error || 'Não foi possível registrar agora. Tente de novo.')
      }
    } catch {
      setState('error')
      setMessage('Não foi possível registrar agora. Tente de novo.')
    }
  }

  if (state === 'done') {
    return (
      <div className="flex items-start gap-2 text-sm text-emerald-300/90 max-w-sm">
        <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
        <span>{message}</span>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className={`flex flex-col gap-2 ${compact ? 'max-w-sm' : 'max-w-md'} w-full`}>
      {!compact && (
        <span className="text-sm font-semibold text-amber-300/90">
          ⚔️ Entre na lista do lançamento — inscritos ganham um título exclusivo
        </span>
      )}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`waitlist-email-${source}`}>Email</label>
        <div className="relative flex-1">
          <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-textsec/60" />
          <input
            id={`waitlist-email-${source}`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-textsec/50 focus:border-amber-300/50 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={state === 'sending'}
          className="shrink-0 rounded-lg border border-amber-300/40 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-400/20 transition-colors disabled:opacity-60"
        >
          {state === 'sending' ? <Loader2 size={16} className="animate-spin" /> : 'Quero jogar'}
        </button>
      </div>
      {state === 'error' && <span className="text-xs text-red-400">{message}</span>}
    </form>
  )
}
