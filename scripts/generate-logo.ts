// 🎨 Gera o logotipo "BDI — Black Dolrath Idle" com a OpenAI (gpt-image-1),
// já em PNG com FUNDO TRANSPARENTE (background: 'transparent'), no mesmo
// visual chumbo+ouro "pedra amaldiçoada" dos dados 3D e do design system.
//
// Uso (via tsx):
//   npx tsx scripts/generate-logo.ts             # gera os 2 assets (pula já feitos)
//   npx tsx scripts/generate-logo.ts --force     # regenera mesmo se já existe
//   npx tsx scripts/generate-logo.ts --only icon # só um deles (icon | full)
//   npx tsx scripts/generate-logo.ts --dry-run   # só imprime os prompts
//
// Saída:
//   public/logo-bdi.png       — emblema completo com o monograma "BDI" (hero)
//   public/logo-bdi-icon.png  — só o d20 emblemático, sem letras (navbar/favicon)

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

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

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valOf = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const DRY = has('--dry-run')
const FORCE = has('--force')
const ONLY = valOf('--only')

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()

// Estilo travado: o mesmo vocabulário dos dados 3D "pedra amaldiçoada"
// (chumbo/obsidiana + numerais gravados em ouro) e do design system chumbo+ouro.
const STYLE = [
  'Dark fantasy tabletop-RPG game logo, Dungeons & Dragons heraldry style.',
  'Material palette: cursed black obsidian / graphite lead stone with subtle',
  'radial sheen, engraved molten-gold details, antique gold filigree trim,',
  'deep amber ember glow. Dramatic torchlight rim lighting.',
  'Clean, crisp, centered emblem readable at small sizes, vector-like game',
  'logo finish, isolated subject on fully transparent background, no',
  'backdrop, no ground shadow, no extra text or watermark.',
].join(' ')

const JOBS: { key: string; file: string; prompt: string }[] = [
  {
    key: 'full',
    file: 'logo-bdi.png',
    prompt:
      `Emblem logo for the game "BDI — Black Dolrath Idle". Centerpiece: a ` +
      `twenty-sided die (d20) carved from dark cursed obsidian stone, its top ` +
      `face engraved with a glowing golden "20", edges beveled in antique gold. ` +
      `The die sits inside an ornate gothic gold ring with subtle rune marks. ` +
      `Below the die, the monogram "BDI" in bold engraved gold gothic-serif ` +
      `capital letters (exactly the three letters B, D, I). ` + STYLE,
  },
  {
    key: 'icon',
    file: 'logo-bdi-icon.png',
    prompt:
      `Icon-only emblem logo for a dark fantasy RPG: a twenty-sided die (d20) ` +
      `carved from cursed black obsidian stone, top face engraved with a ` +
      `glowing golden "20", golden beveled edges, wrapped by a thin ornate ` +
      `gothic gold ring with rune marks. No letters, no wordmark. ` + STYLE,
  },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function generateOne(prompt: string): Promise<Buffer> {
  const payload = {
    model: MODEL,
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'high',
    background: 'transparent',
    output_format: 'png',
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

async function main() {
  if (!OPENAI_API_KEY && !DRY) {
    console.error('❌ OPENAI_API_KEY ausente no .env')
    process.exit(1)
  }
  for (const job of JOBS) {
    if (ONLY && job.key !== ONLY) continue
    const out = join('public', job.file)
    if (existsSync(out) && !FORCE) {
      console.log(`⏭️  ${job.file} já existe (use --force para regenerar)`)
      continue
    }
    console.log(`🎨 ${job.key} → ${out}`)
    if (DRY) {
      console.log(`   prompt: ${job.prompt}\n`)
      continue
    }
    const buf = await generateOne(job.prompt)
    writeFileSync(out, buf)
    console.log(`   ✅ salvo (${(buf.length / 1024).toFixed(0)} KB)`)
  }
}

main().catch((err) => {
  console.error('❌', err)
  process.exit(1)
})
