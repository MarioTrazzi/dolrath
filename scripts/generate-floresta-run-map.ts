// Gera o MAPA DA RUN da Floresta Sombria (top-down, mapa grande de RPG).
//
// - Edita a partir da referência escolhida pelo Mario (floresta certa, câmera errada):
//   o prompt trava a câmera top-down e preserva a identidade da mata.
//
// Uso:
//   npx tsx scripts/generate-floresta-run-map.ts
//   npx tsx scripts/generate-floresta-run-map.ts --dry-run
//   npx tsx scripts/generate-floresta-run-map.ts --force
//
// Saída:
//   public/backgrounds/floresta-run-map.webp

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

import { FLORESTA_RUN_MAP_REF, FLORESTA_RUN_MAP_PROMPT } from '../src/lib/walkScenePrompt'

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
const DRY = argv.includes('--dry-run')
const FORCE = argv.includes('--force')

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()
const SIZE = (process.env.OPENAI_FLORESTA_RUN_MAP_SIZE || '1024x1536').trim()
const OUT_FILE = join('public', 'backgrounds', 'floresta-run-map.webp')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
      form.append('output_format', 'webp')
      form.append('image', new Blob([buf], { type: 'image/png' }), 'ref.png')

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
  if (!existsSync(FLORESTA_RUN_MAP_REF)) {
    throw new Error(`Referência ausente: ${FLORESTA_RUN_MAP_REF}`)
  }
  if (!FORCE && existsSync(OUT_FILE)) {
    console.log(`✓ já existe ${OUT_FILE} (use --force para regerar)`)
    return
  }

  console.log(`🗺️  Floresta Sombria — mapa da run`)
  console.log(`   model=${MODEL} size=${SIZE} dry=${DRY}`)
  console.log(`   ref: ${FLORESTA_RUN_MAP_REF}`)
  console.log(`   out: ${OUT_FILE}\n`)

  if (DRY) {
    console.log(FLORESTA_RUN_MAP_PROMPT)
    return
  }

  const img = await editOne(FLORESTA_RUN_MAP_REF, FLORESTA_RUN_MAP_PROMPT, SIZE)
  writeFileSync(OUT_FILE, img)
  console.log(`   salvou ${OUT_FILE} (${img.length} bytes)`)
  console.log('Done.')
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
