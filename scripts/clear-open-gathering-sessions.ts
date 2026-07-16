/**
 * Fecha todas as GatheringSession abertas (active/exhausted).
 * Uso: npx tsx scripts/clear-open-gathering-sessions.ts
 * Live: CONFIRM=CLEAR_GATHER npx tsx scripts/clear-open-gathering-sessions.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const live = process.env.CONFIRM === 'CLEAR_GATHER'
  const open = await prisma.gatheringSession.findMany({
    where: { status: { in: ['active', 'exhausted'] } },
    select: {
      id: true,
      fieldId: true,
      status: true,
      character: { select: { name: true, gatherXp: true } },
    },
  })
  console.log(`🔎 ${open.length} sessões abertas\n`)
  for (const s of open) {
    console.log(`  ${s.character.name} @ ${s.fieldId} (${s.status}) gatherXp=${s.character.gatherXp}`)
  }
  if (!live) {
    console.log('\n🟡 DRY-RUN. Para executar: CONFIRM=CLEAR_GATHER npx tsx scripts/clear-open-gathering-sessions.ts')
    return
  }
  const res = await prisma.gatheringSession.updateMany({
    where: { status: { in: ['active', 'exhausted'] } },
    data: { status: 'collected', pendingYield: { drops: [], xp: 0, ticks: 0 }, stopRequested: false },
  })
  console.log(`\n✅ ${res.count} sessões fechadas`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
