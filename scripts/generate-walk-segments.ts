// Gera segmentos verticais da WalkScene (gpt-image-1) para emendarem na masmorra.
// Path entra embaixo e sai em cima na mesma X — ver walkScenePrompt.ts.
//
// Uso:
//   npx tsx scripts/generate-walk-segments.ts
//   npx tsx scripts/generate-walk-segments.ts --dungeon floresta
//   npx tsx scripts/generate-walk-segments.ts --only clearing
//   npx tsx scripts/generate-walk-segments.ts --dry-run
//   npx tsx scripts/generate-walk-segments.ts --force
//
// Saída: public/backgrounds/walk/<dungeonId>/<kind>.webp

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { DUNGEONS, type DungeonId } from '../src/lib/dungeonAdventures'
import { WALK_SEGMENTS } from '../src/lib/walkSceneAssets'
import { buildWalkSegmentPrompt, WALK_SEGMENT_ART } from '../src/lib/walkScenePrompt'

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

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()
// Segmento vertical (path bottom→top): portrait
const SIZE = (process.env.OPENAI_WALK_IMAGE_SIZE || '1024x1536').trim()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isGptImage = MODEL.toLowerCase().startsWith('gpt-image')

async function generateOne(prompt: string): Promise<Buffer> {
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

type Job = { dungeonId: DungeonId; kind: string; label: string; outFile: string; prompt: string }

const jobs: Job[] = []
const dungeonIds = (Object.keys(WALK_SEGMENTS) as DungeonId[]).filter(
  (id) => !DUNGEON || id === DUNGEON,
)

for (const dungeonId of dungeonIds) {
  const dungeon = DUNGEONS[dungeonId]
  const artMap = WALK_SEGMENT_ART[dungeonId] || {}
  for (const seg of WALK_SEGMENTS[dungeonId]) {
    if (ONLY && seg.kind !== ONLY && seg.label !== ONLY) continue
    const art = artMap[seg.kind]
    if (!art) {
      console.warn(`⏭️  sem arte para ${dungeonId}/${seg.kind}`)
      continue
    }
    const outFile = join('public', 'backgrounds', 'walk', dungeonId, `${seg.kind}.webp`)
    const prompt = buildWalkSegmentPrompt({
      dungeonName: dungeon.name,
      segmentLabel: seg.label,
      art,
    })
    jobs.push({ dungeonId, kind: seg.kind, label: seg.label, outFile, prompt })
  }
}

async function main() {
  console.log(`Walk segments: ${jobs.length} job(s) | model=${MODEL} size=${SIZE}`)
  if (!DRY && !OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY ausente')
    process.exit(1)
  }

  for (const job of jobs) {
    if (!FORCE && existsSync(job.outFile)) {
      console.log(`✓ já existe ${job.outFile}`)
      continue
    }
    console.log(`→ ${job.dungeonId}/${job.kind} (${job.label})`)
    if (DRY) {
      console.log(job.prompt.slice(0, 200) + '…')
      continue
    }
    mkdirSync(join(job.outFile, '..'), { recursive: true })
    const buf = await generateOne(job.prompt)
    writeFileSync(job.outFile, buf)
    console.log(`   salvou ${job.outFile} (${buf.length} bytes)`)
    await sleep(1200)
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
