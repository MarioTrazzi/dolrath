/*
  Debug script: scan DolrathCharacters owned NFTs for a wallet.

  Usage:
    npx ts-node scripts/debug-owned-nfts.ts --wallet 0xYourWallet

  Optional:
    --contract 0xContractAddress
    --fromBlock 30750000
    --chunk 10000

  Env:
    CHARACTER_NFT_RPC_URL (or POLYGON_AMOY_RPC_URL)
    CHARACTER_NFT_CONTRACT_ADDRESS (if --contract not provided)
*/

require('dotenv/config')

const { Contract, FetchRequest, JsonRpcProvider, ethers } = require('ethers')

const DOLRATH_CHARACTERS_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]

function normalizeRpcUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  try {
    const u = new URL(candidate)
    const host = u.hostname.toLowerCase()
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
    if (u.protocol === 'http:' && !isLocalhost) u.protocol = 'https:'
    return u.toString()
  } catch {
    return candidate
  }
}

function getRpcUrl(): string {
  return normalizeRpcUrl(
    process.env.CHARACTER_NFT_RPC_URL ||
      process.env.POLYGON_AMOY_RPC_URL ||
      process.env.DOL_RPC_URL ||
      ''
  )
}

function getProvider() {
  const rpcUrl = getRpcUrl()
  if (!rpcUrl) throw new Error('Missing CHARACTER_NFT_RPC_URL (or POLYGON_AMOY_RPC_URL)')

  const req = new FetchRequest(rpcUrl)
  const timeoutMs = Number(process.env.NFT_RPC_TIMEOUT_MS || 10_000)
  req.timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000
  return new JsonRpcProvider(req)
}

function getContractAddress(): string {
  return String(process.env.CHARACTER_NFT_CONTRACT_ADDRESS || process.env.NFT_CONTRACT_ADDRESS || '').trim()
}

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return undefined
  return process.argv[idx + 1]
}

async function main() {
  const wallet = (getArg('wallet') || '').trim()
  if (!wallet) throw new Error('Missing --wallet 0x...')

  const contractAddress = (getArg('contract') || getContractAddress() || '').trim()
  if (!contractAddress) throw new Error('Missing --contract or CHARACTER_NFT_CONTRACT_ADDRESS')

  const fromBlockRaw = getArg('fromBlock')
  const fromBlock = fromBlockRaw ? Number(fromBlockRaw) : Number(process.env.CHARACTER_NFT_DEPLOY_BLOCK || 0)
  const startBlock = Number.isFinite(fromBlock) && fromBlock >= 0 ? fromBlock : 0

  const chunkRaw = getArg('chunk')
  const chunkSize = Math.max(1000, Math.min(Number(chunkRaw || 10_000), 100_000))

  const provider = getProvider()
  const [network, latest, code] = await Promise.all([
    provider.getNetwork(),
    provider.getBlockNumber(),
    provider.getCode(contractAddress),
  ])

  console.log(JSON.stringify({ rpcChainId: Number(network.chainId), latest, contractAddress, codeBytes: (code.length - 2) / 2 }, null, 2))

  if (!code || code === '0x') {
    throw new Error('Contract code not found on this RPC network (getCode == 0x)')
  }

  const contract = new Contract(contractAddress, DOLRATH_CHARACTERS_ABI, provider)

  const transferTopic = ethers.id('Transfer(address,address,uint256)')
  const toTopic = ethers.zeroPadValue(ethers.getBytes(ethers.getAddress(wallet)), 32)

  const tokenIdSet = new Set<string>()

  let scanFrom = startBlock
  while (scanFrom <= latest) {
    const scanTo = Math.min(latest, scanFrom + chunkSize - 1)
    const logs = await provider.getLogs({
      address: contractAddress,
      fromBlock: scanFrom,
      toBlock: scanTo,
      topics: [transferTopic, null, toTopic],
    })

    for (const log of logs) {
      const tokenIdHex = log.topics?.[3]
      if (!tokenIdHex) continue
      try {
        tokenIdSet.add(BigInt(tokenIdHex).toString())
      } catch {
        // ignore
      }
    }

    process.stdout.write(`scanned ${scanFrom}-${scanTo} | logs=${logs.length} | tokenIds=${tokenIdSet.size}\n`)
    scanFrom = scanTo + 1
  }

  const tokenIds = Array.from(tokenIdSet).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))
  console.log(`\nCandidate tokenIds (from Transfer-to logs): ${tokenIds.join(', ') || '(none)'}`)

  const owned: Array<{ tokenId: string; tokenURI: string }> = []
  for (const tokenId of tokenIds) {
    try {
      const owner = String(await contract.ownerOf(BigInt(tokenId)))
      if (owner.toLowerCase() !== wallet.toLowerCase()) continue
      const tokenURI = String(await contract.tokenURI(BigInt(tokenId)))
      owned.push({ tokenId, tokenURI })
    } catch {
      // ignore
    }
  }

  console.log(`\nOwned now (ownerOf confirmed): ${owned.length}`)
  for (const item of owned) {
    console.log(`- tokenId=${item.tokenId} tokenURI=${item.tokenURI}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
