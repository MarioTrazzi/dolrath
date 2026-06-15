import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { Contract, ethers } from 'ethers'
import { getCharacterNftContractAddress, getCharacterNftProvider } from '@/lib/characterNftOnchain'
import { DOLRATH_CHARACTERS_ABI } from '@/lib/characterNftSigning'
import { getLevelInfo } from '@/lib/experienceSystem'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

  const [network, code, latest] = await Promise.all([
    provider.getNetwork(),
    provider.getCode(contractAddress),
    provider.getBlockNumber(),
  ])

  const rpcChainId = Number(network.chainId)
  const configuredChainId = Number(process.env.CHARACTER_NFT_CHAIN_ID || 80002)
  if (Number.isFinite(configuredChainId) && configuredChainId > 0 && rpcChainId !== configuredChainId) {
    return NextResponse.json(
      {
        error: 'RPC chainId mismatch',
        configuredChainId,
        rpcChainId,
        contractAddress,
      },
      { status: 500 }
    )
  }

  if (!code || code === '0x') {
    return NextResponse.json(
      {
        error: 'Contract not deployed on configured RPC network',
        rpcChainId,
        contractAddress,
      },
      { status: 500 }
    )
  }

  const contract = new Contract(contractAddress, DOLRATH_CHARACTERS_ABI, provider)

  // Optional optimization: start scanning from the deployment block.
  const deployBlockRaw = process.env.CHARACTER_NFT_DEPLOY_BLOCK || ''
  const deployBlock = deployBlockRaw ? Number(deployBlockRaw) : 0
  const startBlock = Number.isFinite(deployBlock) && deployBlock >= 0 ? deployBlock : 0

  const transferTopic = ethers.id('Transfer(address,address,uint256)')
  const toTopic = ethers.zeroPadValue(ethers.getBytes(ethers.getAddress(walletAddress)), 32)

  if (startBlock > latest) {
    return NextResponse.json(
      {
        chainId: configuredChainId,
        rpcChainId,
        contractAddress,
        owner: walletAddress,
        scanErrors: false,
        debug: {
          startBlock,
          latest,
          note: 'CHARACTER_NFT_DEPLOY_BLOCK is greater than latest block',
        },
        items: [],
      },
      { status: 200 }
    )
  }

  const configuredChunkSize = Number(process.env.CHARACTER_NFT_LOG_CHUNK_SIZE || 10_000)
  let chunkSize = Number.isFinite(configuredChunkSize) && configuredChunkSize > 0 ? configuredChunkSize : 10_000
  chunkSize = Math.max(1000, Math.min(chunkSize, 100_000))

  let logScanHadErrors = false

  const tokenIdSet = new Set<string>()

  let fromBlock = startBlock
  while (fromBlock <= latest) {
    const toBlock = Math.min(latest, fromBlock + chunkSize - 1)

    try {
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

      fromBlock = toBlock + 1
    } catch {
      logScanHadErrors = true

      // Adaptively reduce chunk size on RPC timeouts/rate limits.
      if (chunkSize > 2000) {
        chunkSize = Math.max(2000, Math.floor(chunkSize / 2))
        continue
      }

      // Give up scanning further; we'll return whatever we found so far.
      break
    }
  }

  const candidateTokenIds = Array.from(tokenIdSet)

  // Confirm current ownership (handles transfers-out).
  const owned: Array<{ tokenId: string; tokenURI: string }> = []
  const ownedSet = new Set<string>()
  for (const tokenId of candidateTokenIds) {
    try {
      const owner = String(await contract.ownerOf(BigInt(tokenId)))
      if (owner.toLowerCase() !== walletAddress.toLowerCase()) continue

      const tokenURI = String(await contract.tokenURI(BigInt(tokenId)))
      owned.push({ tokenId, tokenURI })
      ownedSet.add(tokenId)
    } catch {
      // token may not exist anymore or RPC issues
      continue
    }
  }

  // Fetch all DB characters that carry a minted tokenId for this user. These
  // rows are written at creation time, so they exist immediately even when the
  // on-chain log scan (RPC) lags a few seconds behind a freshly-confirmed mint.
  let dbCharacters: any[] = []
  try {
    dbCharacters = await prisma.character.findMany({
      where: {
        userId: session.user.id,
        nftTokenId: { not: null },
      },
    })
  } catch {
    // DB is optional here; NFTs should still be returned even if Neon/Prisma is down.
    dbCharacters = []
  }

  // Backfill tokens the log scan missed. Verify on-chain ownership when
  // possible; if ownerOf reverts (token not yet visible on a lagging node)
  // include it optimistically, since the DB says the user just minted it.
  for (const c of dbCharacters) {
    const tokenId = typeof c.nftTokenId === 'bigint' ? c.nftTokenId.toString() : ''
    if (!tokenId || ownedSet.has(tokenId)) continue

    let includeIt = true
    let tokenURI = typeof c.nftTokenUri === 'string' ? c.nftTokenUri : ''
    try {
      const owner = String(await contract.ownerOf(BigInt(tokenId)))
      // Owned by someone else now (e.g. burned/transferred out) -> skip.
      includeIt = owner.toLowerCase() === walletAddress.toLowerCase()
      if (includeIt) {
        try {
          tokenURI = String(await contract.tokenURI(BigInt(tokenId)))
        } catch {
          // keep the DB tokenURI fallback
        }
      }
    } catch {
      // ownerOf reverted: token likely not indexed yet on the RPC node.
      // Trust the DB record and surface it optimistically.
      includeIt = true
    }

    if (includeIt) {
      owned.push({ tokenId, tokenURI })
      ownedSet.add(tokenId)
    }
  }

  owned.sort((a, b) => {
    try {
      return BigInt(a.tokenId) < BigInt(b.tokenId) ? -1 : 1
    } catch {
      return 0
    }
  })

  // Keep only the DB characters whose tokenId is actually in the returned set,
  // for the per-token enrichment below.
  dbCharacters = dbCharacters.filter((c) => {
    const tid = typeof c.nftTokenId === 'bigint' ? c.nftTokenId.toString() : ''
    return tid && ownedSet.has(tid)
  })

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
      chainId: configuredChainId,
      rpcChainId,
      contractAddress,
      owner: walletAddress,
      scanErrors: logScanHadErrors,
      debug: {
        startBlock,
        latest,
        initialChunkSize: configuredChunkSize,
      },
      items: owned.map((o) => ({
        tokenId: o.tokenId,
        tokenURI: o.tokenURI,
        character: byTokenId.get(o.tokenId) ? serializeBigInt(byTokenId.get(o.tokenId)) : null,
      })),
    },
    { status: 200 }
  )
}
