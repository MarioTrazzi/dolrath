import { Wallet, keccak256, toUtf8Bytes } from 'ethers'
import { getItemNftChainId, getItemNftContractAddress } from './itemNftOnchain'

export const DOLRATH_ITEMS_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event ItemMinted(address indexed to, uint256 indexed tokenId, bytes32 indexed purchaseId, bytes32 itemKey, uint256 paidGold)',
  'function mintWithSig(address to, bytes32 purchaseId, bytes32 itemKey, uint256 paidGold, string tokenURI, uint256 deadline, bytes signature) returns (uint256)',
  'function nextTokenId() view returns (uint256)',
  'function paidGoldByTokenId(uint256 tokenId) view returns (uint256)',
  'function itemKeyByTokenId(uint256 tokenId) view returns (bytes32)',
  'function tokenURI(uint256 tokenId) view returns (string)',
] as const

export function getItemNftSignerWallet(): Wallet {
  const pk =
    (process.env.ITEM_NFT_SIGNER_PRIVATE_KEY || '').trim() ||
    (process.env.GOLD_SIGNER_PRIVATE_KEY || '').trim()
  if (!pk) throw new Error('Missing ITEM_NFT_SIGNER_PRIVATE_KEY (or GOLD_SIGNER_PRIVATE_KEY)')
  return new Wallet(pk)
}

export function computePurchaseId(params: { paymentTxHash: string; itemId: string; to: string }) {
  const normalized = `${params.paymentTxHash.toLowerCase()}:${params.itemId}:${params.to.toLowerCase()}`
  return keccak256(toUtf8Bytes(normalized))
}

export function computeItemKey(itemId: string) {
  const normalized = String(itemId || '').trim()
  if (!normalized) throw new Error('Missing itemId for itemKey')
  return keccak256(toUtf8Bytes(normalized))
}

export function getItemMintTypedData(params: {
  to: string
  purchaseId: string // 0x…32 bytes
  itemKey: string // 0x…32 bytes
  paidGold: bigint
  tokenURI: string
  deadline: bigint
}) {
  const chainId = getItemNftChainId()
  const verifyingContract = getItemNftContractAddress()
  if (!verifyingContract) throw new Error('Missing ITEM_NFT_CONTRACT_ADDRESS')

  return {
    domain: {
      name: 'DolrathItems',
      version: '1',
      chainId,
      verifyingContract,
    },
    types: {
      MintItemRequest: [
        { name: 'to', type: 'address' },
        { name: 'purchaseId', type: 'bytes32' },
        { name: 'itemKey', type: 'bytes32' },
        { name: 'paidGold', type: 'uint256' },
        { name: 'tokenURI', type: 'string' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'MintItemRequest' as const,
    message: {
      to: params.to,
      purchaseId: params.purchaseId,
      itemKey: params.itemKey,
      paidGold: params.paidGold,
      tokenURI: params.tokenURI,
      deadline: params.deadline,
    },
  }
}

export async function signItemMintRequest(params: {
  to: string
  purchaseId: string
  itemKey: string
  paidGold: bigint
  tokenURI: string
  deadline: bigint
}) {
  const signer = getItemNftSignerWallet()
  const typed = getItemMintTypedData(params)

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
