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
 * RECREATE_SEASON=1 apaga a temporada corrente e deixa ensureActivePvpSeason
 * criar outra. Serve para quando ela nasceu com envs erradas — é fácil abrir uma
 * temporada de 90 dias sem querer, porque PVP_SEASON_DAYS só existe em produção
 * e um script rodado na máquina cai no default. Recusa se já houver partida ou
 * inscrição: a partir daí a temporada tem história e não se joga fora.
 *
 * USO:
 *   Dry-run:  npx tsx scripts/enroll-existing-heroes.ts
 *   Live:     CONFIRM=ENROLL npx tsx scripts/enroll-existing-heroes.ts
 */

import { PrismaClient } from '@prisma/client'
import { contributeToPrizePool, enrollCharacter, SEASON_ENTRY_DOL } from '../src/lib/seasonPool'
import { resolveEnrollmentSeason } from '../src/lib/pvpRanking'

const prisma = new PrismaClient()

/** Dias que a temporada deve durar segundo o ambiente ATUAL deste processo. */
const EXPECTED_DAYS = Number(process.env.PVP_SEASON_DAYS || 90)

async function recreateSeasonIfAsked(live: boolean) {
  if (process.env.RECREATE_SEASON !== '1') return

  const [matches, entries] = await Promise.all([
    prisma.pvpMatch.count(),
    prisma.pvpSeasonEntry.count(),
  ])
  if (matches > 0 || entries > 0) {
    throw new Error(
      `RECREATE_SEASON recusado: já existem ${matches} partidas e ${entries} inscrições. ` +
        `Apagar agora destruiria o placar — ajuste a temporada à mão se for mesmo o caso.`
    )
  }

  const doomed = await prisma.pvpSeason.findMany()
  for (const s of doomed) {
    const dias = Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 86_400_000)
    console.log(`♻️  apagando "${s.name}" (${dias}d, pot ${s.potDol}) — esperado ${EXPECTED_DAYS}d`)
  }
  if (live) {
    await prisma.pvpSeason.deleteMany({})
    console.log('♻️  temporada(s) apagada(s); a próxima nasce das envs deste processo\n')
  } else {
    console.log('♻️  (dry-run) seriam apagadas antes de recriar\n')
  }
}

async function main() {
  const live = process.env.CONFIRM === 'ENROLL'

  await recreateSeasonIfAsked(live)

  const season = await resolveEnrollmentSeason()
  const seasonDays = Math.round((season.endsAt.getTime() - season.startsAt.getTime()) / 86_400_000)
  if (seasonDays !== EXPECTED_DAYS) {
    console.log(
      `⚠️  a temporada dura ${seasonDays}d mas PVP_SEASON_DAYS diz ${EXPECTED_DAYS}d.` +
        ` Rode com RECREATE_SEASON=1 para refazê-la.\n`
    )
  }
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
