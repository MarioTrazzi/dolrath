'use client'

// Mini Triângulo de Transmutação para a landing — mesmo idioma visual do
// AlchemyDialog (arestas-circuito douradas + traço-cometa na canalização),
// em versão compacta e autocontida (o original vive inline no dialog).

import React from 'react'
import { motion } from 'framer-motion'
import { GOLD, GOLD_BRIGHT, type CraftPhase } from '@/components/crafting/bdoTheme'
import type { RigMaterial } from '@/components/crafting/professionFx'
import { ItemThumb } from './LootTiles'

const BOX_W = 320
const BOX_H = 240
const POS = {
  top: { x: 160, y: 34 },
  left: { x: 58, y: 196 },
  right: { x: 262, y: 196 },
  center: { x: 160, y: 132 },
}
const SLOT_KEYS = ['top', 'left', 'right'] as const

function SlotFrame({ m, charging }: { m: RigMaterial; charging: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <motion.div
        className="grid h-12 w-12 place-items-center overflow-hidden border text-xl"
        style={{
          background: '#1e1e21',
          borderColor: charging ? GOLD : '#3c3c41',
          boxShadow: charging ? `0 0 10px rgba(201,162,95,0.4)` : undefined,
        }}
        animate={charging ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={charging ? { repeat: Infinity, duration: 1.2 } : undefined}
      >
        <ItemThumb name={m.name} emoji={m.emoji} className="text-xl" />
      </motion.div>
      <span className="text-[9px] font-bold text-[#a8a8ae] whitespace-nowrap">
        {m.name} <span style={{ color: GOLD }}>{m.have}/{m.need}</span>
      </span>
    </div>
  )
}

export default function AlchemyMiniRig({
  phase,
  chargeId,
  materials,
  outputName,
  outputEmoji,
}: {
  phase: CraftPhase
  chargeId: number
  materials: RigMaterial[]
  outputName: string
  outputEmoji: string
}) {
  const charging = phase === 'charging'
  const done = phase === 'done'
  const edgePoints = `${POS.top.x},${POS.top.y} ${POS.left.x},${POS.left.y} ${POS.right.x},${POS.right.y}`

  return (
    <div className="relative mx-auto" style={{ width: BOX_W, height: BOX_H }}>
      {/* Névoa dourada atrás do centro */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2"
        style={{ background: 'radial-gradient(circle, rgba(201,162,95,0.14) 0%, transparent 65%)' }}
      />
      <svg className="pointer-events-none absolute inset-0" width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`}>
        <polygon
          points={edgePoints}
          fill="none"
          stroke={charging || done ? 'rgba(201,162,95,0.8)' : 'rgba(201,162,95,0.3)'}
          strokeWidth={1.5}
          style={charging || done ? { filter: 'drop-shadow(0 0 6px rgba(201,162,95,0.5))' } : undefined}
        />
        {SLOT_KEYS.map(k => (
          <line
            key={k}
            x1={POS[k].x}
            y1={POS[k].y}
            x2={POS.center.x}
            y2={POS.center.y}
            stroke={charging || done ? 'rgba(201,162,95,0.45)' : 'rgba(201,162,95,0.15)'}
            strokeWidth={1}
          />
        ))}
        {/* Luz-cometa percorrendo as arestas durante a canalização */}
        {charging && (
          <motion.polygon
            key={`trace-${chargeId}`}
            points={edgePoints}
            pathLength={100}
            fill="none"
            stroke={GOLD_BRIGHT}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray="14 86"
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: -200 }}
            transition={{ duration: 1.6, ease: 'linear' }}
            style={{ filter: 'drop-shadow(0 0 8px rgba(231,198,130,0.85))' }}
          />
        )}
      </svg>

      {/* Nós em losango no meio das trilhas vértice → centro */}
      {SLOT_KEYS.map(k => (
        <span
          key={`node-${k}`}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border bg-[#1e1e21]"
          style={{
            left: (POS[k].x + POS.center.x) / 2,
            top: (POS[k].y + POS.center.y) / 2,
            borderColor: charging || done ? GOLD : '#3c3c41',
          }}
        />
      ))}

      {/* Insumos nos vértices */}
      {SLOT_KEYS.map((k, i) => {
        const m = materials[i]
        if (!m) return null
        return (
          <div
            key={k}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: POS[k].x, top: POS[k].y }}
          >
            <SlotFrame m={m} charging={charging} />
          </div>
        )
      })}

      {/* Resultado no centro */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
        style={{ left: POS.center.x, top: POS.center.y }}
      >
        <motion.div
          key={done ? `out-${chargeId}` : 'idle'}
          className="grid h-14 w-14 place-items-center overflow-hidden border-2 text-2xl"
          style={{
            background: '#141210',
            borderColor: done ? GOLD_BRIGHT : '#3c3c41',
            boxShadow: done ? '0 0 18px rgba(231,198,130,0.55)' : undefined,
          }}
          initial={done ? { scale: 0.4, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        >
          {done ? <ItemThumb name={outputName} emoji={outputEmoji} className="text-2xl" /> : '❔'}
        </motion.div>
        {done && (
          <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: GOLD_BRIGHT }}>
            {outputName}
          </span>
        )}
      </div>
    </div>
  )
}
