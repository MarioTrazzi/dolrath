// 🌲 Gera os SPRITES DA CENA EXPLORÁVEL (vegetação, cenário e objetos dos nós)
// com a OpenAI (gpt-image-1), já em WEBP com FUNDO TRANSPARENTE.
//
// Estilo travado em src/lib/sceneSpritePrompt.ts (mesma ideia do
// monsterImagePrompt/itemImagePrompt): o BASE é idêntico em todos os sprites,
// só o "Subject" muda. É isso que faz 48 chamadas separadas parecerem do mesmo
// jogo. A sombra NÃO vem na imagem — o canvas desenha, para bater com a luz.
//
// Uso:
//   npx tsx scripts/generate-scene-sprites.ts --dry-run            # só imprime os prompts
//   npx tsx scripts/generate-scene-sprites.ts --only floresta      # começa por uma masmorra
//   npx tsx scripts/generate-scene-sprites.ts --only floresta --kind tree
//   npx tsx scripts/generate-scene-sprites.ts --quality high --force
//
// Saída: public/scene/<bioma>/<tipo>-<variante>.webp  (1024x1024, alpha)
//
// Custo: `--quality medium` (padrão) é bem mais barato que `high` e mais que
// suficiente para objeto pequeno de cenário. Rode um bioma, olhe na bancada
// (/dev/dungeon-scene), e só então gere os outros três.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

import {
  SCENE_SPRITES,
  buildSceneSpritePrompt,
  spriteFileName,
  type SpriteJob,
} from '../src/lib/sceneSpritePrompt'

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
const ONLY = valOf('--only') // floresta | caverna | pantano | ruinas
const KIND = valOf('--kind') // tree | bush | rock | stump | chest | rubble | herb | fountain
const QUALITY = valOf('--quality') || 'medium' // low | medium | high

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function generateOne(prompt: string): Promise<Buffer> {
  const payload = {
    model: MODEL,
    prompt,
    n: 1,
    size: '1024x1024',
    quality: QUALITY,
    background: 'transparent', // exige png ou webp
    output_format: 'webp',
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

function outPathOf(job: SpriteJob) {
  return join('public', 'scene', job.biome, spriteFileName(job))
}

async function main() {
  if (!DRY && !OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY ausente no .env')
    process.exit(1)
  }

  const jobs = SCENE_SPRITES.filter(j => (!ONLY || j.biome === ONLY) && (!KIND || j.kind === KIND))
  console.log(`🌲 Sprites de cena — ${jobs.length} imagem(ns)`)
  console.log(`   model=${MODEL} quality=${QUALITY} dry=${DRY}\n`)

  let made = 0
  let skipped = 0
  for (const job of jobs) {
    const out = outPathOf(job)
    if (existsSync(out) && !FORCE) {
      console.log(`⏭️  ${out} já existe (use --force)`)
      skipped++
      continue
    }
    console.log(`🎨 ${job.biome}/${job.kind}-${job.variant} → ${out}`)
    if (DRY) {
      console.log(`   ${buildSceneSpritePrompt(job).slice(0, 320)}…\n`)
      continue
    }
    mkdirSync(dirname(out), { recursive: true })
    const buf = await generateOne(buildSceneSpritePrompt(job))
    writeFileSync(out, buf)
    made++
    console.log(`   ✅ salvo (${(buf.length / 1024).toFixed(0)} KB)`)
    await sleep(1200)
  }

  console.log(`\nDone. gerados=${made} pulados=${skipped}`)
  if (!DRY && made > 0) {
    console.log('👉 confira em /dev/dungeon-scene antes de gerar os outros biomas.')
  }
}

main().catch(err => {
  console.error('❌', err)
  process.exit(1)
})
