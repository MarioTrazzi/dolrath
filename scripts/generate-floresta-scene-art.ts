// Gera battle BG + walk map da Floresta Sombria a partir da arte celestial da landing
// (gpt-image-1 /images/edits + input_fidelity).
//
// Uso:
//   npx tsx scripts/generate-floresta-scene-art.ts
//   npx tsx scripts/generate-floresta-scene-art.ts --only battle
//   npx tsx scripts/generate-floresta-scene-art.ts --only walk
//   npx tsx scripts/generate-floresta-scene-art.ts --dry-run
//   npx tsx scripts/generate-floresta-scene-art.ts --force
//
// Saída:
//   public/backgrounds/floresta-battle.webp
//   public/backgrounds/floresta-walk-map.webp

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

import {
  FLORESTA_SCENE_REF,
  FLORESTA_BATTLE_PROMPT,
  FLORESTA_WALK_MAP_PROMPT,
} from '../src/lib/walkScenePrompt'

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
const ONLY = valOf('--only') // battle | walk

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Job = {
  id: 'battle' | 'walk'
  outFile: string
  size: string
  prompt: string
}

const JOBS: Job[] = [
  {
    id: 'battle',
    outFile: join('public', 'backgrounds', 'floresta-battle.webp'),
    size: (process.env.OPENAI_FLORESTA_BATTLE_SIZE || '1536x1024').trim(),
    prompt: FLORESTA_BATTLE_PROMPT,
  },
  {
    id: 'walk',
    outFile: join('public', 'backgrounds', 'floresta-walk-map.webp'),
    size: (process.env.OPENAI_FLORESTA_WALK_SIZE || '1024x1536').trim(),
    prompt: FLORESTA_WALK_MAP_PROMPT,
  },
]

async function editOne(refPath: string, prompt: string, size: string): Promise<Buffer> {
  const buf = readFileSync(refPath)
  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const form = new FormData()
      form.append('model', MODEL)
      form.append('prompt', prompt)
      form.append('size', size)
      form.append('quality', 'high')
      form.append('input_fidelity', 'high')
      form.append('image', new Blob([buf], { type: 'image/webp' }), 'ref.webp')

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

async function main() {
  if (!existsSync(FLORESTA_SCENE_REF)) {
    throw new Error(`Referência ausente: ${FLORESTA_SCENE_REF}`)
  }
  if (!DRY && !OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY ausente no ambiente (.env).')
  }

  console.log(`🌲 Floresta scene art (edit from celestial)`)
  console.log(`   ref=${FLORESTA_SCENE_REF} model=${MODEL} dry=${DRY}\n`)

  for (const job of JOBS) {
    if (ONLY && ONLY !== job.id) continue
    if (!FORCE && existsSync(job.outFile)) {
      console.log(`✓ já existe ${job.outFile}`)
      continue
    }
    console.log(`→ ${job.id} (${job.size}) → ${job.outFile}`)
    if (DRY) {
      console.log(job.prompt.slice(0, 220) + '…\n')
      continue
    }
    const img = await editOne(FLORESTA_SCENE_REF, job.prompt, job.size)
    writeFileSync(job.outFile, img)
    console.log(`   salvou ${job.outFile} (${img.length} bytes)`)
    await sleep(1500)
  }
  console.log('\nDone.')
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
