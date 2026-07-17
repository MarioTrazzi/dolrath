'use client'

// Slide 8 — Boss fight REAL: o BattleScene de produção dirigido por
// roteiro (padrão /dev/battle-fx). O herói entra com a MESMA gear do
// slide anterior (set III + arma IV, itens reais), TRANSFORMA no meio da
// luta, solta o especial de forma e fecha com o d20 decisivo. Boss com
// card maior e dado menor; drop final é um item ÉPICO real.

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BattleScene, { type DicePanelInfo } from '@/components/battle/BattleScene'
import { DUNGEON_BATTLE_BG } from '@/lib/walkSceneAssets'
import { getCatalogItemByName } from '@/lib/itemCatalog'
import { useJourney } from '../JourneyContext'
import { useBattleScript } from '../useBattleScript'
import { ItemThumb } from './LootTiles'
import {
  buildBossScript,
  BOSS_HERO_MAX_HP,
  BOSS_SHOW_MAX_HP,
  buildHeroFighter,
  buildBossFighter,
  FOREST_BOSS,
  type JourneySlideProps,
} from '../journeyData'

const Backdrop = (
  <>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={DUNGEON_BATTLE_BG.floresta}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
    />
    <div className="absolute inset-0 bg-black/35" />
  </>
)

const LOOT_ITEM = 'Égide do Baluarte'

export default function Slide8BossFight({ active, onNext }: JourneySlideProps) {
  const { raceId, classId, heroName } = useJourney()
  const script = useMemo(() => buildBossScript(raceId), [raceId])
  const battle = useBattleScript(active, script, {
    heroHp: BOSS_HERO_MAX_HP,
    foeHp: BOSS_SHOW_MAX_HP,
  })

  const hero = useMemo(
    () =>
      buildHeroFighter(
        { raceId, classId },
        { enhanced: true, hp: battle.heroHp, maxHp: BOSS_HERO_MAX_HP, transformed: battle.heroTransformed },
      ),
    [raceId, classId, battle.heroHp, battle.heroTransformed],
  )
  const boss = useMemo(() => buildBossFighter(battle.foeHp), [battle.foeHp])
  const lootMeta = getCatalogItemByName(LOOT_ITEM)

  const dicePanel: DicePanelInfo | null = battle.dice
    ? {
        visible: true,
        diceType: 20,
        hasRolled: battle.dice === 'reveal',
        label: 'Golpe decisivo — toque no d20!',
        onRoll: battle.advance,
        myResult: battle.dice === 'reveal' ? { sides: 20, roll: 19, modifier: 4, total: 23 } : null,
      }
    : null

  return (
    <div className="relative h-full w-full flex flex-col">
      {/* Faixa de turno/etapa */}
      <AnimatePresence>
        {battle.banner && !battle.ended && (
          <motion.div
            key={battle.banner}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-4 inset-x-0 z-30 flex justify-center pointer-events-none"
          >
            <span className="px-3 py-1 rounded-full bg-black/60 border border-amber-400/40 backdrop-blur-md text-[11px] font-bold text-amber-100">
              {battle.banner}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <BattleScene
        className="flex-1 min-h-0"
        left={hero}
        right={boss}
        currentTurnId="hero"
        winnerId={battle.ended ? 'hero' : null}
        combatEnded={battle.ended}
        event={battle.event}
        dicePanel={dicePanel}
        backdrop={Backdrop}
        enemyHpOnly
        brightenEnemyImage
        enemyCardScale={1.18}
        diceSize={64}
      />

      {/* Log de 1 linha */}
      <div className="shrink-0 px-3 py-2 bg-black/60 border-t border-white/10 backdrop-blur-md">
        <p className="font-combat text-[11px] text-white/75 truncate">
          {battle.log || `${heroName} encara ${FOREST_BOSS.name}...`}
        </p>
      </div>

      {/* Overlay de loot épico — item REAL com arte do catálogo */}
      <AnimatePresence>
        {battle.loot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.6, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 180, damping: 15 }}
              className="relative mx-4 max-w-xs w-full rounded-2xl border-2 border-fuchsia-400/70 bg-secondary/95 p-5 text-center"
              style={{ boxShadow: '0 0 40px rgba(217,70,239,0.45), inset 0 0 30px rgba(217,70,239,0.08)' }}
            >
              <div className="mx-auto mb-2 w-20 h-20 rounded-xl border-2 border-fuchsia-400/60 bg-black/40 grid place-items-center overflow-hidden"
                style={{ boxShadow: '0 0 24px rgba(232,121,249,0.5)' }}
              >
                <ItemThumb name={LOOT_ITEM} emoji="🛡️" className="text-4xl" />
              </div>
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-300 mb-1">
                Item épico obtido
              </div>
              <div className="text-lg font-black text-white">{LOOT_ITEM}</div>
              <div className="text-[11px] text-textsec mt-1">
                🛡️ {lootMeta?.description ?? 'Escudo colossal da Guardiã.'}
              </div>
              <div className="text-[11px] font-bold text-fuchsia-300 mt-1">
                {lootMeta?.stats?.def ? `+${lootMeta.stats.def} DEF` : ''}{lootMeta?.stats?.hp ? ` · +${lootMeta.stats.hp} HP` : ''} · ÉPICO
              </div>
              <div className="mt-2 text-xs font-bold text-emerald-300">+320 XP · +240 🪙</div>
              <button
                onClick={onNext}
                className="mt-4 w-full px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
              >
                Desafiar jogadores reais →
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
