'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface TransformationPanelProps {
  characterId: string
  character: any
  onTransformationChange?: (character: any) => void
}

export default function TransformationPanel({ 
  characterId, 
  character, 
  onTransformationChange 
}: TransformationPanelProps) {
  const [transformations, setTransformations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Carregar transformações disponíveis
  useEffect(() => {
    if (characterId) {
      fetchAvailableTransformations()
    }
  }, [characterId])

  const fetchAvailableTransformations = async () => {
    try {
      const response = await fetch(`/api/character/${characterId}/transform`)
      const data = await response.json()
      
      if (response.ok) {
        setTransformations(data.availableTransformations || [])
      } else {
        setError(data.error || 'Erro ao carregar transformações')
      }
    } catch (err) {
      setError('Erro de conexão')
    }
  }

  const handleTransform = async (transformationType: string) => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/character/${characterId}/transform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transformationType })
      })

      const data = await response.json()

      if (response.ok) {
        // Atualizar estado do personagem
        if (onTransformationChange) {
          onTransformationChange(data.character)
        }
        
        // Recarregar transformações para atualizar status
        await fetchAvailableTransformations()
        
        // Success feedback
        setError('') // Clear any previous errors
      } else {
        setError(data.error || 'Erro ao transformar')
      }
    } catch (err) {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  const handleDetransform = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/character/${characterId}/detransform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok) {
        // Atualizar estado do personagem
        if (onTransformationChange) {
          onTransformationChange(data.character)
        }
        
        // Recarregar transformações
        await fetchAvailableTransformations()
      } else {
        setError(data.error || 'Erro ao reverter transformação')
      }
    } catch (err) {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  // Se não há transformações disponíveis, não exibir o painel
  if (!transformations.length && !character?.isTransformed) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
          🐉 Transformações
        </h3>
        
        {character?.isTransformed && (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="px-3 py-1 bg-orange-500/20 border border-orange-400/50 rounded-full"
          >
            <span className="text-sm font-medium text-orange-300">
              ⚡ Transformado
            </span>
          </motion.div>
        )}
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 bg-red-500/20 border border-red-400/50 rounded-lg"
          >
            <p className="text-red-300 text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Estado Transformado */}
      {character?.isTransformed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 p-4 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-400/30 rounded-lg"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-orange-300">
              {character.transformationType === 'dragon' && '🐉 Forma de Dragão'}
              {character.transformationType === 'wolf' && '🐺 Forma de Lobo'}
              {character.transformationType === 'bear' && '🐻 Forma de Urso'}
              {character.transformationType === 'eagle' && '🦅 Forma de Águia'}
            </span>
            
            {character.transformationData?.remainingTurns && (
              <span className="text-sm text-orange-200">
                {character.transformationData.remainingTurns} turnos restantes
              </span>
            )}
          </div>
          
          <button
            onClick={handleDetransform}
            disabled={loading}
            className="w-full py-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:opacity-50 text-white rounded-lg transition-all duration-200 font-medium"
          >
            {loading ? '⏳ Revertendo...' : '⏪ Reverter Transformação'}
          </button>
        </motion.div>
      )}

      {/* Transformações Disponíveis */}
      {!character?.isTransformed && (
        <div className="space-y-3">
          {transformations.map((transformation, index) => (
            <motion.div
              key={transformation.type}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-lg border transition-all duration-200 ${
                transformation.available
                  ? 'bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-blue-500/30 hover:border-blue-400/50'
                  : 'bg-gray-900/20 border-gray-600/30 opacity-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-white">{transformation.name}</h4>
                
                <div className="flex items-center space-x-2 text-sm">
                  <span className="text-blue-300">⚡ {transformation.cost.mp} MP</span>
                  <span className="text-green-300">🔋 {transformation.cost.stamina} Stamina</span>
                </div>
              </div>
              
              <p className="text-gray-300 text-sm mb-3">{transformation.description}</p>
              
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded">
                  {transformation.duration} turnos
                </span>
                <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded">
                  Cooldown: {transformation.cooldown}
                </span>
              </div>

              {/* Habilidades Especiais */}
              {transformation.specialAbilities?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">Habilidades Especiais:</p>
                  <div className="space-y-1">
                    {transformation.specialAbilities.slice(0, 2).map((ability: any, i: number) => (
                      <div key={i} className="text-xs text-yellow-300">
                        • {ability.name}
                      </div>
                    ))}
                    {transformation.specialAbilities.length > 2 && (
                      <div className="text-xs text-gray-400">
                        +{transformation.specialAbilities.length - 2} mais...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Botão de Transformação */}
              <button
                onClick={() => handleTransform(transformation.type)}
                disabled={!transformation.available || loading}
                className={`w-full py-2 rounded-lg font-medium transition-all duration-200 ${
                  transformation.available
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {loading ? '⏳ Transformando...' : 
                 transformation.available ? `⚡ Transformar` : 
                 transformation.reason || 'Indisponível'}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Cooldown Info */}
      {character?.transformationData?.cooldownTurns > 0 && !character?.isTransformed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg"
        >
          <p className="text-red-300 text-sm text-center">
            ⏰ Transformação em cooldown: {character.transformationData.cooldownTurns} turnos restantes
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}
