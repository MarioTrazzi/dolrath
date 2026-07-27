// 🧬 Gera as imagens (avatar normal + forma(s) transformada) das combinações de
// raça×classe que AINDA NÃO existem como personagem, reaproveitando o mesmo
// estilo travado de characterImagePrompt.ts (o "pré-prompt" já cobre as 16
// combinações). Objetivo: ter a arte pronta ANTES do próximo reset, para criar
// os personagens faltantes sem pagar geração ao vivo pela rota paga.
//
// Hoje faltam 9 das 16 combinações (ver MISSING abaixo, calculado contra HAVE).
//
// Uso (via tsx):
//   npx tsx scripts/generate-missing-race-class-images.ts                    # gera tudo (pula já feitos)
//   npx tsx scripts/generate-missing-race-class-images.ts --dry-run          # só imprime os prompts
//   npx tsx scripts/generate-missing-race-class-images.ts --force            # regenera mesmo se já existe
//   npx tsx scripts/generate-missing-race-class-images.ts --only humano-warrior
//   npx tsx scripts/generate-missing-race-class-images.ts --skip-transform   # só o avatar normal
//
// Criar os personagens no banco a partir do manifesto gerado (opt-in, requer DATABASE_URL):
//   npx tsx scripts/generate-missing-race-class-images.ts --create-characters --user-email voce@exemplo.com
//   (idempotente: pula combinação que esse usuário já possui)
//
// Persistência:
//   • PNG/WEBP em public/character-seeds/<race>-<class>.webp (avatar) e
//     public/character-seeds/<race>-<class>-<transformType>.webp (transformação)
//   • Manifesto em scripts/missing-character-image-manifest.json

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { RACES, CLASSES, getRaceById, getClassById } from '../src/lib/gameData'
import {
  buildCombinationPreprompt,
  buildTransformationPrompt,
  type RaceId,
  type ClassId,
} from '../src/lib/characterImagePrompt'
import { getRaceTransformations, type TransformationType } from '../src/lib/transformationSystem'
import { rollCreationStats, computeCreationStats } from '../src/lib/characterStats'
import { SKILL_TREE_VERSION } from '../src/lib/skillTree'

// ---------- .env (manual, sem depender de dotenv) ----------
function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      const val = m[2].trim().replace(/^["']|["']$/g, '')
      if (!(key in process.env)) process.env[key] = val
    }
  }
}
loadEnv()

// ---------- args ----------
const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const DRY = has('--dry-run')
const FORCE = has('--force')
const SKIP_TRANSFORM = has('--skip-transform')
const ONLY = valOf('--only') // "<race>-<class>"
const CREATE_CHARACTERS = has('--create-characters')
const USER_EMAIL = valOf('--user-email')
const USER_ID = valOf('--user-id')

// ---------- combinações ----------
const HAVE: Array<{ race: RaceId; class: ClassId }> = [
  { race: 'humano', class: 'mage' },
  { race: 'metamorfo', class: 'monk' },
  { race: 'elfo', class: 'rogue' },
  { race: 'draconiano', class: 'warrior' },
  { race: 'draconiano', class: 'mage' },
  { race: 'draconiano', class: 'monk' },
  { race: 'draconiano', class: 'rogue' },
]
const haveKey = (r: string, c: string) => `${r}-${c}`
const HAVE_SET = new Set(HAVE.map((h) => haveKey(h.race, h.class)))

const MISSING: Array<{ race: RaceId; class: ClassId }> = []
for (const race of RACES.map((r) => r.id as RaceId)) {
  for (const classId of CLASSES.map((c) => c.id as ClassId)) {
    if (!HAVE_SET.has(haveKey(race, classId))) MISSING.push({ race, class: classId })
  }
}

// ---------- config ----------
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()
const EDIT_MODEL = (process.env.OPENAI_EDIT_MODEL || 'gpt-image-1').trim()
const SIZE = (process.env.OPENAI_IMAGE_SIZE || '1024x1024').trim()
const HAS_DB = Boolean((process.env.DATABASE_URL || '').trim())

const OUT_DIR = join('public', 'character-seeds')
const MANIFEST = join('scripts', 'missing-character-image-manifest.json')

// ---------- helpers ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isGptImage = MODEL.toLowerCase().startsWith('gpt-image')
const slug = (race: string, classId: string, suffix?: string) =>
  suffix ? `${race}-${classId}-${suffix}` : `${race}-${classId}`

async function generateFromText(prompt: string): Promise<Buffer> {
  const payload: Record<string, unknown> = { model: MODEL, prompt, n: 1, size: SIZE }
  if (isGptImage) {
    payload.quality = 'high'
    payload.output_format = 'webp'
    payload.output_compression = 80
  } else {
    payload.response_format = 'b64_json'
  }

  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify(payload),
      })
      const raw = await res.text()
      const json = raw ? JSON.parse(raw) : null
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
      const b64 = json?.data?.[0]?.b64_json
      if (!b64) throw new Error('resposta sem b64_json')
      return Buffer.from(b64, 'base64')
    } catch (err) {
      lastErr = err
      const wait = 2000 * attempt
      console.warn(`   ⚠️  tentativa ${attempt}/4 falhou: ${(err as Error).message}. Retry em ${wait}ms`)
      await sleep(wait)
    }
  }
  throw lastErr
}

async function editFromImage(baseImage: Buffer, prompt: string): Promise<Buffer> {
  const form = new FormData()
  form.append('model', EDIT_MODEL)
  form.append('prompt', prompt)
  form.append('n', '1')
  form.append('size', SIZE)
  form.append('image', new Blob([baseImage], { type: 'image/webp' }), 'base.webp')

  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      })
      const raw = await res.text()
      const json = raw ? JSON.parse(raw) : null
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`)
      const b64 = json?.data?.[0]?.b64_json
      if (!b64) throw new Error('resposta sem b64_json')
      return Buffer.from(b64, 'base64')
    } catch (err) {
      lastErr = err
      const wait = 2000 * attempt
      console.warn(`   ⚠️  tentativa ${attempt}/4 falhou: ${(err as Error).message}. Retry em ${wait}ms`)
      await sleep(wait)
    }
  }
  throw lastErr
}

type ManifestEntry = {
  race: string
  class: string
  avatar: string
  transformations: Record<string, string>
}

async function main() {
  if (!DRY && !OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente no ambiente (.env).')
  if (CREATE_CHARACTERS && !HAS_DB) throw new Error('--create-characters requer DATABASE_URL no ambiente (.env).')
  if (CREATE_CHARACTERS && !USER_EMAIL && !USER_ID) throw new Error('--create-characters requer --user-email <email> ou --user-id <id>.')

  console.log(`🧬 Gerador de imagens das combinações raça×classe faltantes`)
  console.log(
    `   modelo=${MODEL} edit=${EDIT_MODEL} size=${SIZE} · dryRun=${DRY} · force=${FORCE} · skipTransform=${SKIP_TRANSFORM}`
  )
  console.log(`   ${MISSING.length} combinação(ões) faltando de ${RACES.length * CLASSES.length}\n`)

  if (!DRY) mkdirSync(OUT_DIR, { recursive: true })

  const manifest: Record<string, ManifestEntry> = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
    : {}

  for (const { race, class: classId } of MISSING) {
    const key = haveKey(race, classId)
    if (ONLY && ONLY !== key) continue

    const raceData = getRaceById(race)
    const classData = getClassById(classId)
    if (!raceData || !classData) throw new Error(`raça/classe inválida: ${key}`)

    console.log(`\n=== ${raceData.name} / ${classData.name} (${key}) ===`)

    const avatarSlug = slug(race, classId)
    const avatarPath = join(OUT_DIR, `${avatarSlug}.webp`)
    const avatarPublicPath = `/character-seeds/${avatarSlug}.webp`

    const avatarPrompt = buildCombinationPreprompt({
      raceId: race,
      classId,
      raceName: raceData.name,
      className: classData.name,
    })

    let avatarBuffer: Buffer | null = null
    if (DRY) {
      console.log(`📝 avatar →\n${avatarPrompt}\n`)
    } else if (!FORCE && existsSync(avatarPath)) {
      console.log(`⏭️  avatar já existe (${avatarPublicPath})`)
      avatarBuffer = readFileSync(avatarPath)
    } else {
      process.stdout.write(`🖌️  avatar … `)
      avatarBuffer = await generateFromText(avatarPrompt)
      writeFileSync(avatarPath, avatarBuffer)
      console.log(`✅ ${avatarPublicPath}`)
      await sleep(1200)
    }

    const transformations: Record<string, string> = {}
    const types = getRaceTransformations(race) as TransformationType[]

    if (!SKIP_TRANSFORM) {
      for (const type of types) {
        const tSlug = slug(race, classId, type)
        const tPath = join(OUT_DIR, `${tSlug}.webp`)
        const tPublicPath = `/character-seeds/${tSlug}.webp`

        const tPrompt = buildTransformationPrompt(type, {
          classId,
          className: classData.name,
        })

        if (DRY) {
          console.log(`📝 transform[${type}] →\n${tPrompt}\n`)
          transformations[type] = tPublicPath
          continue
        }

        if (!FORCE && existsSync(tPath)) {
          console.log(`⏭️  transform[${type}] já existe (${tPublicPath})`)
          transformations[type] = tPublicPath
          continue
        }

        if (!avatarBuffer) {
          console.log(`⚠️  transform[${type}] pulado: sem avatar base em memória`)
          continue
        }

        process.stdout.write(`🖌️  transform[${type}] … `)
        const tBuffer = await editFromImage(avatarBuffer, tPrompt)
        writeFileSync(tPath, tBuffer)
        transformations[type] = tPublicPath
        console.log(`✅ ${tPublicPath}`)
        await sleep(1200)
      }
    }

    manifest[key] = { race, class: classId, avatar: avatarPublicPath, transformations }
    if (!DRY) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  }

  console.log(`\n✅ Concluído. Manifesto em ${MANIFEST}`)

  if (CREATE_CHARACTERS && !DRY) {
    await createCharacters(manifest)
  }
}

// Cria, para o usuário indicado, os personagens das combinações faltantes que
// ainda não existem na conta dele — usando as imagens do manifesto (sem
// chamar a OpenAI de novo). Metamorfo trava em 'wolf' como forma padrão
// (as 3 imagens ficam salvas em transformationImages para trocar depois).
async function createCharacters(manifest: Record<string, ManifestEntry>) {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  const userLabel = USER_ID || USER_EMAIL
  const user = USER_ID
    ? await prisma.user.findUnique({ where: { id: USER_ID } })
    : await prisma.user.findUnique({ where: { email: USER_EMAIL } })
  if (!user) throw new Error(`Usuário não encontrado: ${userLabel}`)

  console.log(`\n👤 Criando personagens faltantes para ${userLabel} (${user.id})`)

  const CLASS_ROLL_SEED: Record<string, number> = {
    warrior: 0xc0de0001,
    rogue: 0xc0de0002,
    mage: 0xc0de0003,
    monk: 0xc0de0004,
  }

  let created = 0
  for (const { race, class: classId } of MISSING) {
    const key = haveKey(race, classId)
    const entry = manifest[key]
    if (!entry) {
      console.log(`⚠️  ${key}: sem entrada no manifesto, pulando`)
      continue
    }

    const already = await prisma.character.findFirst({ where: { userId: user.id, race, class: classId } })
    if (already) {
      console.log(`⏭️  ${key}: já existe (${already.name})`)
      continue
    }

    const raceData = getRaceById(race)!
    const classData = getClassById(classId)!
    const seed = CLASS_ROLL_SEED[classId] ?? 0xc0de0000
    const rolled = rollCreationStats(seed, classId)
    const { final, derived } = computeCreationStats(race, classId, rolled)

    const defaultTransform = Object.keys(entry.transformations)[0] || null

    const baseStats = {
      hp: derived.hp, maxHp: derived.hp,
      mp: derived.mp, maxMp: derived.mp,
      stamina: derived.stamina, maxStamina: derived.stamina,
      str: final.str, agi: final.agi, int: final.int, def: final.def,
      attack: derived.attack, defense: derived.defense, critical: derived.critical,
      magicPower: derived.magicPower, dodgeChance: derived.dodgeChance,
      magicResistance: derived.magicResistance,
      raceBonuses: { abilities: raceData.abilities ?? [] },
      classBonuses: { abilities: classData.abilities ?? [] },
    }

    const attributes = {
      distributedStr: rolled.str, distributedAgi: rolled.agi, distributedInt: rolled.int, distributedDef: rolled.def,
      str: final.str, agi: final.agi, int: final.int, def: final.def,
      crit: derived.critical, speed: derived.speed,
      canTransform: raceData.transformationAvailable,
      raceAbilities: raceData.abilities ?? [],
      classAbilities: classData.abilities ?? [],
    }

    const character = await prisma.character.create({
      data: {
        userId: user.id,
        name: `${raceData.name} ${classData.name}`,
        race,
        class: classId,
        avatar: entry.avatar,
        level: 1,
        experience: 0,
        gold: 1000,
        availablePoints: 1,
        attributes,
        baseStats,
        hp: derived.hp, maxHp: derived.hp,
        mp: derived.mp, maxMp: derived.mp,
        stamina: derived.stamina, maxStamina: derived.stamina,
        isAlive: true,
        skillTree: { version: SKILL_TREE_VERSION, purchased: [] },
        unlockedTransformation: defaultTransform,
        transformationImage: defaultTransform ? entry.transformations[defaultTransform] : null,
        transformationImages: entry.transformations,
      },
    })
    created++
    console.log(`✅ ${key} → ${character.name} (${character.id})`)
  }

  console.log(`\n✅ ${created} personagem(ns) criado(s) para ${userLabel}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
