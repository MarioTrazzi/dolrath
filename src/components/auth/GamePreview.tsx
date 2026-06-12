'use client'

import { motion } from 'framer-motion'
import { Sword, Shield, Zap, Star } from 'lucide-react'
import { D20 } from '@/components/landing/ui'

export function GamePreview() {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Céu da arena (mesmo do hero da landing) */}
      <div className="absolute inset-0 arena-sky">
        {/* lua */}
        <div
          className="absolute top-[14%] right-[14%] w-24 h-24 rounded-full"
          style={{
            background: 'radial-gradient(circle at 38% 35%, #fef3c7, #fde68a 55%, #f5d57a)',
            boxShadow: '0 0 60px 18px rgba(253,230,138,0.35), 0 0 140px 60px rgba(253,230,138,0.12)',
          }}
        />
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Floating Elements */}
      <motion.div
        animate={{
          y: [0, -20, 0],
          rotate: [0, 5, 0]
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-20 left-20 text-primary/30"
      >
        <Sword className="w-16 h-16" />
      </motion.div>

      <motion.div
        animate={{
          y: [0, 20, 0],
          rotate: [0, -5, 0]
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1
        }}
        className="absolute top-40 right-20 text-primary/20"
      >
        <Shield className="w-12 h-12" />
      </motion.div>

      <motion.div
        animate={{
          y: [0, -15, 0],
          scale: [1, 1.1, 1]
        }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2
        }}
        className="absolute bottom-40 left-32 text-primary/25"
      >
        <Zap className="w-14 h-14" />
      </motion.div>

      {/* Main Content */}
      <div className="relative z-10 text-center px-8">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mb-8"
        >
          <div className="mx-auto mb-6 flex items-center justify-center">
            <D20 size={128} value={20} />
          </div>
          <h1 className="text-5xl font-bold text-text-primary mb-4 font-game">
            DOLRATH
          </h1>
          <p className="text-xl text-text-secondary max-w-md mx-auto">
            Entre na arena e prove seu valor em batalhas épicas
          </p>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto"
        >
          {[
            {
              icon: <Sword className="w-8 h-8" />,
              title: "Combate Épico",
              description: "Sistema de combate por turnos estratégico"
            },
            {
              icon: <Shield className="w-8 h-8" />,
              title: "Dungeons Únicos",
              description: "Explore masmorras geradas dinamicamente"
            },
            {
              icon: <Star className="w-8 h-8" />,
              title: "Progressão",
              description: "Evolua seu personagem com habilidades únicas"
            }
          ].map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1.2 + index * 0.1 }}
              className="glass-card p-6 text-center"
            >
              <div className="text-primary mb-3 flex justify-center">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-text-secondary">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.5 }}
          className="mt-12"
        >
          <div className="inline-flex items-center space-x-2 bg-primary/10 border border-primary/20 rounded-full px-6 py-3">
            <Star className="w-5 h-5 text-primary" />
            <span className="text-text-primary font-medium">
              Mais de 10.000 guerreiros já entraram na arena
            </span>
          </div>
        </motion.div>
      </div>

      {/* Particle Effects */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-primary/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -100],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>
    </div>
  )
} 