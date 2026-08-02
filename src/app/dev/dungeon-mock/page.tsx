'use client'

// Página DEV: renderiza o DungeonRun com personagem falso e as rotas
// /api/dungeon/run/* STUBADAS no fetch (sem DB/auth) pra validar o layout de
// combate no mobile. Mesmo espírito do /dev/battle-fx.
import { useState, useEffect } from 'react'
import DungeonRun, { DungeonCharacter } from '@/components/dungeon/DungeonRun'
import { DUNGEONS, scaleMonster, scaleMonsterGroup, pickMonster, earlyPoolOf, rollNodeLoot, rollKillLoot } from '@/lib/dungeonAdventures'

const DUNGEON = DUNGEONS.floresta

// Combinação padrão; troque pela URL pra conferir os outros bonecos na cena:
//   /dev/dungeon-mock?race=humano&class=mage
//   /dev/dungeon-mock?race=metamorfo&class=monk
//   /dev/dungeon-mock?race=draconiano&class=warrior
// Uma combinação sem boneco (ex.: elfo/mage) cai no retrato/procedural.
const CHAR: DungeonCharacter = {
  id: 'dev-char',
  name: 'Lyra',
  level: 3,
  experience: 603,
  nextLevelExperience: 1128,
  race: 'elfo',
  class: 'rogue',
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
  // ⏱️ Latência FALSA do /step, em ms — o stub responde instantâneo, o que
  // esconde justamente o que se quer medir aqui. Com o /step disparado no início
  // da caminhada (prefetchStep), a régua é:
  //   ?stepDelay=600   → a resposta chega DURANTE a caminhada: nenhum flash.
  //   ?stepDelay=4000  → chega depois: 3 piscadas e a espera calma ("Algo se move...").
  // O que não pode voltar a acontecer é piscar sem parar.
  const stepDelay = Number(new URLSearchParams(window.location.search).get('stepDelay') || 0)
  const lag = () => (stepDelay > 0 ? new Promise(r => setTimeout(r, stepDelay)) : Promise.resolve())
  let stamina = 156
  let steps = 0      // nº do nó atual (1º = pacote travado)
  // Espólio ACUMULADO da run, como no DungeonRun.accrued do servidor: o stub só
  // credita no /finish, igual à rota real.
  const accrued = { gold: 0, xp: 0, kills: 0, drops: [] as any[] }
  let pending: { monsters: any[]; killDrops: Record<string, any[]>; nodeLoot: any; roll: number } | null = null
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

    if (url.includes('/api/dungeon/run/start')) {
      // Slots quase no fim: dá pra ver a previsão de "inventário cheio" agir.
      return json({ runId: 'dev-run', stamina, inventoryUsed: 16, inventorySlots: 20 })
    }
    if (url.includes('/api/dungeon/run/heartbeat')) return json({ active: true })
    if (url.includes('/api/dungeon/run/step')) {
      await lag()
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      // Desfecho do nó anterior de CARONA (protocolo real): absorve no acumulado.
      let absorbed = false
      if (body.resolve && pending) {
        absorbed = true
        const killed: string[] = Array.isArray(body.resolve.killedIds) ? body.resolve.killedIds : []
        const dead = pending.monsters.filter(m => killed.includes(m.id))
        accrued.kills += dead.length
        accrued.gold += dead.reduce((s, m) => s + m.goldReward, 0)
        accrued.xp += dead.reduce((s, m) => s + m.xpReward, 0)
        for (const m of dead) accrued.drops.push(...(pending.killDrops[m.id] ?? []))
        if (dead.length === pending.monsters.length && pending.nodeLoot) {
          accrued.gold += pending.nodeLoot.gold
          accrued.drops.push(...pending.nodeLoot.drops)
        }
        pending = null
      }
      stamina -= 4
      steps += 1
      // 1º nó: espelha a TRAVA do servidor — pacote de 3 do earlyPool com sorte 20
      // (valida o layout do pacote + drops "classe 20" + pedra destacada no card).
      const roll = steps === 1 ? 20 : 14
      const monsters = steps === 1
        ? scaleMonsterGroup(
            DUNGEON, CHAR.level, { tier: 1, isMain: false, isBoss: false }, 'monk', 1,
            { forcedSize: 3, pool: earlyPoolOf(DUNGEON) },
          )
        : [scaleMonster(pickMonster(DUNGEON), DUNGEON, CHAR.level, { tier: 1, isMain: false })]
      // O espólio é rolado JÁ no passo (como na rota real) — é o que permite o
      // card de vitória sair sem rede.
      const killDrops: Record<string, any[]> = {}
      for (const m of monsters) {
        killDrops[m.id] = rollKillLoot('minor', false, DUNGEON.difficultyStars, 1, roll, DUNGEON)
      }
      const nodeLoot = rollNodeLoot(DUNGEON, roll, 'minor', CHAR.level, CHAR.race, CHAR.class, 1)
      pending = { monsters, killDrops, nodeLoot, roll }
      // `resolved` fecha o protocolo real: é a confirmação que autoriza o cliente
      // a descartar o desfecho guardado. Sem ele a bancada reenviava o mesmo
      // resolve em todo passo — e não exercitava esse ramo.
      return json({ resolved: absorbed, type: 'monster', roll, monster: monsters[0], monsters, killDrops, nodeLoot, stamina })
    }
    if (url.includes('/api/dungeon/run/finish')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (body.resolve && pending) {
        const killed: string[] = Array.isArray(body.resolve.killedIds) ? body.resolve.killedIds : []
        const dead = pending.monsters.filter(m => killed.includes(m.id))
        accrued.kills += dead.length
        accrued.gold += dead.reduce((s, m) => s + m.goldReward, 0)
        accrued.xp += dead.reduce((s, m) => s + m.xpReward, 0)
        for (const m of dead) accrued.drops.push(...(pending.killDrops[m.id] ?? []))
        if (dead.length === pending.monsters.length && body.resolve.outcome === 'clear') {
          accrued.gold += pending.nodeLoot.gold
          accrued.drops.push(...pending.nodeLoot.drops)
        }
        pending = null
      }
      // Desgaste em lote (arma −2/abate, resto −1), como o flush do servidor.
      const equipmentWear = [
        { slot: 'WEAPON', name: 'Espada de Recruta', durability: Math.max(0, 6 - 2 * accrued.kills), maxDurability: 100, justBroke: 6 - 2 * accrued.kills <= 0 },
        { slot: 'ARMOR', name: 'Peitoral de Couro', durability: Math.max(0, 3 - accrued.kills), maxDurability: 100, justBroke: 3 - accrued.kills <= 0 },
      ]
      // Mochila com 4 slots livres: o excedente volta como perdido (o resumo
      // precisa mostrar a reconciliação, não fingir que coletou).
      const skippedDrops = accrued.drops.slice(4)
      return json({
        finished: true, gold: accrued.gold, xp: accrued.xp, kills: accrued.kills,
        drops: accrued.drops, skippedDrops, equipmentWear,
        bossDefeated: body.reason === 'boss', leveledUp: false,
      })
    }
    if (url.includes('/api/dungeon/run/')) return json({ ok: true, active: false })
    if (url.includes('/api/character/')) return json({ ok: true })
    return real(input as RequestInfo, init)
  }
}

export default function DungeonMockPage() {
  const [ready, setReady] = useState(false)
  const [hero, setHero] = useState<DungeonCharacter>(CHAR)
  useEffect(() => {
    installFetchStub()
    // Raça/classe pela query — o boneco da cena vem de heroSprites.ts.
    const q = new URLSearchParams(window.location.search)
    const race = q.get('race')
    const cls = q.get('class')
    if (race || cls) {
      setHero({ ...CHAR, race: race || CHAR.race, class: cls || CHAR.class })
    }
    setReady(true)
  }, [])
  if (!ready) return null
  return (
    <DungeonRun
      dungeon={DUNGEON}
      character={hero}
      onExit={() => window.location.reload()}
    />
  )
}
