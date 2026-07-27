// 📥 Baixa localmente o avatar + transformação(ões) dos personagens REAIS já
// existentes no banco (avatar/transformationImage(s) hoje só vivem no Cloudinary
// via URL no Character), pra ter tudo em disco junto com os 9 gerados por
// generate-missing-race-class-images.ts — as 16 combinações completas em
// public/character-seeds/.
//
// Uso (via tsx):
//   npx tsx scripts/export-existing-character-images.ts                # baixa tudo (pula já feito)
//   npx tsx scripts/export-existing-character-images.ts --force        # rebaixa mesmo se já existe
//   npx tsx scripts/export-existing-character-images.ts --only Arkantos
//
// Persistência:
//   • public/character-seeds/<slug(nome)>-<race>-<class>.webp (avatar)
//   • public/character-seeds/<slug(nome)>-<race>-<class>-<transformType>.webp
//   • scripts/existing-character-image-manifest.json

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

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
const FORCE = has('--force')
const ONLY = valOf('--only')

const OUT_DIR = join('public', 'character-seeds')
const MANIFEST = join('scripts', 'existing-character-image-manifest.json')

const nameSlug = (name: string) =>
  name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

async function downloadToFile(url: string, filePath: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} baixando ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(filePath, buf)
}

type ManifestEntry = {
  characterId: string
  name: string
  race: string
  class: string
  avatar: string | null
  transformations: Record<string, string>
}

async function main() {
  if (!(process.env.DATABASE_URL || '').trim()) throw new Error('DATABASE_URL ausente no ambiente (.env).')

  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient()

  const chars = await prisma.character.findMany({
    where: { user: { isBot: false } },
    select: {
      id: true, name: true, race: true, class: true,
      avatar: true, transformationImage: true, transformationImages: true,
    },
  })

  console.log(`📥 Exportando imagens de ${chars.length} personagem(ns) real(is)\n`)
  mkdirSync(OUT_DIR, { recursive: true })

  const manifest: Record<string, ManifestEntry> = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
    : {}

  for (const c of chars) {
    if (ONLY && c.name !== ONLY) continue
    const base = `${nameSlug(c.name)}-${c.race}-${c.class}`
    console.log(`=== ${c.name} (${c.race}/${c.class}) ===`)

    let avatarPath: string | null = null
    if (c.avatar) {
      const file = join(OUT_DIR, `${base}.webp`)
      const pub = `/character-seeds/${base}.webp`
      if (!FORCE && existsSync(file)) {
        console.log(`⏭️  avatar já existe (${pub})`)
      } else {
        process.stdout.write(`⬇️  avatar … `)
        try {
          await downloadToFile(c.avatar, file)
          console.log(`✅ ${pub}`)
        } catch (err) {
          console.log(`❌ ${(err as Error).message}`)
        }
      }
      avatarPath = pub
    } else {
      console.log('⚠️  sem avatar no banco')
    }

    const transformations: Record<string, string> = {}
    const map: Record<string, string> =
      c.transformationImages && typeof c.transformationImages === 'object'
        ? (c.transformationImages as Record<string, string>)
        : c.transformationImage
          ? { default: c.transformationImage }
          : {}

    for (const [type, url] of Object.entries(map)) {
      if (!url) continue
      const file = join(OUT_DIR, `${base}-${type}.webp`)
      const pub = `/character-seeds/${base}-${type}.webp`
      if (!FORCE && existsSync(file)) {
        console.log(`⏭️  transform[${type}] já existe (${pub})`)
      } else {
        process.stdout.write(`⬇️  transform[${type}] … `)
        try {
          await downloadToFile(url, file)
          console.log(`✅ ${pub}`)
        } catch (err) {
          console.log(`❌ ${(err as Error).message}`)
        }
      }
      transformations[type] = pub
    }

    manifest[c.id] = {
      characterId: c.id, name: c.name, race: c.race, class: c.class,
      avatar: avatarPath, transformations,
    }
    console.log()
  }

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
  console.log(`✅ Concluído. Manifesto em ${MANIFEST}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
