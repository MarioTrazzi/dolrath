'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Coins, Wallet, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { getWalletTxErrorMessage } from '@/lib/walletErrors'
import { claimGoldOnChain } from '@/lib/goldClaimClient'
import { BdoWindow, GOLD_BRIGHT, BEVEL_BTN_CLASS, BEVEL_COLOR_BTN_CLASS, BEVEL_VARIANTS } from '@/components/crafting/bdoTheme'

type GoldStatus = {
  walletLinked: boolean
  walletAddress: string | null
  offchainBalance: number
  claimable: number
  pending:
    | {
        amount: number
        nonce: number
        deadline: string
        expired: boolean
        txHash: string | null
      }
    | null
}

type TokenBalance = {
  walletLinked: boolean
  walletAddress?: string
  formatted?: string
  symbol?: string
  decimals?: number
  raw?: string
  error?: string
}

export default function WalletPage() {
  const { data: session, status, update } = useSession()

  const [goldStatus, setGoldStatus] = useState<GoldStatus | null>(null)
  const [goldOnchain, setGoldOnchain] = useState<TokenBalance | null>(null)
  const [dolOnchain, setDolOnchain] = useState<TokenBalance | null>(null)

  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)

  const [email, setEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)

  const walletAddress = (session?.user as any)?.walletAddress as string | undefined
  const currentEmail = (session?.user as any)?.email as string | undefined

  const canClaim = useMemo(() => {
    if (!goldStatus) return false
    if (!goldStatus.walletLinked) return false
    if (goldStatus.claimable > 0) return true
    if (goldStatus.pending && !goldStatus.pending.expired) return true
    return false
  }, [goldStatus])

  const refresh = async () => {
    if (!session?.user?.id) return

    setLoading(true)
    try {
      const [goldStatusRes, goldBalRes, dolBalRes] = await Promise.all([
        fetch('/api/gold/status', { cache: 'no-store' }),
        fetch('/api/wallet/gold-balance', { cache: 'no-store' }),
        fetch('/api/wallet/dol-balance', { cache: 'no-store' }),
      ])

      const [goldStatusJson, goldBalJson, dolBalJson] = await Promise.all([
        goldStatusRes.json(),
        goldBalRes.json(),
        dolBalRes.json(),
      ])

      if (goldStatusRes.ok) setGoldStatus(goldStatusJson)
      else setGoldStatus(null)

      setGoldOnchain(goldBalJson)
      setDolOnchain(dolBalJson)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status !== 'authenticated') {
      setGoldStatus(null)
      setGoldOnchain(null)
      setDolOnchain(null)
      return
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, walletAddress])

  const handleClaim = async () => {
    if (!session?.user?.id) {
      toast.error('Faça login para continuar')
      return
    }

    if (!goldStatus?.walletLinked || !goldStatus.walletAddress) {
      toast.error('Conecte sua wallet primeiro')
      return
    }

    setClaiming(true)
    try {
      await claimGoldOnChain((msg) => toast.success(msg))
      toast.success('GOLD claimado on-chain!')
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : getWalletTxErrorMessage(e)
      toast.error(msg)
    } finally {
      setClaiming(false)
    }
  }

  const handleSaveEmail = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      toast.error('Digite um email')
      return
    }

    setSavingEmail(true)
    try {
      const res = await fetch('/api/profile/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || 'Falha ao salvar email')
      }
      await update?.()
      setEmail('')
      toast.success('Email salvo! Você receberá novidades do Dolrath.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar email')
    } finally {
      setSavingEmail(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-24">
        <div className="text-[#8a8a90]">Carregando…</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-24" style={{ fontFamily: "'Barlow', sans-serif" }}>
        <BdoWindow icon={<Wallet size={16} />} title="Wallet" bodyClassName="p-6">
          <p className="text-[#8a8a90]">Você precisa estar logado.</p>
          <Link
            href="/auth/login"
            className={`${BEVEL_COLOR_BTN_CLASS} inline-flex mt-4 px-4 py-2`}
            style={BEVEL_VARIANTS.gold}
          >
            Entrar
          </Link>
        </BdoWindow>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-16" style={{ fontFamily: "'Barlow', sans-serif" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#ece7da]" style={{ letterSpacing: '0.5px' }}>Wallet</h1>
          <p className="text-[#8a8a90] mt-1">
            Veja seu saldo on-chain e faça claim do GOLD acumulado.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={`${BEVEL_BTN_CLASS} px-4 py-2 disabled:opacity-50`}
        >
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <BdoWindow icon={<Coins size={16} />} title="DOL (on-chain)" bodyClassName="p-5">
          <div className="font-semibold tabular-nums" style={{ color: GOLD_BRIGHT }}>
            {dolOnchain?.walletLinked ? (
              dolOnchain?.formatted ? `${dolOnchain.formatted} ${dolOnchain.symbol || 'DOL'}` : '…'
            ) : (
              '—'
            )}
          </div>
          {!walletAddress && (
            <div className="text-[#8a8a90] text-sm mt-2 inline-flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Conecte sua wallet para ver o saldo.
            </div>
          )}
        </BdoWindow>

        <BdoWindow icon={<Coins size={16} />} title="GOLD" bodyClassName="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[3px] border border-black/60 bg-[#19191c] p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#77777d]">On-chain</div>
              <div className="font-semibold tabular-nums mt-1" style={{ color: GOLD_BRIGHT }}>
                {goldOnchain?.walletLinked ? (
                  goldOnchain?.formatted ? `${goldOnchain.formatted} ${goldOnchain.symbol || 'GOLD'}` : '…'
                ) : (
                  '—'
                )}
              </div>
            </div>

            <div className="rounded-[3px] border border-black/60 bg-[#19191c] p-4">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#77777d]">Pode dar claim</div>
              <div className="font-semibold tabular-nums mt-1" style={{ color: GOLD_BRIGHT }}>
                {goldStatus ? `${goldStatus.claimable} GOLD` : '…'}
              </div>
              {goldStatus?.pending && !goldStatus.pending.expired && (
                <div className="text-[#8a8a90] text-xs mt-2">
                  Claim pendente: {goldStatus.pending.amount} GOLD (expira em{' '}
                  {new Date(goldStatus.pending.deadline).toLocaleString()})
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleClaim}
              disabled={!canClaim || claiming}
              className={`${BEVEL_COLOR_BTN_CLASS} px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40`}
              style={BEVEL_VARIANTS.gold}
            >
              {claiming ? 'Claimando…' : 'Claim GOLD'}
            </button>

            {!walletAddress && (
              <div className="text-[#8a8a90] text-sm">
                Conecte sua wallet para claimar.
              </div>
            )}
          </div>
        </BdoWindow>

        {/* Optional: add an email later (newsletter / account recovery) */}
        <BdoWindow icon={<Mail size={16} />} title="Receber novidades" bodyClassName="p-5">
          {currentEmail ? (
            <p className="text-[#8a8a90] text-sm">
              Email cadastrado: <span className="text-[#ece7da]">{currentEmail}</span>
            </p>
          ) : (
            <>
              <p className="text-[#8a8a90] text-sm">
                Opcional. Adicione um email para receber novidades do Dolrath e poder
                recuperar sua conta.
              </p>
              <div className="mt-3 flex flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="min-w-0 flex-1 rounded-[3px] border border-[#3c3c41] bg-[#101013] px-3 py-2 text-[#ece7da] placeholder:text-[#57575c] outline-none transition-colors focus:border-[#8a6d3b]"
                />
                <button
                  onClick={handleSaveEmail}
                  disabled={savingEmail}
                  className={`${BEVEL_COLOR_BTN_CLASS} px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40`}
                  style={BEVEL_VARIANTS.gold}
                >
                  {savingEmail ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </>
          )}
        </BdoWindow>
      </div>
    </div>
  )
}
