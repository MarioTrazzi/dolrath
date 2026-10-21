import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { verifyCharacterNftMintTx } from '@/lib/characterNftVerify'
import { getCharacterNftChainId, getCharacterNftContractAddress, hasLiveCharacterToken } from '@/lib/characterNftOnchain'
import { getT } from '@/lib/i18n/server'

function serializeBigIntForJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T
}

export async function POST(req: Request) {
  const t = getT()
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const to = (session.user as any)?.walletAddress?.trim?.() || ''
    if (!to) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as any
    const characterId = (body?.characterId || '').toString().trim()
    const mintTxHash = (body?.mintTxHash || '').toString().trim()
    if (!characterId || !mintTxHash) {
      return NextResponse.json({ error: 'Missing characterId or mintTxHash' }, { status: 400 })
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } })
    if (!character || character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Character not found or unauthorized' }, { status: 404 })
    }

    const currentContract = getCharacterNftContractAddress()
    if (hasLiveCharacterToken(character, currentContract)) {
      return NextResponse.json({ error: 'This character already has an NFT' }, { status: 409 })
    }

    const verified = await verifyCharacterNftMintTx({
      txHash: mintTxHash,
      expectedTo: to,
    })

    // Condicional: o personagem ainda não pode ter ganho token vivo nem listagem
    // entre a checagem acima e aqui (dois confirms paralelos, ou um list-confirm).
    const claimed = await prisma.character.updateMany({
      where: {
        id: character.id,
        userId: session.user.id,
        marketListingId: null,
        OR: [
          { nftTokenId: null },
          { NOT: { nftContract: { equals: currentContract, mode: 'insensitive' } } },
        ],
      },
      data: {
        nftChainId: getCharacterNftChainId(),
        nftContract: verified.contractAddress,
        nftTokenId: verified.tokenId,
        nftTokenUri: verified.tokenURI,
        nftMintTxHash: mintTxHash,
        nftMintedAt: new Date(),
      },
    })
    if (claimed.count !== 1) {
      return NextResponse.json({ error: 'This character already has an NFT' }, { status: 409 })
    }
    const updated = await prisma.character.findUnique({ where: { id: character.id } })

    return NextResponse.json({ success: true, character: serializeBigIntForJson(updated) })
  } catch (err) {
    if ((err as any)?.code === 'P2002') {
      return NextResponse.json({ error: t('This transaction was already used to link another character') }, { status: 409 })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
