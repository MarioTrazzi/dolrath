// Client-side: paga DOL para a tesouraria via MetaMask (Polygon Amoy) e
// devolve o txHash confirmado. Mesmo padrão usado pela taxa de criação; as
// regerações de imagem por IA reutilizam este helper.

import { ethers } from 'ethers';
import { getPolygonFeeOverrides } from '@/lib/gasFees';

const POLYGON_AMOY_CHAIN_ID_DEC = BigInt(80002);
const POLYGON_AMOY_CHAIN_ID_HEX = '0x13882';

export function getImageRegenCostDol(): string {
  return (process.env.NEXT_PUBLIC_IMAGE_REGEN_COST_DOL || '1').trim();
}

// Garante que a MetaMask está na Polygon Amoy (troca ou adiciona a rede).
async function ensureAmoyNetwork(provider: ethers.BrowserProvider) {
  const network = await provider.getNetwork();
  if (network.chainId === POLYGON_AMOY_CHAIN_ID_DEC) return;
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: POLYGON_AMOY_CHAIN_ID_HEX }]);
  } catch (switchErr: any) {
    // 4902: Unrecognized chain.
    if (switchErr?.code === 4902) {
      await provider.send('wallet_addEthereumChain', [
        {
          chainId: POLYGON_AMOY_CHAIN_ID_HEX,
          chainName: 'Polygon Amoy',
          nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
          rpcUrls: ['https://rpc-amoy.polygon.technology/'],
          blockExplorerUrls: ['https://amoy.polygonscan.com/'],
        },
      ]);
    } else {
      throw new Error('Conecte sua MetaMask à rede Polygon Amoy (chainId 80002) para pagar.');
    }
  }
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
  await ensureAmoyNetwork(provider);

  // Recria provider/signer após trocar de rede (a MetaMask pode mudar o contexto).
  const providerAfterSwitch = new ethers.BrowserProvider(eth);
  const signerAfterSwitch = await providerAfterSwitch.getSigner();

  // Valida que o contrato do token existe na rede selecionada.
  const code = await providerAfterSwitch.getCode(tokenAddress);
  if (!code || code === '0x') {
    throw new Error(
      'O token DOL não foi encontrado na rede atual. Verifique se sua MetaMask está na Polygon Amoy e se o NEXT_PUBLIC_DOL_TOKEN_ADDRESS está correto.'
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
  await tx.wait();

  return tx.hash;
}
