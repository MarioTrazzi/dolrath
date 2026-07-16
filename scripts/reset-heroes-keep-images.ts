/**
 * DESTRUTIVO (mas PRESERVA IMAGENS) — reseta TODO personagem para fresh level 1,
 * re-rolando os 18 pontos de criação com o perfil da CLASSE de cada herói
 * (mesma lógica de src/lib/characterStats.ts / POST /api/character).
 *
 * PRESERVA: avatar, transformationImage, transformationImages, unlockedTransformation,
 *           name/race/class, campos de NFT.
 *
 * POR PERSONAGEM:
 *   • Rola 18 pts via rollCreationStats(seed, classId) — seed aleatória por herói
 *   • Stats finais = rolled + race/class bonuses + piso 8 em str/agi/int
 *   • level=1, experience=0, gold=0, availablePoints=1
 *   • skillTree limpa { version, purchased: [] }
 *   • hp/mp/stamina cheios; failstacks=0; transformação limpa
 *   • apaga inventário, equipamento, histórico, dungeon runs e sessões de coleta
 *   • zera XP de profissões (gather/farm/forge/alchemy/process/cook)
 *
 * Conta: goldBalance=1000, globalInventorySlots=50, UserInventory vazio.
 *
 * USO:
 *   Dry-run:  npx tsx scripts/reset-heroes-keep-images.ts
 *   Live:     CONFIRM=RESET_ALL npx tsx scripts/reset-heroes-keep-images.ts
 */

import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'
import {
  computeCreationStats,
  rollCreationStats,
} from '../src/lib/characterStats'
import { getRaceById, getClassById } from '../src/lib/gameData'
import { SKILL_TREE_VERSION } from '../src/lib/skillTree'

const prisma = new PrismaClient()

const AVAILABLE_POINTS = 1
const DEFAULT_GOLD = 1000
const DEFAULT_GLOBAL_SLOTS = 50
const DEFAULT_INV_SLOTS = 10

function freshSeed(): number {
  return randomBytes(4).readUInt32BE(0)
}

function buildFreshCharacter(race: string, classId: string, seed: number) {
  const rolled = rollCreationStats(seed, classId)
  const stats = computeCreationStats(race, classId, rolled)
  const raceData = getRaceById(race)
  const classData = getClassById(classId)

  const { final, derived, race: raceB, class: classB } = stats

  const baseStats = {
    hp: derived.hp,
    maxHp: derived.hp,
    mp: derived.mp,
    maxMp: derived.mp,
    stamina: derived.stamina,
    maxStamina: derived.stamina,
    str: final.str,
    agi: final.agi,
    int: final.int,
    def: final.def,
    attack: derived.attack,
    defense: derived.defense,
    critical: derived.critical,
    magicPower: derived.magicPower,
    dodgeChance: derived.dodgeChance,
    magicResistance: derived.magicResistance,
    raceBonuses: {
      str: raceB.str,
      agi: raceB.agi,
      int: raceB.int,
      def: raceB.def,
      abilities: raceData?.abilities ?? [],
    },
    classBonuses: {
      str: classB.str,
      agi: classB.agi,
      int: classB.int,
      def: classB.def,
      abilities: classData?.abilities ?? [],
    },
  }

  const attributes = {
    distributedStr: rolled.str,
    distributedAgi: rolled.agi,
    distributedInt: rolled.int,
    distributedDef: rolled.def,
    str: final.str,
    agi: final.agi,
    int: final.int,
    def: final.def,
    crit: derived.critical,
    speed: derived.speed,
    magicResistance: final.int * 0.2 + final.def * 0.1,
    canTransform: raceData?.transformationAvailable ?? false,
    isTransformed: false,
    transformationType: null,
    transformationData: null,
    raceAbilities: raceData?.abilities ?? [],
    classAbilities: classData?.abilities ?? [],
    strength: final.str,
    agility: final.agi,
    intelligence: final.int,
    defense: final.def,
  }

  return { rolled, final, derived, baseStats, attributes }
}

async function main() {
  const live = process.env.CONFIRM === 'RESET_ALL'
  const chars = await prisma.character.findMany({
    select: {
      id: true,
      name: true,
      race: true,
      class: true,
      level: true,
      gold: true,
      avatar: true,
      transformationImage: true,
      transformationImages: true,
    },
  })
  const [users, ui] = await Promise.all([
    prisma.user.count(),
    prisma.userInventory.count(),
  ])

  console.log(
    `🔎 ${chars.length} personagens, ${users} usuários, ${ui} itens no baú geral (UserInventory)\n`
  )
  console.log(
    live
      ? '🔴 LIVE — CONFIRM=RESET_ALL — vai gravar\n'
      : '🟡 DRY-RUN — nada será escrito\n'
  )

  const previews: Array<{
    id: string
    name: string
    race: string
    classId: string
    seed: number
    payload: ReturnType<typeof buildFreshCharacter>
  }> = []

  for (const c of chars) {
    const seed = freshSeed()
    const payload = buildFreshCharacter(c.race, c.class, seed)
    previews.push({
      id: c.id,
      name: c.name,
      race: c.race,
      classId: c.class,
      seed,
      payload,
    })
    const { rolled, final, derived } = payload
    console.log(
      `${c.name} (${c.race}/${c.class}) nv${c.level} gold ${c.gold}` +
        ` → rolled ${rolled.str}/${rolled.agi}/${rolled.int}/${rolled.def}` +
        ` | final ${final.str}/${final.agi}/${final.int}/${final.def}` +
        ` | hp ${derived.hp} mp ${derived.mp} stam ${derived.stamina}` +
        ` | pts=${AVAILABLE_POINTS}` +
        ` | imgs avatar=${c.avatar ? 'sim' : 'não'} transform=${c.transformationImage ? 'sim' : 'não'}`
    )
  }

  if (!live) {
    console.log(
      '\n🟡 DRY-RUN — nada foi escrito. Para executar: CONFIRM=RESET_ALL npx tsx scripts/reset-heroes-keep-images.ts'
    )
    return
  }

  let ok = 0
  for (const p of previews) {
    const { baseStats, attributes, derived } = p.payload
    await prisma.$transaction([
      prisma.characterInventory.deleteMany({ where: { characterId: p.id } }),
      prisma.characterEquipment.deleteMany({ where: { characterId: p.id } }),
      prisma.characterHistory.deleteMany({ where: { characterId: p.id } }),
      prisma.dungeonRun.deleteMany({ where: { characterId: p.id } }),
      prisma.gatheringSession.deleteMany({ where: { characterId: p.id } }),
      prisma.character.update({
        where: { id: p.id },
        data: {
          level: 1,
          experience: 0,
          gold: 0,
          availablePoints: AVAILABLE_POINTS,
          inventorySlots: DEFAULT_INV_SLOTS,
          failstacks: 0,
          // Profissões zeradas junto do herói (evita sessão em campo travado por nível).
          gatherXp: 0,
          farmXp: 0,
          forgeXp: 0,
          alchemyXp: 0,
          processXp: 0,
          cookXp: 0,
          skillTree: { version: SKILL_TREE_VERSION, purchased: [] },
          baseStats,
          attributes,
          hp: derived.hp,
          maxHp: derived.hp,
          mp: derived.mp,
          maxMp: derived.mp,
          stamina: derived.stamina,
          maxStamina: derived.stamina,
          staminaUpdatedAt: new Date(),
          isAlive: true,
          deathTimestamp: null,
          isTransformed: false,
          transformationType: null,
          transformationData: null,
        },
      }),
    ])
    ok++
    console.log(`  ✓ ${p.name} resetado (seed=${p.seed})`)
  }

  await prisma.userInventory.deleteMany({})
  const uRes = await prisma.user.updateMany({
    data: { goldBalance: DEFAULT_GOLD, globalInventorySlots: DEFAULT_GLOBAL_SLOTS },
  })
  console.log(
    `\n✅ ${ok} personagens resetados | baú geral esvaziado | ${uRes.count} contas com gold=${DEFAULT_GOLD}`
  )
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
