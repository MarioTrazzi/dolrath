'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/I18nProvider'
import toast from 'react-hot-toast'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'
import { claimGoldOnChain } from '@/lib/goldClaimClient'
import { getChainInfo } from '@/lib/chainConfig'

interface CharWallet { id: string; name: string; class: string; gold: number }

// 🏦 COFRE DA CONTA + claim de GOLD. O cofre (User.goldBalance) é o caixa
// COMPARTILHADO entre todos os personagens: um herói deposita o que tem no
// bolso, outro saca — é assim que o ouro viaja de um personagem pro outro sem
// passar pela blockchain (sem gas, instantâneo).
//
// ⛓️ Claim de GOLD: o Baú Geral também representa a CARTEIRA on-chain do jogador.
// "Reivindicar" move o ouro do herói (Character.gold) para o banco da conta
// (User.goldBalance) e em seguida minta o token GOLD on-chain via claimWithSig
// (assinatura EIP-712 do servidor; o jogador assina o tx e paga o gas). É assim
// que se saca o ouro ganho nas runs e no PvP. "Sacar" continua existindo para
// devolver saldo do banco ao herói (habilita compras off-chain). [[bank — Opção B]]
//
// `characterId` (opcional): quando informado, o painel opera SÓ sobre o herói
// ativo — sabe-se de quem é o ouro, então mostramos apenas as ações dele.
export default function BankPanel({ characterId, onChanged }: { characterId?: string | null; onChanged?: () => void }) {
  const t = useT()
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
      toast.error(t('Enter a valid amount.'))
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
        toast.error(data?.error || t('Failed to move the gold'))
        return
      }
      setAmounts((p) => ({ ...p, [charId]: '' }))
      refreshActiveCharacter()

      toast(t('⛓️ Confirm the claim in MetaMask to receive the GOLD on-chain…'))
      try {
        const { amount: minted } = await claimGoldOnChain((msg) => toast.success(msg))
        toast.success(t('⛓️ {n} GOLD claimed on-chain!', { n: minted }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('On-chain claim failed'))
        toast(t('🏦 The gold stayed reserved in the bank — try claiming again in a few minutes.'))
      }
      finishOp()
    } catch {
      toast.error(t('Connection error.'))
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
      toast.success(t('⛓️ {n} GOLD claimed on-chain!', { n: minted }))
      finishOp()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('On-chain claim failed'))
    } finally {
      setBusy(false)
    }
  }

  // 🏦 Cofre da conta ↔ bolso do herói (off-chain, sem gas). Depositar com um
  // personagem e sacar com outro é o caminho oficial pra mover ouro entre heróis.
  const move = async (charId: string, op: 'deposit' | 'withdraw') => {
    const amount = Math.floor(Number(amounts[charId] || 0))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('Enter a valid amount.'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/bank/${op}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: charId, amount }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || (op === 'deposit' ? t('Failed to deposit') : t('Failed to withdraw')))
        return
      }
      toast.success(data?.message || t('Done!'))
      setAmounts((p) => ({ ...p, [charId]: '' }))
      if (typeof data?.bankGold === 'number') setBankGold(data.bankGold)
      finishOp()
    } catch {
      toast.error(t('Connection error.'))
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
          <span style={{ color: '#c9a25f' }}>🏦</span> {t('Account Vault')}
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
        <b className="text-[#c9c9ce]">{t('Deposit')}</b>
        {t(' stores the hero gold in the account vault and ')}
        <b className="text-[#c9c9ce]">{t('Withdraw')}</b>
        {t(' returns it to ')}<i>{t('any')}</i>
        {t(' character of yours — this is how you pass gold from one hero to another (no gas, instantly).')}
      </p>
      <p className="text-xs text-[#8a8a90] mb-2">
        <b className="text-[#c9c9ce]">{t('Claim')}</b>
        {t(' turns the hero gold into ')}
        <b className="text-[#c9c9ce]">{t('GOLD on-chain')}</b>
        {t(' in your wallet — this is how you cash out what you earned in dungeons and PvP (you sign the transaction and pay the gas). The gold in the hero hand is for ')}
        <b className="text-[#c9c9ce]">{t('buying')}</b>
        {t(' at the blacksmith/alchemist.')}
      </p>
      {!walletLinked && (
        <p className="text-xs mb-2" style={{ color: '#e09a3a' }}>{t('⚠️ Link your wallet in the panel to claim GOLD on-chain.')}</p>
      )}
      {walletLinked && (
        <p className="text-xs mb-2 flex items-start gap-1" style={{ color: '#8a8a90' }}>
          <span style={{ color: '#c9a25f' }}>⛽</span>
          <span>
            {t('Claiming is a transaction on {chain} — you need a bit of ', { chain: getChainInfo().name })}{' '}
            <b className="text-[#c9c9ce]">{t('POL')}</b>
            {t(' in the wallet for the network fee (gas). ')}
            {getChainInfo().isMainnet
              ? t('You buy POL on any exchange and send it to your wallet.')
              : t('Get test POL from the official Polygon faucet.')}
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3 rounded-[3px] border px-3 py-2" style={{ borderColor: '#8a6d3b', background: 'linear-gradient(180deg, rgba(58,51,37,0.7), rgba(36,31,22,0.7))' }}>
        <span className="text-xs" style={{ color: '#e7c682' }}>
          🏦 <b className="tabular-nums">{bankGold ?? '…'}</b>
          {t(' 🪙 in the vault — shared by all your characters')}
        </span>
        {hasBankGold && (
          <button
            onClick={claimBank}
            disabled={busy || !walletLinked}
            className="ml-auto rounded-[3px] border px-3 py-1 text-xs font-semibold text-emerald-200 transition-all hover:brightness-125 disabled:opacity-40"
            style={{ borderColor: '#2f6b3a', background: 'linear-gradient(180deg, #25351f, #161f12)' }}
          >
            {t('⛓️ Claim vault balance')}
          </button>
        )}
      </div>

      {(() => {
        // Com herói ativo definido, opera só sobre ele; senão, lista todos (fallback).
        const visibleChars = characterId ? chars.filter((c) => c.id === characterId) : chars
        return visibleChars.length === 0 ? (
        <p className="text-sm text-[#8a8a90]">{t('No character.')}</p>
      ) : (
        <div className="space-y-2">
          {visibleChars.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-[3px] border border-black/60 bg-[#19191c] p-3">
              <div className="flex-1 min-w-[140px]">
                <div className="font-semibold text-[#ece7da]">{c.name} <span className="text-xs text-[#8a8a90]">({c.class})</span></div>
                <div className="text-sm tabular-nums" style={{ color: '#e7c682' }}>{t('{n} 🪙 on hand', { n: c.gold })}</div>
              </div>
              <input
                type="number" min={1} placeholder={t('amount')}
                value={amounts[c.id] || ''}
                onChange={(e) => setAmounts((p) => ({ ...p, [c.id]: e.target.value }))}
                className="w-28 rounded-[3px] border border-[#3c3c41] bg-[#101013] px-2 py-1.5 text-sm text-[#ece7da] outline-none transition-colors focus:border-[#8a6d3b]"
              />
              <button
                onClick={() => move(c.id, 'deposit')}
                disabled={busy || c.gold <= 0}
                title={t('Character → account vault (another hero can withdraw later)')}
                className="rounded-[3px] border px-3 py-1.5 text-sm font-semibold transition-all hover:brightness-125 disabled:opacity-40"
                style={{ borderColor: '#8a6d3b', background: 'linear-gradient(180deg, #3a3325, #241f16)', color: '#e7c682' }}
              >
                {t('↑ Deposit')}
              </button>
              <button
                onClick={() => move(c.id, 'withdraw')}
                disabled={busy || !hasBankGold}
                title={t('Account vault → character (enables buying at the blacksmith/alchemist)')}
                className="rounded-[3px] border px-3 py-1.5 text-sm font-semibold transition-all hover:brightness-125 disabled:opacity-40"
                style={{ borderColor: '#8a6d3b', background: 'linear-gradient(180deg, #3a3325, #241f16)', color: '#e7c682' }}
              >
                {t('↓ Withdraw')}
              </button>
              <button
                onClick={() => claim(c.id)}
                disabled={busy || !walletLinked}
                title={t('Character → GOLD on-chain in your wallet (signature + gas)')}
                className="rounded-[3px] border px-3 py-1.5 text-sm font-semibold text-emerald-200 transition-all hover:brightness-125 disabled:opacity-40"
                style={{ borderColor: '#2f6b3a', background: 'linear-gradient(180deg, #25351f, #161f12)' }}
              >
                {t('⛓️ Claim GOLD')}
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
