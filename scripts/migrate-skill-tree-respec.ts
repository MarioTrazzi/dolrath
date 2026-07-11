// 🌳 Respec ÚNICO p/ a Árvore de Habilidades (estilo Child of Light).
//
// Personagens com `skillTree` null (todos, antes deste script) tiveram os pontos de
// nível distribuídos LIVREMENTE (attributes.distributed{Str,Agi,Int,Def}, cumulativo
// desde a criação). A árvore precisa de uma base limpa: reescala essa distribuição
// para somar os 18 pontos LIVRES da criação (characterCreationData.ts), preservando
// a PROPORÇÃO que o jogador já tinha escolhido, e devolve TODOS os pontos ganhos por
// nível (level - 1) como pontos de habilidade — a gastar na árvore nova.
//
// Idempotente: só processa `skillTree` null; rodar de novo após --apply não faz nada
// (todo mundo já terá skillTree preenchido). Dry-run por padrão.
//   DATABASE_URL=... npx tsx scripts/migrate-skill-tree-respec.ts            # dry-run
//   DATABASE_URL=... npx tsx scripts/migrate-skill-tree-respec.ts --apply    # aplica

import { Prisma, PrismaClient } from '@prisma/client'
import { buildAttributeUpdate } from '../src/lib/attributeRecalc'

const APPLY = process.argv.includes('--apply')
const prisma = new PrismaClient()

// characterCreationData.ts: pontos livres distribuídos na criação.
const CREATION_POOL = 18

type Attr = 'str' | 'agi' | 'int' | 'def'
const ATTRS: Attr[] = ['str', 'agi', 'int', 'def']

function rescaleToCreationPool(cur: Record<Attr, number>, total: number): Record<Attr, number> {
  const scaled = {} as Record<Attr, number>
  for (const a of ATTRS) scaled[a] = Math.round((cur[a] * CREATION_POOL) / total)
  const scaledSum = ATTRS.reduce((s, a) => s + scaled[a], 0)
  const diff = CREATION_POOL - scaledSum
  if (diff !== 0) {
    // Ajuste de arredondamento no MAIOR atributo (menor distorção proporcional).
    const biggest = ATTRS.reduce((a, b) => (scaled[a] >= scaled[b] ? a : b))
    scaled[biggest] += diff
  }
  return scaled
}

async function main() {
  console.log(`🌳 Respec único p/ Árvore de Habilidades ${APPLY ? '(APPLY — vai gravar)' : '(dry-run)'}\n`)

  const legacy = await prisma.character.findMany({ where: { skillTree: { equals: Prisma.DbNull } } })
  console.log(`personagens legados (skillTree null): ${legacy.length}\n`)

  let migrated = 0
  for (const char of legacy) {
    const attrs = (char.attributes as Record<string, number> | null) || {}
    const cur: Record<Attr, number> = {
      str: attrs.distributedStr || 0,
      agi: attrs.distributedAgi || 0,
      int: attrs.distributedInt || 0,
      def: attrs.distributedDef || 0,
    }
    const total = ATTRS.reduce((s, a) => s + cur[a], 0)

    // Só reescala se já passou do pool de criação (nível baixo/nunca gastou = não mexe).
    const target = total > CREATION_POOL ? rescaleToCreationPool(cur, total) : cur
    const delta: Record<Attr, number> = {
      str: target.str - cur.str,
      agi: target.agi - cur.agi,
      int: target.int - cur.int,
      def: target.def - cur.def,
    }
    const noop = ATTRS.every(a => delta[a] === 0)
    const refund = Math.max(0, char.level - 1)

    const fmtDelta = (a: Attr) => (delta[a] !== 0 ? ` ${a}${delta[a] > 0 ? '+' : ''}${delta[a]}` : '')
    console.log(
      `${char.name} (nv.${char.level}, ${char.race}/${char.class}): distribuído ${total} → ${ATTRS.reduce((s, a) => s + target[a], 0)}` +
      (noop ? ' (sem mudança de stats)' : ` [${ATTRS.map(fmtDelta).join('').trim()}]`) +
      ` · pontos de habilidade: ${refund}`
    )

    if (!APPLY) continue

    const updateData: Prisma.CharacterUpdateInput = {
      skillTree: { version: 1, purchased: [], respecAt: new Date().toISOString() },
      availablePoints: refund,
    }
    if (!noop) {
      const recalc = buildAttributeUpdate(
        { race: char.race, class: char.class, level: char.level, attributes: char.attributes },
        delta,
      )
      Object.assign(updateData, recalc.data)
      // HP atual não pode ultrapassar o novo teto (maxHp pode ter caído com a reescala).
      updateData.hp = Math.min(char.hp, recalc.data.maxHp)
    }
    await prisma.character.update({ where: { id: char.id }, data: updateData })
    migrated++
  }

  console.log(`\n${APPLY ? `✅ ${migrated} personagem(ns) migrado(s).` : 'ℹ️  Dry-run — nada foi gravado. Rode com --apply para aplicar de fato.'}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('💥', e)
  process.exit(1)
})
