// Gera mapa da run + battle BG para Caverna de Cristal, Pântano Maldito e Ruínas Arcanas.
//
// - Edita a partir das ARTES APROVADAS da Floresta (floresta-run-map / floresta-battle):
//   o prompt trava câmera/estilo/composição e troca só o bioma de cada masmorra.
// - SEM input_fidelity alto de propósito: o bioma precisa mudar por inteiro,
//   a referência serve de âncora de câmera/estilo.
//
// Uso:
//   npx tsx scripts/generate-dungeon-scene-art.ts
//   npx tsx scripts/generate-dungeon-scene-art.ts --only caverna
//   npx tsx scripts/generate-dungeon-scene-art.ts --kind map|battle
//   npx tsx scripts/generate-dungeon-scene-art.ts --dry-run --force
//
// Saída:
//   public/backgrounds/<id>-run-map.webp  (1024x1536)
//   public/backgrounds/<id>-battle.webp   (1536x1024)

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

import {
  RUN_MAP_STYLE_REF,
  BATTLE_STYLE_REF,
  DUNGEON_RUN_MAP_PROMPTS,
  DUNGEON_BATTLE_PROMPTS,
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
const ONLY = valOf('--only') // caverna | pantano | ruinas
const KIND = valOf('--kind') // map | battle

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Job = {
  dungeon: string
  kind: 'map' | 'battle'
  outFile: string
  size: string
  prompt: string
  ref: string
}

const DUNGEON_IDS = ['caverna', 'pantano', 'ruinas'] as const

const JOBS: Job[] = DUNGEON_IDS.flatMap((id): Job[] => [
  {
    dungeon: id,
    kind: 'map',
    outFile: join('public', 'backgrounds', `${id}-run-map.webp`),
    size: '1024x1536',
    prompt: DUNGEON_RUN_MAP_PROMPTS[id],
    ref: RUN_MAP_STYLE_REF,
  },
  {
    dungeon: id,
    kind: 'battle',
    outFile: join('public', 'backgrounds', `${id}-battle.webp`),
    size: '1536x1024',
    prompt: DUNGEON_BATTLE_PROMPTS[id],
    ref: BATTLE_STYLE_REF,
  },
])

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
      form.append('output_format', 'webp')
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
  if (!DRY && !OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY ausente no ambiente (.env).')
  }

  console.log(`🏰 Dungeon scene art (caverna/pantano/ruinas)`)
  console.log(`   model=${MODEL} dry=${DRY}\n`)

  for (const job of JOBS) {
    if (ONLY && ONLY !== job.dungeon) continue
    if (KIND && KIND !== job.kind) continue
    if (!existsSync(job.ref)) {
      throw new Error(`Referência ausente para ${job.dungeon}/${job.kind}: ${job.ref}`)
    }
    if (!FORCE && existsSync(job.outFile)) {
      console.log(`✓ já existe ${job.outFile}`)
      continue
    }
    console.log(`→ ${job.dungeon} ${job.kind} (${job.size})`)
    console.log(`   ref: ${job.ref}`)
    console.log(`   out: ${job.outFile}`)
    if (DRY) {
      console.log(job.prompt.slice(0, 280) + '…\n')
      continue
    }
    const img = await editOne(job.ref, job.prompt, job.size)
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
