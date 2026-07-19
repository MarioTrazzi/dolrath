'use client'

// Slide 9 — PvP didático: BattleScene real + barra de ações do CombatShell.
// O roteiro explica a lógica de turnos (iniciativa em dado duplo → seu
// turno com menu → turno do oponente) e tem clímax: o oponente TRANSFORMA
// no meio da luta e mesmo assim cai, porque o herói tira NAT 20 no dado
// final. Gear real nos dois lutadores.

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BattleScene, { type DicePanelInfo } from '@/components/battle/BattleScene'
import CombatShell, { type CombatAttackOption } from '@/components/battle/CombatShell'
import { DUNGEON_BATTLE_BG } from '@/lib/walkSceneAssets'
import { useJourney } from '../JourneyContext'
import { useBattleScript } from '../useBattleScript'
import { useT } from '@/lib/i18n/I18nProvider'
import {
  buildPvpScript,
  PVP_HERO_MAX_HP,
  PVP_FOE_MAX_HP,
  PVP_RANK_WIN_POINTS,
  buildHeroFighter,
  buildPvpOpponent,
  classAttackName,
  type JourneySlideProps,
} from '../journeyData'

export default function Slide9Pvp({ active, onNext }: JourneySlideProps) {
  const t = useT()
  const { raceId, classId, heroName } = useJourney()
  const script = useMemo(() => buildPvpScript({ raceId, classId }, t), [raceId, classId, t])
  const battle = useBattleScript(active, script, {
    heroHp: PVP_HERO_MAX_HP,
    foeHp: PVP_FOE_MAX_HP,
  })

  const hero = useMemo(
    () => buildHeroFighter({ raceId, classId }, { enhanced: true, hp: battle.heroHp, maxHp: PVP_HERO_MAX_HP }),
    [raceId, classId, battle.heroHp],
  )
  const foe = useMemo(
    () => buildPvpOpponent({ raceId, classId }, battle.foeHp, PVP_FOE_MAX_HP, { transformed: battle.foeTransformed }),
    [raceId, classId, battle.foeHp, battle.foeTransformed],
  )

  // Passos 0-1 = iniciativa (dado duplo); o dado do fim da luta é single.
  const isInitiative = battle.step <= 1
  const dicePanel: DicePanelInfo | null = battle.dice
    ? isInitiative
      ? {
          visible: true,
          diceType: 20,
          hasRolled: battle.dice === 'reveal',
          label: t('Initiative: who acts first?'),
          onRoll: battle.advance,
          dual: true,
          myResult: battle.dice === 'reveal' ? { sides: 20, roll: 17, modifier: 2, total: 19 } : null,
          opponentResult: battle.dice === 'reveal' ? { sides: 20, roll: 9, modifier: 2, total: 11 } : null,
          resultBanner: battle.dice === 'reveal' ? t('{name} won the initiative!', { name: heroName }) : null,
        }
      : {
          visible: true,
          diceType: 20,
          hasRolled: battle.dice === 'reveal',
          label: t('🎲 Everything on the final roll — tap to roll!'),
          onRoll: battle.advance,
          myResult: battle.dice === 'reveal' ? { sides: 20, roll: 20, modifier: 4, total: 24 } : null,
        }
    : null

  const attackOptions: CombatAttackOption[] = [
    { key: 'basic', label: t('👊 Strike'), sub: t('d6 · no cost'), locked: false, onPick: battle.advance },
    { key: 'weapon', label: `🗡️ ${t(classAttackName(classId))}`, sub: t('d8 · class attack'), locked: false, onPick: battle.advance },
    { key: 'special', label: t('💫 Form special'), sub: 'd20 · 12 MP', locked: false, onPick: battle.advance },
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
              {battle.dice
                ? t('🎲 Rolling the dice...')
                : battle.foeTransformed
                  ? t('⚠️ Opponent transformed — hold the line...')
                  : t("⏳ Waiting for the opponent's turn...")}
            </span>
          ) : (
            <span className="text-[11px] text-emerald-300 font-bold">{t('🏆 Victory for {name}!', { name: heroName })}</span>
          )
        }
        attackOptions={attackOptions}
        showItemButton={false}
      >
        <div className="relative h-[320px] sm:h-[340px] md:h-[380px]">
          {/* Arena de PvP nas Ruínas Arcanas — mesmo battle BG do combate real */}
          <div className="absolute inset-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={DUNGEON_BATTLE_BG.ruinas}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/35" />
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
            diceSize={72}
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
                +310 🪙 · +115 XP · {t('+{n} ranking pts', { n: PVP_RANK_WIN_POINTS })}
              </span>
              <p className="text-[10px] text-white/60 mt-0.5">
                {t('Not even the transformation survives a NAT 20 — the dice decides.')}
              </p>
            </div>
            <button
              onClick={onNext}
              className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
            >
              {t('See the ranking and the prize →')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
