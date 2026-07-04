import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { getPolygonFeeOverrides } from '@/lib/gasFees';

// 💰 Recarga de GOLD on-chain para a "mão" do personagem (Character.gold).
//
// Fluxo: o jogador transfere GOLD (ERC-20) para a tesouraria via carteira e o
// servidor credita o mesmo valor off-chain (rota /api/gold/buy). É esse gold que
// a loja do ferreiro/alquimista consome — a compra do item em si é SEMPRE
// off-chain. Comprar item-NFT direto na loja fica fora da lore; isso é papel do
// market.
//
// Retorna o novo saldo do personagem em sucesso, ou null se faltar carteira /
// rede errada / saldo on-chain / o usuário cancelar (já exibe o toast). Não lança
// erros de carteira "esperados"; deixa erros inesperados subirem.

// Extrai o total de GOLD necessário de uma mensagem de erro do servidor no
// formato "…precisa de N 🪙." (loja/forja/alquimia). Retorna null se não casar.
export function parseNeededGold(errorMsg: unknown): number | null {
  const m = String(errorMsg ?? '').match(/precisa de\s+([\d.,]+)/i);
  if (!m) return null;
  const n = Math.ceil(Number(m[1].replace(/[.,]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Indica se um erro do servidor é "GOLD insuficiente na mão" (loja/forja/alquimia).
export function isInsufficientGold(errorMsg: unknown): boolean {
  return /insuficiente/i.test(String(errorMsg ?? '')) && /precisa de/i.test(String(errorMsg ?? ''));
}

// Transfere `totalCostGold` de GOLD para a tesouraria. Retorna o txHash, ou null.
export async function payGoldToTreasury(totalCostGold: number): Promise<string | null> {
  const eth = (globalThis as any)?.ethereum ?? (typeof window !== 'undefined' ? (window as any).ethereum : null);
  if (!eth) {
    toast.error('MetaMask não encontrada');
    return null;
  }

  const cfgRes = await fetch('/api/gold/spend-config', { cache: 'no-store' });
  const cfgJson = await cfgRes.json();
  if (!cfgRes.ok) {
    throw new Error(cfgJson?.error || 'Falha ao carregar config do GOLD');
  }

  const { contractAddress, chainId, treasuryAddress } = cfgJson as {
    contractAddress: string;
    chainId: number;
    treasuryAddress: string;
  };

  const provider = new ethers.BrowserProvider(eth);
  await provider.send('eth_requestAccounts', []);

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== Number(chainId)) {
    toast.error(`Troque a rede para chainId ${chainId} na MetaMask`);
    return null;
  }

  const signer = await provider.getSigner();
  const from = await signer.getAddress();

  const erc20Abi = [
    'function decimals() view returns (uint8)',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 value) returns (bool)',
  ] as const;

  const gold = new ethers.Contract(contractAddress, erc20Abi, signer);
  const decimals = Number(await gold.decimals());
  const costWei = ethers.parseUnits(String(totalCostGold), decimals);
  const balanceWei = (await gold.balanceOf(from)) as bigint;

  if (balanceWei < costWei) {
    toast.error(`💰 GOLD insuficiente on-chain! Você precisa de ${totalCostGold} GOLD na carteira.`);
    return null;
  }

  const payTx = await gold.transfer(treasuryAddress, costWei, await getPolygonFeeOverrides(provider));
  toast.success('Pagamento enviado! Aguardando confirmação…');
  const payReceipt = await payTx.wait();
  if (!payReceipt || payReceipt.status !== 1) {
    throw new Error('Pagamento falhou');
  }
  return payTx.hash as string;
}

// Recarrega `amountGold` de GOLD on-chain e credita off-chain em Character.gold.
// Retorna o novo saldo (characterGold) em sucesso, ou null.
export async function buyGoldOnChain(params: {
  characterId: string;
  amountGold: number;
}): Promise<{ characterGold: number; credited: number } | null> {
  const amount = Math.max(1, Math.ceil(params.amountGold));
  const txHash = await payGoldToTreasury(amount);
  if (!txHash) return null;

  // RPCs podem demorar a propagar — tenta confirmar algumas vezes.
  let response: Response | null = null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch('/api/gold/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash, characterId: params.characterId }),
    });
    if (response.ok) break;
    try { lastError = await response.json(); } catch { lastError = null; }
    const msg = String(lastError?.error || '').toLowerCase();
    const looksLikePropagation = msg.includes('ainda não encontrada') || msg.includes('not found');
    if (!looksLikePropagation) break;
    await new Promise((r) => setTimeout(r, 1200));
  }

  if (!response || !response.ok) {
    toast.error(`❌ ${lastError?.error || 'Falha ao creditar GOLD'}`);
    return null;
  }

  const data = await response.json().catch(() => null);
  return {
    characterGold: Number(data?.characterGold ?? 0),
    credited: Number(data?.credited ?? amount),
  };
}
