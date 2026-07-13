'use client'

// Página DEV: renderiza o DungeonRun com personagem falso e as rotas
// /api/dungeon/run/* STUBADAS no fetch (sem DB/auth) pra validar o layout de
// combate no mobile. Mesmo espírito do /dev/battle-fx.
import { useState, useEffect } from 'react'
import DungeonRun, { DungeonCharacter } from '@/components/dungeon/DungeonRun'
import { DUNGEONS, scaleMonster, scaleMonsterGroup, pickMonster, earlyPoolOf, rollNodeLoot, rollKillLoot } from '@/lib/dungeonAdventures'

const DUNGEON = DUNGEONS.floresta

const CHAR: DungeonCharacter = {
  id: 'dev-char',
  name: 'Drakmon',
  level: 3,
  experience: 603,
  nextLevelExperience: 1128,
  race: 'draconiano',
  class: 'monk',
  avatar: null,
  hp: 182,
  maxHp: 182,
  mp: 100,
  maxMp: 100,
  stamina: 156,
  maxStamina: 156,
  attack: 37,
  defense: 23,
  magicPower: 8,
  str: 18,
  agi: 12,
  int: 8,
  def: 10,
  // Gear com durabilidade BAIXA de propósito: em 2-3 abates dá pra ver o aviso
  // de "quase quebrando" e a quebra (peça some do cálculo + banner 💔).
  equipment: [
    {
      id: 'eq-w', slot: 'WEAPON', enhancementLevel: 0, durability: 6, maxDurability: 100,
      item: { id: 'w1', name: 'Espada de Recruta', type: 'SWORD', image: null, stats: { str: 9, rarity: 'COMMON' } },
    },
    {
      id: 'eq-a', slot: 'ARMOR', enhancementLevel: 0, durability: 3, maxDurability: 100,
      item: { id: 'a1', name: 'Peitoral de Couro', type: 'MEDIUM_ARMOR', image: null, stats: { def: 6, hp: 8, rarity: 'COMMON' } },
    },
  ],
}

function installFetchStub() {
  const real = window.fetch.bind(window)
  let stamina = 156
  let steps = 0      // nº do nó atual (1º = pacote travado)
  let lastRoll = 14  // d20 do nó corrente (classe dos drops por abate)
  let remaining = 0  // monstros vivos do nó (cleared quando zera)
  // Desgaste simulado no "servidor" do stub (arma −2/abate, resto −1) — espelha
  // a rota real /api/dungeon/run/combat.
  const dur: Record<string, { name: string; durability: number; maxDurability: number }> = {
    WEAPON: { name: 'Espada de Recruta', durability: 6, maxDurability: 100 },
    ARMOR: { name: 'Peitoral de Couro', durability: 3, maxDurability: 100 },
  }
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

    if (url.includes('/api/dungeon/run/start')) return json({ runId: 'dev-run', stamina })
    if (url.includes('/api/dungeon/run/heartbeat')) return json({ active: true })
    if (url.includes('/api/dungeon/run/step')) {
      stamina -= 4
      steps += 1
      // 1º nó: espelha a TRAVA do servidor — pacote de 3 do earlyPool com sorte 20
      // (valida o layout do pacote + drops "classe 20" + pedra destacada no card).
      if (steps === 1) {
        const monsters = scaleMonsterGroup(
          DUNGEON, CHAR.level, { tier: 1, isMain: false, isBoss: false }, 'monk', 1,
          { forcedSize: 3, pool: earlyPoolOf(DUNGEON) },
        )
        lastRoll = 20
        remaining = monsters.length
        return json({ type: 'monster', roll: 20, monsters, stamina })
      }
      // Demais nós: 1 inimigo, sorte 14 (layout clássico).
      const monster = scaleMonster(pickMonster(DUNGEON), DUNGEON, CHAR.level, { tier: 1, isMain: false })
      lastRoll = 14
      remaining = 1
      return json({ type: 'monster', roll: 14, monster, stamina })
    }
    if (url.includes('/api/dungeon/run/combat')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      // Protocolo por NÓ (espelha a rota real): 'clear' credita todos os vivos;
      // 'retreat'/'lose' credita só os killedIds reportados; desgaste em lote
      // (arma −2/abate, resto −1) e drops nos MESMOS geradores do servidor.
      const isClear = body.outcome === 'clear' || body.outcome === 'win'
      const isRunEnd = body.outcome === 'retreat' || body.outcome === 'lose'
      if (isClear || isRunEnd) {
        const kills = isClear
          ? remaining
          : Math.min(remaining, Array.isArray(body.killedIds) ? body.killedIds.length : 0)
        remaining = isClear ? 0 : Math.max(0, remaining - kills)
        const equipmentWear = kills === 0 ? [] : Object.entries(dur)
          .filter(([, d]) => d.durability > 0)
          .map(([slot, d]) => {
            d.durability = Math.max(0, d.durability - (slot === 'WEAPON' ? 2 : 1) * kills)
            return { slot, name: d.name, durability: d.durability, maxDurability: d.maxDurability, justBroke: d.durability === 0 }
          })
        const killDrops = Array.from({ length: kills }).flatMap(() =>
          rollKillLoot('minor', false, DUNGEON.difficultyStars, 1, lastRoll, DUNGEON))
        const nodeLoot = isClear
          ? rollNodeLoot(DUNGEON, lastRoll, 'minor', CHAR.level, CHAR.race, CHAR.class, 1)
          : null
        const loot = { gold: nodeLoot?.gold ?? 0, drops: [...killDrops, ...(nodeLoot?.drops ?? [])] }
        return json({
          granted: { gold: 12 * kills + loot.gold, killGold: 12 * kills, lootGold: loot.gold, xp: 20 * kills, loot, roll: lastRoll },
          cleared: isClear,
          equipmentWear,
          finished: isRunEnd,
          retreated: body.outcome === 'retreat',
          defeated: body.outcome === 'lose',
        })
      }
      return json({ finished: true })
    }
    if (url.includes('/api/dungeon/run/')) return json({ ok: true, active: false })
    if (url.includes('/api/character/')) return json({ ok: true })
    return real(input as RequestInfo, init)
  }
}

export default function DungeonMockPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    installFetchStub()
    setReady(true)
  }, [])
  if (!ready) return null
  return (
    <DungeonRun
      dungeon={DUNGEON}
      character={CHAR}
      onExit={() => window.location.reload()}
    />
  )
}
