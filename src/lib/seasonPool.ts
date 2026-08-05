/**
 * Pool de premiação da temporada.
 *
 * DUAS MOEDAS, SEM CONTATO ENTRE SI. O dólar sustenta o estúdio; a temporada é
 * disputada em DOL. Nenhum USDC entra na pool — o jogador paga 2 USDC pelo
 * herói (NFT, imagem por IA, acesso) e o estúdio deposita SEASON_ENTRY_DOL do
 * bucket Play & Achieve na pool como a inscrição dele. Isso tira o estúdio da
 * posição de custodiar dinheiro de jogador com distribuição manual.
 *
 * Duas entradas alimentam a pool, ambas valendo SEASON_ENTRY_DOL:
 *   • criação de personagem — o estúdio aporta a inscrição do herói, e ele já
 *     nasce inscrito na temporada corrente.
 *   • inscrição avulsa (temporada 2+) — o próprio jogador paga em DOL, do que
 *     ganhou ou comprou. É a peça que faz o sistema girar sozinho: a pool se
 *     renova com a base existente em vez de depender de personagens novos.
 *
 * Toda entrada passa por `contributeToPrizePool`, ancorada no txHash (@unique)
 * — chamar duas vezes com o mesmo hash é no-op, mesmo padrão de GoldTopup.
 *
 * A pool é contabilidade off-chain enquanto o DOL não circula (Fase 1 do
 * lançamento). O claim on-chain e o mercado de personagens — o único
 * consumidor de DOL, e o que faz o prêmio valer alguma coisa — entram na
 * Fase 2, dentro da janela da temporada 1.
 */
import { prisma } from '@/lib/prisma'
import { resolveEnrollmentSeason } from '@/lib/pvpRanking'
import type { PvpSeason } from '@prisma/client'

/**
 * Inscrição de um herói na temporada, em DOL. É o valor que a criação aporta e
 * o que a inscrição avulsa cobra — os dois lados iguais é o que preserva a
 * promessa "o 20º recupera o que pagou" (1% de 100 inscritos = 1 inscrição).
 */
export const SEASON_ENTRY_DOL = Number(process.env.SEASON_ENTRY_DOL || 100)

/**
 * Inscrição avulsa só existe quando o jogador tem DOL para pagar — ou seja,
 * depois do DolDistributor (Fase 2). Na temporada 1 a pool é alimentada apenas
 * pela criação de personagem.
 */
export const SEASON_ENTRY_ENABLED = process.env.SEASON_ENTRY_ENABLED === 'true'

/**
 * Corte da pool desviado para o cofre de torneios. ZERO no lançamento: a
 * temporada 1 leva a pool inteira, então 100 inscritos = 10.000 DOL e o 20º
 * (1% do split) recupera exatamente os 100 DOL da inscrição. Liga-se na
 * temporada 2, com base maior.
 */
export const TOURNAMENT_CUT_PCT = Number(process.env.TOURNAMENT_CUT_PCT || 0)

/**
 * Personagem criado nos últimos N dias de uma temporada entra inscrito também
 * na seguinte — sem isso, quem cria a 3 dias do fim paga por 3 dias de ranqueada.
 */
export const ENTRY_GRACE_DAYS = Number(process.env.SEASON_ENTRY_GRACE_DAYS || 14)

export const TOURNAMENT_VAULT = 'tournament'

/** Prêmio real da temporada: aporte do estúdio + o que os jogadores puseram. */
export function getSeasonPot(season: Pick<PvpSeason, 'potDol' | 'fundedDol'>): number {
  return round2(season.potDol + season.fundedDol)
}

/** Parte da pool que vai de fato para o top 20 (o resto é corte de torneio). */
export function getDistributablePot(season: Pick<PvpSeason, 'potDol' | 'fundedDol'>): number {
  return round2(getSeasonPot(season) * (1 - TOURNAMENT_CUT_PCT))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Registra uma inscrição na premiação e engorda o pot da temporada.
 * Idempotente pelo txHash — devolve `{ credited: false }` quando já contabilizado.
 *
 * O prêmio é SEMPRE SEASON_ENTRY_DOL, independente do que foi pago em dólar:
 * na criação o USDC é receita do estúdio e o DOL sai do bucket; na inscrição
 * avulsa o próprio DOL pago é o aporte. `paidUsdc` fica no ledger só para
 * auditoria da receita — nunca vira prêmio.
 */
export async function contributeToPrizePool(opts: {
  txHash: string
  seasonId: string
  userId: string
  characterId?: string | null
  kind: 'creation' | 'entry'
  /** Dólares verificados on-chain. Zero na inscrição avulsa (paga em DOL). */
  paidUsdc?: number
}): Promise<{ credited: boolean; prizeDol: number }> {
  const prizeDol = round2(SEASON_ENTRY_DOL)

  try {
    await prisma.$transaction([
      prisma.dolPrizeContribution.create({
        data: {
          txHash: opts.txHash,
          seasonId: opts.seasonId,
          userId: opts.userId,
          characterId: opts.characterId ?? null,
          kind: opts.kind,
          paidUsdc: round2(opts.paidUsdc ?? 0),
          paidDol: prizeDol,
          prizeDol,
          // Receita de operação é o dólar inteiro, contabilizado em paidUsdc.
          // Nenhum DOL é desviado da pool.
          opsDol: 0,
        },
      }),
      prisma.pvpSeason.update({
        where: { id: opts.seasonId },
        data: { fundedDol: { increment: prizeDol } },
      }),
    ])
    return { credited: true, prizeDol }
  } catch (e: any) {
    // P2002 = txHash já contabilizado (retry do cliente, replay do hash).
    if (e?.code === 'P2002') return { credited: false, prizeDol: 0 }
    throw e
  }
}

/**
 * Inscreve o herói na temporada. `source: 'purchase'` também contabiliza o DOL
 * na pool; `'creation'` já foi contabilizado pelo fluxo de criação, e a
 * cortesia de fim de temporada entra sem txHash e sem dinheiro.
 *
 * Idempotente pelo par (temporada, personagem).
 */
export async function enrollCharacter(opts: {
  seasonId: string
  characterId: string
  userId: string
  source: 'creation' | 'purchase'
  txHash?: string | null
  paidDol?: number
  /** Contabiliza o pagamento na pool (só faz sentido na compra avulsa). */
  contribute?: boolean
}): Promise<{ enrolled: boolean; alreadyEnrolled: boolean }> {
  const existing = await prisma.pvpSeasonEntry.findUnique({
    where: { seasonId_characterId: { seasonId: opts.seasonId, characterId: opts.characterId } },
  })
  if (existing) return { enrolled: false, alreadyEnrolled: true }

  if (opts.contribute && opts.txHash) {
    await contributeToPrizePool({
      txHash: opts.txHash,
      seasonId: opts.seasonId,
      userId: opts.userId,
      characterId: opts.characterId,
      kind: 'entry',
      // Inscrição avulsa é paga em DOL: nenhum dólar envolvido.
      paidUsdc: 0,
    })
  }

  try {
    await prisma.pvpSeasonEntry.create({
      data: {
        seasonId: opts.seasonId,
        characterId: opts.characterId,
        userId: opts.userId,
        source: opts.source,
        txHash: opts.txHash ?? null,
        paidDol: opts.paidDol ?? 0,
      },
    })
    return { enrolled: true, alreadyEnrolled: false }
  } catch (e: any) {
    // Corrida entre duas requisições do mesmo jogador.
    if (e?.code === 'P2002') return { enrolled: false, alreadyEnrolled: true }
    throw e
  }
}

/**
 * O herói disputa o ranking nesta temporada? Sem inscrição a luta continua
 * pagando ouro e XP — só não pontua. Fica no caminho quente do crédito de
 * recompensas, daí o cache curto.
 */
const enrollmentCache = new Map<string, { value: boolean; expiresAt: number }>()
const ENROLLMENT_TTL_MS = 60_000

export async function isEnrolled(seasonId: string, characterId: string): Promise<boolean> {
  const key = `${seasonId}:${characterId}`
  const hit = enrollmentCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const row = await prisma.pvpSeasonEntry.findUnique({
    where: { seasonId_characterId: { seasonId, characterId } },
    select: { id: true },
  })
  const value = !!row
  // Só cacheia o positivo: inscrição é irreversível, então nunca fica stale.
  // O negativo precisa expirar rápido pra quem acabou de se inscrever pontuar.
  enrollmentCache.set(key, {
    value,
    expiresAt: Date.now() + (value ? ENROLLMENT_TTL_MS * 30 : ENROLLMENT_TTL_MS),
  })
  return value
}

/**
 * Fluxo completo da criação de personagem: o estúdio aporta SEASON_ENTRY_DOL na
 * pool e o herói já nasce inscrito na temporada corrente — a inscrição está
 * inclusa no preço de criação, o jogador só paga de novo na temporada seguinte.
 *
 * O USDC pago NÃO entra na pool: é receita de operação, registrada em
 * `paidUsdc` apenas para auditoria.
 *
 * Na entressafra o aporte e a inscrição vão para a temporada que vem, não para
 * a que está sendo encerrada.
 */
export async function creditCreationToPrizePool(opts: {
  txHash: string
  userId: string
  characterId: string
  paidUsdc: number
}): Promise<{ seasonId: string; prizeDol: number }> {
  const season = await resolveEnrollmentSeason()

  const { prizeDol } = await contributeToPrizePool({
    txHash: opts.txHash,
    seasonId: season.id,
    userId: opts.userId,
    characterId: opts.characterId,
    kind: 'creation',
    paidUsdc: opts.paidUsdc,
  })

  await enrollCharacter({
    seasonId: season.id,
    characterId: opts.characterId,
    userId: opts.userId,
    source: 'creation',
    // O txHash já está no ledger de contribuição; aqui ficaria duplicado e
    // colidiria com o @unique de PvpSeasonEntry.txHash.
    txHash: null,
    paidDol: prizeDol,
  })

  return { seasonId: season.id, prizeDol }
}

/**
 * Cortesia de virada: personagem criado nos últimos ENTRY_GRACE_DAYS da
 * temporada anterior entra de graça na nova. Sem isso, quem cria o herói a três
 * dias do fim paga a inscrição por três dias de ranqueada.
 *
 * Roda na criação da temporada (cron) — é lá que a "próxima" existe.
 */
export async function grantGraceEntries(opts: {
  seasonId: string
  previousSeasonEndsAt: Date
}): Promise<number> {
  const cutoff = new Date(opts.previousSeasonEndsAt.getTime() - ENTRY_GRACE_DAYS * 86_400_000)
  const recent = await prisma.character.findMany({
    where: {
      createdAt: { gte: cutoff },
      creationTxHash: { not: null },
      user: { isBot: false },
    },
    select: { id: true, userId: true },
  })

  let granted = 0
  for (const character of recent) {
    const { enrolled } = await enrollCharacter({
      seasonId: opts.seasonId,
      characterId: character.id,
      userId: character.userId,
      source: 'creation',
      txHash: null,
      paidDol: 0,
    })
    if (enrolled) granted++
  }
  return granted
}

/** Manda DOL não distribuído para o cofre que financia os torneios. */
export async function creditTournamentVault(amountDol: number): Promise<void> {
  if (amountDol <= 0) return
  await prisma.prizeVault.upsert({
    where: { kind: TOURNAMENT_VAULT },
    create: { kind: TOURNAMENT_VAULT, balanceDol: round2(amountDol) },
    update: { balanceDol: { increment: round2(amountDol) } },
  })
}

export async function getTournamentVaultBalance(): Promise<number> {
  const vault = await prisma.prizeVault.findUnique({ where: { kind: TOURNAMENT_VAULT } })
  return vault?.balanceDol ?? 0
}

/** Quantos heróis (e contas) disputam a temporada — alimenta o card do pot. */
export async function getSeasonEntryStats(seasonId: string) {
  const [entries, distinctUsers] = await Promise.all([
    prisma.pvpSeasonEntry.count({ where: { seasonId } }),
    prisma.pvpSeasonEntry.findMany({
      where: { seasonId },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ])
  return { entries, users: distinctUsers.length }
}
