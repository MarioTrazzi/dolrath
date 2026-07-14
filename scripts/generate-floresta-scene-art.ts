// Gera battle BG + walk map da Floresta Sombria.
//
// - battle: edita a partir do celestial da landing (identidade Dolrath)
// - walk: edita a partir da ref Anterra (câmera iso + halo) — NÃO usar celestial aqui
//
// Uso:
//   npx tsx scripts/generate-floresta-scene-art.ts --only walk --force
//   npx tsx scripts/generate-floresta-scene-art.ts --only battle --force
//   npx tsx scripts/generate-floresta-scene-art.ts --dry-run
//
// Saída:
//   public/backgrounds/floresta-battle.webp
//   public/backgrounds/floresta-walk-map.webp

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

import {
  FLORESTA_SCENE_REF,
  FLORESTA_WALK_CAMERA_REF,
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
  ref: string
  mime: string
}

const JOBS: Job[] = [
  {
    id: 'battle',
    outFile: join('public', 'backgrounds', 'floresta-battle.webp'),
    size: (process.env.OPENAI_FLORESTA_BATTLE_SIZE || '1536x1024').trim(),
    prompt: FLORESTA_BATTLE_PROMPT,
    ref: FLORESTA_SCENE_REF,
    mime: 'image/webp',
  },
  {
    id: 'walk',
    outFile: join('public', 'backgrounds', 'floresta-walk-map.webp'),
    size: (process.env.OPENAI_FLORESTA_WALK_SIZE || '1024x1536').trim(),
    prompt: FLORESTA_WALK_MAP_PROMPT,
    // Câmera Anterra: iso + spotlight — base visual do walk
    ref: FLORESTA_WALK_CAMERA_REF,
    mime: 'image/png',
  },
]

async function editOne(refPath: string, mime: string, prompt: string, size: string): Promise<Buffer> {
  const buf = readFileSync(refPath)
  const filename = refPath.endsWith('.png') || refPath.endsWith('.jpg') || refPath.endsWith('.jpeg')
    ? 'ref.png'
    : 'ref.webp'
  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const form = new FormData()
      form.append('model', MODEL)
      form.append('prompt', prompt)
      form.append('size', size)
      form.append('quality', 'high')
      form.append('input_fidelity', 'high')
      form.append('image', new Blob([buf], { type: mime }), filename)

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
  if (!DRY && !OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY ausente no ambiente (.env).')
  }

  console.log(`🌲 Floresta scene art`)
  console.log(`   model=${MODEL} dry=${DRY}`)
  console.log(`   walk camera ref=${FLORESTA_WALK_CAMERA_REF}`)
  console.log(`   battle ref=${FLORESTA_SCENE_REF}\n`)

  for (const job of JOBS) {
    if (ONLY && ONLY !== job.id) continue
    if (!existsSync(job.ref)) {
      throw new Error(`Referência ausente para ${job.id}: ${job.ref}`)
    }
    if (!FORCE && existsSync(job.outFile)) {
      console.log(`✓ já existe ${job.outFile}`)
      continue
    }
    console.log(`→ ${job.id} (${job.size})`)
    console.log(`   ref: ${job.ref}`)
    console.log(`   out: ${job.outFile}`)
    if (DRY) {
      console.log(job.prompt.slice(0, 280) + '…\n')
      continue
    }
    const img = await editOne(job.ref, job.mime, job.prompt, job.size)
    writeFileSync(job.outFile, img)
    console.log(`   salvou ${job.outFile} (${img.length} bytes)\n`)
    await sleep(1500)
  }
  console.log('Done.')
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
