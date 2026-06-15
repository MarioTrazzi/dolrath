'use client';

import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { RaceSelectionStep } from './components/RaceSelectionStep';
import { ClassSelectionStep } from './components/ClassSelectionStep';
import { StatsDistributionStep } from './components/StatsDistributionStep';
import { AppearanceStep } from './components/AppearanceStep';
import { NameConfirmStep } from './components/NameConfirmStep';
import { ArrowLeft, ArrowRight, CheckCircle, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession, signIn } from 'next-auth/react';
import { ethers } from 'ethers';
import { getWalletTxErrorMessage } from '@/lib/walletErrors';
import Link from 'next/link';
import Image from 'next/image';

const POLYGON_AMOY_CHAIN_ID_DEC = BigInt(80002);
const POLYGON_AMOY_CHAIN_ID_HEX = '0x13882';

export default function CharacterCreationPage() {
  const { data: session, status, update } = useSession();
  const { currentStep, creationSteps, nextStep, prevStep, goToStep, creationPaymentTxHash, setCreationPaymentTxHash } = useCharacterCreationStore();
  const [isLinkingWallet, setIsLinkingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string>('');
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string>('');

  const [ownedNfts, setOwnedNfts] = useState<any[]>([]);
  const [ownedNftsLoading, setOwnedNftsLoading] = useState<boolean>(false);
  const [nftMetaByTokenId, setNftMetaByTokenId] = useState<Record<string, any>>({});
  const [ownedNftContext, setOwnedNftContext] = useState<{ chainId?: number; contractAddress?: string } | null>(null);
  const [ownedNftsError, setOwnedNftsError] = useState<string>('');
  // NFT just minted in this session, shown optimistically until the on-chain
  // log scan catches up (the RPC often lags a few seconds behind the mint).
  const [justCreatedNft, setJustCreatedNft] = useState<{ tokenId: string; tokenURI: string; metadata: any; character: any } | null>(null);

  const linkedWallet = session?.user?.walletAddress;

  const tokenAddress = process.env.NEXT_PUBLIC_DOL_TOKEN_ADDRESS || '';
  const treasuryAddress = process.env.NEXT_PUBLIC_DOL_TREASURY_ADDRESS || '';
  const creationCostDol = process.env.NEXT_PUBLIC_CHARACTER_CREATION_COST_DOL || '2';

  const safeReadJson = async (res: Response) => {
    const raw = await res.text().catch(() => '');
    if (!raw.trim()) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const loadMetadataFromTokenUri = async (tokenUri: string) => {
    if (!tokenUri || typeof tokenUri !== 'string') return null;
    if (tokenUri.startsWith('data:application/json;base64,')) {
      const b64 = tokenUri.replace('data:application/json;base64,', '');
      const jsonStr = atob(b64);
      return JSON.parse(jsonStr);
    }
    const m = await fetch(tokenUri);
    if (!m.ok) return null;
    return await m.json();
  };

  const refreshOwnedNfts = async () => {
    setOwnedNftsLoading(true);
    setOwnedNftsError('');
    try {
      const res = await fetch('/api/nft/character/owned');
      const json = await safeReadJson(res);
      const items = (json as any)?.items;

      if (!res.ok || !Array.isArray(items)) {
        const msg = typeof (json as any)?.error === 'string' ? (json as any).error : '';
        if (msg) setOwnedNftsError(msg);
        setOwnedNfts([]);
        setNftMetaByTokenId({});
        setOwnedNftContext(null);
        return;
      }

      setOwnedNftContext({
        chainId: typeof (json as any)?.chainId === 'number' ? (json as any).chainId : undefined,
        contractAddress: typeof (json as any)?.contractAddress === 'string' ? (json as any).contractAddress : undefined,
      });

      setOwnedNfts(items);

      const entries = await Promise.all(
        (items as any[]).map(async (it) => {
          const tokenId = String(it?.tokenId || '');
          const tokenUri = String(it?.tokenURI || '');
          if (!tokenId || !tokenUri) return [tokenId, null] as const;
          try {
            const meta = await loadMetadataFromTokenUri(tokenUri);
            return [tokenId, meta] as const;
          } catch {
            return [tokenId, null] as const;
          }
        })
      );

      const map: Record<string, any> = {};
      for (const [tokenId, meta] of entries) {
        if (tokenId && meta) map[tokenId] = meta;
      }
      setNftMetaByTokenId(map);
    } finally {
      setOwnedNftsLoading(false);
    }
  };

  useEffect(() => {
    if (status !== 'authenticated') return;
    refreshOwnedNfts();

    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const tokenId = detail?.tokenId ? String(detail.tokenId) : '';
      if (tokenId) {
        // Show the freshly-minted NFT immediately, regardless of RPC lag.
        setJustCreatedNft({
          tokenId,
          tokenURI: String(detail.tokenURI || ''),
          metadata: detail.metadata ?? null,
          character: detail.characterId ? { id: String(detail.characterId) } : null,
        });
        if (detail.contractAddress || typeof detail.chainId === 'number') {
          setOwnedNftContext((prev) => ({
            chainId: typeof detail.chainId === 'number' ? detail.chainId : prev?.chainId,
            contractAddress: detail.contractAddress || prev?.contractAddress,
          }));
        }
      }
      refreshOwnedNfts();
    };
    window.addEventListener('dolrath:character-created', handler as any);
    return () => window.removeEventListener('dolrath:character-created', handler as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Merge the optimistic just-created NFT into the on-chain list until the
  // scan picks it up (at which point it is deduped away).
  const displayNfts = useMemo(() => {
    if (
      justCreatedNft &&
      !ownedNfts.some((it) => String(it?.tokenId || '') === justCreatedNft.tokenId)
    ) {
      return [...ownedNfts, justCreatedNft];
    }
    return ownedNfts;
  }, [ownedNfts, justCreatedNft]);

  // Dynamically assign components to steps
  useEffect(() => {
    useCharacterCreationStore.setState((state) => ({
      creationSteps: state.creationSteps.map(step => {
        if (step.id === 'race-selection') return { ...step, component: RaceSelectionStep };
        if (step.id === 'class-selection') return { ...step, component: ClassSelectionStep };
        if (step.id === 'stats-distribution') return { ...step, component: StatsDistributionStep };
        if (step.id === 'appearance') return { ...step, component: AppearanceStep };
        if (step.id === 'name-confirm') return { ...step, component: NameConfirmStep };
        return step;
      })
    }));
  }, []);

  const CurrentStepComponent = useMemo(() => {
    const step = creationSteps[currentStep];
    return step ? step.component : null;
  }, [currentStep, creationSteps]);

  const isNextButtonDisabled = useMemo(() => {
    const step = creationSteps[currentStep];
    if (!step) return true;

    // Disable next button if current step is not complete
    return !step.isComplete;
  }, [currentStep, creationSteps]);

  const handleLinkWallet = async () => {
    setWalletError('');
    setIsLinkingWallet(true);
    try {
      const eth = (window as any)?.ethereum;
      if (!eth) {
        throw new Error('MetaMask não encontrada. Instale/ative a extensão para continuar.');
      }

      const provider = new ethers.BrowserProvider(eth);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();

      const nonceRes = await fetch('/api/wallet/nonce', { method: 'POST' });
      const nonceJson = await nonceRes.json();
      if (!nonceRes.ok) {
        throw new Error(nonceJson?.error || 'Falha ao obter nonce');
      }

      const message = nonceJson?.message;
      if (!message || typeof message !== 'string') {
        throw new Error('Resposta inválida ao obter nonce');
      }

      const signature = await signer.signMessage(message);

      const linkRes = await fetch('/api/wallet/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });
      const linkJson = await linkRes.json();
      if (!linkRes.ok) {
        throw new Error(linkJson?.error || 'Falha ao vincular carteira');
      }

      await update?.();
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : 'Erro ao vincular carteira');
    } finally {
      setIsLinkingWallet(false);
    }
  };

  const handlePayCreationFee = async () => {
    setPaymentError('');
    setIsPaying(true);
    try {
      const eth = (window as any)?.ethereum;
      if (!eth) {
        throw new Error('MetaMask não encontrada. Instale/ative a extensão para continuar.');
      }

      if (!tokenAddress) {
        throw new Error('Token address não configurado (NEXT_PUBLIC_DOL_TOKEN_ADDRESS)');
      }

      if (!treasuryAddress) {
        throw new Error('Treasury address não configurado (NEXT_PUBLIC_DOL_TREASURY_ADDRESS)');
      }

      const provider = new ethers.BrowserProvider(eth);
      await provider.send('eth_requestAccounts', []);

      // Ensure the wallet is on Polygon Amoy. If not, try to switch (or add) the chain.
      const network = await provider.getNetwork();
      if (network.chainId !== POLYGON_AMOY_CHAIN_ID_DEC) {
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
            throw new Error(
              'Conecte sua MetaMask à rede Polygon Amoy (chainId 80002) para pagar a taxa.'
            );
          }
        }
      }

      // Recreate provider/signer after switching chains (MetaMask may change context).
      const providerAfterSwitch = new ethers.BrowserProvider(eth);
      const signerAfterSwitch = await providerAfterSwitch.getSigner();

      // Validate token contract exists on the currently selected chain.
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
      const amount = ethers.parseUnits(String(creationCostDol), decimals);

      const tx = await erc20.transfer(treasuryAddress, amount);
      await tx.wait();

      setCreationPaymentTxHash(tx.hash);
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : getWalletTxErrorMessage(e, 'Erro ao pagar taxa de criação'));
    } finally {
      setIsPaying(false);
    }
  };

  const burnNftToDeadWallet = async (tokenId: string) => {
    const burnAddress = process.env.NEXT_PUBLIC_CHARACTER_NFT_BURN_ADDRESS || '0x000000000000000000000000000000000000dEaD';
    const contractAddress = ownedNftContext?.contractAddress;
    if (!contractAddress) {
      throw new Error('Contract address da NFT não disponível. Atualize a lista e tente novamente.');
    }

    const eth = (window as any)?.ethereum;
    if (!eth) {
      throw new Error('MetaMask não encontrada. Instale/ative a extensão para continuar.');
    }

    const provider = new ethers.BrowserProvider(eth);
    await provider.send('eth_requestAccounts', []);

    const network = await provider.getNetwork();
    if (network.chainId !== POLYGON_AMOY_CHAIN_ID_DEC) {
      try {
        await provider.send('wallet_switchEthereumChain', [{ chainId: POLYGON_AMOY_CHAIN_ID_HEX }]);
      } catch (switchErr: any) {
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
          throw new Error('Conecte sua MetaMask à rede Polygon Amoy (chainId 80002) para continuar.');
        }
      }
    }

    const providerAfterSwitch = new ethers.BrowserProvider(eth);
    const signer = await providerAfterSwitch.getSigner();
    const from = await signer.getAddress();

    const erc721 = new ethers.Contract(
      contractAddress,
      ['function transferFrom(address from, address to, uint256 tokenId)'],
      signer
    );

    const tx = await erc721.transferFrom(from, burnAddress, BigInt(tokenId));
    await tx.wait();
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen text-white p-8">
        <div className="max-w-3xl mx-auto py-12">Carregando...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen text-white p-8">
        <div className="max-w-3xl mx-auto py-12">
          <div className="bg-surface/30 backdrop-blur-lg rounded-xl p-8 shadow-2xl border border-white/10">
            <h1 className="text-2xl font-bold mb-2">Faça login para criar seu personagem</h1>
            <p className="text-text-secondary mb-6">Você pode entrar com Google ou credenciais.</p>
            <button
              onClick={() => signIn()}
              className="px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg font-medium"
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!linkedWallet) {
    return (
      <div className="min-h-screen text-white p-8 relative">
        <div className="max-w-3xl mx-auto py-12">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl font-extrabold text-center mb-12 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark"
          >
            Criação de Personagem
          </motion.h1>

          <div className="bg-surface/30 backdrop-blur-lg rounded-xl p-8 shadow-2xl border border-white/10">
            <h2 className="text-2xl font-bold text-text-primary mb-2">Vincule sua carteira</h2>
            <p className="text-text-secondary mb-6">
              Para criar um personagem, precisamos vincular uma carteira EVM (ex: MetaMask) à sua conta.
            </p>

            {walletError && (
              <p className="text-error mb-4">{walletError}</p>
            )}

            <button
              onClick={handleLinkWallet}
              disabled={isLinkingWallet}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg font-medium disabled:opacity-50"
            >
              <Wallet className="w-5 h-5" />
              {isLinkingWallet ? 'Vinculando...' : 'Conectar e assinar'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Payment gate (testnet): require a fixed DOL transfer before proceeding.
  if (!creationPaymentTxHash) {
    return (
      <div className="min-h-screen text-white p-8 relative">
        <div className="max-w-3xl mx-auto py-12">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-4xl font-extrabold text-center mb-12 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark"
          >
            Criação de Personagem
          </motion.h1>

          <div className="bg-surface/30 backdrop-blur-lg rounded-xl p-8 shadow-2xl border border-white/10">
            <h2 className="text-2xl font-bold text-text-primary mb-2">Taxa de criação</h2>
            <p className="text-text-secondary mb-6">
              Para criar um personagem nesta testnet, é necessário pagar {creationCostDol} DOL.
            </p>

            {paymentError && <p className="text-error mb-4">{paymentError}</p>}

            <button
              onClick={handlePayCreationFee}
              disabled={isPaying}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg font-medium disabled:opacity-50"
            >
              {isPaying ? 'Processando pagamento...' : `Pagar ${creationCostDol} DOL`}
            </button>

            <p className="text-xs text-text-secondary mt-4">
              Você vai assinar uma transação on-chain e pagar gas.
            </p>
          </div>

          {/* Owned NFTs (on-chain) - shown ONLY before paying */}
          <div className="mt-8 bg-surface/20 backdrop-blur-lg rounded-xl p-6 shadow-2xl border border-white/10">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-xl font-bold text-text-primary">Suas NFTs</h2>
              <button
                type="button"
                onClick={refreshOwnedNfts}
                disabled={ownedNftsLoading}
                className="px-3 py-2 bg-surface border border-white/20 rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                {ownedNftsLoading ? 'Atualizando...' : 'Atualizar'}
              </button>
            </div>

              {ownedNftsError ? (
                <div className="text-xs text-error mb-3">{ownedNftsError}</div>
              ) : null}

            {ownedNftsLoading && displayNfts.length === 0 ? (
              <div className="text-text-secondary">Carregando...</div>
            ) : displayNfts.length === 0 ? (
              <div className="text-text-secondary">Nenhuma NFT encontrada na sua carteira.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {displayNfts.map((it) => {
                  const tokenId = String(it?.tokenId || '');
                  const meta =
                    nftMetaByTokenId[tokenId] ||
                    (justCreatedNft?.tokenId === tokenId ? justCreatedNft.metadata : null);
                  const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
                  const getTrait = (t: string) => attrs.find((a: any) => String(a?.trait_type) === t)?.value;
                  const displayName = String(getTrait('CharacterName') || meta?.name || `NFT #${tokenId}`);
                  const displayRace = String(getTrait('Race') || '');
                  const displayClass = String(getTrait('Class') || '');
                  const displayLevel = String(getTrait('Level') || '');
                  const characterId = it?.character?.id ? String(it.character.id) : '';

                  return (
                    <div key={tokenId} className="py-3 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-white/10 bg-background/30 flex-shrink-0">
                        {meta?.image ? (
                          <Image
                            src={String(meta.image)}
                            alt={displayName}
                            width={96}
                            height={96}
                            unoptimized
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-text-primary font-semibold truncate">{displayName}</div>
                        <div className="text-xs text-text-secondary truncate">
                          {displayRace}
                          {displayRace && displayClass ? ' • ' : ''}
                          {displayClass}
                          {displayLevel ? ` • Lv ${displayLevel}` : ''}
                        </div>
                        <div className="text-[11px] text-text-secondary truncate">Token ID: {tokenId}</div>
                      </div>

                      <Link
                        href={`/character/${characterId || tokenId}`}
                        className="px-3 py-2 bg-surface border border-white/20 rounded-lg text-text-secondary hover:text-text-primary"
                      >
                        Abrir
                      </Link>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await burnNftToDeadWallet(tokenId);
                            await refreshOwnedNfts();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : 'Erro ao excluir NFT');
                          }
                        }}
                        className="px-3 py-2 bg-surface border border-white/20 rounded-lg text-text-secondary hover:text-text-primary"
                      >
                        Excluir
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white p-8 relative">
      <div className="max-w-6xl mx-auto py-12">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl font-extrabold text-center mb-12 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark"
        >
          Criação de Personagem
        </motion.h1>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            {creationSteps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center relative">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300",
                    index <= currentStep
                      ? "bg-primary text-white"
                      : "bg-surface text-text-secondary border border-white/20",
                    step.isAccessible && "cursor-pointer hover:scale-110"
                  )}
                  onClick={() => goToStep(index)}
                >
                  {step.isComplete ? <CheckCircle className="w-5 h-5" /> : index + 1}
                </div>
                <span
                  className={cn(
                    "mt-2 text-sm text-center transition-colors duration-300",
                    index <= currentStep ? "text-text-primary" : "text-text-secondary"
                  )}
                >
                  {step.title}
                </span>
                {index < creationSteps.length - 1 && (
                  <div
                    className={cn(
                      "absolute left-[calc(50%+20px)] top-5 h-1 w-[calc(100%-40px)] -translate-y-1/2 transition-colors duration-300",
                      index < currentStep ? "bg-primary" : "bg-white/20"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-surface/30 backdrop-blur-lg rounded-xl p-8 shadow-2xl border border-white/10"
        >
          {CurrentStepComponent && <CurrentStepComponent />}
        </motion.div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-6 py-3 bg-surface border border-white/20 rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Anterior
          </button>

          <button
            onClick={nextStep}
            disabled={isNextButtonDisabled || currentStep === creationSteps.length - 1}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Próximo
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

      </div>
    </div>
  );
}
