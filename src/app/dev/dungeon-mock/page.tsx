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
// 🃏 As cartas vêm LIGADAS aqui; `?cards=0` volta ao menu "⚔️ Ataque" pra comparar.
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

// Snapshot do set para o espólio de manutenção (o que a rota /step monta com
// gearSnapshotOf). Mesmas peças e durabilidades do CHAR acima.
const MOCK_GEAR = CHAR.equipment.map(eq => ({
  name: eq.item.name,
  type: eq.item.type,
  durability: eq.durability,
  maxDurability: eq.maxDurability,
}))

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
      // ?bagFull=1 entra com a mochila JÁ cheia — é o caso em que o freio 🎒
      // encerra a run antes de gastar o primeiro passo.
      const bagFull = new URLSearchParams(window.location.search).get('bagFull') === '1'
      return json({
        runId: 'dev-run', stamina,
        inventoryUsed: bagFull ? 20 : 16, inventorySlots: 20, inventoryFull: bagFull,
      })
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
        killDrops[m.id] = rollKillLoot('minor', false, DUNGEON.difficultyStars, 1, roll, DUNGEON, MOCK_GEAR)
      }
      // 🔧 O set do mock entra quase quebrado, então o espólio de MANUTENÇÃO cai
      // na frequência máxima — é o jeito de ver o "🔧 (repara X)" no log sem banco.
      const nodeLoot = rollNodeLoot(DUNGEON, roll, 'minor', CHAR.level, CHAR.race, CHAR.class, 1, MOCK_GEAR)
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

/**
 * 🌑 Simulador de ABA EM SEGUNDO PLANO — `?bg=1` mostra o botão.
 *
 * Reproduz, com a aba na sua frente, as DUAS coisas que o browser faz quando o
 * jogo vai para trás: `document.hidden` vira true (com o `visibilitychange`
 * correspondente) e o `requestAnimationFrame` para de correr. Era esse rAF
 * parado que congelava a run inteira — dá para ver a stamina descendo mesmo com
 * o mundo imóvel, e o herói sendo replantado no nó certo ao "voltar".
 *
 * O que ele NÃO simula: o estrangulamento dos timers da página (1 disparo/min),
 * que é o que o relógio em worker resolve. Aqui os timers correm normais.
 */
function useFakeBackground() {
  const [faking, setFaking] = useState(false)
  useEffect(() => {
    if (!faking) return
    const realRaf = window.requestAnimationFrame
    const ownHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame
    document.dispatchEvent(new Event('visibilitychange'))
    return () => {
      window.requestAnimationFrame = realRaf
      delete (document as unknown as Record<string, unknown>).hidden
      if (ownHidden) Object.defineProperty(Document.prototype, 'hidden', ownHidden)
      document.dispatchEvent(new Event('visibilitychange'))
    }
  }, [faking])
  return { faking, setFaking }
}

function BackgroundToggle() {
  const { faking, setFaking } = useFakeBackground()
  return (
    <button
      onClick={() => setFaking(v => !v)}
      className="fixed bottom-3 right-3 z-[9999] rounded-lg border border-amber-500/40 bg-zinc-900/95 px-3 py-2 text-xs font-semibold text-amber-200 shadow-lg"
    >
      {faking ? '▶ voltar para a aba' : '⏸ simular segundo plano'}
    </button>
  )
}

export default function DungeonMockPage() {
  const [ready, setReady] = useState(false)
  const [bgTool, setBgTool] = useState(false)
  const [hero, setHero] = useState<DungeonCharacter>(CHAR)
  // 🃏 Modo carta LIGADO por padrão nesta bancada (é aqui que ele se testa); `?cards=0`
  // volta ao menu de sempre para comparar lado a lado. Em produção o padrão é o inverso.
  const [cards, setCards] = useState(true)
  useEffect(() => {
    installFetchStub()
    setBgTool(new URLSearchParams(window.location.search).get('bg') === '1')
    setCards(new URLSearchParams(window.location.search).get('cards') !== '0')
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
    <>
      <DungeonRun
        dungeon={DUNGEON}
        character={hero}
        cards={cards}
        onExit={() => window.location.reload()}
      />
      {bgTool && <BackgroundToggle />}
    </>
  )
}
