/**
 * Seed idempotente da frota 4×4 (User.isBot + Character).
 *
 * Usage:
 *   BOT_FLEET_SECRET=... DATABASE_URL=... npx ts-node --compiler-options '{"module":"commonjs"}' -r tsconfig-paths/register scripts/bot-fleet-seed.ts
 *
 * Escreve scripts/bot-fleet-registry.json com os 16 characterIds.
 */
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { rollCreationStats, computeCreationStats } from '../src/lib/characterStats'
import { SKILL_TREE_VERSION } from '../src/lib/skillTree'
import { getRaceById, getClassById } from '../src/lib/gameData'

const prisma = new PrismaClient()

const RACES = ['humano', 'draconiano', 'metamorfo', 'elfo'] as const
const CLASSES = ['warrior', 'rogue', 'mage', 'monk'] as const

const CLASS_LABEL: Record<string, string> = {
  warrior: 'Guerreiro',
  rogue: 'Ladino',
  mage: 'Mago',
  monk: 'Monge',
}
const RACE_LABEL: Record<string, string> = {
  humano: 'Humano',
  draconiano: 'Draconiano',
  metamorfo: 'Metamorfo',
  elfo: 'Elfo',
}

/** Seed fixa por classe → mesma distribuição base para todos da classe. */
const CLASS_ROLL_SEED: Record<string, number> = {
  warrior: 0xb07f1e01,
  rogue: 0xb07f1e02,
  mage: 0xb07f1e03,
  monk: 0xb07f1e04,
}

type RegistryEntry = {
  key: string
  race: string
  class: string
  userId: string
  characterId: string
  name: string
}

async function upsertBot(race: string, classId: string): Promise<RegistryEntry> {
  const key = `bot_${race}_${classId}`
  const email = `${key}@bots.dolrath.local`
  const name = `Bot ${RACE_LABEL[race]} ${CLASS_LABEL[classId]}`

  const raceData = getRaceById(race)
  const classData = getClassById(classId)
  if (!raceData || !classData) throw new Error(`Invalid race/class ${race}/${classId}`)

  const rolled = rollCreationStats(CLASS_ROLL_SEED[classId], classId)
  const created = computeCreationStats(race, classId, rolled)
  const { final, derived } = created

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: `Fleet ${name}`,
      isBot: true,
      goldBalance: 50_000,
    },
    update: {
      isBot: true,
      name: `Fleet ${name}`,
    },
  })

  const existing = await prisma.character.findFirst({
    where: { userId: user.id, name },
  })

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
    canTransform: raceData.transformationAvailable,
  }

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
  }

  const character = existing
    ? await prisma.character.update({
        where: { id: existing.id },
        data: {
          race,
          class: classId,
          level: existing.level || 1,
          attributes,
          baseStats,
          hp: derived.hp,
          maxHp: derived.hp,
          mp: derived.mp,
          maxMp: derived.mp,
          stamina: derived.stamina,
          maxStamina: derived.stamina,
          isAlive: true,
          gold: Math.max(existing.gold, 5000),
          skillTree: existing.skillTree ?? { version: SKILL_TREE_VERSION, purchased: [] },
        },
      })
    : await prisma.character.create({
        data: {
          userId: user.id,
          name,
          race,
          class: classId,
          level: 1,
          experience: 0,
          attributes,
          baseStats,
          hp: derived.hp,
          maxHp: derived.hp,
          mp: derived.mp,
          maxMp: derived.mp,
          stamina: derived.stamina,
          maxStamina: derived.stamina,
          isAlive: true,
          gold: 5000,
          skillTree: { version: SKILL_TREE_VERSION, purchased: [] },
        },
      })

  return {
    key,
    race,
    class: classId,
    userId: user.id,
    characterId: character.id,
    name,
  }
}

async function main() {
  const registry: RegistryEntry[] = []
  for (const race of RACES) {
    for (const classId of CLASSES) {
      const entry = await upsertBot(race, classId)
      registry.push(entry)
      console.log(`✓ ${entry.name} (${entry.characterId})`)
    }
  }

  const outPath = path.join(__dirname, 'bot-fleet-registry.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), bots: registry }, null, 2)
  )
  console.log(`\nWrote ${registry.length} bots → ${outPath}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
