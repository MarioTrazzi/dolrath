// Client-side: paga DOL para a tesouraria via MetaMask (rede via chainConfig)
// e devolve o txHash confirmado. Mesmo padrão usado pela taxa de criação; as
// regerações de imagem por IA reutilizam este helper.

import { ethers } from 'ethers';
import { getPolygonFeeOverrides } from '@/lib/gasFees';
import { ensureTargetNetwork, getChainInfo } from '@/lib/chainConfig';

export function getImageRegenCostDol(): string {
  return (process.env.NEXT_PUBLIC_IMAGE_REGEN_COST_DOL || '1').trim();
}

export async function payDolToTreasury(amountDol: string): Promise<string> {
  const eth = (window as any)?.ethereum;
  if (!eth) {
    throw new Error('MetaMask não encontrada. Instale/ative a extensão para continuar.');
  }

  const tokenAddress = process.env.NEXT_PUBLIC_DOL_TOKEN_ADDRESS || '';
  const treasuryAddress = process.env.NEXT_PUBLIC_DOL_TREASURY_ADDRESS || '';
  if (!tokenAddress) {
    throw new Error('Token address não configurado (NEXT_PUBLIC_DOL_TOKEN_ADDRESS)');
  }
  if (!treasuryAddress) {
    throw new Error('Treasury address não configurado (NEXT_PUBLIC_DOL_TREASURY_ADDRESS)');
  }

  const provider = new ethers.BrowserProvider(eth);
  await provider.send('eth_requestAccounts', []);
  await ensureTargetNetwork(provider);

  // Recria provider/signer após trocar de rede (a MetaMask pode mudar o contexto).
  const providerAfterSwitch = new ethers.BrowserProvider(eth);
  const signerAfterSwitch = await providerAfterSwitch.getSigner();

  // Valida que o contrato do token existe na rede selecionada.
  const code = await providerAfterSwitch.getCode(tokenAddress);
  if (!code || code === '0x') {
    throw new Error(
      `O token DOL não foi encontrado na rede atual. Verifique se sua MetaMask está na ${getChainInfo().name} e se o NEXT_PUBLIC_DOL_TOKEN_ADDRESS está correto.`
    );
  }

  const erc20 = new ethers.Contract(
    tokenAddress,
    ['function decimals() view returns (uint8)', 'function transfer(address to, uint256 amount) returns (bool)'],
    signerAfterSwitch
  );

  const decimals: number = Number(await erc20.decimals());
  const amount = ethers.parseUnits(String(amountDol), decimals);

  const tx = await erc20.transfer(treasuryAddress, amount, await getPolygonFeeOverrides(providerAfterSwitch));

  // O RPC da Amoy às vezes nunca resolve o tx.wait() (a UI ficava presa em
  // "Confirmando o pagamento…"). Espera com timeout; se estourar, segue com o
  // hash mesmo assim — o servidor valida a confirmação on-chain por conta própria.
  try {
    await providerAfterSwitch.waitForTransaction(tx.hash, 1, 90_000);
  } catch {
    // Timeout ou soluço do RPC: o pagamento pode já estar confirmado on-chain.
  }

  return tx.hash;
}
