// Client-safe: rede EVM alvo do app (Polygon mainnet ou Amoy testnet),
// resolvida por NEXT_PUBLIC_CHAIN_ID. Único lugar que conhece nome/RPC/explorer
// por chainId — os fluxos de pagamento/burn e os textos de UI derivam daqui.

export type ChainInfo = {
  chainIdDec: bigint;
  chainIdHex: string;
  name: string;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  isMainnet: boolean;
};

const CHAINS: Record<string, Omit<ChainInfo, 'chainIdDec' | 'chainIdHex'>> = {
  '137': {
    name: 'Polygon Mainnet',
    rpcUrls: ['https://polygon-rpc.com/'],
    blockExplorerUrls: ['https://polygonscan.com/'],
    isMainnet: true,
  },
  '80002': {
    name: 'Polygon Amoy',
    rpcUrls: ['https://rpc-amoy.polygon.technology/'],
    blockExplorerUrls: ['https://amoy.polygonscan.com/'],
    isMainnet: false,
  },
};

export function getChainInfo(): ChainInfo {
  const id = (process.env.NEXT_PUBLIC_CHAIN_ID || '80002').trim();
  const base = CHAINS[id] || CHAINS['80002'];
  return {
    ...base,
    chainIdDec: BigInt(id in CHAINS ? id : '80002'),
    chainIdHex: `0x${BigInt(id in CHAINS ? id : '80002').toString(16)}`,
  };
}

// Parâmetros de wallet_addEthereumChain para a MetaMask.
export function getAddChainParams() {
  const c = getChainInfo();
  return {
    chainId: c.chainIdHex,
    chainName: c.name,
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: c.rpcUrls,
    blockExplorerUrls: c.blockExplorerUrls,
  };
}

type MinimalProvider = {
  getNetwork(): Promise<{ chainId: bigint }>;
  send(method: string, params: unknown[]): Promise<unknown>;
};

// Garante que a MetaMask está na rede alvo (troca ou adiciona). Tipagem
// estrutural para aceitar o BrowserProvider do ethers sem importá-lo aqui.
export async function ensureTargetNetwork(provider: MinimalProvider): Promise<void> {
  const chain = getChainInfo();
  const network = await provider.getNetwork();
  if (network.chainId === chain.chainIdDec) return;
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: chain.chainIdHex }]);
  } catch (switchErr: any) {
    // 4902: Unrecognized chain.
    if (switchErr?.code === 4902) {
      await provider.send('wallet_addEthereumChain', [getAddChainParams()]);
    } else {
      throw new Error(`Conecte sua MetaMask à rede ${chain.name} (chainId ${chain.chainIdDec}) para continuar.`);
    }
  }
}
