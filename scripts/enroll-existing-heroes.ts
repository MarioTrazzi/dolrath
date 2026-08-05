/**
 * Inscreve heróis JÁ EXISTENTES na temporada corrente, para o ensaio da Amoy ter
 * ranking populado no dia 1 sem esperar 16 criações pela UI.
 *
 * POR QUE ISTO NÃO FINGE UM PAGAMENTO
 *
 * A criação de personagem paga 2 USDC on-chain e o estúdio aporta
 * SEASON_ENTRY_DOL na pool (src/lib/seasonPool.ts). Um herói que já existe não
 * tem esse pagamento, e o critério de liberação da mainnet é justamente
 * reconciliar `sum(paidUsdc)` com o que entrou na tesouraria. Então aqui:
 *
 *   • `paidUsdc = 0` — nenhum dólar é inventado no ledger;
 *   • `kind = 'entry'` e txHash sintético `seed:<characterId>` — a linha se
 *     identifica como cortesia do estúdio, não como venda;
 *   • a pool RECEBE os SEASON_ENTRY_DOL mesmo assim, porque o aporte sai do
 *     bucket Play & Achieve — é DOL do estúdio, que é exatamente o que a
 *     criação também faz.
 *
 * Ou seja: o prêmio fica realista para testar o rateio do top 20, e a auditoria
 * de receita continua honesta. O caminho de 6 decimais é exercido pelo primeiro
 * herói criado pela UI (§5 do web3/REHEARSAL-AMOY.md), não por aqui.
 *
 * Bots ficam de fora: eles servem de oponente, não disputam prêmio.
 *
 * USO:
 *   Dry-run:  npx tsx scripts/enroll-existing-heroes.ts
 *   Live:     CONFIRM=ENROLL npx tsx scripts/enroll-existing-heroes.ts
 */

import { PrismaClient } from '@prisma/client'
import { contributeToPrizePool, enrollCharacter, SEASON_ENTRY_DOL } from '../src/lib/seasonPool'
import { resolveEnrollmentSeason } from '../src/lib/pvpRanking'

const prisma = new PrismaClient()

async function main() {
  const live = process.env.CONFIRM === 'ENROLL'

  const season = await resolveEnrollmentSeason()
  const chars = await prisma.character.findMany({
    where: { user: { isBot: false } },
    select: { id: true, name: true, userId: true, user: { select: { walletAddress: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const existing = await prisma.pvpSeasonEntry.findMany({
    where: { seasonId: season.id },
    select: { characterId: true },
  })
  const already = new Set(existing.map((e) => e.characterId))
  const pending = chars.filter((c) => !already.has(c.id))

  console.log(
    `🏆 Temporada "${season.name}" (${season.status}) — pot ${season.potDol} + funded ${season.fundedDol} DOL`
  )
  console.log(
    `👥 ${chars.length} heróis de humanos | ${already.size} já inscritos | ${pending.length} a inscrever`
  )
  console.log(`💰 ${SEASON_ENTRY_DOL} DOL por herói → +${pending.length * SEASON_ENTRY_DOL} DOL na pool\n`)

  for (const c of pending) {
    const wallet = c.user.walletAddress
    console.log(`  ${c.name}${wallet ? ` (${wallet.slice(0, 10)}…)` : ' ⚠️ SEM CARTEIRA — não recebe prêmio'}`)
  }

  if (!live) {
    console.log('\n🟡 DRY-RUN — nada escrito. Para executar: CONFIRM=ENROLL npx tsx scripts/enroll-existing-heroes.ts')
    return
  }

  let ok = 0
  for (const c of pending) {
    await contributeToPrizePool({
      txHash: `seed:${c.id}`,
      seasonId: season.id,
      userId: c.userId,
      characterId: c.id,
      kind: 'entry',
      paidUsdc: 0,
    })
    const { enrolled } = await enrollCharacter({
      seasonId: season.id,
      characterId: c.id,
      userId: c.userId,
      source: 'creation',
      txHash: null,
      paidDol: SEASON_ENTRY_DOL,
    })
    if (enrolled) ok++
    console.log(`  ✓ ${c.name} inscrito`)
  }

  const after = await prisma.pvpSeason.findUnique({ where: { id: season.id } })
  console.log(`\n✅ ${ok} heróis inscritos | pool agora: ${after?.potDol} + ${after?.fundedDol} DOL`)
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
