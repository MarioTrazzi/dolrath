import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { verifyCharacterListedTx } from '@/lib/characterMarketVerify'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

// Fecha o ciclo da listagem: depois que a carteira confirma `createListing`, o
// app grava o listingId no personagem. É só espelho — a posse e o escrow
// continuam sendo decididos na chain —, mas é o que permite à UI mostrar
// "à venda", oferecer o cancelamento certo e barrar uma segunda listagem.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const body = await req.json().catch(() => ({}))
    const characterId = (typeof body?.characterId === 'string' ? body.characterId : '').trim()
    const txHash = (typeof body?.txHash === 'string' ? body.txHash : '').trim()

    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }
    if (!txHash || !isHex32Bytes(txHash)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const walletAddress = (user?.walletAddress || '').trim()
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet not linked' }, { status: 400 })
    }

    const character = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    if (character.nftTokenId == null) {
      return NextResponse.json({ error: 'Personagem sem NFT' }, { status: 409 })
    }

    const evt = await verifyCharacterListedTx({
      txHash,
      expectedSeller: walletAddress,
      expectedTokenId: character.nftTokenId,
    })

    await prisma.character.update({
      where: { id: character.id },
      data: { marketListingId: evt.listingId, marketListedAt: new Date() },
    })

    return NextResponse.json({
      ok: true,
      listingId: evt.listingId.toString(),
      tokenId: evt.tokenId.toString(),
      priceDol: evt.priceDol.toString(),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to confirm character listing'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
