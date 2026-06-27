'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import { ethers } from 'ethers'
import { getWalletTxErrorMessage } from '@/lib/walletErrors'

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleWalletLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const eth = (window as any)?.ethereum
      if (!eth) {
        throw new Error('MetaMask não encontrada. Instale/ative a extensão para continuar.')
      }

      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const address = (await signer.getAddress()).toLowerCase()

      // 1) Get a challenge from the server.
      const challengeRes = await fetch('/api/auth/wallet/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      const challenge = await challengeRes.json()
      if (!challengeRes.ok) {
        throw new Error(challenge?.error || 'Falha ao iniciar login')
      }

      const { message, nonce, issuedAt, hmac } = challenge as {
        message: string
        nonce: string
        issuedAt: number
        hmac: string
      }

      // 2) Sign it (free, no transaction).
      const signature = await signer.signMessage(message)

      // 3) Submit to NextAuth.
      const result = await signIn('wallet', {
        address,
        message,
        signature,
        nonce,
        issuedAt: String(issuedAt),
        hmac,
        redirect: false,
      })

      if (result?.error) {
        setError('Não foi possível validar sua carteira. Tente novamente.')
      } else {
        window.location.href = '/dashboard'
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : getWalletTxErrorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="glass-card p-8"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="w-16 h-16 bg-gradient-to-r from-primary to-primary-dark rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <span className="text-2xl font-bold text-white">⚔️</span>
        </motion.div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Bem-vindo ao Dolrath
        </h1>
        <p className="text-text-secondary">
          Conecte sua carteira para entrar na arena
        </p>
      </div>

      {/* Wallet Login Button */}
      <button
        type="button"
        onClick={handleWalletLogin}
        disabled={isLoading}
        className="w-full h-12 flex items-center justify-center gap-3 text-base font-semibold bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Wallet className="w-5 h-5" />
        {isLoading ? 'Conectando…' : 'Conectar carteira'}
      </button>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 bg-error/10 border border-error/20 rounded-lg p-3"
        >
          <p className="text-sm text-error">{error}</p>
        </motion.div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-text-secondary text-sm">
          Não tem uma carteira?{' '}
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-dark font-medium transition-colors"
          >
            Instalar MetaMask
          </a>
        </p>
        <p className="text-text-secondary text-xs mt-3">
          Sua primeira conexão cria sua conta automaticamente. Você pode adicionar
          um email depois, nas configurações, para receber novidades.
        </p>
      </div>
    </motion.div>
  )
}
