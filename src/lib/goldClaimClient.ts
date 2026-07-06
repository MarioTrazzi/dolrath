'use client'

import { ethers } from 'ethers'
import { decodeContractCustomErrorMessage, getWalletTxErrorMessage } from '@/lib/walletErrors'
import { getPolygonFeeOverrides } from '@/lib/gasFees'

const GOLD_CLAIM_ABI = [
  'function claimWithSig(address to, uint256 amount, uint256 nonce, uint256 deadline, bytes signature)',
] as const

export interface GoldClaimResult {
  amount: number
  txHash: string
}

// ⛓️ Claim de GOLD on-chain (client): pede a intent assinada ao servidor
// (/api/gold/claim-intent), envia a claimWithSig pela MetaMask e confirma o tx
// no servidor (/api/gold/claim-confirm). O claim cobre TODO o saldo do banco
// (User.goldBalance) — é o único caminho de mint do token GOLD.
// Reutilizado pela página /wallet e pelo painel de claim do /inventory.
// Lança Error com mensagem amigável em qualquer falha (inclusive rejeição).
export async function claimGoldOnChain(onProgress?: (message: string) => void): Promise<GoldClaimResult> {
  const eth = (window as any)?.ethereum
  if (!eth) throw new Error('MetaMask não encontrada')

  const intentRes = await fetch('/api/gold/claim-intent', { method: 'POST' })
  const intentJson = await intentRes.json()
  if (!intentRes.ok) {
    throw new Error(intentJson?.error || 'Falha ao criar claim')
  }

  const { contractAddress, chainId, to, amount, amountWei, nonce, deadline, signature } = intentJson as {
    contractAddress: string
    chainId: number
    to: string
    amount: number
    amountWei: string
    nonce: string
    deadline: string
    signature: string
  }

  const provider = new ethers.BrowserProvider(eth)
  await provider.send('eth_requestAccounts', [])

  const network = await provider.getNetwork()
  if (Number(network.chainId) !== Number(chainId)) {
    throw new Error(`Troque a rede para chainId ${chainId} na MetaMask`)
  }

  const signer = await provider.getSigner()
  const contract = new ethers.Contract(contractAddress, GOLD_CLAIM_ABI, signer)

  // Preflight para melhorar as mensagens de erro (decodifica custom errors).
  let gasLimit: bigint | undefined
  try {
    const est = (await contract.claimWithSig.estimateGas(to, amountWei, nonce, deadline, signature)) as bigint
    gasLimit = (est * BigInt(12)) / BigInt(10)
  } catch (preErr: any) {
    const decoded = decodeContractCustomErrorMessage({ contractInterface: contract.interface as any, err: preErr })
    throw new Error(decoded || getWalletTxErrorMessage(preErr))
  }

  const feeOverrides = await getPolygonFeeOverrides(provider)
  const tx = await contract.claimWithSig(to, amountWei, nonce, deadline, signature, {
    ...feeOverrides,
    ...(gasLimit ? { gasLimit } : {}),
  })
  onProgress?.('Transação enviada! Aguardando confirmação…')

  const receipt = await tx.wait()
  if (!receipt || receipt.status !== 1) {
    throw new Error('Transação falhou')
  }

  const confirmRes = await fetch('/api/gold/claim-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash: tx.hash }),
  })
  const confirmJson = await confirmRes.json()
  if (!confirmRes.ok) {
    throw new Error(confirmJson?.error || 'Falha ao confirmar claim')
  }

  return { amount: Number(amount) || 0, txHash: tx.hash as string }
}
