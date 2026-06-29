'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import DungeonRun, { DungeonCharacter } from '@/components/dungeon/DungeonRun'
import DungeonBackdrop from '@/components/dungeon/DungeonBackdrop'
import { DUNGEON_LIST, DungeonDef, monsterImagePath } from '@/lib/dungeonAdventures'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'

// Miniatura do bestiário: arte do monstro (DB → /monsters/<slug>.webp) e cai no
// emoji se a imagem 404. Substitui os emojis-placeholder no card da masmorra.
function BeastThumb({ name, image, emoji }: { name: string; image?: string; emoji: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span>{emoji}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image ?? monsterImagePath(name)}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
      referrerPolicy="no-referrer"
    />
  )
}

export default function DungeonsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  // Herói ATIVO global (navbar): a masmorra usa sempre o personagem selecionado.
  // `refresh` recarrega /api/character/me — usado ao voltar de uma run para
  // atualizar o gold (e demais recursos) que a navbar exibe.
  const { activeCharacterId, refresh: refreshActiveCharacter } = useActiveCharacter()
  const [characters, setCharacters] = useState<DungeonCharacter[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<DungeonCharacter | null>(null)
  const [activeDungeon, setActiveDungeon] = useState<DungeonDef | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Herói já rodando em OUTRA aba/janela (lock vivo no servidor): bloqueia o "Entrar".
  const [heroInUse, setHeroInUse] = useState(false)
  // Acabamos de sair da NOSSA run: ignora a detecção por uns segundos (o /abandon é
  // assíncrono, então o lock ainda pode constar "vivo" e piscaria o bloqueio à toa).
  const [recentExit, setRecentExit] = useState(false)
  // Subiu de nível na última run: mostra um aviso/botão p/ distribuir os pontos novos.
  const [levelUpAlert, setLevelUpAlert] = useState<{ characterId: string; points: number } | null>(null)

  useEffect(() => {
    if (!session) {
      router.push('/auth/login')
      return
    }

    const fetchCharacters = async () => {
      try {
        const response = await fetch('/api/character')
        if (!response.ok) {
          throw new Error('Erro ao carregar personagens')
        }
        const charData = await response.json()

        // Buscar dados completos de cada personagem incluindo equipamentos
        const charactersWithDetails: DungeonCharacter[] = await Promise.all(
          charData.map(async (char: any) => {
            const detailResponse = await fetch(`/api/character/${char.id}`)
            if (detailResponse.ok) {
              const details = await detailResponse.json()
              return {
                ...char,
                ...details,
                race: details.race || char.race || 'Humano',
                class: details.class || char.class || 'Guerreiro',
                avatar: details.avatar || null,
                mp: details.baseStats?.mp || 50,
                maxMp: details.baseStats?.maxMp || 50,
                stamina: details.stamina ?? 100,
                maxStamina: details.maxStamina ?? 100,
                attack: details.baseStats?.str || 10,
                defense: details.baseStats?.def || 10,
                magicPower: details.baseStats?.int || 0,
                // Atributos distribuídos (alimentam o TILT do modelo enxuto no combate)
                str: details.baseStats?.str ?? 0,
                agi: details.baseStats?.agi ?? 0,
                int: details.baseStats?.int ?? 0,
                def: details.baseStats?.def ?? 0,
                equipment: details.equipment || [],
              }
            }
            return {
              ...char,
              avatar: null,
              mp: 50,
              maxMp: 50,
              stamina: 100,
              maxStamina: 100,
              attack: 10,
              defense: 10,
              magicPower: 0,
              equipment: [],
            }
          })
        )

        setCharacters(charactersWithDetails)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setIsLoading(false)
      }
    }

    fetchCharacters()
  }, [session, router])

  // Mantém o personagem do contexto (navbar) como o selecionado da masmorra.
  useEffect(() => {
    if (characters.length === 0) return
    setSelectedCharacter((prev) => {
      const match = characters.find((c) => c.id === activeCharacterId) || characters[0]
      // Preserva o objeto local (com hp/mp atualizados pós-run) se o id não mudou.
      return prev && prev.id === match.id ? prev : match
    })
  }, [activeCharacterId, characters])

  // Detecta se o herói selecionado já está rodando em OUTRA aba/janela (lock vivo no
  // servidor) e bloqueia o "Entrar". Recheca ao trocar de herói e ao focar a aba —
  // assim, abrir o jogo numa segunda aba detecta a run em andamento na hora.
  const heroId = selectedCharacter?.id
  useEffect(() => {
    if (!heroId || activeDungeon || recentExit) { setHeroInUse(false); return }
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`/api/dungeon/run/active?characterId=${heroId}`)
        const data = await res.json().catch(() => null)
        if (!cancelled) setHeroInUse(!!data?.active)
      } catch { /* ignora: não bloqueia por falha de rede */ }
    }
    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    // Recheca periodicamente para liberar o botão quando a outra aba fechar.
    const id = setInterval(check, 20000)
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); clearInterval(id) }
  }, [heroId, activeDungeon, recentExit])

  // Ao sair da masmorra, sincroniza os recursos locais do personagem
  const handleRunExit = (updates: { hp: number; mp: number; stamina: number; leveledUp?: boolean }) => {
    setActiveDungeon(null)
    setRecentExit(true)
    setTimeout(() => setRecentExit(false), 4000)
    const hero = selectedCharacter
    if (hero) {
      const updated = { ...hero, ...updates }
      setSelectedCharacter(updated)
      setCharacters(prev => prev.map(c => (c.id === updated.id ? updated : c)))
    }
    // O gold da run já foi creditado no servidor a cada combate/espólio. Ao voltar
    // ao mapa a navbar reaparece (a run a cobria com fixed inset-0), então recarrega
    // o personagem ativo para a barra refletir o ouro ganho na hora — sem reload.
    refreshActiveCharacter()

    // Recarrega o detalhe COMPLETO do herói para refletir o XP (e nível/pontos)
    // ganho na run — o card mostra experience/nextLevelExperience, que a saída
    // otimista acima (só hp/mp/stamina) não traz. Antes só buscávamos isso ao
    // SUBIR de nível, então o XP no card ficava parado quando saía sem upar.
    if (hero) {
      ;(async () => {
        try {
          const res = await fetch(`/api/character/${hero.id}`)
          if (!res.ok) return
          const detail = await res.json()
          const points = Number(detail.availablePoints) || 0
          const patch = {
            experience: detail.experience,
            nextLevelExperience: detail.nextLevelExperience,
            level: detail.level,
            availablePoints: points,
            stamina: detail.stamina,
            maxStamina: detail.maxStamina,
          }
          setSelectedCharacter(prev => (prev && prev.id === hero.id ? { ...prev, ...patch } as DungeonCharacter : prev))
          setCharacters(prev => prev.map(c => (c.id === hero.id ? { ...c, ...patch } as DungeonCharacter : c)))
          // Subiu de nível: mostra o botão para distribuir os pontos creditados.
          if (updates.leveledUp) setLevelUpAlert({ characterId: hero.id, points })
        } catch { /* silencioso: o aviso aparece na página do personagem mesmo assim */ }
      })()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-textsec">Abrindo o mapa das masmorras...</p>
        </div>
      </div>
    )
  }

  // Masmorra ativa: experiência em tela cheia
  if (activeDungeon && selectedCharacter) {
    return (
      <DungeonRun
        dungeon={activeDungeon}
        character={selectedCharacter}
        onExit={handleRunExit}
      />
    )
  }

  const canEnter = !!selectedCharacter && (selectedCharacter as any).isAlive !== false

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8 text-center">
          <motion.h1
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-3xl sm:text-4xl font-black text-white mb-2"
          >
            ⚔️ Masmorras de Dolrath
          </motion.h1>
          <p className="text-white/50 text-sm">
            Quatro terras perigosas, um boss em cada uma. Explore com o d20, lute na arena e volte rico — ou não volte.
          </p>
        </div>

        {/* Personagem ativo (definido na navbar — sem seletor aqui) */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          {selectedCharacter ? (
            <>
              <div className="px-4 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-sm font-bold">
                {selectedCharacter.name} <span className="text-white/60">(Nv.{selectedCharacter.level})</span>
                <span className="text-white/60 capitalize"> — {selectedCharacter.race} {selectedCharacter.class}</span>
              </div>
              {selectedCharacter && (
                <div className="flex items-center gap-3 text-xs text-white/70 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5">
                  <span>❤️ {selectedCharacter.hp}/{selectedCharacter.maxHp}</span>
                  <span>🔮 {selectedCharacter.mp}/{selectedCharacter.maxMp}</span>
                  <span>⚡ {selectedCharacter.stamina}/{selectedCharacter.maxStamina}</span>
                  {typeof (selectedCharacter as any).experience === 'number' && (
                    <span>⭐ {(selectedCharacter as any).experience}/{(selectedCharacter as any).nextLevelExperience ?? '?'} XP</span>
                  )}
                  {(selectedCharacter as any).isAlive === false && (
                    <span className="text-red-400 font-bold">💀 MORTO</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-yellow-950/60 border border-yellow-700/50 rounded-xl px-6 py-4 text-center">
              <p className="text-yellow-300 font-bold text-sm mb-1">Nenhum personagem encontrado</p>
              <p className="text-yellow-500/80 text-xs">Crie um personagem primeiro para explorar as masmorras.</p>
            </div>
          )}
        </div>

        {levelUpAlert && (
          <motion.button
            initial={{ scale: 0.9, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 16 }}
            onClick={() => router.push(`/character/${levelUpAlert.characterId}`)}
            className="group relative w-full max-w-2xl mx-auto mb-6 flex items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-yellow-400/60 bg-gradient-to-r from-amber-500/20 via-yellow-400/15 to-amber-500/20 px-5 py-3.5 text-center shadow-[0_0_30px_rgba(253,224,71,0.25)] transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(253,224,71,0.4)]"
          >
            <motion.span
              className="text-2xl"
              animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
            >
              ⭐
            </motion.span>
            <span className="font-black text-yellow-200 text-sm sm:text-base">
              Você subiu de nível!{' '}
              {levelUpAlert.points > 0
                ? `${levelUpAlert.points} ponto${levelUpAlert.points > 1 ? 's' : ''} a distribuir`
                : 'Veja seus novos atributos'}
            </span>
            <span className="font-black text-yellow-300 text-base group-hover:translate-x-1 transition-transform">→</span>
          </motion.button>
        )}

        {error && (
          <div className="bg-red-950/60 border border-red-700/50 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm text-center">
            ❌ {error}
          </div>
        )}

        {selectedCharacter && (selectedCharacter as any).isAlive === false && (
          <div className="bg-red-950/60 border border-red-700/50 rounded-xl p-4 mb-6 text-center">
            <p className="text-red-300 font-bold text-sm">💀 Personagem morto</p>
            <p className="text-red-400/80 text-xs">Use uma Poção de Reviver antes de entrar em masmorras.</p>
          </div>
        )}

        {heroInUse && (
          <div className="bg-amber-950/60 border border-amber-600/50 rounded-xl p-4 mb-6 text-center">
            <p className="text-amber-300 font-bold text-sm">🔒 Herói em uso em outra aba</p>
            <p className="text-amber-400/80 text-xs">
              {selectedCharacter?.name} já está numa masmorra em outra aba/janela. Saia daquela sessão para liberá-lo (libera sozinho ~1 min após fechar).
            </p>
          </div>
        )}

        {/* Grid das 4 masmorras */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {DUNGEON_LIST.map((dungeon, idx) => (
            <motion.div
              key={dungeon.id}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: idx * 0.1, type: 'spring', stiffness: 180, damping: 20 }}
              whileHover={{ scale: 1.02 }}
              className="relative overflow-hidden rounded-3xl border-2 group"
              style={{ borderColor: `${dungeon.accent}55` }}
            >
              {/* Cenário em miniatura */}
              <div className="absolute inset-0">
                <DungeonBackdrop theme={dungeon.id} />
              </div>
              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/15 transition-colors" />

              <div className="relative p-5 sm:p-6 flex flex-col min-h-[230px]">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-4xl mb-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{dungeon.emoji}</div>
                    <h2 className="text-white font-black text-xl sm:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                      {dungeon.name}
                    </h2>
                    <p className="text-white/70 text-xs italic drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {dungeon.tagline}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-amber-400 text-sm tracking-tighter">
                      {'★'.repeat(dungeon.difficultyStars)}
                      <span className="text-white/25">{'★'.repeat(4 - dungeon.difficultyStars)}</span>
                    </div>
                    <div className="text-white/60 text-[10px] mt-0.5">
                      {dungeon.rooms} salas + 👑
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 font-bold ${selectedCharacter && selectedCharacter.level < dungeon.levelReq ? 'text-red-400' : 'text-white/50'}`}
                    >
                      Nv. {dungeon.levelReq}+
                    </div>
                  </div>
                </div>

                <p className="text-white/60 text-xs mt-3 mb-4 max-w-md drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                  {dungeon.description}
                </p>

                <div className="mt-auto flex items-end justify-between gap-2">
                  {/* Bestiário */}
                  <div className="flex items-center gap-1.5">
                    {dungeon.monsters.map(m => (
                      <span
                        key={m.name}
                        title={m.name}
                        className="w-12 h-12 rounded-lg bg-black/50 border border-white/15 flex items-center justify-center text-xl overflow-hidden"
                      >
                        <BeastThumb name={m.name} image={m.image} emoji={m.emoji} />
                      </span>
                    ))}
                    <span
                      title={`Boss: ${dungeon.boss.name}`}
                      className="w-14 h-14 rounded-lg bg-amber-950/70 border border-amber-500/50 flex items-center justify-center text-2xl overflow-hidden"
                    >
                      <BeastThumb name={dungeon.boss.name} image={dungeon.boss.image} emoji={dungeon.boss.emoji} />
                    </span>
                  </div>

                  {(() => {
                    const meetsLevel = !!selectedCharacter && selectedCharacter.level >= dungeon.levelReq
                    const enter = canEnter && meetsLevel && !heroInUse
                    return (
                      <button
                        onClick={() => enter && setActiveDungeon(dungeon)}
                        disabled={!enter}
                        title={
                          heroInUse ? 'Este herói já está em uma masmorra em outra aba ou janela.'
                          : !meetsLevel ? `Requer nível ${dungeon.levelReq}` : undefined
                        }
                        className={`px-5 py-2.5 rounded-xl font-black text-sm text-white shadow-lg transition-all ${
                          enter ? 'hover:scale-105' : 'opacity-50 cursor-not-allowed'
                        }`}
                        style={{
                          background: `linear-gradient(90deg, ${dungeon.accent}cc, ${dungeon.accent}77)`,
                          boxShadow: `0 4px 20px ${dungeon.accentSoft}`,
                        }}
                      >
                        {heroInUse ? '🔒 Em outra aba'
                          : canEnter && !meetsLevel ? `🔒 Nv. ${dungeon.levelReq}` : '🚪 Entrar'}
                      </button>
                    )
                  })()}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-white/30 text-[11px] mt-6 max-w-2xl mx-auto">
          ⚡ A stamina é seu orçamento de runs e só é gasta avançando na trilha — o combate não a consome. Ela se restaura sozinha: +2 a cada 15 min, após 15 min sem gastar.
          ❤️🔮 HP e MP voltam ao cheio entre runs. Você nunca perde XP, ouro ou itens ao morrer ou sair: cada tentativa te deixa mais forte.
          Salas principais (⚔️) têm monstro garantido e melhor espólio; os nós menores entre elas são mais fáceis.
        </p>
      </div>
    </div>
  )
}
