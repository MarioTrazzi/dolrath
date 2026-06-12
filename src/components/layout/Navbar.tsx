'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coins, Wallet, LogOut, Menu, X } from 'lucide-react'
import { ethers } from 'ethers'
import toast from 'react-hot-toast'
import { getWalletTxErrorMessage } from '@/lib/walletErrors'

// Estilos de botão alinhados ao design system da landing (src/components/landing/ui.tsx)
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] transition-all'
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-surface/60 border border-white/10 text-white hover:border-white/20 hover:bg-surface/80 active:scale-[0.98] transition-all'
const NAV_LINK =
  'px-4 py-2 rounded-lg text-sm font-medium text-textsec hover:text-white hover:bg-white/5 transition-colors'
const NAV_LINK_MOBILE =
  'block px-4 py-3 rounded-lg text-sm font-medium text-textsec hover:text-white hover:bg-white/5 transition-colors'
const WALLET_CHIP =
  'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:border-primary/40 transition-all'

const NAV_ITEMS = [
  { label: 'Criar Personagem', href: '/character/create' },
  { label: 'Masmorras', href: '/dungeons' },
  { label: 'Combate', href: '/combat-lobby' },
  { label: 'Inventário', href: '/inventory' },
  { label: 'Loja', href: '/store' },
]

export function Navbar() {
  const { data: session, update } = useSession()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const router = useRouter()

  const [dolLoading, setDolLoading] = useState(false)
  const [dolBalance, setDolBalance] = useState<string | null>(null)
  const [dolSymbol, setDolSymbol] = useState<string | null>(null)

  const [goldLoading, setGoldLoading] = useState(false)
  const [goldBalance, setGoldBalance] = useState<string | null>(null)
  const [goldSymbol, setGoldSymbol] = useState<string | null>(null)

  const [isLinkingWallet, setIsLinkingWallet] = useState(false)

  const walletAddress = session?.user?.walletAddress

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }

  const handleProtectedRoute = (e: React.MouseEvent, path: string) => {
    e.preventDefault()
    if (!session) {
      router.push('/auth/login')
    } else {
      router.push(path)
    }
  }

  const handleLinkWallet = async () => {
    setIsLinkingWallet(true)
    try {
      const eth = (window as any)?.ethereum
      if (!eth) {
        throw new Error('MetaMask não encontrada. Instale/ative a extensão para continuar.')
      }

      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()

      const nonceRes = await fetch('/api/wallet/nonce', { method: 'POST' })
      const nonceJson = await nonceRes.json()
      if (!nonceRes.ok) {
        throw new Error(nonceJson?.error || 'Falha ao obter nonce')
      }

      const message = nonceJson?.message
      if (!message || typeof message !== 'string') {
        throw new Error('Resposta inválida ao obter nonce')
      }

      const signature = await signer.signMessage(message)

      const linkRes = await fetch('/api/wallet/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      })
      const linkJson = await linkRes.json()
      if (!linkRes.ok) {
        throw new Error(linkJson?.error || 'Falha ao vincular carteira')
      }

      await update?.()
      toast.success('Carteira vinculada com sucesso!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : getWalletTxErrorMessage(e))
    } finally {
      setIsLinkingWallet(false)
    }
  }

  useEffect(() => {
    if (!session) {
      setDolLoading(false)
      setDolBalance(null)
      setDolSymbol(null)

      setGoldLoading(false)
      setGoldBalance(null)
      setGoldSymbol(null)
      return
    }

    if (!walletAddress) {
      setDolLoading(false)
      setDolBalance(null)
      setDolSymbol(null)

      setGoldLoading(false)
      setGoldBalance(null)
      setGoldSymbol(null)
      return
    }

    setDolLoading(true)
    fetch('/api/wallet/dol-balance')
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json?.error || 'Falha ao buscar saldo on-chain')
        }
        if (json?.walletLinked && typeof json?.formatted === 'string') {
          setDolBalance(json.formatted)
          setDolSymbol(typeof json?.symbol === 'string' ? json.symbol : 'DOL')
        } else {
          setDolBalance(null)
          setDolSymbol(null)
        }
      })
      .catch(() => {
        setDolBalance(null)
        setDolSymbol('DOL')
      })
      .finally(() => setDolLoading(false))
  }, [session, walletAddress])

  useEffect(() => {
    setGoldLoading(true)
    fetch('/api/wallet/gold-balance', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Falha ao buscar saldo on-chain')

        if (json?.walletLinked && typeof json?.formatted === 'string') {
          setGoldBalance(json.formatted)
          setGoldSymbol(typeof json?.symbol === 'string' ? json.symbol : 'GOLD')
        } else {
          setGoldBalance(null)
          setGoldSymbol('GOLD')
        }
      })
      .catch(() => {
        setGoldBalance(null)
        setGoldSymbol('GOLD')
      })
      .finally(() => setGoldLoading(false))
  }, [session, walletAddress])

  // Texto formatado dos saldos on-chain (DOL/GOLD), reutilizado em desktop e mobile
  const dolText = walletAddress
    ? dolLoading
      ? '...'
      : `${dolBalance ?? '0'} ${dolSymbol || 'DOL'}`
    : `— ${dolSymbol || 'DOL'}`

  const goldText = walletAddress
    ? goldLoading
      ? '...'
      : `${goldBalance ?? '0'} ${goldSymbol || 'GOLD'}`
    : `— ${goldSymbol || 'GOLD'}`

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6" aria-label="Navegação principal">
        <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-secondary/70 backdrop-blur-xl px-4 sm:px-6 py-3 shadow-2xl shadow-black/20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl" aria-hidden="true">⚔️</span>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
              Dolrath
            </span>
          </Link>

          {/* Navigation Links - Desktop */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={NAV_LINK}
                onClick={(e) => handleProtectedRoute(e, item.href)}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right cluster */}
          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <>
                {/* DOL (on-chain) */}
                <Link href="/wallet" className={WALLET_CHIP} title="Abrir Wallet">
                  <Coins className="w-4 h-4 text-warning" />
                  <span className="font-combat text-sm text-warning">{dolText}</span>
                </Link>

                {/* GOLD (on-chain) */}
                <Link href="/wallet" className={WALLET_CHIP} title="Abrir Wallet">
                  <Coins className="w-4 h-4 text-warning" />
                  <span className="font-combat text-sm text-warning">{goldText}</span>
                </Link>

                {!walletAddress && (
                  <button
                    onClick={handleLinkWallet}
                    disabled={isLinkingWallet}
                    className={`${BTN_SECONDARY} disabled:opacity-60`}
                  >
                    <Wallet className="w-4 h-4" />
                    {isLinkingWallet ? 'Conectando...' : 'Conectar wallet'}
                  </button>
                )}

                <Link href="/dashboard" className={BTN_PRIMARY}>
                  Dashboard
                </Link>

                <button onClick={handleSignOut} className={BTN_SECONDARY} title="Sair">
                  <LogOut className="w-4 h-4" />
                  <span className="sr-only sm:not-sr-only">Sair</span>
                </button>
              </>
            ) : (
              <Link href="/auth/login" className={BTN_PRIMARY}>
                <Wallet className="w-4 h-4" />
                Entrar
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            className="lg:hidden p-2 rounded-lg text-white hover:bg-white/5 transition-colors"
          >
            {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="lg:hidden mt-2 rounded-2xl border border-white/10 bg-secondary/90 backdrop-blur-xl p-3 shadow-2xl"
            >
              <div className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={NAV_LINK_MOBILE}
                    onClick={(e) => {
                      handleProtectedRoute(e, item.href)
                      setIsMenuOpen(false)
                    }}
                  >
                    {item.label}
                  </Link>
                ))}

                <div className="my-2 h-px bg-white/10" />

                {session ? (
                  <div className="flex flex-col gap-2">
                    <Link
                      href="/wallet"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Coins className="w-4 h-4 text-warning" />
                        <span className="font-combat text-sm text-warning">{dolText}</span>
                      </span>
                      <span className="font-combat text-sm text-warning">{goldText}</span>
                    </Link>

                    {!walletAddress && (
                      <button
                        onClick={async () => {
                          await handleLinkWallet()
                          setIsMenuOpen(false)
                        }}
                        disabled={isLinkingWallet}
                        className={`${BTN_SECONDARY} w-full disabled:opacity-60`}
                      >
                        <Wallet className="w-4 h-4" />
                        {isLinkingWallet ? 'Conectando...' : 'Conectar wallet'}
                      </button>
                    )}

                    <Link
                      href="/dashboard"
                      onClick={() => setIsMenuOpen(false)}
                      className={`${BTN_PRIMARY} w-full`}
                    >
                      Dashboard
                    </Link>

                    <button
                      onClick={handleSignOut}
                      className={`${BTN_SECONDARY} w-full`}
                    >
                      <LogOut className="w-4 h-4" />
                      Sair
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/auth/login"
                    onClick={() => setIsMenuOpen(false)}
                    className={`${BTN_PRIMARY} w-full`}
                  >
                    <Wallet className="w-4 h-4" />
                    Entrar
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  )
}
