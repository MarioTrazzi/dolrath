'use client'

import React, { useState } from 'react'

interface BossDialogProps {
  isOpen: boolean
  onClose: () => void
  onAcceptFight: () => void
  onDeclineFight: () => void
  bossName: string
}

export default function BossDialog({ 
  isOpen, 
  onClose, 
  onAcceptFight, 
  onDeclineFight,
  bossName 
}: BossDialogProps) {
  const [isClosing, setIsClosing] = useState(false)

  if (!isOpen) return null

  const handleAccept = () => {
    setIsClosing(true)
    setTimeout(() => {
      onAcceptFight()
      onClose()
    }, 300)
  }

  const handleDecline = () => {
    setIsClosing(true)
    setTimeout(() => {
      onDeclineFight()
      onClose()
    }, 300)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 transform transition-all duration-300 ${
        isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
      }`}>
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">👑</div>
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
            BOSS ENCONTRADO!
          </h2>
          <div className="text-xl font-bold text-gray-800 dark:text-gray-200">
            {bossName}
          </div>
        </div>

        {/* Description */}
        <div className="text-center mb-6">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Um boss poderoso emergiu das sombras! Esta será a batalha mais difícil da dungeon.
          </p>
          <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
            <div className="text-yellow-800 dark:text-yellow-200 text-sm">
              <div className="font-bold mb-2">⚠️ RECOMPENSAS ESPECIAIS:</div>
              <ul className="text-left space-y-1">
                <li>• 500-1500 Gold extra</li>
                <li>• 200-500 XP extra</li>
                <li>• Chance de itens Épicos e Lendários</li>
                <li>• Possível drop de equipamentos únicos</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-6">
          <div className="text-red-800 dark:text-red-200 text-sm text-center">
            <div className="font-bold mb-1">⚡ AVISO:</div>
            <div>Este boss é extremamente poderoso! Certifique-se de que seu personagem está preparado.</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-4">
          <button
            onClick={handleAccept}
            className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold"
          >
            ⚔️ ACEITAR DESAFIO
          </button>
          <button
            onClick={handleDecline}
            className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-bold"
          >
            🏃 FUGIR
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-4 text-xs text-gray-500 dark:text-gray-400">
          Esta é uma batalha opcional. Você pode sair com segurança se fugir.
        </div>
      </div>
    </div>
  )
}
