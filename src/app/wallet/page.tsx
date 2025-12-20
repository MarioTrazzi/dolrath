'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Coins, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { ethers } from 'ethers'

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

const GOLD_CLAIM_ABI = [
  'function claimWithSig(address to, uint256 amount, uint256 nonce, uint256 deadline, bytes signature)',
] as const

export default function WalletPage() {
  const { data: session, status } = useSession()

  const [goldStatus, setGoldStatus] = useState<GoldStatus | null>(null)
  const [goldOnchain, setGoldOnchain] = useState<TokenBalance | null>(null)
  const [dolOnchain, setDolOnchain] = useState<TokenBalance | null>(null)

  const [loading, setLoading] = useState(false)
  const [claiming, setClaiming] = useState(false)

  const walletAddress = (session?.user as any)?.walletAddress as string | undefined

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

    const eth = (window as any)?.ethereum
    if (!eth) {
      toast.error('MetaMask não encontrada')
      return
    }

    setClaiming(true)
    try {
      const intentRes = await fetch('/api/gold/claim-intent', { method: 'POST' })
      const intentJson = await intentRes.json()
      if (!intentRes.ok) {
        throw new Error(intentJson?.error || 'Falha ao criar claim')
      }

      const {
        contractAddress,
        chainId,
        to,
        amountWei,
        nonce,
        deadline,
        signature,
      } = intentJson as {
        contractAddress: string
        chainId: number
        to: string
        amountWei: string
        nonce: string
        deadline: string
        signature: string
      }

      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])

      const network = await provider.getNetwork()
      if (Number(network.chainId) !== Number(chainId)) {
        toast.error(`Troque a rede para chainId ${chainId} na MetaMask`)
        return
      }

      const signer = await provider.getSigner()
      const contract = new ethers.Contract(contractAddress, GOLD_CLAIM_ABI, signer)

      const tx = await contract.claimWithSig(to, amountWei, nonce, deadline, signature)
      toast.success('Transação enviada! Aguardando confirmação…')

      const receipt = await tx.wait()
      if (!receipt || receipt.status !== 1) {
        throw new Error('Transação falhou')
      }

      const confirmRes = await fetch('/api/gold/claim-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash: tx.hash }),
      })
      const confirmJson = await confirmRes.json()
      if (!confirmRes.ok) {
        throw new Error(confirmJson?.error || 'Falha ao confirmar claim')
      }

      toast.success('GOLD claimado on-chain!')
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao claimar'
      toast.error(msg)
    } finally {
      setClaiming(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-24">
        <div className="text-text-secondary">Carregando…</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-24">
        <div className="bg-surface/50 border border-white/10 rounded-xl p-6">
          <h1 className="text-2xl font-bold text-text-primary">Wallet</h1>
          <p className="text-text-secondary mt-2">Você precisa estar logado.</p>
          <Link
            href="/auth/login"
            className="inline-flex mt-4 bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2 rounded-lg font-semibold"
          >
            Entrar
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Wallet</h1>
          <p className="text-text-secondary mt-1">
            Veja seu saldo on-chain e faça claim do GOLD acumulado.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="bg-surface/50 border border-white/20 text-text-primary px-4 py-2 rounded-lg font-semibold hover:border-primary hover:text-primary transition-all"
        >
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <div className="bg-surface/50 border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 text-text-primary font-semibold">
            <Coins className="w-4 h-4 text-yellow-500" />
            DOL (on-chain)
          </div>
          <div className="mt-2 text-yellow-400 font-semibold">
            {dolOnchain?.walletLinked ? (
              dolOnchain?.formatted ? `${dolOnchain.formatted} ${dolOnchain.symbol || 'DOL'}` : '…'
            ) : (
              '—'
            )}
          </div>
          {!walletAddress && (
            <div className="text-text-secondary text-sm mt-2 inline-flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Conecte sua wallet para ver o saldo.
            </div>
          )}
        </div>

        <div className="bg-surface/50 border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 text-text-primary font-semibold">
            <Coins className="w-4 h-4 text-yellow-500" />
            GOLD
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div className="border border-white/10 rounded-lg p-4">
              <div className="text-text-secondary text-sm">On-chain</div>
              <div className="text-yellow-400 font-semibold mt-1">
                {goldOnchain?.walletLinked ? (
                  goldOnchain?.formatted ? `${goldOnchain.formatted} ${goldOnchain.symbol || 'GOLD'}` : '…'
                ) : (
                  '—'
                )}
              </div>
            </div>

            <div className="border border-white/10 rounded-lg p-4">
              <div className="text-text-secondary text-sm">Pode dar claim</div>
              <div className="text-yellow-400 font-semibold mt-1">
                {goldStatus ? `${goldStatus.claimable} GOLD` : '…'}
              </div>
              {goldStatus?.pending && !goldStatus.pending.expired && (
                <div className="text-text-secondary text-xs mt-2">
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
              className="bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {claiming ? 'Claimando…' : 'Claim GOLD'}
            </button>

            {!walletAddress && (
              <div className="text-text-secondary text-sm">
                Conecte sua wallet para claimar.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
