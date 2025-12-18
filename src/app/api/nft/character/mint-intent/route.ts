import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { buildCharacterNftTokenUri } from '@/lib/characterNftMetadata'
import { signMintRequest } from '@/lib/characterNftSigning'
import { getCharacterNftChainId, getCharacterNftContractAddress } from '@/lib/characterNftOnchain'

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

    const str = Number(body?.distributedPoints?.str ?? 0)
    const agi = Number(body?.distributedPoints?.agi ?? 0)
    const int = Number(body?.distributedPoints?.int ?? 0)
    const def = Number(body?.distributedPoints?.def ?? body?.distributedPoints?.res ?? 0)

    const avatarUrl = typeof body.avatar === 'string' ? body.avatar.trim() : null

    if (!name || !raceId || !classId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const allInts = [str, agi, int, def].every((v) => Number.isFinite(v) && Number.isInteger(v))
    const inRange = [str, agi, int, def].every((v) => v >= 0 && v <= 10)
    const total = str + agi + int + def
    if (!allInts || !inRange || total !== 15) {
      return NextResponse.json(
        {
          error: 'Invalid distributedPoints',
          details: { received: { str, agi, int, def }, total },
        },
        { status: 400 }
      )
    }

    const contractAddress = getCharacterNftContractAddress()
    if (!contractAddress) {
      return NextResponse.json(
        { error: 'Server missing CHARACTER_NFT_CONTRACT_ADDRESS' },
        { status: 500 }
      )
    }

    const chainId = getCharacterNftChainId()

    const { tokenURI } = buildCharacterNftTokenUri({
      name,
      raceId,
      classId,
      avatarUrl,
      stats: { str, agi, int, def },
    })

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
