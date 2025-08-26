'use client'

import React, { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import toast from 'react-hot-toast'

interface AttributeDistributionProps {
  characterId: string
  availablePoints: number
  currentAttributes: {
    str: number
    agi: number
    int: number
    res: number
  }
  currentStats?: {
    hp: number
    maxHp: number
    mp: number
    maxMp: number
    stamina: number
    maxStamina: number
    crit?: number
    speed?: number
  }
  onPointsDistributed: () => void
}

export default function AttributeDistributionPanel({ 
  characterId, 
  availablePoints, 
  currentAttributes,
  currentStats,
  onPointsDistributed 
}: AttributeDistributionProps) {
  const [pendingPoints, setPendingPoints] = useState({
    str: 0,
    agi: 0,
    int: 0,
    res: 0
  })
  const [isDistributing, setIsDistributing] = useState(false)

  const totalPendingPoints = Object.values(pendingPoints).reduce((sum, val) => sum + val, 0)
  const remainingPoints = availablePoints - totalPendingPoints

  // Calcular prévia dos stats baseado nos pontos pendentes
  const calculateStatsPreview = () => {
    if (!currentStats) return null

    const strBonus = pendingPoints.str * 3 // HP = str * 3
    const agiBonus = pendingPoints.agi * 1 // MP = agi * 1
    const intBonus = pendingPoints.int * 4 // MP = int * 4
    const resBonus = pendingPoints.res * 2 // HP = res * 2, Stamina = res * 5

    // Calcular novos valores de AGI total para CRIT e SPEED
    const currentAgi = currentAttributes.agi
    const newAgi = currentAgi + pendingPoints.agi

    return {
      hp: currentStats.hp + strBonus + resBonus,
      maxHp: currentStats.maxHp + strBonus + resBonus,
      mp: currentStats.mp + intBonus + agiBonus,
      maxMp: currentStats.maxMp + intBonus + agiBonus,
      stamina: currentStats.stamina + (pendingPoints.res * 5),
      maxStamina: currentStats.maxStamina + (pendingPoints.res * 5),
      crit: newAgi * 0.2,
      speed: newAgi * 0.5,
      // Para comparação
      critBonus: pendingPoints.agi * 0.2,
      speedBonus: pendingPoints.agi * 0.5,
      currentCrit: currentAgi * 0.2,
      currentSpeed: currentAgi * 0.5
    }
  }

  const statsPreview = calculateStatsPreview()

  const adjustPoint = (attribute: keyof typeof pendingPoints, delta: number) => {
    setPendingPoints(prev => {
      const newValue = Math.max(0, prev[attribute] + delta)
      const newTotal = Object.values(prev).reduce((sum, val) => sum + val, 0) - prev[attribute] + newValue
      
      // Não permitir exceder pontos disponíveis
      if (newTotal > availablePoints) return prev
      
      return {
        ...prev,
        [attribute]: newValue
      }
    })
  }

  const handleDistribute = async () => {
    if (totalPendingPoints === 0) {
      toast.error('Você precisa distribuir pelo menos 1 ponto!')
      return
    }

    setIsDistributing(true)
    try {
      const response = await fetch(`/api/character/${characterId}/distribute-points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ distributedPoints: pendingPoints }),
      })

      const result = await response.json()

      if (result.success) {
        toast.success(result.message)
        setPendingPoints({ str: 0, agi: 0, int: 0, res: 0 })
        onPointsDistributed()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      console.error('Error distributing points:', error)
      toast.error('Erro ao distribuir pontos')
    } finally {
      setIsDistributing(false)
    }
  }

  const resetPoints = () => {
    setPendingPoints({ str: 0, agi: 0, int: 0, res: 0 })
  }

  if (availablePoints === 0) {
    return null
  }

  return (
    <div className="glass-card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-text-primary">
          📊 Distribuir Pontos de Atributo
        </h3>
        <div className="bg-primary/20 px-3 py-1 rounded-lg">
          <span className="text-primary font-bold">{remainingPoints} pontos restantes</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Força */}
        <div className="flex items-center justify-between p-3 bg-surface/30 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💪</span>
            <div>
              <div className="font-semibold text-text-primary">Força</div>
              <div className="text-xs text-text-secondary">
                Atual: {currentAttributes.str} → {currentAttributes.str + pendingPoints.str}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustPoint('str', -1)}
              disabled={pendingPoints.str === 0}
              className="w-8 h-8 rounded-full bg-error/20 text-error hover:bg-error/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="min-w-[2rem] text-center font-bold">{pendingPoints.str}</span>
            <button
              onClick={() => adjustPoint('str', 1)}
              disabled={remainingPoints === 0}
              className="w-8 h-8 rounded-full bg-success/20 text-success hover:bg-success/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Agilidade */}
        <div className="flex items-center justify-between p-3 bg-surface/30 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <div className="font-semibold text-text-primary">Agilidade</div>
              <div className="text-xs text-text-secondary">
                Atual: {currentAttributes.agi} → {currentAttributes.agi + pendingPoints.agi}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustPoint('agi', -1)}
              disabled={pendingPoints.agi === 0}
              className="w-8 h-8 rounded-full bg-error/20 text-error hover:bg-error/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="min-w-[2rem] text-center font-bold">{pendingPoints.agi}</span>
            <button
              onClick={() => adjustPoint('agi', 1)}
              disabled={remainingPoints === 0}
              className="w-8 h-8 rounded-full bg-success/20 text-success hover:bg-success/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Inteligência */}
        <div className="flex items-center justify-between p-3 bg-surface/30 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <div className="font-semibold text-text-primary">Inteligência</div>
              <div className="text-xs text-text-secondary">
                Atual: {currentAttributes.int} → {currentAttributes.int + pendingPoints.int}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustPoint('int', -1)}
              disabled={pendingPoints.int === 0}
              className="w-8 h-8 rounded-full bg-error/20 text-error hover:bg-error/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="min-w-[2rem] text-center font-bold">{pendingPoints.int}</span>
            <button
              onClick={() => adjustPoint('int', 1)}
              disabled={remainingPoints === 0}
              className="w-8 h-8 rounded-full bg-success/20 text-success hover:bg-success/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Resistência */}
        <div className="flex items-center justify-between p-3 bg-surface/30 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛡️</span>
            <div>
              <div className="font-semibold text-text-primary">Resistência</div>
              <div className="text-xs text-text-secondary">
                Atual: {currentAttributes.res} → {currentAttributes.res + pendingPoints.res}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustPoint('res', -1)}
              disabled={pendingPoints.res === 0}
              className="w-8 h-8 rounded-full bg-error/20 text-error hover:bg-error/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="min-w-[2rem] text-center font-bold">{pendingPoints.res}</span>
            <button
              onClick={() => adjustPoint('res', 1)}
              disabled={remainingPoints === 0}
              className="w-8 h-8 rounded-full bg-success/20 text-success hover:bg-success/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Botões de ação */}
      <div className="flex gap-3">
        <button
          onClick={handleDistribute}
          disabled={totalPendingPoints === 0 || isDistributing}
          className="flex-1 bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isDistributing ? 'Distribuindo...' : `Confirmar (${totalPendingPoints} pontos)`}
        </button>
        <button
          onClick={resetPoints}
          disabled={totalPendingPoints === 0}
          className="px-4 py-2 bg-surface/50 text-text-secondary rounded-lg hover:bg-surface/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Resetar
        </button>
      </div>

      {/* Prévia dos Stats - aparece apenas se há pontos pendentes */}
      {totalPendingPoints > 0 && statsPreview && currentStats && (
        <div className="mt-6 p-4 bg-gradient-to-br from-success/10 to-primary/10 border border-success/20 rounded-lg">
          <h4 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            👁️ Prévia dos Novos Stats
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* HP Preview */}
            <div className="flex items-center justify-between p-2 bg-surface/30 rounded">
              <div className="flex items-center gap-2">
                <span className="text-red-500">❤️</span>
                <span className="text-sm font-medium">HP</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">
                  {currentStats.hp} → {statsPreview.hp}
                </div>
                {statsPreview.hp > currentStats.hp && (
                  <div className="text-xs text-success">
                    +{statsPreview.hp - currentStats.hp}
                  </div>
                )}
              </div>
            </div>

            {/* MP Preview */}
            <div className="flex items-center justify-between p-2 bg-surface/30 rounded">
              <div className="flex items-center gap-2">
                <span className="text-blue-500">⚡</span>
                <span className="text-sm font-medium">MP</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">
                  {currentStats.mp} → {statsPreview.mp}
                </div>
                {statsPreview.mp > currentStats.mp && (
                  <div className="text-xs text-success">
                    +{statsPreview.mp - currentStats.mp}
                  </div>
                )}
              </div>
            </div>

            {/* Stamina Preview */}
            <div className="flex items-center justify-between p-2 bg-surface/30 rounded">
              <div className="flex items-center gap-2">
                <span className="text-orange-500">🔋</span>
                <span className="text-sm font-medium">Stamina</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">
                  {currentStats.stamina} → {statsPreview.stamina}
                </div>
                {statsPreview.stamina > currentStats.stamina && (
                  <div className="text-xs text-success">
                    +{statsPreview.stamina - currentStats.stamina}
                  </div>
                )}
              </div>
            </div>

            {/* CRIT Preview */}
            <div className="flex items-center justify-between p-2 bg-surface/30 rounded">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">⭐</span>
                <span className="text-sm font-medium">CRIT</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">
                  {statsPreview.currentCrit.toFixed(1)}% → {statsPreview.crit.toFixed(1)}%
                </div>
                {statsPreview.critBonus > 0 && (
                  <div className="text-xs text-success">
                    +{statsPreview.critBonus.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>

            {/* SPEED Preview */}
            <div className="flex items-center justify-between p-2 bg-surface/30 rounded">
              <div className="flex items-center gap-2">
                <span className="text-green-400">🏃</span>
                <span className="text-sm font-medium">SPEED</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">
                  {statsPreview.currentSpeed.toFixed(1)} → {statsPreview.speed.toFixed(1)}
                </div>
                {statsPreview.speedBonus > 0 && (
                  <div className="text-xs text-success">
                    +{statsPreview.speedBonus.toFixed(1)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
