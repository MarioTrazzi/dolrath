import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { verifyCharacterNftMintTx } from '@/lib/characterNftVerify'
import { getCharacterNftContractAddress, getCharacterNftChainId } from '@/lib/characterNftOnchain'

export async function GET(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const expectedTo = (session.user.walletAddress || '').trim()
  if (!expectedTo) {
    return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
  }

  const url = new URL(req.url)
  const txHash = (url.searchParams.get('txHash') || '').trim()
  if (!txHash) {
    return NextResponse.json({ error: 'Missing txHash' }, { status: 400 })
  }

  try {
    const expectedContract = getCharacterNftContractAddress()
    const chainId = getCharacterNftChainId()

    const verified = await verifyCharacterNftMintTx({
      txHash,
      expectedTo,
      expectedContract,
    })

    return NextResponse.json({
      chainId,
      contractAddress: verified.contractAddress,
      tokenId: verified.tokenId.toString(),
      tokenURI: verified.tokenURI,
      owner: expectedTo,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
