// 🐺 Gera as imagens dos MONSTROS das masmorras com a OpenAI, no MESMO estilo das
// imagens de personagem e do boss já existente (monsterImagePrompt.ts reaproveita o
// estilo travado). Hoje cobre a Floresta Sombria; o boss (Anciã da Mata) JÁ tem arte
// (/boss-ancia-da-mata.webp) e é reaproveitado — não é gerado aqui.
//
// Uso (via tsx):
//   npx tsx scripts/generate-monster-images.ts                 # gera tudo (pula já feitos)
//   npx tsx scripts/generate-monster-images.ts --only "Lobo Faminto"
//   npx tsx scripts/generate-monster-images.ts --dungeon floresta
//   npx tsx scripts/generate-monster-images.ts --dry-run       # só imprime os prompts
//   npx tsx scripts/generate-monster-images.ts --force         # regenera mesmo se já existe
//
// Persistência: salva o WEBP em public/monsters/<slug>.webp (asset estático / commit).
// Os monstros são definições estáticas (dungeonAdventures.ts), não itens de DB —
// o wiring da imagem é por caminho (monsterImagePath).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { DUNGEONS, type DungeonId, monsterImageSlug } from '../src/lib/dungeonAdventures'
import { buildMonsterImagePrompt, MONSTER_ART } from '../src/lib/monsterImagePrompt'

// ---------- .env (manual, sem depender de dotenv) ----------
function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      const val = m[2].trim().replace(/^["']|["']$/g, '') // tira aspas
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
const ONLY = valOf('--only')
const DUNGEON = valOf('--dungeon') as DungeonId | undefined

// ---------- config ----------
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()
// Monstro de corpo inteiro → retrato vertical, igual à arte do boss da floresta.
const SIZE = (process.env.OPENAI_MONSTER_IMAGE_SIZE || '1024x1536').trim()

const OUT_DIR = join('public', 'monsters')

// ---------- helpers ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isGptImage = MODEL.toLowerCase().startsWith('gpt-image')

async function generateOne(prompt: string): Promise<Buffer> {
  const payload: Record<string, unknown> = { model: MODEL, prompt, n: 1, size: SIZE }
  if (isGptImage) {
    payload.quality = 'high'        // mesmo nível das imagens de personagem/itens
    payload.output_format = 'webp'  // asset compacto para commitar
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

// ---------- subjects ----------
type Subject = { name: string; dungeon: DungeonId }

const subjects: Subject[] = []
for (const id of Object.keys(DUNGEONS) as DungeonId[]) {
  const dungeon = DUNGEONS[id]
  // só geramos os que têm arte definida em MONSTER_ART (hoje: floresta já tem asset
  // próprio pronto; caverna/pântano/ruínas ainda pendentes de geração).
  for (const m of dungeon.monsters) {
    if (MONSTER_ART[m.name]) subjects.push({ name: m.name, dungeon: id })
  }
  // boss: floresta reaproveita /boss-ancia-da-mata.webp (fora deste gerador); os
  // demais bosses (caverna/pântano/ruínas) também têm arte em MONSTER_ART.
  if (MONSTER_ART[dungeon.boss.name]) subjects.push({ name: dungeon.boss.name, dungeon: id })
}

async function main() {
  if (!DRY && !OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente no ambiente (.env).')

  console.log(`🐺 Gerador de imagens de monstros`)
  console.log(`   modelo=${MODEL} size=${SIZE} · dryRun=${DRY} · force=${FORCE}`)
  console.log(`   ${subjects.length} monstro(s) com arte definida\n`)

  if (!DRY) mkdirSync(OUT_DIR, { recursive: true })

  let done = 0
  let made = 0
  for (const s of subjects) {
    if (ONLY && s.name !== ONLY) continue
    if (DUNGEON && s.dungeon !== DUNGEON) continue

    const slug = monsterImageSlug(s.name)
    const filePath = join(OUT_DIR, `${slug}.webp`)
    const publicPath = `/monsters/${slug}.webp`

    if (!FORCE && existsSync(filePath)) {
      console.log(`⏭️  ${s.name} (já existe ${publicPath})`)
      done++
      continue
    }

    const prompt = buildMonsterImagePrompt({ name: s.name, art: MONSTER_ART[s.name] })

    if (DRY) {
      console.log(`📝 ${s.name} [${s.dungeon}] →\n${prompt}\n`)
      made++
      continue
    }

    process.stdout.write(`🖌️  ${s.name} [${s.dungeon}] … `)
    try {
      const img = await generateOne(prompt)
      writeFileSync(filePath, img)
      console.log(`✅ ${publicPath}`)
      made++
      await sleep(1200) // respeita rate limit
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`)
    }
    done++
  }

  console.log(`\n✅ Concluído. ${made} gerado(s), ${done} processado(s). Assets em ${OUT_DIR}/`)
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
