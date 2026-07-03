'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Plus, Check, Heart, Sparkles, Zap, Layers } from 'lucide-react'
import { resolveImageUrl } from '@/lib/imageUrl'
import { useActiveCharacter, ActiveCharacter } from '@/components/providers/ActiveCharacterProvider'

// 🎴 Diálogo de troca de herói: abre pela foto-avatar na navbar. Mostra todos os
// personagens lado a lado (rolagem horizontal estilo carrossel) com foto, nível,
// status (HP/MP/Stamina) e failstacks. Escolher um o torna o ATIVO em todo o app.

function StatBar({ icon, value, max, color }: { icon: React.ReactNode; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0">{icon}</span>
      <div className="relative h-2 flex-1 rounded-full bg-black/50 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-white/70 w-12 text-right">
        {value}/{max}
      </span>
    </div>
  )
}

function CharacterCard({
  character,
  active,
  onSelect,
}: {
  character: ActiveCharacter
  active: boolean
  onSelect: () => void
}) {
  const avatarUrl = resolveImageUrl(character.avatar ?? null)
  const dead = character.isAlive === false
  const fs = Number(character.failstacks ?? 0)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative w-56 shrink-0 snap-start rounded-2xl border p-4 text-left transition-all ${
        active
          ? 'border-primary bg-primary/10 ring-2 ring-primary/50'
          : 'border-white/10 bg-secondary/60 hover:border-white/30 hover:bg-secondary/80'
      }`}
    >
      {active && (
        <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
          <Check className="h-3 w-3" /> Ativo
        </span>
      )}

      <div className="relative mx-auto mb-3 aspect-square w-full overflow-hidden rounded-xl bg-indigo-500/15 ring-1 ring-white/10">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={character.name}
            fill
            sizes="224px"
            className={`object-cover transition-transform group-hover:scale-105 ${dead ? 'grayscale' : 'art-bright'}`}
            unoptimized={!/^https?:\/\//i.test(avatarUrl)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">🧙</div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-black text-amber-300">
          Nv.{character.level}
        </span>
        {dead && (
          <span className="absolute inset-x-0 bottom-0 bg-error/80 py-1 text-center text-[11px] font-bold text-white">
            ☠️ Morto
          </span>
        )}
      </div>

      <div className="mb-2 min-w-0">
        <div className="truncate text-base font-bold text-white">{character.name}</div>
        <div className="truncate text-xs capitalize text-textsec">
          {character.race} • {character.class}
        </div>
      </div>

      <div className="space-y-1.5">
        <StatBar icon={<Heart className="h-3 w-3 text-rose-400" />} value={character.hp} max={character.maxHp} color="#fb7185" />
        <StatBar icon={<Sparkles className="h-3 w-3 text-sky-400" />} value={character.mp} max={character.maxMp} color="#38bdf8" />
        <StatBar icon={<Zap className="h-3 w-3 text-amber-400" />} value={character.stamina} max={character.maxStamina} color="#fbbf24" />
      </div>

      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2 py-1">
        <Layers className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-[11px] text-textsec">Failstacks</span>
        <span className="ml-auto text-sm font-black text-amber-300">{fs}</span>
      </div>
    </button>
  )
}

export function CharacterSwitcherDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { characters, activeCharacterId, setActiveCharacterId, refresh } = useActiveCharacter()
  const router = useRouter()

  // O snapshot dos personagens só é buscado na montagem / criação / volta de run.
  // Sem isto, abrir o seletor depois de gastar recursos (ex.: stamina numa run)
  // mostrava o estado de quando a página carregou — a barra "cheia" mesmo já tendo
  // gastado. Recarregar ao abrir garante que HP/MP/Stamina/Failstacks reflitam o
  // banco na hora. (O regen passivo de stamina segue subindo sozinho via tick.)
  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const handleSelect = (id: string) => {
    setActiveCharacterId(id)
    onClose()
    router.push(`/character/${id}`)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-3xl rounded-3xl border border-white/10 bg-secondary/95 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Escolher personagem"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Escolha seu herói</h2>
                <p className="text-sm text-textsec">O personagem ativo é usado em PvP, masmorras, loja e inventário.</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {characters.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="text-5xl">🧙</div>
                <p className="text-textsec">Você ainda não tem personagens.</p>
                <Link
                  href="/character/create"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-dark px-4 py-2 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" /> Criar personagem
                </Link>
              </div>
            ) : (
              <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
                {characters.map((c) => (
                  <CharacterCard
                    key={c.id}
                    character={c}
                    active={c.id === activeCharacterId}
                    onSelect={() => handleSelect(c.id)}
                  />
                ))}

                <Link
                  href="/character/create"
                  onClick={onClose}
                  className="flex w-40 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/5 text-textsec transition-colors hover:border-white/40 hover:text-white"
                >
                  <Plus className="h-7 w-7" />
                  <span className="text-sm font-semibold">Novo herói</span>
                </Link>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
