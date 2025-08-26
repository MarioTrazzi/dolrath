'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

const CAROUSEL_IMAGES = [
  { 
    bgColor: 'from-blue-900 to-purple-900',
    title: 'O Mundo de Dolrath',
    description: 'Um vasto mundo de fantasia para explorar'
  },
  { 
    bgColor: 'from-red-900 to-orange-900',
    title: 'Batalhas Épicas',
    description: 'Enfrente inimigos em combates estratégicos'
  },
  { 
    bgColor: 'from-green-900 to-teal-900',
    title: 'Masmorras Misteriosas',
    description: 'Descubra segredos em dungeons únicas'
  },
  { 
    bgColor: 'from-purple-900 to-pink-900',
    title: 'Personagens Únicos',
    description: 'Crie e desenvolva seu herói'
  }
]

const GAME_FEATURES = [
  {
    title: 'Combate Dinâmico',
    description: 'Sistema de combate por turnos com mecânicas únicas e estratégicas',
    icon: '⚔️'
  },
  {
    title: 'Masmorras Desafiadoras',
    description: 'Explore dungeons geradas proceduralmente com tesouros e perigos',
    icon: '🏰'
  },
  {
    title: 'Progressão Profunda',
    description: 'Desenvolva seu personagem com classes, habilidades e equipamentos únicos',
    icon: '📈'
  },
]

export default function Home() {
  const { data: session, status } = useSession()
  const [currentImage, setCurrentImage] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % CAROUSEL_IMAGES.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <>
      <div className="min-h-screen bg-background text-text-primary">
        {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative h-screen flex flex-col items-center justify-center text-center p-8"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="relative w-full h-full">
            {CAROUSEL_IMAGES.map((slide, index) => (
              <motion.div
                key={slide.title}
                initial={{ opacity: 0 }}
                animate={{ opacity: index === currentImage ? 1 : 0 }}
                transition={{ duration: 1 }}
                className="absolute inset-0"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${slide.bgColor}`} />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="text-center">
                    <h3 className="text-3xl font-bold text-white mb-2">{slide.title}</h3>
                    <p className="text-xl text-white/80">{slide.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

       
      </motion.div>

      {/* Features Section */}
      <motion.section
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="py-16 px-8 bg-surface/50"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark">
            Características do Jogo
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {GAME_FEATURES.map((feature) => (
              <motion.div
                key={feature.title}
                whileHover={{ scale: 1.05 }}
                className="bg-surface/30 backdrop-blur-sm p-6 rounded-lg border border-white/10"
              >
                <span className="text-4xl mb-4 block">{feature.icon}</span>
                <h3 className="text-xl font-bold mb-2 text-primary">{feature.title}</h3>
                <p className="text-text-secondary">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="flex flex-col items-center space-y-4 w-full max-w-sm mx-auto py-16"
      >
        {status === 'loading' ? (
          <div className="bg-surface/50 backdrop-blur-sm rounded-lg p-4 text-center text-text-secondary">
            Carregando sessão...
          </div>
        ) : session ? (
          <Link href="/dashboard" passHref>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-4 rounded-lg text-lg font-bold shadow-lg hover:shadow-xl transition-all"
            >
              Ir para o Dashboard
            </motion.button>
          </Link>
        ) : (
          <>
            <Link href="/character/create" passHref>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-4 rounded-lg text-lg font-bold shadow-lg hover:shadow-xl transition-all"
              >
                Criar Novo Personagem
              </motion.button>
            </Link>
            <Link href="/auth/login" passHref>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full bg-surface/50 border border-white/20 text-text-primary py-4 rounded-lg text-lg font-bold shadow-lg hover:border-primary hover:text-primary transition-all"
              >
                Entrar
              </motion.button>
            </Link>
          </>
        )}
      </motion.div>
    </div>
    </>
  )
}