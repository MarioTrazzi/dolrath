import './globals.css'
import type { Metadata } from 'next'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { DragAndDropProvider } from '@/components/providers/DragAndDropProvider'
import { GoldProvider } from '@/components/providers/GoldProvider'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Dolrath RPG - Sistema de Combate Tokenizado',
  description: 'RPG com IA como juiz automático e sistema de tokenização',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-background text-text-primary min-h-screen font-primary">
        <AuthProvider>
          <GoldProvider>
            <DragAndDropProvider>
              <AppShell>{children}</AppShell>
            </DragAndDropProvider>
          </GoldProvider>
        </AuthProvider>
        <Toaster
          position="top-right"
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