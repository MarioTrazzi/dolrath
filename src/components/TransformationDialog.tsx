'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface TransformationDialogProps {
  isOpen: boolean
  onClose: () => void
  characterRace: string
  onTransform: (transformationType: string) => void
  loading?: boolean
}

interface TransformationOption {
  type: string
  name: string
  emoji: string
  description: string
  cost: { mp: number; stamina: number }
}

const TRANSFORMATION_OPTIONS: Record<string, TransformationOption[]> = {
  'draconiano': [
    {
      type: 'dragon',
      name: 'Forma de Dragão',
      emoji: '🐉',
      description: 'Transformação ancestral que aumenta drasticamente força e resistência',
      cost: { mp: 40, stamina: 50 }
    }
  ],
  'metamorfo': [
    {
      type: 'wolf',
      name: 'Forma de Lobo',
      emoji: '🐺',
      description: 'Forma ágil focada em ataques críticos e velocidade',
      cost: { mp: 25, stamina: 35 }
    },
    {
      type: 'bear',
      name: 'Forma de Urso',
      emoji: '🐻',
      description: 'Forma tanque com alta defesa e resistência',
      cost: { mp: 30, stamina: 40 }
    },
    {
      type: 'eagle',
      name: 'Forma de Águia',
      emoji: '🦅',
      description: 'Forma elusive com habilidades especiais de voo',
      cost: { mp: 20, stamina: 30 }
    }
  ],
  'humano': [
    {
      type: 'seventh_sense',
      name: 'Despertar do 7º Sentido',
      emoji: '✨',
      description: 'Eleva reflexos, força e mente em harmonia — forma versátil e sem fraquezas',
      cost: { mp: 30, stamina: 35 }
    }
  ],
  'elfo': [
    {
      type: 'celestial',
      name: 'Forma Celestial',
      emoji: '🌟',
      description: 'Avatar de luz astral: poder mágico e reflexos amplificados, corpo frágil',
      cost: { mp: 25, stamina: 30 }
    }
  ]
}

const RACE_INFO: Record<string, { title: string; text: string }> = {
  draconiano: { title: '🐉 Habilidade Dracônica', text: 'Draconianos possuem uma única transformação poderosa' },
  metamorfo: { title: '🔄 Metamorfose', text: 'Metamorfos podem escolher entre diferentes formas animais' },
  humano: { title: '✨ Despertar do Cosmo', text: 'Humanos despertam o 7º Sentido, uma forma equilibrada e versátil' },
  elfo: { title: '🌟 Ascensão Élfica', text: 'Elfos ascendem à Forma Celestial, amplificando sua magia' },
}

export default function TransformationDialog({
  isOpen,
  onClose,
  characterRace,
  onTransform,
  loading = false
}: TransformationDialogProps) {
  const [selectedTransformation, setSelectedTransformation] = useState<string>('')
  const [showAnimation, setShowAnimation] = useState(false)

  const transformations = TRANSFORMATION_OPTIONS[characterRace] || []

  const handleTransform = async (transformationType: string) => {
    setSelectedTransformation(transformationType)
    
    // Se for draconiano, mostrar animação especial
    if (characterRace === 'draconiano') {
      setShowAnimation(true)
      
      // Aguardar animação antes de transformar
      setTimeout(() => {
        onTransform(transformationType)
        setShowAnimation(false)
        onClose()
      }, 3000)
    } else {
      // Metamorfo transforma imediatamente
      onTransform(transformationType)
      onClose()
    }
  }

  const handleClose = () => {
    if (!loading && !showAnimation) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-gradient-to-br from-purple-900/95 to-blue-900/95 border border-purple-500/30 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              🔮 Escolher Transformação
            </h2>
            {!loading && !showAnimation && (
              <button
                onClick={handleClose}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Animation for Draconiano */}
          {showAnimation && characterRace === 'draconiano' && (
            <div className="p-8 text-center">
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ 
                  duration: 0.8, 
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="text-8xl mb-4"
              >
                🐉
              </motion.div>
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="text-orange-400 font-bold text-lg"
              >
                ✨ TRANSFORMAÇÃO EM PROGRESSO ✨
              </motion.div>
              <div className="text-white/70 text-sm mt-2">
                O poder dracônico desperta...
              </div>
            </div>
          )}

          {/* Transformation Options */}
          {!showAnimation && (
            <div className="p-6 space-y-4">
              {transformations.map((transformation) => (
                <motion.div
                  key={transformation.type}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-black/20 border border-white/10 rounded-lg p-4 hover:border-white/20 transition-all cursor-pointer"
                  onClick={() => !loading && handleTransform(transformation.type)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <span className="text-3xl">{transformation.emoji}</span>
                      <div>
                        <h3 className="font-semibold text-white">{transformation.name}</h3>
                        <p className="text-sm text-white/70">{transformation.description}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 text-sm">
                      <span className="text-blue-300">💙 {transformation.cost.mp} MP</span>
                      <span className="text-yellow-300">⚡ {transformation.cost.stamina} Stamina</span>
                    </div>
                    
                    <button
                      disabled={loading}
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-all text-sm"
                    >
                      {loading ? '⏳' : '⚡ Transformar'}
                    </button>
                  </div>
                </motion.div>
              ))}

              {/* Race Info */}
              {RACE_INFO[characterRace] && (
                <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-400/30 rounded-lg p-4 mt-6">
                  <div className="text-center">
                    <h4 className="font-semibold text-purple-300 mb-2">{RACE_INFO[characterRace].title}</h4>
                    <p className="text-sm text-white/70">{RACE_INFO[characterRace].text}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
