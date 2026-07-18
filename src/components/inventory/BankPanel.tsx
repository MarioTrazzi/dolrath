'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'
import { claimGoldOnChain } from '@/lib/goldClaimClient'
import { getChainInfo } from '@/lib/chainConfig'

interface CharWallet { id: string; name: string; class: string; gold: number }

// ⛓️ Claim de GOLD: o Baú Geral agora representa a CARTEIRA on-chain do jogador.
// "Reivindicar" move o ouro do herói (Character.gold) para o banco da conta
// (User.goldBalance) e em seguida minta o token GOLD on-chain via claimWithSig
// (assinatura EIP-712 do servidor; o jogador assina o tx e paga o gas). É assim
// que se saca o ouro ganho nas runs e no PvP. "Sacar" continua existindo para
// devolver saldo do banco ao herói (habilita compras off-chain). [[bank — Opção B]]
//
// `characterId` (opcional): quando informado, o painel opera SÓ sobre o herói
// ativo — sabe-se de quem é o ouro, então mostramos apenas as ações dele.
export default function BankPanel({ characterId, onChanged }: { characterId?: string | null; onChanged?: () => void }) {
  const [bankGold, setBankGold] = useState<number | null>(null)
  const [chars, setChars] = useState<CharWallet[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  // Saldo GOLD on-chain (o "Baú" de verdade) — null enquanto carrega/sem carteira.
  const [onchainGold, setOnchainGold] = useState<string | null>(null)
  const [walletLinked, setWalletLinked] = useState<boolean>(true)
  // Claim/sacar muda Character.gold; o gold da navbar vem do herói ativo do
  // provider, então recarregamos a lista global para refletir o novo saldo.
  const { refresh: refreshActiveCharacter } = useActiveCharacter()

  const load = useCallback(async () => {
    try {
      const [bankRes, goldRes] = await Promise.all([
        fetch('/api/bank/status'),
        fetch('/api/wallet/gold-balance', { cache: 'no-store' }),
      ])
      if (bankRes.ok) {
        const data = await bankRes.json()
        setBankGold(Number(data?.bankGold ?? 0))
        setChars(Array.isArray(data?.characters) ? data.characters : [])
      }
      if (goldRes.ok) {
        const data = await goldRes.json()
        setWalletLinked(Boolean(data?.walletLinked))
        const n = Number(data?.formatted)
        setOnchainGold(data?.walletLinked && Number.isFinite(n) ? n.toLocaleString('pt-BR') : null)
      }
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => { load() }, [load])

  const finishOp = () => {
    load()
    refreshActiveCharacter()
    onChanged?.()
  }

  // ⛓️ Reivindicar: bolso do herói → banco (off-chain) → mint on-chain do saldo
  // do banco inteiro. Se o jogador cancelar o tx, o valor fica reservado como
  // claim pendente (expira em ~15 min e volta ao banco sozinho).
  const claim = async (charId: string) => {
    const amount = Math.floor(Number(amounts[charId] || 0))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe uma quantia válida.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/bank/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: charId, amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Falha ao mover o ouro')
        return
      }
      setAmounts((p) => ({ ...p, [charId]: '' }))
      refreshActiveCharacter()

      toast('⛓️ Confirme o claim na MetaMask para receber o GOLD on-chain…')
      try {
        const { amount: minted } = await claimGoldOnChain((msg) => toast.success(msg))
        toast.success(`⛓️ ${minted} GOLD reivindicado on-chain!`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Falha no claim on-chain')
        toast('🏦 O ouro ficou reservado no banco — tente reivindicar de novo em alguns minutos.')
      }
      finishOp()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setBusy(false)
    }
  }

  // ⛓️ Claim do saldo que já está no banco (sem passar pelo bolso de um herói) —
  // cobre ouro legado de vendas no Baú Geral e claims que expiraram.
  const claimBank = async () => {
    setBusy(true)
    try {
      const { amount: minted } = await claimGoldOnChain((msg) => toast.success(msg))
      toast.success(`⛓️ ${minted} GOLD reivindicado on-chain!`)
      finishOp()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no claim on-chain')
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (charId: string) => {
    const amount = Math.floor(Number(amounts[charId] || 0))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe uma quantia válida.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/bank/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: charId, amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || 'Falha ao sacar')
        return
      }
      toast.success(data?.message || 'Pronto!')
      setAmounts((p) => ({ ...p, [charId]: '' }))
      if (typeof data?.bankGold === 'number') setBankGold(data.bankGold)
      finishOp()
    } catch {
      toast.error('Erro de conexão.')
    } finally {
      setBusy(false)
    }
  }

  const hasBankGold = (bankGold ?? 0) > 0

  return (
    <div
      className="mb-6 overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60"
      style={{ background: 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))' }}
    >
      {/* Barra de título em bisel (mesma das demais janelas chumbo+ouro) */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
        style={{ background: 'linear-gradient(180deg, #2b2b2f, #1a1a1d)', borderBottom: '1px solid rgba(0,0,0,0.7)' }}
      >
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-wide text-[#dcdce0]">
          <span style={{ color: '#c9a25f' }}>⛓️</span> Reivindicar GOLD
        </h2>
        <div className="text-right">
          <span className="mr-2 text-[11px] uppercase tracking-[0.14em] text-[#77777d]">on-chain</span>
          <span className="text-lg font-black tabular-nums" style={{ color: '#e7c682' }}>
            {walletLinked ? (onchainGold ?? '…') : '—'} <span className="text-xs font-bold">GOLD</span>
          </span>
        </div>
      </div>

      <div className="p-5">
      <p className="text-xs text-[#8a8a90] mb-2">
        <b className="text-[#c9c9ce]">Reivindicar</b> transforma o ouro do herói em token <b className="text-[#c9c9ce]">GOLD on-chain</b> na sua carteira —
        é assim que você saca o que ganhou nas masmorras e no PvP (você assina a transação e paga o gas).
        O ouro na mão do herói serve para <b className="text-[#c9c9ce]">comprar</b> no ferreiro/alquimista.
      </p>
      {!walletLinked && (
        <p className="text-xs mb-2" style={{ color: '#e09a3a' }}>⚠️ Vincule sua carteira no painel para reivindicar GOLD on-chain.</p>
      )}
      {walletLinked && (
        <p className="text-xs mb-2 flex items-start gap-1" style={{ color: '#8a8a90' }}>
          <span style={{ color: '#c9a25f' }}>⛽</span>
          <span>
            Reivindicar é uma transação na {getChainInfo().name} — você precisa de um pouco de{' '}
            <b className="text-[#c9c9ce]">POL</b> na carteira para a taxa de rede (gas).{' '}
            {getChainInfo().isMainnet
              ? 'Você compra POL em qualquer corretora e envia para sua carteira.'
              : 'Pegue POL de teste no faucet oficial da Polygon.'}
          </span>
        </p>
      )}
      {hasBankGold && (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-[3px] border px-3 py-2" style={{ borderColor: '#8a6d3b', background: 'linear-gradient(180deg, rgba(58,51,37,0.7), rgba(36,31,22,0.7))' }}>
          <span className="text-xs" style={{ color: '#e7c682' }}>
            🏦 {bankGold} 🪙 no banco aguardando claim
          </span>
          <button
            onClick={claimBank}
            disabled={busy || !walletLinked}
            className="ml-auto rounded-[3px] border px-3 py-1 text-xs font-semibold text-emerald-200 transition-all hover:brightness-125 disabled:opacity-40"
            style={{ borderColor: '#2f6b3a', background: 'linear-gradient(180deg, #25351f, #161f12)' }}
          >
            ⛓️ Reivindicar saldo do banco
          </button>
        </div>
      )}

      {(() => {
        // Com herói ativo definido, opera só sobre ele; senão, lista todos (fallback).
        const visibleChars = characterId ? chars.filter((c) => c.id === characterId) : chars
        return visibleChars.length === 0 ? (
        <p className="text-sm text-[#8a8a90]">Nenhum personagem.</p>
      ) : (
        <div className="space-y-2">
          {visibleChars.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-[3px] border border-black/60 bg-[#19191c] p-3">
              <div className="flex-1 min-w-[140px]">
                <div className="font-semibold text-[#ece7da]">{c.name} <span className="text-xs text-[#8a8a90]">({c.class})</span></div>
                <div className="text-sm tabular-nums" style={{ color: '#e7c682' }}>{c.gold} 🪙 na mão</div>
              </div>
              <input
                type="number" min={1} placeholder="quantia"
                value={amounts[c.id] || ''}
                onChange={(e) => setAmounts((p) => ({ ...p, [c.id]: e.target.value }))}
                className="w-28 rounded-[3px] border border-[#3c3c41] bg-[#101013] px-2 py-1.5 text-sm text-[#ece7da] outline-none transition-colors focus:border-[#8a6d3b]"
              />
              {hasBankGold && (
                <button
                  onClick={() => withdraw(c.id)}
                  disabled={busy}
                  title="Banco → personagem (habilita compras off-chain)"
                  className="rounded-[3px] border px-3 py-1.5 text-sm font-semibold transition-all hover:brightness-125 disabled:opacity-40"
                  style={{ borderColor: '#8a6d3b', background: 'linear-gradient(180deg, #3a3325, #241f16)', color: '#e7c682' }}
                >
                  ↓ Sacar
                </button>
              )}
              <button
                onClick={() => claim(c.id)}
                disabled={busy || !walletLinked}
                title="Personagem → GOLD on-chain na sua carteira (assinatura + gas)"
                className="rounded-[3px] border px-3 py-1.5 text-sm font-semibold text-emerald-200 transition-all hover:brightness-125 disabled:opacity-40"
                style={{ borderColor: '#2f6b3a', background: 'linear-gradient(180deg, #25351f, #161f12)' }}
              >
                ⛓️ Reivindicar GOLD
              </button>
            </div>
          ))}
        </div>
      )
      })()}
      </div>
    </div>
  )
}
