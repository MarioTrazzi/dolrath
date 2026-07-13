'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import DungeonRun, { DungeonCharacter } from '@/components/dungeon/DungeonRun'
import DungeonBackdrop from '@/components/dungeon/DungeonBackdrop'
import { DUNGEON_LIST, DungeonDef, monsterImagePath, MAX_DUNGEON_TIER, CONCENTRATED_MIN_TIER } from '@/lib/dungeonAdventures'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'
import { GOLD, GOLD_BRIGHT, BORDER_GOLD, PANEL_BG } from '@/components/crafting/bdoTheme'

// Numerais dos tiers (1..5 → I..V).
const ROMAN = ['I', 'II', 'III', 'IV', 'V']

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
      // Artes de monstro são escuras — clareia via .art-bright (mesmo da arena), sem regenerar.
      className="w-full h-full object-cover art-bright"
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
  // Algum personagem da CONTA já rodando em OUTRA aba/janela (lock vivo no servidor):
  // bloqueia o "Entrar" pra qualquer herói — só dá pra farmar um de cada vez.
  const [heroInUse, setHeroInUse] = useState(false)
  const [lockedCharacterName, setLockedCharacterName] = useState<string | null>(null)
  // Acabamos de sair da NOSSA run: ignora a detecção por uns segundos (o /abandon é
  // assíncrono, então o lock ainda pode constar "vivo" e piscaria o bloqueio à toa).
  const [recentExit, setRecentExit] = useState(false)
  // Subiu de nível na última run: mostra um aviso/botão p/ distribuir os pontos novos.
  const [levelUpAlert, setLevelUpAlert] = useState<{ characterId: string; points: number } | null>(null)
  // 🔁 Re-run: incrementa a key da DungeonRun (remonta do zero) preservando o piloto.
  const [runSeq, setRunSeq] = useState(0)
  const [resumeAuto, setResumeAuto] = useState(false)
  // 🏆 Tiers: maior tier desbloqueado por masmorra ({dungeonId: maxTier}) e o tier
  // ESCOLHIDO em cada card (default = o maior desbloqueado).
  const [tierProgress, setTierProgress] = useState<Record<string, number>>({})
  const [selectedTier, setSelectedTier] = useState<Record<string, number>>({})

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

  // 🏆 Carrega o progresso de TIER do herói selecionado. Recarrega ao VOLTAR de uma run
  // (activeDungeon → null) — vencer o boss pode ter desbloqueado um tier novo.
  useEffect(() => {
    const charId = selectedCharacter?.id
    if (!charId || activeDungeon) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/dungeon/progress?characterId=${charId}`)
        const data = await res.json().catch(() => null)
        if (!cancelled && data?.progress) setTierProgress(data.progress)
      } catch { /* silencioso: sem progresso = tudo no Tier I */ }
    })()
    return () => { cancelled = true }
  }, [selectedCharacter?.id, activeDungeon])

  // Detecta se QUALQUER personagem da conta já está rodando em OUTRA aba/janela (lock
  // vivo no servidor) e bloqueia o "Entrar" — não importa qual herói está selecionado
  // aqui, só dá pra farmar um de cada vez. Recheca ao focar a aba — assim, abrir o
  // jogo numa segunda aba detecta a run em andamento na hora.
  useEffect(() => {
    if (activeDungeon || recentExit) { setHeroInUse(false); setLockedCharacterName(null); return }
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/dungeon/run/active')
        const data = await res.json().catch(() => null)
        if (!cancelled) {
          setHeroInUse(!!data?.active)
          setLockedCharacterName(data?.active ? data?.characterName ?? null : null)
        }
      } catch { /* ignora: não bloqueia por falha de rede */ }
    }
    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    // Recheca periodicamente para liberar o botão quando a outra aba fechar.
    const id = setInterval(check, 20000)
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); clearInterval(id) }
  }, [activeDungeon, recentExit])

  // 🔁 Re-run: mantém a masmorra ativa e remonta a DungeonRun do zero (nova key),
  // sincronizando os recursos e preservando o estado do piloto automático.
  const handleRunRestart = (updates: { hp: number; mp: number; stamina: number; level?: number; leveledUp?: boolean; auto: boolean }) => {
    const hero = selectedCharacter
    if (hero) {
      // O re-run remonta <DungeonRun> do zero com este `character` como prop —
      // sem propagar o nível aqui, um level up no farm automático "voltaria"
      // para o nível antigo a cada re-run (mesmo bug do combate, um nível acima).
      const updated = {
        ...hero,
        hp: updates.hp,
        mp: updates.mp,
        stamina: updates.stamina,
        ...(updates.level != null ? { level: updates.level } : {}),
      }
      setSelectedCharacter(updated)
      setCharacters(prev => prev.map(c => (c.id === updated.id ? updated : c)))
    }
    setResumeAuto(updates.auto)
    setRunSeq(s => s + 1)
  }

  // Ao sair da masmorra, sincroniza os recursos locais do personagem
  const handleRunExit = (updates: { hp: number; mp: number; stamina: number; leveledUp?: boolean }) => {
    setActiveDungeon(null)
    setResumeAuto(false)
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
        key={`${activeDungeon.id}-${runSeq}`}
        dungeon={activeDungeon}
        character={selectedCharacter}
        tier={selectedTier[activeDungeon.id] ?? tierProgress[activeDungeon.id] ?? 1}
        onExit={handleRunExit}
        onRestart={handleRunRestart}
        initialAuto={resumeAuto}
        backgroundImageUrl={activeDungeon.id === 'floresta' ? '/backgrounds/dark-forest.png' : undefined}
        backgroundImageOverlay={0.35}
      />
    )
  }

  const canEnter = !!selectedCharacter && (selectedCharacter as any).isAlive !== false

  return (
    <div className="min-h-[100dvh] p-4 sm:p-6" style={{ fontFamily: "'Barlow', sans-serif" }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8 text-center">
          <motion.h1
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-3xl sm:text-4xl font-black text-[#ece7da] mb-2"
            style={{ letterSpacing: '0.5px' }}
          >
            ⚔️ Masmorras de Dolrath
          </motion.h1>
          <p className="text-[#8a8a90] text-sm">
            Quatro terras perigosas, um boss em cada uma. Explore com o d20, lute na arena e volte rico — ou não volte.
          </p>
        </div>

        {/* Personagem ativo (definido na navbar — sem seletor aqui). Linha única
            com wrap: nada re-centraliza entre breakpoints. */}
        <div className="mb-6 flex flex-row flex-wrap items-center justify-center gap-3">
          {selectedCharacter ? (
            <>
              <div
                className="px-4 py-2.5 rounded-[3px] border border-[#46464c] text-sm font-bold text-[#ece7da]"
                style={{ background: PANEL_BG }}
              >
                {selectedCharacter.name} <span style={{ color: GOLD_BRIGHT }}>(Nv.{selectedCharacter.level})</span>
                <span className="text-[#8a8a90] capitalize"> — {selectedCharacter.race} {selectedCharacter.class}</span>
              </div>
              {selectedCharacter && (
                <div
                  className="flex items-center gap-3 text-xs text-[#c9c9ce] rounded-[3px] border border-[#46464c] px-4 py-2.5 tabular-nums"
                  style={{ background: PANEL_BG }}
                >
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
            <div className="rounded-[3px] border px-6 py-4 text-center" style={{ borderColor: '#8a6d3b', background: 'linear-gradient(180deg, rgba(58,51,37,0.85), rgba(36,31,22,0.85))' }}>
              <p className="font-bold text-sm mb-1" style={{ color: GOLD_BRIGHT }}>Nenhum personagem encontrado</p>
              <p className="text-xs text-[#8a8a90]">Crie um personagem primeiro para explorar as masmorras.</p>
            </div>
          )}
        </div>

        {levelUpAlert && (
          <motion.button
            initial={{ scale: 0.9, opacity: 0, y: -8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 16 }}
            onClick={() => router.push(`/character/${levelUpAlert.characterId}`)}
            className="group relative w-full max-w-2xl mx-auto mb-6 flex items-center justify-center gap-2 overflow-hidden rounded-[3px] border px-5 py-3.5 text-center transition-all hover:brightness-125"
            style={{
              borderColor: GOLD,
              background: 'linear-gradient(180deg, #3a3325, #241f16)',
              boxShadow: 'inset 0 1px 0 rgba(231,198,130,0.25), 0 0 22px rgba(201,162,95,0.3)',
            }}
          >
            <motion.span
              className="text-2xl"
              animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
            >
              ⭐
            </motion.span>
            <span className="font-black text-sm sm:text-base" style={{ color: GOLD_BRIGHT }}>
              Você subiu de nível!{' '}
              {levelUpAlert.points > 0
                ? `${levelUpAlert.points} ponto${levelUpAlert.points > 1 ? 's' : ''} a distribuir`
                : 'Veja seus novos atributos'}
            </span>
            <span className="font-black text-base group-hover:translate-x-1 transition-transform" style={{ color: GOLD }}>→</span>
          </motion.button>
        )}

        {error && (
          <div className="rounded-[3px] border border-red-900/70 bg-red-950/40 text-red-300 px-4 py-3 mb-6 text-sm text-center">
            ❌ {error}
          </div>
        )}

        {selectedCharacter && (selectedCharacter as any).isAlive === false && (
          <div className="rounded-[3px] border border-red-900/70 bg-red-950/40 p-4 mb-6 text-center">
            <p className="text-red-300 font-bold text-sm">💀 Personagem morto</p>
            <p className="text-red-400/80 text-xs">Use uma Poção de Reviver antes de entrar em masmorras.</p>
          </div>
        )}

        {heroInUse && (
          <div className="rounded-[3px] border p-4 mb-6 text-center" style={{ borderColor: 'rgba(224,154,58,0.5)', background: 'rgba(58,45,22,0.5)' }}>
            <p className="font-bold text-sm" style={{ color: '#e09a3a' }}>🔒 Herói em uso em outra aba</p>
            <p className="text-xs text-[#8a8a90]">
              {lockedCharacterName ?? 'Outro personagem'} já está numa masmorra em outra aba/janela. Só dá pra explorar com um herói por vez — saia daquela sessão para liberá-lo (libera sozinho ~1 min após fechar).
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
              whileHover={{ scale: 1.01 }}
              className="relative overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60 group transition-colors hover:border-[#8a6d3b]"
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
                    <div className="text-[10px] mt-0.5 font-bold text-white/50" title="Nível recomendado — a masmorra é acessível em qualquer nível, mas o boss exige estar por perto.">
                      Nv. {dungeon.levelReq}+ recom.
                    </div>
                  </div>
                </div>

                <p className="text-white/60 text-xs mt-3 mb-3 max-w-md drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                  {dungeon.description}
                </p>

                {/* 🏆 Abas de Tier: desbloqueadas ≤ maxTier; escolher define a dificuldade da run. */}
                <div className="flex items-center flex-wrap gap-1.5 mb-3">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wide mr-0.5">Tier</span>
                  {Array.from({ length: MAX_DUNGEON_TIER }).map((_, i) => {
                    const t = i + 1
                    const maxT = tierProgress[dungeon.id] ?? 1
                    const unlocked = t <= maxT
                    const chosen = (selectedTier[dungeon.id] ?? maxT) === t
                    return (
                      <button
                        key={t}
                        disabled={!unlocked}
                        onClick={() => setSelectedTier((p) => ({ ...p, [dungeon.id]: t }))}
                        title={
                          unlocked
                            ? `Tier ${ROMAN[i]}${t >= CONCENTRATED_MIN_TIER ? ' — dropa Pedra Concentrada' : ''}`
                            : `Vença o boss no Tier ${ROMAN[maxT - 1]} para desbloquear`
                        }
                        className={`min-w-[26px] h-6 px-1.5 rounded-[3px] text-[11px] font-black border transition-all ${
                          chosen
                            ? 'border-[#c9a25f] bg-gradient-to-b from-[#3a3325] to-[#241f16] text-[#e7c682] shadow-[0_0_8px_rgba(201,162,95,0.4)]'
                            : unlocked
                              ? 'border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] text-[#c9c9ce] hover:border-[#8a6d3b]'
                              : 'border-[#3c3c41] bg-[#1a1a1d] text-[#57575c] cursor-not-allowed'
                        }`}
                      >
                        {unlocked ? ROMAN[i] : '🔒'}
                      </button>
                    )
                  })}
                  {((selectedTier[dungeon.id] ?? tierProgress[dungeon.id] ?? 1) >= CONCENTRATED_MIN_TIER) && (
                    <span className="text-[10px] text-amber-300/90 ml-1">💎 Concentrada</span>
                  )}
                </div>

                <div className="mt-auto flex items-end justify-between gap-2">
                  {/* Bestiário */}
                  <div className="flex items-center gap-1.5">
                    {dungeon.monsters.map(m => (
                      <span
                        key={m.name}
                        title={m.name}
                        className="w-12 h-12 rounded-[3px] border border-[#3c3c41] flex items-center justify-center text-xl overflow-hidden"
                        style={{ background: 'linear-gradient(160deg, #232327, #101013)' }}
                      >
                        <BeastThumb name={m.name} image={m.image} emoji={m.emoji} />
                      </span>
                    ))}
                    <span
                      title={`Boss: ${dungeon.boss.name}`}
                      className="w-14 h-14 rounded-[3px] border flex items-center justify-center text-2xl overflow-hidden"
                      style={{ borderColor: BORDER_GOLD, background: 'linear-gradient(160deg, #2c2620, #141210)', boxShadow: '0 0 8px rgba(201,162,95,0.3)' }}
                    >
                      <BeastThumb name={dungeon.boss.name} image={dungeon.boss.image} emoji={dungeon.boss.emoji} />
                    </span>
                  </div>

                  {(() => {
                    // Sem gate de nível: toda masmorra é entrável. A dificuldade e o boss
                    // (ancorado no clearLevel) gateiam quem está sub-nivelado.
                    const enter = canEnter && !heroInUse
                    return (
                      <button
                        onClick={() => enter && setActiveDungeon(dungeon)}
                        disabled={!enter}
                        title={
                          heroInUse ? `${lockedCharacterName ?? 'Outro personagem'} já está em uma masmorra em outra aba ou janela. Só um herói por vez.`
                          : undefined
                        }
                        className={`px-5 py-2.5 rounded-[3px] border font-semibold tracking-wide text-sm transition-all ${
                          enter ? 'hover:brightness-125' : 'opacity-50 cursor-not-allowed'
                        }`}
                        style={{
                          borderColor: `${dungeon.accent}aa`,
                          background: `linear-gradient(180deg, ${dungeon.accent}40, ${dungeon.accent}14)`,
                          color: '#ece7da',
                          boxShadow: `inset 0 1px 0 ${dungeon.accent}44, 0 0 14px ${dungeon.accentSoft}`,
                        }}
                      >
                        {heroInUse ? '🔒 Em outra aba' : '🚪 Entrar'}
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
