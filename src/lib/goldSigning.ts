import { Wallet } from 'ethers'
import { getGoldChainId, getGoldContractAddress } from './goldOnchain'

export const DOLRATH_GOLD_ABI = [
  'event Claimed(address indexed to, uint256 amount, uint256 nonce)',
  'function claimWithSig(address to, uint256 amount, uint256 nonce, uint256 deadline, bytes signature)',
  'function usedNonce(address,uint256) view returns (bool)',
] as const

export function getGoldSignerWallet(): Wallet {
  const pk = (process.env.GOLD_SIGNER_PRIVATE_KEY || '').trim()
  if (!pk) throw new Error('Missing GOLD_SIGNER_PRIVATE_KEY')
  return new Wallet(pk)
}

export function getGoldClaimTypedData(params: {
  to: string
  amountWei: bigint
  nonce: bigint
  deadline: bigint
}) {
  const chainId = getGoldChainId()
  const verifyingContract = getGoldContractAddress()
  if (!verifyingContract) {
    throw new Error('Missing GOLD_CONTRACT_ADDRESS (or NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS)')
  }

  return {
    domain: {
      name: 'DolrathGold',
      version: '1',
      chainId,
      verifyingContract,
    },
    types: {
      ClaimRequest: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'ClaimRequest' as const,
    message: {
      to: params.to,
      amount: params.amountWei,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  }
}

export async function signGoldClaim(params: {
  to: string
  amountWei: bigint
  nonce: bigint
  deadline: bigint
}) {
  const signer = getGoldSignerWallet()
  const typed = getGoldClaimTypedData(params)

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
