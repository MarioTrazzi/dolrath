import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { Contract, ethers } from 'ethers'
import { getCharacterNftContractAddress, getCharacterNftProvider } from '@/lib/characterNftOnchain'
import { DOLRATH_CHARACTERS_ABI } from '@/lib/characterNftSigning'
import { getLevelInfo } from '@/lib/experienceSystem'

function serializeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(serializeBigInt)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializeBigInt(v)
    return out
  }
  return value
}

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const walletAddress = String((session.user as any)?.walletAddress || '').trim()
  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Wallet not linked' },
      { status: 400 }
    )
  }

  const contractAddress = getCharacterNftContractAddress()
  if (!contractAddress) {
    return NextResponse.json(
      { error: 'Missing CHARACTER_NFT_CONTRACT_ADDRESS' },
      { status: 500 }
    )
  }

  const provider = getCharacterNftProvider()
  const contract = new Contract(contractAddress, DOLRATH_CHARACTERS_ABI, provider)

  // Optional optimization: start scanning from the deployment block.
  const deployBlockRaw = process.env.CHARACTER_NFT_DEPLOY_BLOCK || ''
  const deployBlock = deployBlockRaw ? Number(deployBlockRaw) : 0
  const startBlock = Number.isFinite(deployBlock) && deployBlock >= 0 ? deployBlock : 0

  const transferTopic = ethers.id('Transfer(address,address,uint256)')
  const toTopic = ethers.zeroPadValue(ethers.getAddress(walletAddress), 32)

  const latest = await provider.getBlockNumber()
  const chunkSize = 50_000

  const tokenIdSet = new Set<string>()

  for (let fromBlock = startBlock; fromBlock <= latest; fromBlock += chunkSize) {
    const toBlock = Math.min(latest, fromBlock + chunkSize - 1)

    const logs = await provider.getLogs({
      address: contractAddress,
      fromBlock,
      toBlock,
      topics: [transferTopic, null, toTopic],
    })

    for (const log of logs) {
      if (!log.topics || log.topics.length < 4) continue
      const tokenIdHex = log.topics[3]
      try {
        const tokenId = BigInt(tokenIdHex)
        tokenIdSet.add(tokenId.toString())
      } catch {
        // ignore
      }
    }
  }

  const candidateTokenIds = Array.from(tokenIdSet)

  // Confirm current ownership (handles transfers-out).
  const owned: Array<{ tokenId: string; tokenURI: string }> = []
  for (const tokenId of candidateTokenIds) {
    try {
      const owner = String(await contract.ownerOf(BigInt(tokenId)))
      if (owner.toLowerCase() !== walletAddress.toLowerCase()) continue

      const tokenURI = String(await contract.tokenURI(BigInt(tokenId)))
      owned.push({ tokenId, tokenURI })
    } catch {
      // token may not exist anymore or RPC issues
      continue
    }
  }

  owned.sort((a, b) => {
    try {
      return BigInt(a.tokenId) < BigInt(b.tokenId) ? -1 : 1
    } catch {
      return 0
    }
  })

  // Optional: enrich with DB characters that are linked to these tokenIds
  const tokenIdBigints = owned.map((o) => {
    try {
      return BigInt(o.tokenId)
    } catch {
      return null
    }
  }).filter(Boolean) as bigint[]

  const dbCharacters = tokenIdBigints.length
    ? await prisma.character.findMany({
        where: {
          userId: session.user.id,
          nftTokenId: { in: tokenIdBigints },
        },
      })
    : []

  const byTokenId = new Map<string, any>()
  for (const c of dbCharacters) {
    const tokenId = typeof c.nftTokenId === 'bigint' ? c.nftTokenId.toString() : null
    if (!tokenId) continue

    const levelInfo = getLevelInfo(c.experience)
    const baseStats = (c.baseStats as any) || {}

    byTokenId.set(tokenId, {
      ...c,
      level: levelInfo.level,
      levelInfo,
      hp: c.hp || baseStats.hp || 100,
      maxHp: c.maxHp || baseStats.maxHp || 100,
      mp: c.mp || baseStats.mp || 50,
      maxMp: c.maxMp || baseStats.maxMp || 50,
      stamina: c.stamina || baseStats.stamina || 100,
      maxStamina: c.maxStamina || baseStats.maxStamina || 100,
    })
  }

  return NextResponse.json(
    {
      chainId: Number(process.env.CHARACTER_NFT_CHAIN_ID || 80002),
      contractAddress,
      owner: walletAddress,
      items: owned.map((o) => ({
        tokenId: o.tokenId,
        tokenURI: o.tokenURI,
        character: byTokenId.get(o.tokenId) ? serializeBigInt(byTokenId.get(o.tokenId)) : null,
      })),
    },
    { status: 200 }
  )
}
