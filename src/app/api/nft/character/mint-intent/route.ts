import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { signMintRequest } from '@/lib/characterNftSigning'
import { getCharacterNftChainId, getCharacterNftContractAddress } from '@/lib/characterNftOnchain'
import crypto from 'node:crypto'

export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const to = (session.user.walletAddress || '').trim()
    if (!to) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as any
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const name = (body.name || '').toString().trim()
    const raceId = (body.race || '').toString().trim()
    const classId = (body.characterClass || '').toString().trim()

    if (!name || !raceId || !classId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const contractAddress = getCharacterNftContractAddress()
    if (!contractAddress) {
      return NextResponse.json(
        { error: 'Server missing CHARACTER_NFT_CONTRACT_ADDRESS' },
        { status: 500 }
      )
    }

    const chainId = getCharacterNftChainId()

    // Make tokenURI unique per mint to avoid collisions / retries reverting with AlreadyMinted().
    const mintNonce = crypto.randomUUID()

    // Dynamic tokenURI (metadata served by the app). This lets the NFT reflect
    // future level/stat changes without requiring an on-chain tokenURI update.
    const origin = new URL(req.url).origin
    const tokenURI = `${origin}/api/nft/character/metadata?nonce=${mintNonce}`

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)

    const signed = await signMintRequest({ to, tokenURI, deadline })

    return NextResponse.json({
      contractAddress,
      chainId,
      to,
      tokenURI,
      deadline: deadline.toString(),
      signature: signed.signature,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
