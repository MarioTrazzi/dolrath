// 🔍 Lint estrutural: acha lugares no código que resolvem a imagem de um ITEM
// (resolveImageUrl(...algo.image)) sem o fallback por nome (itemImagePath(...algo.name)).
// Sem esse fallback, qualquer Item com `image` null no banco (comum em drops/loot
// antigos, seeds legados etc.) cai pro ícone genérico mesmo já tendo um .webp
// gerado em public/items/. Foi o bug do colar na EnhancementDialog e do anel do
// batedor na RepairBench — este script existe pra achar os próximos antes que
// alguém precise reportar manualmente.
//
// Heurística: para cada `resolveImageUrl(X.image)` no arquivo, procura
// `itemImagePath(` nas ~3 linhas seguintes. Não distingue semanticamente
// "item" de "avatar de personagem" — avatares de personagem NÃO usam
// itemImagePath (são outro sistema de asset) e por isso aparecem como
// "possível exceção", revisar manualmente.
//   npx tsx scripts/audit-image-fallback-pattern.ts

import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const AVATAR_HINTS = ['avatar', 'character.avatar', 'avatarUrl', 'params.avatarUrl']

const grepOut = execSync(
  `grep -rn "resolveImageUrl(" src --include="*.tsx" --include="*.ts" | grep -v "src/lib/imageUrl.ts"`,
  { encoding: 'utf8' }
)

type Hit = { file: string; line: number; snippet: string }
const hits: Hit[] = grepOut
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const m = l.match(/^([^:]+):(\d+):(.*)$/)
    if (!m) return null
    return { file: m[1], line: Number(m[2]), snippet: m[3].trim() }
  })
  .filter((x): x is Hit => !!x)

const ok: Hit[] = []
const missing: Hit[] = []
const avatarLike: Hit[] = []

for (const hit of hits) {
  const isAvatar = AVATAR_HINTS.some((h) => hit.snippet.includes(h))
  const lines = readFileSync(hit.file, 'utf8').split('\n')
  const window = lines.slice(hit.line - 1, hit.line + 2).join('\n')
  const hasFallback = window.includes('itemImagePath(')

  if (hasFallback) ok.push(hit)
  else if (isAvatar) avatarLike.push(hit)
  else missing.push(hit)
}

console.log(`✅ Com fallback por nome (${ok.length}):`)
for (const h of ok) console.log(`   ${h.file}:${h.line}`)

console.log(`\n👤 Parecem avatar de personagem, não item — revisar manualmente (${avatarLike.length}):`)
for (const h of avatarLike) console.log(`   ${h.file}:${h.line}  ${h.snippet}`)

console.log(`\n❌ SEM fallback por nome — candidato ao bug do ícone (${missing.length}):`)
for (const h of missing) console.log(`   ${h.file}:${h.line}  ${h.snippet}`)

if (missing.length > 0) process.exitCode = 1
