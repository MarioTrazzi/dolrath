import { Contract, Interface, type Log } from 'ethers'
import { getCharacterNftContractAddress, getCharacterNftProvider } from './characterNftOnchain'
import { DOLRATH_CHARACTERS_ABI } from './characterNftSigning'

const erc721Iface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
])

export async function verifyCharacterNftMintTx(params: {
  txHash: string
  expectedTo: string
  expectedContract?: string
  expectedTokenId?: bigint
  expectedTokenUri?: string
}) {
  const contractAddress = (params.expectedContract || getCharacterNftContractAddress()).trim()
  if (!contractAddress) throw new Error('Missing CHARACTER_NFT_CONTRACT_ADDRESS')

  const provider = getCharacterNftProvider()
  const receipt = await provider.getTransactionReceipt(params.txHash)

  if (!receipt) {
    throw new Error('NFT mint tx ainda não encontrada. Aguarde a confirmação e tente novamente.')
  }

  if (receipt.status !== 1) {
    throw new Error('NFT mint tx falhou (status != 1)')
  }

  const toLc = params.expectedTo.toLowerCase()
  const contractLc = contractAddress.toLowerCase()

  if ((receipt.to || '').toLowerCase() !== contractLc) {
    throw new Error('NFT mint tx não foi enviada para o contrato esperado')
  }

  const transferLog = receipt.logs
    .filter((l) => l.address.toLowerCase() === contractLc)
    .map((l) => {
      try {
        return erc721Iface.parseLog(l as unknown as Log)
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .find((parsed: any) => {
      const from = String(parsed.args.from).toLowerCase()
      const to = String(parsed.args.to).toLowerCase()
      return from === '0x0000000000000000000000000000000000000000' && to === toLc
    }) as any | undefined

  if (!transferLog) {
    throw new Error('Nenhum evento Transfer de mint encontrado para esse endereço')
  }

  const tokenId = BigInt(transferLog.args.tokenId)

  if (typeof params.expectedTokenId !== 'undefined' && tokenId !== params.expectedTokenId) {
    throw new Error('TokenId da NFT não confere')
  }

  const contract = new Contract(contractAddress, DOLRATH_CHARACTERS_ABI, provider)
  const onchainUri = String(await contract.tokenURI(tokenId))

  if (params.expectedTokenUri && onchainUri !== params.expectedTokenUri) {
    throw new Error('tokenURI on-chain não confere com o esperado')
  }

  const owner = String(await contract.ownerOf(tokenId))
  if (owner.toLowerCase() !== toLc) {
    throw new Error('ownerOf(tokenId) não confere com a carteira do usuário')
  }

  return {
    contractAddress,
    tokenId,
    tokenURI: onchainUri,
  }
}
