import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { verifyDolTransferTx } from '@/lib/dolPayments'
import { resolveEnrollmentSeason } from '@/lib/pvpRanking'
import {
  SEASON_ENTRY_DOL,
  SEASON_ENTRY_ENABLED,
  enrollCharacter,
  getSeasonPot,
} from '@/lib/seasonPool'

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

/**
 * GET — estado da inscrição: qual temporada está vendendo, quanto custa e
 * quais heróis do jogador já estão dentro.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const season = await resolveEnrollmentSeason()
  const [characters, entries] = await Promise.all([
    prisma.character.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, level: true, class: true, race: true, avatar: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.pvpSeasonEntry.findMany({
      where: { seasonId: season.id, userId: session.user.id },
      select: { characterId: true, source: true, createdAt: true },
    }),
  ])

  const enrolledIds = new Set(entries.map((e) => e.characterId))

  return NextResponse.json({
    season: {
      id: season.id,
      name: season.name,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
      status: season.status,
      potDol: getSeasonPot(season),
    },
    costDol: SEASON_ENTRY_DOL,
    enrollmentOpen: SEASON_ENTRY_ENABLED,
    treasuryAddress: (process.env.DOL_TREASURY_ADDRESS || '').trim(),
    characters: characters.map((c) => ({ ...c, enrolled: enrolledIds.has(c.id) })),
  })
}

/**
 * POST — inscreve um herói na temporada mediante SEASON_ENTRY_DOL transferidos
 * para a tesouraria. A inscrição vai 100% para a pool: a operação é paga em
 * USDC na criação do personagem, então nenhum DOL é desviado.
 *
 * Mesma forma do fluxo de criação: sem txHash devolve 402 com o que pagar e
 * para onde; com txHash, verifica on-chain e inscreve. Idempotente pelo par
 * (temporada, personagem) e pelo txHash do ledger.
 *
 * ⚠️ Fechado na Fase 1 do lançamento (SEASON_ENTRY_ENABLED): a inscrição é
 * paga em DOL e o DOL só circula depois do DolDistributor. Na temporada 1 a
 * pool é alimentada apenas pela criação de personagem. Ao ligar isto na Fase 2,
 * o `verifyDolTransferTx` abaixo precisa apontar para o endereço do DOL — hoje
 * `DOL_TOKEN_ADDRESS` guarda o token de PAGAMENTO (USDC), não o DOL.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!SEASON_ENTRY_ENABLED) {
    return NextResponse.json(
      {
        error:
          'A inscrição avulsa abre na próxima temporada. Nesta, todo herói criado já entra inscrito.',
        enrollmentOpen: false,
      },
      { status: 503 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : ''
    const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : ''

    if (!characterId) {
      return NextResponse.json({ error: 'characterId obrigatório' }, { status: 400 })
    }

    const treasuryAddress = (process.env.DOL_TREASURY_ADDRESS || '').trim()
    if (!treasuryAddress) {
      return NextResponse.json({ error: 'Server missing DOL_TREASURY_ADDRESS' }, { status: 500 })
    }

    const [user, character] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { walletAddress: true },
      }),
      prisma.character.findUnique({
        where: { id: characterId },
        select: { id: true, userId: true, name: true },
      }),
    ])

    if (!character || character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    if (!user?.walletAddress) {
      return NextResponse.json({ error: 'Conta sem carteira vinculada' }, { status: 400 })
    }

    const season = await resolveEnrollmentSeason()

    // Já inscrito: responde sucesso sem cobrar nada. Evita que um retry do
    // cliente vire uma segunda transferência.
    const existing = await prisma.pvpSeasonEntry.findUnique({
      where: { seasonId_characterId: { seasonId: season.id, characterId } },
    })
    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyEnrolled: true,
        season: { id: season.id, name: season.name },
      })
    }

    if (!txHash) {
      return NextResponse.json(
        {
          error: 'Pagamento necessário para inscrever o herói',
          requiresPayment: true,
          amountDol: SEASON_ENTRY_DOL,
          treasuryAddress,
          season: { id: season.id, name: season.name },
        },
        { status: 402 }
      )
    }

    if (!isHex32Bytes(txHash)) {
      return NextResponse.json({ error: 'txHash inválido' }, { status: 400 })
    }

    await verifyDolTransferTx({
      txHash,
      expectedFrom: user.walletAddress,
      expectedTo: treasuryAddress,
      minAmountHuman: String(SEASON_ENTRY_DOL),
    })

    const { alreadyEnrolled } = await enrollCharacter({
      seasonId: season.id,
      characterId,
      userId: session.user.id,
      source: 'purchase',
      txHash,
      paidDol: SEASON_ENTRY_DOL,
      contribute: true,
    })

    const updated = await prisma.pvpSeason.findUnique({ where: { id: season.id } })

    return NextResponse.json({
      success: true,
      alreadyEnrolled,
      character: { id: character.id, name: character.name },
      season: {
        id: season.id,
        name: season.name,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        potDol: updated ? getSeasonPot(updated) : getSeasonPot(season),
      },
    })
  } catch (e) {
    console.error('season enroll', e)
    const message = e instanceof Error ? e.message : 'Falha ao inscrever'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
