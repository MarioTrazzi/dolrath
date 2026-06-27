import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { verifyMessage } from 'ethers'
import {
  buildWalletLoginMessage,
  verifyChallengeHmac,
  WALLET_CHALLENGE_TTL_MS,
} from '@/lib/walletLogin'

export const { handlers: { GET, POST }, auth } = NextAuth({
  providers: [
    // Wallet-only login (SIWE-style). The client requests a challenge from
    // /api/auth/wallet/challenge, signs the message, and submits it here.
    CredentialsProvider({
      id: 'wallet',
      name: 'wallet',
      credentials: {
        address: { label: 'Address', type: 'text' },
        message: { label: 'Message', type: 'text' },
        signature: { label: 'Signature', type: 'text' },
        nonce: { label: 'Nonce', type: 'text' },
        issuedAt: { label: 'IssuedAt', type: 'text' },
        hmac: { label: 'Hmac', type: 'text' },
      },
      async authorize(credentials) {
        const address = (credentials?.address as string | undefined)?.toLowerCase()
        const message = credentials?.message as string | undefined
        const signature = credentials?.signature as string | undefined
        const nonce = credentials?.nonce as string | undefined
        const hmac = credentials?.hmac as string | undefined
        const issuedAt = Number(credentials?.issuedAt)

        if (!address || !message || !signature || !nonce || !hmac || !issuedAt) {
          console.log('❌ Wallet login: campos faltando')
          return null
        }

        // 1) The challenge must be one we issued (HMAC) and still valid.
        if (!verifyChallengeHmac({ address, nonce, issuedAt, hmac })) {
          console.log('❌ Wallet login: HMAC inválido')
          return null
        }
        if (Date.now() - issuedAt > WALLET_CHALLENGE_TTL_MS) {
          console.log('❌ Wallet login: challenge expirado')
          return null
        }

        // 2) The signed message must match exactly what we expect.
        const expectedMessage = buildWalletLoginMessage({ address, nonce, issuedAt })
        if (message !== expectedMessage) {
          console.log('❌ Wallet login: mensagem adulterada')
          return null
        }

        // 3) The signature must recover to the claimed address.
        let recovered: string
        try {
          recovered = verifyMessage(message, signature)
        } catch {
          console.log('❌ Wallet login: assinatura inválida')
          return null
        }
        if (recovered.toLowerCase() !== address) {
          console.log('❌ Wallet login: assinatura não corresponde ao endereço')
          return null
        }

        // 4) Find-or-create the user by wallet address.
        try {
          const { prisma } = await import('@/lib/prisma')
          let user = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: { id: true, email: true, name: true, walletAddress: true },
          })

          if (!user) {
            user = await prisma.user.create({
              data: {
                walletAddress: address,
                walletLinkedAt: new Date(),
                name: `${address.slice(0, 6)}…${address.slice(-4)}`,
              },
              select: { id: true, email: true, name: true, walletAddress: true },
            })
            console.log('✅ Usuário criado via carteira:', address)
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: null,
          }
        } catch (error) {
          console.error('❌ Erro no login por carteira:', error)
          return null
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, `user.id` comes straight from authorize().
      if (user?.id) {
        token.userId = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        const { prisma } = await import('@/lib/prisma')
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { id: true, email: true, name: true, walletAddress: true },
        })

        if (dbUser) {
          session.user.id = dbUser.id
          session.user.email = dbUser.email ?? ''
          session.user.name = dbUser.name ?? ''
          session.user.walletAddress = dbUser.walletAddress ?? null
        }
      }
      return session
    },
  },
})
