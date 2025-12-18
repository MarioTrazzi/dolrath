import { Wallet } from 'ethers'
import { getCharacterNftChainId, getCharacterNftContractAddress } from './characterNftOnchain'

export const DOLRATH_CHARACTERS_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function mintWithSig(address to, string tokenURI, uint256 deadline, bytes signature) returns (uint256)',
  'function nextTokenId() view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
] as const

export function getNftSignerWallet(): Wallet {
  const pk = (process.env.NFT_SIGNER_PRIVATE_KEY || '').trim()
  if (!pk) throw new Error('Missing NFT_SIGNER_PRIVATE_KEY')
  return new Wallet(pk)
}

export function getMintTypedData(params: {
  to: string
  tokenURI: string
  deadline: bigint
}) {
  const chainId = getCharacterNftChainId()
  const verifyingContract = getCharacterNftContractAddress()
  if (!verifyingContract) throw new Error('Missing CHARACTER_NFT_CONTRACT_ADDRESS')

  return {
    domain: {
      name: 'DolrathCharacters',
      version: '1',
      chainId,
      verifyingContract,
    },
    types: {
      MintRequest: [
        { name: 'to', type: 'address' },
        { name: 'tokenURI', type: 'string' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'MintRequest' as const,
    message: {
      to: params.to,
      tokenURI: params.tokenURI,
      deadline: params.deadline,
    },
  }
}

export async function signMintRequest(params: {
  to: string
  tokenURI: string
  deadline: bigint
}) {
  const signer = getNftSignerWallet()
  const typed = getMintTypedData(params)

  const signature = await signer.signTypedData(
    typed.domain as any,
    typed.types as any,
    typed.message as any
  )

  return {
    signature,
    domain: typed.domain,
    types: typed.types,
    message: typed.message,
  }
}
