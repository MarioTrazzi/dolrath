import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter, Cinzel, Cinzel_Decorative } from 'next/font/google'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { DragAndDropProvider } from '@/components/providers/DragAndDropProvider'
import { GoldProvider } from '@/components/providers/GoldProvider'
import { ActiveCharacterProvider } from '@/components/providers/ActiveCharacterProvider'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from 'react-hot-toast'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

// ⛏️ Fontes do Mapa do Reino (Coleta): títulos gravados no pergaminho.
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-cinzel',
  display: 'swap',
})
const cinzelDecorative = Cinzel_Decorative({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-cinzel-dec',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BDI — Black Dolrath Idle',
  description: 'RPG idle de fantasia sombria on-chain: rolagens de dado, masmorras, PvP e relíquias NFT.',
  icons: { icon: '/logo-bdi-icon.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${cinzel.variable} ${cinzelDecorative.variable}`}>
      <body className="bg-background text-text-primary min-h-[100dvh] font-primary">
        <AuthProvider>
          <GoldProvider>
            <ActiveCharacterProvider>
              <DragAndDropProvider>
                <AppShell>{children}</AppShell>
              </DragAndDropProvider>
            </ActiveCharacterProvider>
          </GoldProvider>
        </AuthProvider>
        <Toaster
          position="top-right"
          containerStyle={{ top: 72 }}
          toastOptions={{
            duration: 3000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#4ade80',
                secondary: '#fff',
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  )
} 