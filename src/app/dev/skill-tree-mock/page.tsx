'use client'

// 🧪 Mock visual da Árvore de Habilidades — testa o SkillTreePanel sem DB/auth,
// no mesmo espírito de /dev/dungeon-mock e /dev/gathering-map-mock.
// Seletor classe×forma cobre as combinações; compra vive em useState e o botão
// "+1 ponto" simula o level-up.

import { useMemo, useState } from 'react'
import SkillTreePanel from '@/components/SkillTreePanel'
import {
  getSkillTree,
  getSkillPaths,
  skillTreeTotalCost,
} from '@/lib/skillTree'
import type { TransformationType } from '@/lib/transformationSystem'

const CLASSES = [
  { id: 'warrior', label: 'Guerreiro' },
  { id: 'rogue', label: 'Ladino' },
  { id: 'mage', label: 'Mago' },
  { id: 'monk', label: 'Monge' },
]

// raça (dona da forma) só para rotular o seletor — a árvore depende de classe+forma
const FORMS: { id: TransformationType; label: string }[] = [
  { id: 'dragon', label: '🐉 Dragão (Draconiano)' },
  { id: 'wolf', label: '🐺 Lobo (Metamorfo)' },
  { id: 'bear', label: '🐻 Urso (Metamorfo)' },
  { id: 'eagle', label: '🦅 Águia (Metamorfo)' },
  { id: 'seventh_sense', label: '🌌 7º Sentido (Humano)' },
  { id: 'celestial', label: '✨ Celestial (Elfo)' },
]

export default function SkillTreeMockPage() {
  const [classId, setClassId] = useState('warrior')
  const [form, setForm] = useState<TransformationType>('dragon')
  const [purchased, setPurchased] = useState<string[]>([])
  const [points, setPoints] = useState(5)

  const tree = useMemo(() => getSkillTree(classId, form), [classId, form])
  const paths = useMemo(() => getSkillPaths(classId, form), [classId, form])
  const totalCost = useMemo(() => skillTreeTotalCost(tree), [tree])
  const spent = useMemo(
    () => purchased.reduce((sum, id) => sum + (tree.find(n => n.id === id)?.cost || 0), 0),
    [purchased, tree],
  )

  const spend = (nodeId: string) => {
    const node = tree.find(n => n.id === nodeId)
    if (!node) return
    setPurchased(p => [...p, nodeId])
    setPoints(p => p - node.cost)
  }

  const reset = () => {
    setPurchased([])
    setPoints(5)
  }

  return (
    <div className="min-h-screen bg-[#141416] text-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-lg font-bold text-[#e7c682]">🧪 Mock — Árvore de Habilidades</h1>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={classId}
            onChange={e => { setClassId(e.target.value); setPurchased([]) }}
            className="bg-[#26262b] border border-[#46464c] rounded-lg px-3 py-2"
          >
            {CLASSES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select
            value={form}
            onChange={e => { setForm(e.target.value as TransformationType); setPurchased([]) }}
            className="bg-[#26262b] border border-[#46464c] rounded-lg px-3 py-2"
          >
            {FORMS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <button
            onClick={() => setPoints(p => p + 1)}
            className="px-3 py-2 rounded-lg bg-[#c9a25f] text-black font-bold hover:brightness-110"
          >
            +1 ponto (level-up)
          </button>
          <button
            onClick={reset}
            className="px-3 py-2 rounded-lg border border-[#46464c] text-white/70 hover:bg-white/10"
          >
            Resetar
          </button>
          <span className="text-white/50 text-xs">
            gasto {spent}/{totalCost} • {tree.length} nós
          </span>
        </div>

        <SkillTreePanel
          tree={tree}
          paths={paths}
          purchased={purchased}
          availablePoints={points}
          onSpend={spend}
          classId={classId}
        />
      </div>
    </div>
  )
}
