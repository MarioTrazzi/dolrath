// 🎨 Gera as imagens de TODOS os itens com a OpenAI, no MESMO estilo das
// imagens de personagem (itemImagePrompt.ts reaproveita o estilo travado).
//
// Uso (via tsx):
//   npx tsx scripts/generate-item-images.ts                 # gera tudo (pula já feitos)
//   npx tsx scripts/generate-item-images.ts --only "Lâmina de Krax-thar"
//   npx tsx scripts/generate-item-images.ts --limit 5       # só os 5 primeiros pendentes
//   npx tsx scripts/generate-item-images.ts --dry-run       # só imprime os prompts
//   npx tsx scripts/generate-item-images.ts --force         # regenera mesmo se já existe
//
// Persistência (automática conforme as credenciais disponíveis):
//   1) Sempre salva o PNG em public/items/<slug>.png (asset estático / commit).
//   2) Se NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME + _UPLOAD_PRESET → sobe pro Cloudinary.
//   3) Se DATABASE_URL → atualiza Item.image no banco.
// Sempre escreve scripts/item-image-manifest.json (nome → arquivo/publicId).

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { ITEM_CATALOG, CONSUMABLE_CATALOG, INGREDIENT_CATALOG, FORGE_MATERIAL_CATALOG, PROCESSED_CATALOG, FOOD_CATALOG, SEED_CATALOG, TOOL_CATALOG, itemImageSlug } from '../src/lib/itemCatalog'
import { buildItemImagePrompt } from '../src/lib/itemImagePrompt'

// Pseudo-tipo de arte para cada material de forja (só muda o PROMPT; no DB são
// CONSUMABLE). Estilhaços de pedra = lasca da black stone; memória = fragmento
// fantasma; o resto = matéria-prima bruta de ferreiro.
function forgeMaterialArtType(name: string): string {
  if (name === 'Estilhaço de Memória') return 'MEMORY_SHARD'
  if (name.startsWith('Estilhaço de Pedra Negra')) return 'STONE_SHARD'
  return 'MATERIAL'
}

// ---------- .env (manual, sem depender de dotenv) ----------
function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim().replace(/^["']|["']$/g, '') // tira aspas
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
// Filtra por pseudo-tipo de arte (ex.: --types INGREDIENT,MATERIAL,STONE_SHARD,MEMORY_SHARD).
const TYPES = valOf('--types')?.split(',').map((t) => t.trim()).filter(Boolean)
const LIMIT = valOf('--limit') ? parseInt(valOf('--limit')!, 10) : Infinity

// ---------- config ----------
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim()
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim()
const SIZE = (process.env.OPENAI_IMAGE_SIZE || '1024x1024').trim() // mesmo aspecto das imagens de personagem
const CLOUD_NAME = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || '').trim()
const UPLOAD_PRESET = (process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '').trim()
const HAS_CLOUDINARY = Boolean(CLOUD_NAME && UPLOAD_PRESET)
const HAS_DB = Boolean((process.env.DATABASE_URL || '').trim())

const OUT_DIR = join('public', 'items')
const MANIFEST = join('scripts', 'item-image-manifest.json')

// ---------- helpers ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const isGptImage = MODEL.toLowerCase().startsWith('gpt-image')

async function generateOne(prompt: string): Promise<Buffer> {
  const payload: Record<string, unknown> = { model: MODEL, prompt, n: 1, size: SIZE }
  if (isGptImage) {
    payload.quality = 'high'          // melhor detalhe (mesmo nível das imagens de personagem)
    payload.output_format = 'webp'    // asset compacto para commitar
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

async function uploadToCloudinary(dataUrl: string, publicId: string): Promise<string> {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`
  const form = new FormData()
  form.append('upload_preset', UPLOAD_PRESET)
  form.append('folder', 'items')
  form.append('public_id', publicId)
  form.append('file', dataUrl)
  const res = await fetch(url, { method: 'POST', body: form })
  const json: any = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `Cloudinary HTTP ${res.status}`)
  return json.public_id as string
}

// ---------- subjects ----------
type Subject = {
  name: string
  description?: string
  type: string
  rarity: any
  raceRestriction?: any
  adventureBoss?: any
}

const subjects: Subject[] = [
  ...ITEM_CATALOG.map((i) => ({
    name: i.name, description: i.description, type: i.type, rarity: i.rarity,
    raceRestriction: i.raceRestriction, adventureBoss: i.adventureBoss,
  })),
  ...CONSUMABLE_CATALOG.map((c) => ({
    name: c.name, description: c.description, type: 'CONSUMABLE', rarity: c.rarity,
    adventureBoss: c.adventureBoss,
  })),
  // Ingredientes de alquimia (espólios de craft) — matéria-prima, não poção.
  ...INGREDIENT_CATALOG.map((i) => ({
    name: i.name, description: i.description, type: 'INGREDIENT', rarity: i.rarity,
  })),
  // Materiais de forja (couro/ferro/especiais + estilhaços + memória).
  ...FORGE_MATERIAL_CATALOG.map((m) => ({
    name: m.name, description: m.description, type: forgeMaterialArtType(m.name), rarity: m.rarity,
  })),
  // Insumos processados (Bancada de Processamento) — beneficiados, não crus.
  ...PROCESSED_CATALOG.map((p) => ({
    name: p.name, description: p.description, type: 'PROCESSED', rarity: p.rarity,
  })),
  // Pratos de Culinária (itens já catalogados; a bancada chega em outra sessão).
  ...FOOD_CATALOG.map((f) => ({
    name: f.name, description: f.description, type: 'FOOD', rarity: f.rarity,
  })),
  // Sementes da Fazenda (SeedItem não tem `type` — a arte é sempre SEED).
  ...SEED_CATALOG.map((s) => ({
    name: s.name, description: s.description, type: 'SEED', rarity: s.rarity,
  })),
  // Ferramentas e trajes de coleta (lifeskill): o próprio type do catálogo já
  // resolve a arte (PICKAXE, HERB_SICKLE, ..., GATHER_GARB).
  ...TOOL_CATALOG.map((t) => ({
    name: t.name, description: t.description, type: t.type, rarity: t.rarity,
  })),
  // Consumíveis legados que vivem só no seed-battle-consumables.ts (nomes que
  // não estão no CONSUMABLE_CATALOG) — gerados para não deixar refs quebradas.
  { name: 'Poção de Mana Grande', description: 'Restaura 50 MP instantaneamente em combate.', type: 'CONSUMABLE', rarity: 'COMMON' as any },
  { name: 'Elixir de Energia', description: 'Restaura 40 de stamina instantaneamente.', type: 'CONSUMABLE', rarity: 'COMMON' as any },
  { name: 'Elixir Maior', description: 'Restaura 40 HP e 30 MP em combate.', type: 'CONSUMABLE', rarity: 'UNCOMMON' as any },
  { name: 'Poção de Reviver', description: 'Revive um personagem morto com 25% do HP máximo.', type: 'CONSUMABLE', rarity: 'RARE' as any },
  // Pedras de aprimoramento (obtidas em masmorras). type ENHANCEMENT_STONE só
  // muda o PROMPT (no DB continuam CONSUMABLE); o wiring da imagem é por nome.
  { name: 'Pedra Negra (Arma)', description: 'Fragmento de pedra negra com brilho âmbar quente e uma marca de espadas cruzadas gravada em runas na face. Aprimora ARMAS de +1 a +15.', type: 'ENHANCEMENT_STONE', rarity: 'UNCOMMON' as any },
  { name: 'Pedra Negra (Armadura)', description: 'Fragmento de pedra negra com brilho azul-aço e uma marca de escudo gravada em runas na face. Aprimora ARMADURAS de +1 a +15.', type: 'ENHANCEMENT_STONE', rarity: 'UNCOMMON' as any },
  { name: 'Pedra Negra Mágica Concentrada (Arma)', description: 'Pedra negra condensada, maior e ardente, runas de espada e uma aura magenta intensa com fagulhas. Aprimora ARMAS aos níveis I–V.', type: 'ENHANCEMENT_STONE', rarity: 'EPIC' as any },
  { name: 'Pedra Negra Mágica Concentrada (Armadura)', description: 'Pedra negra condensada, maior, runas de escudo e uma aura violeta intensa com fagulhas. Aprimora ARMADURAS aos níveis I–V.', type: 'ENHANCEMENT_STONE', rarity: 'EPIC' as any },
]

async function main() {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente no ambiente (.env).')

  console.log(`🎨 Gerador de imagens de itens`)
  console.log(`   modelo=${MODEL} size=${SIZE}`)
  console.log(`   Cloudinary=${HAS_CLOUDINARY ? 'ON' : 'off'} · DB=${HAS_DB ? 'ON' : 'off'} · dryRun=${DRY} · force=${FORCE}`)
  console.log(`   ${subjects.length} itens no catálogo\n`)

  if (!DRY) mkdirSync(OUT_DIR, { recursive: true })

  const manifest: Record<string, { file: string; publicId?: string }> = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
    : {}

  // Prisma só se houver DB (import dinâmico pra não exigir client sem DATABASE_URL).
  let prisma: any = null
  if (HAS_DB && !DRY) {
    const { PrismaClient } = await import('@prisma/client')
    prisma = new PrismaClient()
  }

  let done = 0
  let made = 0
  for (const s of subjects) {
    if (ONLY && s.name !== ONLY) continue
    if (TYPES && !TYPES.includes(s.type)) continue
    if (made >= LIMIT) break

    const slug = itemImageSlug(s.name)
    const filePath = join(OUT_DIR, `${slug}.webp`)
    const publicPath = `/items/${slug}.webp`

    if (!FORCE && existsSync(filePath)) {
      console.log(`⏭️  ${s.name} (já existe ${publicPath})`)
      done++
      continue
    }

    const prompt = buildItemImagePrompt(s as any)

    if (DRY) {
      console.log(`📝 ${s.name} [${s.type}/${s.rarity}] →\n${prompt}\n`)
      made++
      continue
    }

    process.stdout.write(`🖌️  ${s.name} [${s.type}/${s.rarity}] … `)
    try {
      const img = await generateOne(prompt)
      writeFileSync(filePath, img)
      const dataUrl = `data:image/webp;base64,${img.toString('base64')}`

      let imageRef = publicPath
      let publicId: string | undefined

      if (HAS_CLOUDINARY) {
        publicId = await uploadToCloudinary(dataUrl, slug)
        imageRef = publicId // resolveImageUrl monta a URL do Cloudinary
      }

      if (prisma) {
        await prisma.item.updateMany({ where: { name: s.name }, data: { image: imageRef } })
      }

      manifest[s.name] = { file: publicPath, publicId }
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))

      console.log(`✅ ${HAS_CLOUDINARY ? `cloudinary:${publicId}` : publicPath}${prisma ? ' · DB' : ''}`)
      made++
      await sleep(1200) // respeita rate limit
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`)
    }
    done++
  }

  if (prisma) await prisma.$disconnect()
  console.log(`\n✅ Concluído. ${made} gerado(s), ${done} processado(s). Manifesto: ${MANIFEST}`)
  if (!HAS_CLOUDINARY) console.log('ℹ️  Cloudinary não configurado: imagens salvas em public/items/ (referência /items/<slug>.png).')
  if (!HAS_DB) console.log('ℹ️  DATABASE_URL ausente: o banco não foi atualizado (rode em um ambiente com DB, ou reseed).')
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
