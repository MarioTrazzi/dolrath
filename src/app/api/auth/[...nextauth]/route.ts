import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

export const { handlers: { GET, POST }, auth } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        params: {
          scope: 'openid email profile',
        },
      },
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        
        try {
          const { prisma } = await import('@/lib/prisma')
          
          // Buscar usuário no banco
          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string }
          })
          
          if (!user || !user.password) {
            console.log('❌ Usuário não encontrado ou sem senha:', credentials.email)
            return null
          }
          
          // Verificar senha com bcrypt
          const isValidPassword = await bcrypt.compare(
            credentials.password as string, 
            user.password
          )
          
          if (!isValidPassword) {
            console.log('❌ Senha inválida para:', credentials.email)
            return null
          }
          
          console.log('✅ Login bem-sucedido:', credentials.email)
          
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: null
          }
        } catch (error) {
          console.error('❌ Erro na autenticação:', error)
          return null
        }
      }
    })
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error'
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        const { prisma } = await import('@/lib/prisma')
        const email = user.email ?? '';
        
        let dbUser = await prisma.user.findUnique({ 
          where: { email },
          select: { id: true, email: true, name: true, walletAddress: true }
        })

        // Only create user automatically for OAuth providers (Google)
        // For credentials, user must already exist from registration
        if (!dbUser && account?.provider === 'google' && email) {
          dbUser = await prisma.user.create({
            data: {
              email,
              name: user.name ?? email.split('@')[0],
            },
            select: { id: true, email: true, name: true, walletAddress: true }
          })
          console.log('✅ Usuário Google criado automaticamente:', email)
        }

        if (dbUser) {
          token.userId = dbUser.id
          token.email = dbUser.email
          token.name = dbUser.name
          token.walletAddress = dbUser.walletAddress
          console.log('✅ Token JWT configurado para usuário:', {
            id: dbUser.id,
            email: dbUser.email
          })
        } else {
          console.log('❌ Usuário não encontrado no banco para token:', email)
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string
        session.user.email = token.email as string
        session.user.name = token.name as string

        // Keep wallet state in sync with DB (e.g. after linking).
        try {
          const { prisma } = await import('@/lib/prisma')
          const dbUser = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { walletAddress: true },
          })
          session.user.walletAddress = dbUser?.walletAddress ?? null
        } catch {
          session.user.walletAddress = (token.walletAddress as string | null | undefined) ?? null
        }

        console.log('✅ Sessão configurada:', {
          userId: session.user.id,
          email: session.user.email
        })
      } else {
        console.log('❌ Problema na configuração da sessão:', {
          hasSessionUser: !!session.user,
          hasTokenUserId: !!token.userId,
          tokenUserId: token.userId
        })
      }
      return session
    }
  }
});