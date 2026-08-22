// ✅ Checagem das chaves de UI (i18n): todo t('...') do código existe no PT_DICT?
//
// A falha que esse script pega é SILENCIOSA nos dois sentidos: uma chave sem
// entrada no dicionário deixa o jogador PT vendo inglês, e um dicionário órfão
// (escrito mas nunca importado no index) deixa o jogador EN vendo português.
// Foi exatamente assim que forge/cooking/alchemy/processing/dungeonsmap
// ficaram mortos por semanas.
//
// Rodar: npm run check:i18n-keys

import * as fs from 'fs'
import * as path from 'path'
import { PT_DICT } from '../src/lib/i18n/dict/pt'

const SRC = path.resolve(__dirname, '../src')
const DICT_DIR = path.resolve(SRC, 'lib/i18n/dict/pt')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

// t('...') / t("...") / t(`...`) — só a forma literal; chave dinâmica não dá p/ checar.
const CALL = /\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g

const missing = new Map<string, string[]>()
let calls = 0

for (const file of walk(SRC)) {
  if (file.startsWith(DICT_DIR)) continue
  const code = fs.readFileSync(file, 'utf8')
  if (!/\buseT\b|\bgetT\b|\bgetTFromRequest\b|\buseI18n\b/.test(code)) continue
  // Array.from: sob target es5 sem downlevelIteration um for..of direto no
  // iterador do matchAll roda ZERO vezes em silêncio (a armadilha do es5).
  for (const m of Array.from(code.matchAll(CALL))) {
    // Desescapa como o TS faria: \n, \t e os escapes de aspas/barra. Sem isso
    // uma chave com quebra de linha nunca casa com a do dicionário.
    const key = m[2].replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, esc: string) => {
      if (esc === 'n') return '\n'
      if (esc === 't') return '\t'
      if (esc === 'r') return '\r'
      if (esc === '0') return '\0'
      if (esc[0] === 'u' || esc[0] === 'x') {
        const hex = esc.startsWith('u{') ? esc.slice(2, -1) : esc.slice(1)
        return String.fromCodePoint(parseInt(hex, 16))
      }
      return esc
    })
    calls++
    if (!(key in PT_DICT)) {
      const rel = path.relative(path.resolve(__dirname, '..'), file)
      if (!missing.has(key)) missing.set(key, [])
      if (!missing.get(key)!.includes(rel)) missing.get(key)!.push(rel)
    }
  }
}

// Dicionário escrito mas nunca mesclado no PT_DICT (o caso do d3bfac1).
const indexSrc = fs.readFileSync(path.join(DICT_DIR, 'index.ts'), 'utf8')
const orphans = fs
  .readdirSync(DICT_DIR)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .map((f) => f.replace(/\.ts$/, ''))
  .filter((name) => !new RegExp(`from '\\./${name}'`).test(indexSrc))

let bad = false

if (orphans.length) {
  bad = true
  console.error(`\n❌ Dicionários órfãos — escritos mas NÃO importados em dict/pt/index.ts (${orphans.length}):`)
  for (const o of orphans) console.error(`   - ${o}.ts`)
}

if (missing.size) {
  bad = true
  console.error(`\n❌ Chaves t() sem tradução PT (${missing.size}):`)
  for (const [key, files] of Array.from(missing).sort()) {
    console.error(`   - ${JSON.stringify(key)}`)
    for (const f of files) console.error(`       ${f}`)
  }
}

// Guarda contra a checagem que "passa" porque não leu nada.
if (calls === 0) {
  console.error('\n❌ Nenhuma chamada t() literal encontrada — o scanner está quebrado, não o código.')
  process.exit(1)
}

if (!bad) {
  console.log(`✅ i18n de UI completo — ${calls} chamadas t() literais, ${Object.keys(PT_DICT).length} chaves no PT_DICT, 0 dicionários órfãos.`)
} else {
  process.exit(1)
}
