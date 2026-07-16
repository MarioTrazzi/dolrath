'use client'

// Slide 7 — PvP didático: mesmo BattleScene real + a barra de ações do
// CombatShell, com roteiro que EXPLICA a lógica de turnos (iniciativa com
// dado duplo → seu turno com menu de ações → turno do oponente → ...).

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BattleScene, { type DicePanelInfo } from '@/components/battle/BattleScene'
import CombatShell, { type CombatAttackOption } from '@/components/battle/CombatShell'
import ArenaBackdrop from '@/components/combat/ArenaBackdrop'
import { useJourney } from '../JourneyContext'
import { useBattleScript } from '../useBattleScript'
import {
  PVP_SCRIPT,
  PVP_HERO_MAX_HP,
  PVP_FOE_MAX_HP,
  PVP_RANK_WIN_POINTS,
  buildHeroFighter,
  buildPvpOpponent,
  classAttackName,
  type JourneySlideProps,
} from '../journeyData'

export default function Slide7Pvp({ active, onNext }: JourneySlideProps) {
  const { raceId, classId, heroName } = useJourney()
  const battle = useBattleScript(active, PVP_SCRIPT, {
    heroHp: PVP_HERO_MAX_HP,
    foeHp: PVP_FOE_MAX_HP,
  })

  const hero = useMemo(
    () => buildHeroFighter({ raceId, classId }, { enhanced: true, hp: battle.heroHp, maxHp: PVP_HERO_MAX_HP }),
    [raceId, classId, battle.heroHp],
  )
  const foe = useMemo(
    () => buildPvpOpponent({ raceId, classId }, battle.foeHp, PVP_FOE_MAX_HP),
    [raceId, classId, battle.foeHp],
  )

  const dicePanel: DicePanelInfo | null = battle.dice
    ? {
        visible: true,
        diceType: 20,
        hasRolled: battle.dice === 'reveal',
        label: 'Iniciativa: quem age primeiro?',
        onRoll: battle.advance,
        dual: true,
        myResult: battle.dice === 'reveal' ? { sides: 20, roll: 17, modifier: 2, total: 19 } : null,
        opponentResult: battle.dice === 'reveal' ? { sides: 20, roll: 9, modifier: 2, total: 11 } : null,
        resultBanner: battle.dice === 'reveal' ? `${heroName} venceu a iniciativa!` : null,
      }
    : null

  const attackOptions: CombatAttackOption[] = [
    { key: 'basic', label: '👊 Golpe', sub: 'd6 · sem custo', locked: false, onPick: battle.advance },
    { key: 'weapon', label: `🗡️ ${classAttackName(classId)}`, sub: 'd8 · ataque de classe', locked: false, onPick: battle.advance },
    { key: 'special', label: '💫 Especial de forma', sub: 'd20 · 12 MP', locked: false, onPick: battle.advance },
  ]

  const currentTurnId = battle.showActions || battle.dice ? 'hero' : 'foe'

  return (
    <div className="relative h-full w-full">
      <CombatShell
        className="h-full"
        logLines={battle.log ? [battle.log] : []}
        showActions={battle.showActions && !battle.ended}
        statusContent={
          !battle.ended ? (
            <span className="text-[11px] text-white/60 font-bold">
              {battle.dice ? '🎲 Rolando iniciativa...' : '⏳ Aguardando o turno do oponente...'}
            </span>
          ) : (
            <span className="text-[11px] text-emerald-300 font-bold">🏆 Vitória de {heroName}!</span>
          )
        }
        attackOptions={attackOptions}
        showItemButton={false}
      >
        <div className="relative h-[320px] sm:h-[340px] md:h-[380px]">
          <div className="absolute inset-0 overflow-hidden">
            <ArenaBackdrop />
            <div className="absolute inset-0 bg-black/25" />
          </div>
          <BattleScene
            className="h-full"
            left={hero}
            right={foe}
            currentTurnId={currentTurnId}
            winnerId={battle.ended ? 'hero' : null}
            combatEnded={battle.ended}
            event={battle.event}
            dicePanel={dicePanel}
            backdrop={null}
          />

          {/* Faixa do turno (didática) */}
          <AnimatePresence>
            {battle.banner && !battle.ended && (
              <motion.div
                key={battle.banner}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute top-2 inset-x-0 z-30 flex justify-center pointer-events-none"
              >
                <span className="px-3 py-1 rounded-full bg-black/65 border border-primary/50 backdrop-blur-md text-[11px] font-bold text-white">
                  {battle.banner}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </CombatShell>

      {/* Recompensas + CTA */}
      <AnimatePresence>
        {battle.rewards && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-16 inset-x-0 z-40 flex flex-col items-center gap-2 px-4"
          >
            <div className="px-4 py-2 rounded-xl bg-black/75 border border-amber-400/50 backdrop-blur-md text-center">
              <span className="text-xs font-black text-amber-200">
                +310 🪙 · +115 XP · +{PVP_RANK_WIN_POINTS} pts de ranking
              </span>
              <p className="text-[10px] text-white/60 mt-0.5">
                Arena paga ouro e pontos — e os pontos valem prêmio em DOL.
              </p>
            </div>
            <button
              onClick={onNext}
              className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
            >
              Ver o ranking e o prêmio →
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
