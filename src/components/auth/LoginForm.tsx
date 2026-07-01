'use client'

// ============================================================
// DOLRATH — Login por carteira (SIWE-style)
// Fluxo: challenge HMAC → assinatura gratuita → signIn('wallet').
// Visual segue o design system da landing (ui.tsx + glass-card).
// ============================================================

import { useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import Link from 'next/link'
import { Wallet, Swords, ArrowRight, Scroll, PenLine } from 'lucide-react'
import { motion } from 'framer-motion'
import { ethers } from 'ethers'
import { getWalletTxErrorMessage } from '@/lib/walletErrors'
import { Button, GlassCard, Badge, D20 } from '@/components/landing/ui'

// Etapas do fluxo — viram feedback visual no botão e na lista de passos.
type LoginStep = 'idle' | 'connect' | 'sign' | 'verify'

const STEP_LABEL: Record<Exclude<LoginStep, 'idle'>, string> = {
  connect: 'Abrindo a carteira…',
  sign: 'Aguardando sua assinatura…',
  verify: 'Validando e entrando…',
}

const STEPS: { key: Exclude<LoginStep, 'idle'>; Icon: typeof Wallet; title: string; desc: string }[] = [
  { key: 'connect', Icon: Wallet, title: 'Conecte a carteira', desc: 'MetaMask ou compatível — sem cadastro, sem senha.' },
  { key: 'sign', Icon: PenLine, title: 'Assine a mensagem', desc: 'Assinatura gratuita: prova que a carteira é sua. Nenhuma transação é enviada.' },
  { key: 'verify', Icon: Swords, title: 'Entre na arena', desc: 'Primeira vez? Sua conta é criada na hora, vinculada à carteira.' },
]

export function LoginForm() {
  const { data: session } = useSession()
  const [step, setStep] = useState<LoginStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const isLoading = step !== 'idle'

  const handleWalletLogin = async () => {
    setError(null)

    try {
      setStep('connect')
      const eth = (window as any)?.ethereum
      if (!eth) {
        throw new Error('MetaMask não encontrada. Instale/ative a extensão para continuar.')
      }

      const provider = new ethers.BrowserProvider(eth)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const address = (await signer.getAddress()).toLowerCase()

      // 1) Challenge do servidor (HMAC, sem escrita no DB).
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

      // 2) Assinatura gratuita (nenhuma transação).
      setStep('sign')
      const signature = await signer.signMessage(message)

      // 3) Submete ao NextAuth.
      setStep('verify')
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
        setStep('idle')
      } else {
        // Reload completo: garante que SessionProvider, GoldProvider e
        // ActiveCharacterProvider partam já com a sessão nova.
        window.location.href = '/dashboard'
      }
    } catch (e) {
      setError(getWalletTxErrorMessage(e, 'Não foi possível conectar. Tente novamente.'))
      setStep('idle')
    }
  }

  return (
    <GlassCard className="relative p-8 sm:p-10">
      {/* Emblema d20 + título */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 16 }}
          className="flex justify-center mb-5"
        >
          <D20 size={84} value={20} />
        </motion.div>
        <Badge tone="primary" icon={<Scroll size={13} />} className="mb-4">
          RPG on-chain · NFT
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold text-white text-balance">
          Entre em{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
            Dolrath
          </span>
        </h1>
        <p className="mt-3 text-textsec text-pretty">
          Sua carteira é sua conta. Conecte, assine de graça e role seu primeiro d20.
        </p>
      </div>

      {session ? (
        // Já logado: nada de pedir assinatura de novo — segue pro jogo.
        <div className="flex flex-col gap-3">
          <Button as="a" href="/dashboard" size="lg" className="w-full" icon={<Swords size={18} />}>
            Continuar como {session.user?.name || 'aventureiro'}
          </Button>
          <p className="text-center text-xs text-textsec">
            Você já está conectado. Para trocar de carteira, saia primeiro.
          </p>
        </div>
      ) : (
        <>
          {/* Passos do fluxo — o passo ativo acende durante o login */}
          <ol className="flex flex-col gap-3 mb-8">
            {STEPS.map((s, i) => {
              const active = step === s.key
              return (
                <li
                  key={s.key}
                  className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                    active ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      active
                        ? 'border-primary/50 bg-primary/20 text-primary'
                        : 'border-white/10 bg-white/5 text-textsec'
                    }`}
                  >
                    <s.Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-combat text-[10px] text-primary/80">0{i + 1}</span>
                      <h2 className="text-sm font-semibold text-white">{s.title}</h2>
                    </div>
                    <p className="text-xs text-textsec leading-relaxed">{s.desc}</p>
                  </div>
                </li>
              )
            })}
          </ol>

          <Button
            size="lg"
            className="w-full"
            onClick={handleWalletLogin}
            disabled={isLoading}
            icon={<Wallet size={18} />}
            iconRight={isLoading ? undefined : <ArrowRight size={16} />}
          >
            {isLoading ? STEP_LABEL[step as Exclude<LoginStep, 'idle'>] : 'Conectar Carteira'}
          </Button>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-lg border border-error/30 bg-error/10 p-3"
              role="alert"
            >
              <p className="text-sm text-error">{error}</p>
            </motion.div>
          )}

          <div className="mt-8 flex flex-col gap-2 text-center">
            <p className="text-sm text-textsec">
              Não tem uma carteira?{' '}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary transition-colors hover:text-primary-dark"
              >
                Instalar MetaMask
              </a>
            </p>
            <p className="text-xs text-textsec/70 text-pretty">
              Você pode adicionar um email depois, nas configurações, para receber novidades.
            </p>
          </div>
        </>
      )}

      <div className="mt-8 border-t border-white/5 pt-4 text-center">
        <Link href="/" className="text-xs text-textsec transition-colors hover:text-white">
          ← Voltar para a página inicial
        </Link>
      </div>
    </GlassCard>
  )
}
