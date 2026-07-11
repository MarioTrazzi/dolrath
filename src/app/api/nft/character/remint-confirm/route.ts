import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { verifyCharacterNftMintTx } from '@/lib/characterNftVerify'
import { getCharacterNftChainId } from '@/lib/characterNftOnchain'

function serializeBigIntForJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T
}

export async function POST(req: Request) {
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

    const verified = await verifyCharacterNftMintTx({
      txHash: mintTxHash,
      expectedTo: to,
    })

    const updated = await prisma.character.update({
      where: { id: character.id },
      data: {
        nftChainId: getCharacterNftChainId(),
        nftContract: verified.contractAddress,
        nftTokenId: verified.tokenId,
        nftTokenUri: verified.tokenURI,
        nftMintTxHash: mintTxHash,
        nftMintedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, character: serializeBigIntForJson(updated) })
  } catch (err) {
    if ((err as any)?.code === 'P2002') {
      return NextResponse.json({ error: 'Essa transação já foi usada para vincular outro personagem' }, { status: 409 })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
