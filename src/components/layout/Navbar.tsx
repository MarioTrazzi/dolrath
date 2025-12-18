'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coins, Wallet } from 'lucide-react'
import { ethers } from 'ethers'

export function Navbar() {
  const { data: session, update } = useSession()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const router = useRouter()

  const [dolLoading, setDolLoading] = useState(false)
  const [dolBalance, setDolBalance] = useState<string | null>(null)
  const [dolSymbol, setDolSymbol] = useState<string | null>(null)

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
    } finally {
      setIsLinkingWallet(false)
    }
  }

  useEffect(() => {
    if (!session) {
      setDolLoading(false)
      setDolBalance(null)
      setDolSymbol(null)
      return
    }

    if (!walletAddress) {
      setDolLoading(false)
      setDolBalance(null)
      setDolSymbol(null)
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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl">⚔️</span>
            <span className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark">
              Dolrath
            </span>
          </Link>

          {/* Navigation Links - Desktop */}
          <div className="hidden md:flex items-center space-x-8">
            <Link 
              href="/character/create" 
              className="text-text-secondary hover:text-primary transition-colors"
              onClick={(e) => handleProtectedRoute(e, '/character/create')}
            >
              Criar Personagem
            </Link>
            <Link 
              href="/dungeons" 
              className="text-text-secondary hover:text-primary transition-colors"
              onClick={(e) => handleProtectedRoute(e, '/dungeons')}
            >
              Masmorras
            </Link>
            <Link 
              href="/combat-lobby" 
              className="text-text-secondary hover:text-primary transition-colors"
              onClick={(e) => handleProtectedRoute(e, '/combat-lobby')}
            >
              Combate
            </Link>
            <Link 
              href="/inventory" 
              className="text-text-secondary hover:text-primary transition-colors"
              onClick={(e) => handleProtectedRoute(e, '/inventory')}
            >
              Inventário
            </Link>
            <Link 
              href="/store" 
              className="text-text-secondary hover:text-primary transition-colors"
              onClick={(e) => handleProtectedRoute(e, '/store')}
            >
              Loja
            </Link>
            {session ? (
              <div className="flex items-center space-x-4">
                {/* DOL (on-chain) Display */}
                <div className="flex items-center gap-2 px-3 py-2 bg-surface/50 rounded-lg border border-yellow-500/30">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  <span className="text-yellow-400 font-semibold">
                    {walletAddress ? (
                      dolLoading ? (
                        '...'
                      ) : dolBalance ? (
                        `${dolBalance} ${dolSymbol || 'DOL'}`
                      ) : (
                        `0 ${dolSymbol || 'DOL'}`
                      )
                    ) : (
                      `— ${dolSymbol || 'DOL'}`
                    )}
                  </span>
                </div>

                {!walletAddress && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleLinkWallet}
                    disabled={isLinkingWallet}
                    className="bg-surface/50 border border-white/20 text-text-primary px-4 py-2 rounded-lg font-semibold shadow-lg hover:border-primary hover:text-primary transition-all inline-flex items-center gap-2"
                  >
                    <Wallet className="w-4 h-4" />
                    {isLinkingWallet ? 'Conectando...' : 'Conectar wallet'}
                  </motion.button>
                )}
                <Link href="/dashboard">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                  >
                    Dashboard
                  </motion.button>
                </Link>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSignOut}
                  className="bg-surface/50 border border-white/20 text-text-primary px-4 py-2 rounded-lg font-semibold shadow-lg hover:border-red-500 hover:text-red-500 transition-all"
                >
                  Sair
                </motion.button>
              </div>
            ) : (
              <Link href="/auth/login">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-surface/50 border border-white/20 text-text-primary px-4 py-2 rounded-lg font-semibold shadow-lg hover:border-primary hover:text-primary transition-all"
                >
                  Entrar
                </motion.button>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden text-text-primary hover:text-primary transition-colors"
          >
            <span className="text-2xl">{isMenuOpen ? '✕' : '☰'}</span>
          </motion.button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background/95 backdrop-blur-md border-b border-white/10"
          >
            <div className="px-4 py-4 space-y-4">
              <Link 
                href="/character/create" 
                className="block text-text-secondary hover:text-primary transition-colors py-2"
                onClick={(e) => {
                  handleProtectedRoute(e, '/character/create')
                  setIsMenuOpen(false)
                }}
              >
                Criar Personagem
              </Link>
              <Link 
                href="/dungeons" 
                className="block text-text-secondary hover:text-primary transition-colors py-2"
                onClick={(e) => {
                  handleProtectedRoute(e, '/dungeons')
                  setIsMenuOpen(false)
                }}
              >
                Masmorras
              </Link>
              <Link 
                href="/combat-lobby" 
                className="block text-text-secondary hover:text-primary transition-colors py-2"
                onClick={(e) => {
                  handleProtectedRoute(e, '/combat-lobby')
                  setIsMenuOpen(false)
                }}
              >
                Combate
              </Link>
              <Link 
                href="/inventory" 
                className="block text-text-secondary hover:text-primary transition-colors py-2"
                onClick={(e) => {
                  handleProtectedRoute(e, '/inventory')
                  setIsMenuOpen(false)
                }}
              >
                Inventário
              </Link>
              <Link 
                href="/store" 
                className="block text-text-secondary hover:text-primary transition-colors py-2"
                onClick={(e) => {
                  handleProtectedRoute(e, '/store')
                  setIsMenuOpen(false)
                }}
              >
                Loja
              </Link>
              {session ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 px-3 py-2 bg-surface/50 rounded-lg border border-yellow-500/30">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-yellow-500" />
                      <span className="text-yellow-400 font-semibold">
                        {walletAddress ? (
                          dolLoading ? (
                            '...'
                          ) : dolBalance ? (
                            `${dolBalance} ${dolSymbol || 'DOL'}`
                          ) : (
                            `0 ${dolSymbol || 'DOL'}`
                          )
                        ) : (
                          `— ${dolSymbol || 'DOL'}`
                        )}
                      </span>
                    </div>

                    {!walletAddress && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={async () => {
                          await handleLinkWallet()
                          setIsMenuOpen(false)
                        }}
                        disabled={isLinkingWallet}
                        className="bg-surface/50 border border-white/20 text-text-primary px-3 py-2 rounded-lg font-semibold shadow-lg hover:border-primary hover:text-primary transition-all inline-flex items-center gap-2"
                      >
                        <Wallet className="w-4 h-4" />
                        {isLinkingWallet ? 'Conectando...' : 'Conectar'}
                      </motion.button>
                    )}
                  </div>
                  <Link 
                    href="/dashboard"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-full bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                    >
                      Dashboard
                    </motion.button>
                  </Link>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSignOut}
                    className="w-full bg-surface/50 border border-white/20 text-text-primary px-4 py-2 rounded-lg font-semibold shadow-lg hover:border-red-500 hover:text-red-500 transition-all"
                  >
                    Sair
                  </motion.button>
                </div>
              ) : (
                <Link 
                  href="/auth/login"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full bg-surface/50 border border-white/20 text-text-primary px-4 py-2 rounded-lg font-semibold shadow-lg hover:border-primary hover:text-primary transition-all"
                  >
                    Entrar
                  </motion.button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
