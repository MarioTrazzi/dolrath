import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getCharacterNftOwner } from '@/lib/characterMarketOnchain'
import { verifyCharacterListingCancelledTx } from '@/lib/characterMarketVerify'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

// Contraparte do list-confirm: limpa a marca de "à venda" quando o vendedor
// tira a NFT do escrow. Aceita `txHash` (evento ListingCancelled) ou, sem ele,
// resolve pela chain — se a NFT voltou para a carteira do dono, a listagem
// acabou, não importa como. Assim uma limpeza nunca fica presa a uma tx perdida.
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
    if (txHash && !isHex32Bytes(txHash)) {
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

    if (txHash) {
      await verifyCharacterListingCancelledTx({
        txHash,
        expectedSeller: walletAddress,
        expectedListingId: character.marketListingId ?? undefined,
      })
    } else {
      if (character.nftTokenId == null) {
        return NextResponse.json({ error: 'Personagem sem NFT' }, { status: 409 })
      }
      const owner = await getCharacterNftOwner(character.nftTokenId)
      if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
        return NextResponse.json(
          { error: 'A NFT ainda não voltou para a sua carteira — a listagem segue ativa.', onchainOwner: owner },
          { status: 409 }
        )
      }
    }

    await prisma.character.update({
      where: { id: character.id },
      data: { marketListingId: null, marketListedAt: null },
    })

    return NextResponse.json({ ok: true, characterId: character.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to confirm character listing cancel'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
