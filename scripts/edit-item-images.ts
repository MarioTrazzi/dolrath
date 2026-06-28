// 🖌️ Edição cirúrgica de imagens de itens já geradas.
//
// Diferente de generate-item-images.ts (que gera do ZERO via /images/generations),
// este script usa o endpoint /images/edits do gpt-image-1 passando a IMAGEM ATUAL
// como entrada + input_fidelity=high — ou seja, NÃO refaz o item, só aplica o
// ajuste pedido (lâmina mais longa, remover elmo, virar adaga...) mantendo
// material, cabo, cor, iluminação e fundo.
//
// Uso:
//   npx tsx scripts/edit-item-images.ts                 # edita todos os itens da lista
//   npx tsx scripts/edit-item-images.ts --only "Espada do Veterano"
//   npx tsx scripts/edit-item-images.ts --dry-run       # só imprime os prompts
//
// Persistência: sobrescreve public/items/<slug>.webp. Se DATABASE_URL/Cloudinary
// estiverem configurados, atualiza igual ao generate (a referência por nome não
// muda, então em geral basta o asset estático + commit/redeploy).

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

import { itemImageSlug } from '../src/lib/itemCatalog'
import { DOLRATH_ITEM_STYLE_BASE } from '../src/lib/itemImagePrompt'

// ---------- .env ----------
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
const ONLY = valOf('--only')

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()
const SIZE = (process.env.OPENAI_IMAGE_SIZE || '1024x1024').trim()
const OUT_DIR = join('public', 'items')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Cada edição reafirma o estilo travado + descreve SÓ o ajuste, deixando claro
// que todo o resto deve permanecer idêntico (o input_fidelity=high segura isso).
const KEEP = (extra: string) =>
  `${DOLRATH_ITEM_STYLE_BASE}\n` +
  `This is an EDIT of the provided item image. Keep the exact same object identity, ` +
  `materials, ornamentation, colors, magical glow, three-quarter studio angle, ` +
  `lighting and dark atmospheric backdrop. Do NOT redesign the item. ${extra}`

type Job = { name: string; prompt: string }

const JOBS: Job[] = [
  {
    name: 'Espada do Veterano',
    prompt: KEEP(
      'The ONLY change: make the steel BLADE much LONGER. Keep the same wrapped grip, ' +
        'round gem pommel, weathered tempered-steel crossguard and material, but extend the ' +
        'blade into a proper full one-handed longsword blade — roughly three times the width ' +
        'of the crossguard in length — straight, tapering to a point, with a central fuller. ' +
        'It must clearly read as a SWORD, not a short stubby gladius or dagger.',
    ),
  },
  {
    name: 'Couraça de Aço',
    prompt: KEEP(
      'The ONLY change: REMOVE the helmet entirely. There must be NO helmet and NO head — ' +
        'leave an empty open neck / gorget at the top of the breastplate, as if the steel plate ' +
        'armor is displayed on an invisible stand with nothing above the shoulders. Keep the ' +
        'exact same cuirass, pauldrons, faulds, arm plates, rivets, weathering and color.',
    ),
  },
  {
    name: 'Lâmina das Brasas',
    prompt: KEEP(
      'The ONLY change: turn the weapon into a DAGGER (it is a rogue / assassin weapon). ' +
        'Keep the same dark dragon-scale hilt, ember-cracked pommel, ornate crossguard, glowing ' +
        'energy along the fuller and all materials and colors, but shorten and widen the blade ' +
        'into a short, wickedly sharp leaf-shaped dagger blade — about as long as the grip — ' +
        'not a long sword blade. It must clearly read as a DAGGER.',
    ),
  },
  {
    name: 'Espada do Andarilho',
    prompt: KEEP(
      'The ONLY change: make the steel BLADE at least TWICE as LONG. Keep the same engraved ' +
        'crossguard, blue gem, leather-wrapped grip, ornate pommel, steel material and faint blue ' +
        'magical sheen, but extend the blade into a proper slender one-handed longsword blade ' +
        'tapering to a fine point. It must clearly read as a full SWORD, not a short stubby blade.',
    ),
  },
  {
    name: 'Lâmina do Carrasco',
    prompt: KEEP(
      'The ONLY change: make the BLADE noticeably LONGER and broad — a heavy executioner\'s ' +
        'broadsword, roughly twice its current blade length, wide and imposing. Keep the same dark ' +
        'ornate crossguard, leather-wrapped grip, pommel, weathered steel and the glowing violet ' +
        'runic energy and purple aura exactly as they are.',
    ),
  },
  {
    name: 'Lâmina do Sétimo Sentido',
    prompt: KEEP(
      'The ONLY change: make the metal BLADE significantly LONGER — a full elegant longsword blade ' +
        'extending well up the frame and tapering to a point, so the STEEL itself (not only the flames) ' +
        'is clearly long. Keep the same crossguard, leather-wrapped grip, pommel, steel material and ' +
        'the fiery orange aura, embers and glow exactly as they are.',
    ),
  },
]

async function editOne(imgPath: string, prompt: string): Promise<Buffer> {
  const buf = readFileSync(imgPath)
  let lastErr: unknown
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const form = new FormData()
      form.append('model', MODEL)
      form.append('prompt', prompt)
      form.append('size', SIZE)
      form.append('quality', 'high')
      form.append('input_fidelity', 'high') // segura o item original; só muda o que o prompt pede
      form.append('image', new Blob([buf], { type: 'image/webp' }), 'item.webp')

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
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente no ambiente (.env).')

  console.log(`🖌️  Editor de imagens de itens (input_fidelity=high)`)
  console.log(`   modelo=${MODEL} size=${SIZE} dryRun=${DRY}\n`)

  for (const job of JOBS) {
    if (ONLY && job.name !== ONLY) continue
    const slug = itemImageSlug(job.name)
    const filePath = join(OUT_DIR, `${slug}.webp`)

    if (!existsSync(filePath)) {
      console.log(`❌ ${job.name}: ${filePath} não existe (pulando)`)
      continue
    }

    if (DRY) {
      console.log(`📝 ${job.name} (${slug}.webp) →\n${job.prompt}\n`)
      continue
    }

    process.stdout.write(`🖌️  ${job.name} … `)
    try {
      const img = await editOne(filePath, job.prompt)
      writeFileSync(filePath, img)
      console.log(`✅ /items/${slug}.webp`)
      await sleep(1200)
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`)
    }
  }

  console.log('\n✅ Concluído. Confira em /doc; originais ficaram no backup do scratchpad.')
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
