'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Coins } from 'lucide-react'
import { useGold } from '@/components/providers/GoldProvider'

export function Navbar() {
  const { data: session } = useSession()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { goldBalance } = useGold()
  const router = useRouter()

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
                {/* Gold Display */}
                {goldBalance !== null && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-surface/50 rounded-lg border border-yellow-500/30">
                    <Coins className="w-4 h-4 text-yellow-500" />
                    <span className="text-yellow-400 font-semibold">{goldBalance}</span>
                  </div>
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
