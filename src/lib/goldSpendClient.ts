'use client'

import { ethers } from 'ethers'
import { getPolygonFeeOverrides } from '@/lib/gasFees'

// 💳 Gasto de GOLD on-chain (client): quando o jogador não tem GOLD "na mão"
// (off-chain) para uma compra, ele paga transferindo o token GOLD da carteira
// para a treasury e o servidor confirma a compra pelo txHash. Irmão do
// goldClaimClient (que faz o caminho inverso: banco → token).
//
// Aqui NÃO se emite toast: a função devolve um resultado discriminado e quem
// chama traduz a mensagem (a ficha e o Baú Geral usam textos diferentes).

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
] as const

export type GoldPaymentResult =
  | { ok: true; txHash: string }
  /** Sem MetaMask/carteira injetada no navegador. */
  | { ok: false; reason: 'no-wallet' }
  /** Carteira conectada em outra rede — `chainId` é a esperada. */
  | { ok: false; reason: 'wrong-chain'; chainId: number }
  /** Saldo do token GOLD insuficiente para o custo pedido. */
  | { ok: false; reason: 'insufficient'; needed: number }

/**
 * Paga `totalCostGold` em token GOLD para a treasury configurada.
 * Lança apenas em falhas de verdade (config indisponível, tx revertida,
 * rejeição na carteira) — o caller trata com getWalletTxErrorMessage.
 */
export async function payGoldOnChain(totalCostGold: number): Promise<GoldPaymentResult> {
  const eth = (window as any)?.ethereum
  if (!eth) return { ok: false, reason: 'no-wallet' }

  const cfgRes = await fetch('/api/gold/spend-config', { cache: 'no-store' })
  const cfgJson = await cfgRes.json()
  if (!cfgRes.ok) {
    throw new Error(cfgJson?.error || 'Failed to load GOLD config')
  }

  const { contractAddress, chainId, treasuryAddress } = cfgJson as {
    contractAddress: string
    chainId: number
    treasuryAddress: string
  }

  const provider = new ethers.BrowserProvider(eth)
  await provider.send('eth_requestAccounts', [])

  const network = await provider.getNetwork()
  if (Number(network.chainId) !== Number(chainId)) {
    return { ok: false, reason: 'wrong-chain', chainId: Number(chainId) }
  }

  const signer = await provider.getSigner()
  const from = await signer.getAddress()

  const gold = new ethers.Contract(contractAddress, ERC20_ABI, signer)
  const decimals = Number(await gold.decimals())
  const costWei = ethers.parseUnits(String(totalCostGold), decimals)
  const balanceWei = (await gold.balanceOf(from)) as bigint

  if (balanceWei < costWei) {
    return { ok: false, reason: 'insufficient', needed: totalCostGold }
  }

  const tx = await gold.transfer(treasuryAddress, costWei, await getPolygonFeeOverrides(provider))
  const receipt = await tx.wait()
  if (!receipt || receipt.status !== 1) {
    throw new Error('Payment failed')
  }
  return { ok: true, txHash: tx.hash as string }
}

/**
 * Confirma no servidor uma expansão paga on-chain, com retry: RPCs demoram a
 * propagar o tx e a rota responde "transação ainda não encontrada" no meio
 * tempo. Devolve a última Response (ou null se nem chegou a tentar).
 */
export async function confirmExpansion(url: string, slots: number, txHash: string): Promise<Response | null> {
  let response: Response | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots, txHash }),
    })
    if (response.ok) break

    let lastError: any = null
    try { lastError = await response.json() } catch { lastError = null }
    const msg = String(lastError?.error || '').toLowerCase()
    const looksLikePropagation = msg.includes('ainda não encontrada') || msg.includes('not found')
    if (!looksLikePropagation) break
    await new Promise((r) => setTimeout(r, 1200))
  }
  return response
}
