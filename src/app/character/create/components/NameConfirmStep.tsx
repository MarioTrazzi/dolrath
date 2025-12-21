'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, RefreshCw } from 'lucide-react';
import { CharacterSummary } from './CharacterSummary';
import { createCharacter } from '@/lib/api';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { ethers } from 'ethers';
import Image from 'next/image';
import { decodeContractCustomErrorMessage, getWalletTxErrorMessage } from '@/lib/walletErrors';

export function NameConfirmStep() {
  const { data: session } = useSession();
  const { selectedRace, selectedClass, distributedPoints, selectedImage, characterName, creationPaymentTxHash, setCharacterName, markStepComplete, resetCreation } = useCharacterCreationStore();
  const [isCreating, setIsCreating] = useState(false);
  const [nameError, setNameError] = useState('');

  const [nftDialogOpen, setNftDialogOpen] = useState(false);
  const [nftDialogLoading, setNftDialogLoading] = useState(false);
  const [nftData, setNftData] = useState<null | {
    chainId: number;
    contractAddress: string;
    tokenId: string;
    tokenURI: string;
    mintTxHash?: string;
    mintedAt?: string;
    metadata: any;
  }>(null);

  const POLYGON_AMOY_CHAIN_ID_DEC = BigInt(80002);
  const POLYGON_AMOY_CHAIN_ID_HEX = '0x13882';

  const safeReadJson = async (res: Response) => {
    const raw = await res.text().catch(() => '');
    if (!raw.trim()) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return { _raw: raw };
    }
  };

  const recoverExistingCharacterId = async (opts: { creationTxHash?: string; nftMintTxHash?: string }) => {
    const res = await fetch('/api/character', { method: 'GET' });
    const json = await safeReadJson(res);
    if (!res.ok || !Array.isArray(json)) return null;

    const creationLc = (opts.creationTxHash || '').toLowerCase();
    const mintLc = (opts.nftMintTxHash || '').toLowerCase();

    const match = (json as any[]).find((c) => {
      const cCreation = String(c?.creationTxHash || '').toLowerCase();
      const cMint = String(c?.nftMintTxHash || '').toLowerCase();
      return (creationLc && cCreation === creationLc) || (mintLc && cMint === mintLc);
    });

    return match?.id ? String(match.id) : null;
  };
  
  useEffect(() => {
    // Mark step complete if name is valid and all previous steps are complete (implicitly handled by navigation)
    const isValid = !validateName(characterName) && characterName.length > 0;
    markStepComplete('name-confirm', isValid);
  }, [characterName, markStepComplete]);

  const validateName = (name: string) => {
    if (name.length < 2) return 'Nome deve ter pelo menos 2 caracteres';
    if (name.length > 20) return 'Nome deve ter no máximo 20 caracteres';
    if (!/^[a-zA-ZÀ-ÿ\s]+$/.test(name)) return 'Nome deve conter apenas letras';
    return '';
  };
  
  const handleNameChange = (value: string) => {
    setCharacterName(value);
    setNameError(validateName(value));
  };
  
  const handleCreateCharacter = async () => {
    const error = validateName(characterName);
    if (error) {
      setNameError(error);
      return;
    }
    if (!selectedRace || !selectedClass || !selectedImage) {
      // This should ideally not happen if previous steps are enforced
      setNameError('Dados do personagem incompletos. Volte e conclua os passos anteriores.');
      return;
    }
    
    setIsCreating(true);
    try {
      let mintTxHashForRecovery: string | null = null;
      if (!creationPaymentTxHash) {
        throw new Error('Pagamento necessário para criar o personagem');
      }
      if (!selectedRace?.id) {
        throw new Error('Raça não selecionada');
      }
      if (!selectedClass?.id) {
        throw new Error('Classe não selecionada');
      }

      const eth = (window as any)?.ethereum;
      if (!eth) {
        throw new Error('MetaMask não encontrada. Instale/ative a extensão para continuar.');
      }

      const provider = new ethers.BrowserProvider(eth);
      await provider.send('eth_requestAccounts', []);

      // Ensure Polygon Amoy (user pays gas)
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
      const signerAfterSwitch = await providerAfterSwitch.getSigner();
      const to = await signerAfterSwitch.getAddress();
      const linkedWallet = (session?.user as any)?.walletAddress;
      if (linkedWallet && String(linkedWallet).toLowerCase() !== String(to).toLowerCase()) {
        throw new Error('A carteira conectada na MetaMask não é a mesma vinculada à sua conta.');
      }

      // Convert BaseStats to Record<string, number>
      const statsRecord: Record<string, number> = {
        str: Number(distributedPoints?.str || 0),
        agi: Number(distributedPoints?.agi || 0),
        int: Number(distributedPoints?.int || 0),
        // Backend expects 'def' (not 'res')
        def: Number((distributedPoints as any)?.res || 0),
      };

      // 1) Signed mint intent from server
      const mintIntentRes = await fetch('/api/nft/character/mint-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: characterName.trim(),
          race: selectedRace.id,
          characterClass: selectedClass.id,
          distributedPoints: statsRecord,
          avatar: selectedImage,
        }),
      });
      const mintIntentJson = await safeReadJson(mintIntentRes);
      if (!mintIntentRes.ok) {
        const maybeRaw = mintIntentJson?._raw ? ` (${String(mintIntentJson._raw).slice(0, 180)})` : '';
        throw new Error(
          (mintIntentJson as any)?.error ||
            `Falha ao preparar o mint da NFT (HTTP ${mintIntentRes.status})${maybeRaw}`
        );
      }

      const contractAddress = String(mintIntentJson.contractAddress || '').trim();
      const tokenURI = String(mintIntentJson.tokenURI || '').trim();
      const deadline = BigInt(String(mintIntentJson.deadline || '0'));
      const signature = String(mintIntentJson.signature || '').trim();
      const chainIdNumber = Number(mintIntentJson.chainId);

      if (!contractAddress || !tokenURI || !signature || deadline <= BigInt(0) || !Number.isFinite(chainIdNumber)) {
        throw new Error('Mint intent inválido (server)');
      }

      // 2) Mint NFT (MetaMask prompt + gas)
      const nftContract = new ethers.Contract(
        contractAddress,
        [
          'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
          'function mintWithSig(address to, string tokenURI, uint256 deadline, bytes signature) returns (uint256)',
          'function tokenURI(uint256 tokenId) view returns (string)',
        ],
        signerAfterSwitch
      );

      // Preflight (improves user-facing errors vs opaque -32603)
      let gasLimit: bigint | undefined = undefined;
      try {
        const est = (await nftContract.mintWithSig.estimateGas(to, tokenURI, deadline, signature)) as bigint;
        // Use a generous buffer to avoid MetaMask masking with -32603 on borderline limits.
        const buffered = (est * 15n) / 10n + 50_000n;
        const min = 350_000n;
        gasLimit = buffered < min ? min : buffered;
      } catch (preErr: any) {
        const decoded = decodeContractCustomErrorMessage({
          contractInterface: nftContract.interface,
          err: preErr,
        });
        if (decoded) throw new Error(decoded);
        throw new Error(getWalletTxErrorMessage(preErr));
      }

      let mintTx: any;
      try {
        mintTx = await nftContract.mintWithSig(
          to,
          tokenURI,
          deadline,
          signature,
          gasLimit ? { gasLimit } : {}
        );
      } catch (sendErr: any) {
        const decoded = decodeContractCustomErrorMessage({
          contractInterface: nftContract.interface,
          err: sendErr,
        });
        if (decoded) throw new Error(decoded);
        throw new Error(getWalletTxErrorMessage(sendErr));
      }
      mintTxHashForRecovery = String(mintTx.hash);
      const mintReceipt = await mintTx.wait();

      let mintedAtIso: string | undefined;
      try {
        const block = await providerAfterSwitch.getBlock(mintReceipt.blockNumber);
        const ts = (block as any)?.timestamp;
        if (typeof ts === 'number' && Number.isFinite(ts)) {
          mintedAtIso = new Date(ts * 1000).toISOString();
        }
      } catch {
        // optional
      }

      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const contractLc = contractAddress.toLowerCase();
      const toLc = to.toLowerCase();
      let mintedTokenId: bigint | null = null;

      for (const log of mintReceipt.logs) {
        if (String(log.address).toLowerCase() !== contractLc) continue;
        if (!log.topics || log.topics.length < 4) continue;
        if (log.topics[0] !== transferTopic) continue;

        const fromTopic = log.topics[1];
        const toTopic = log.topics[2];
        const tokenIdTopic = log.topics[3];

        const fromAddr = ethers.getAddress('0x' + fromTopic.slice(26));
        const toAddr = ethers.getAddress('0x' + toTopic.slice(26));

        if (
          fromAddr.toLowerCase() === '0x0000000000000000000000000000000000000000' &&
          toAddr.toLowerCase() === toLc
        ) {
          mintedTokenId = BigInt(tokenIdTopic);
          break;
        }
      }

      if (mintedTokenId === null) {
        throw new Error('Não foi possível identificar o tokenId do mint');
      }

      const onchainTokenUri = String(await nftContract.tokenURI(mintedTokenId));

      // 3) Create character in DB (includes mint proof)
      const characterData = {
        name: characterName.trim(),
        race: selectedRace.id,
        characterClass: selectedClass.id,
        distributedPoints: statsRecord,
        avatar: selectedImage,
        creationTxHash: creationPaymentTxHash,
        nftMintTxHash: String(mintTx.hash),
        nftTokenId: mintedTokenId.toString(),
        nftTokenUri: onchainTokenUri,
      };

      let character: any = null;
      try {
        character = await createCharacter(characterData);
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        // If the user already paid/minted, try to recover the existing character instead of getting stuck.
        if (msg.includes('Pagamento já utilizado')) {
          const recoveredId = await recoverExistingCharacterId({
            creationTxHash: creationPaymentTxHash,
            nftMintTxHash: mintTxHashForRecovery || undefined,
          });
          if (recoveredId) {
            character = { id: recoveredId, alreadyExisted: true };
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }

      if (!character?.id) {
        throw new Error('Falha ao criar personagem: resposta inválida do servidor');
      }

      // 4) Dialog: load from the NFT tokenURI (not from DB)
      setNftDialogOpen(true);
      setNftDialogLoading(true);
      try {
        let metadata: any = null;
        if (onchainTokenUri.startsWith('data:application/json;base64,')) {
          const b64 = onchainTokenUri.replace('data:application/json;base64,', '');
          const jsonStr = atob(b64);
          metadata = JSON.parse(jsonStr);
        } else {
          const metaRes = await fetch(onchainTokenUri);
          metadata = await metaRes.json();
        }

        setNftData({
          chainId: chainIdNumber,
          contractAddress,
          tokenId: mintedTokenId.toString(),
          tokenURI: onchainTokenUri,
          mintTxHash: String(mintTx.hash),
          mintedAt: mintedAtIso,
          metadata,
        });
      } finally {
        setNftDialogLoading(false);
      }

      // Notify parent pages (e.g. creation page list) to refresh.
      try {
        window.dispatchEvent(
          new CustomEvent('dolrath:character-created', {
            detail: { characterId: String(character.id) },
          })
        );
      } catch {
        // ignore
      }
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : getWalletTxErrorMessage(error, 'Erro desconhecido ao criar personagem')
      );
    } finally {
      setIsCreating(false);
    }
  };
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Name Input */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            Nome do Personagem
          </h2>
          <p className="text-text-secondary">
            Escolha um nome épico para seu guerreiro
          </p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="characterName" className="block text-sm font-medium text-text-primary mb-2">
              Nome do Personagem
            </label>
            <input
              type="text"
              id="characterName"
              value={characterName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Digite o nome do seu personagem"
              className={cn(
                "w-full h-12 px-4 bg-background border rounded-lg text-text-primary placeholder:text-text-secondary transition-all",
                nameError 
                  ? "border-error focus:ring-error/50" 
                  : "border-white/20 focus:border-primary focus:ring-primary/50"
              )}
              maxLength={20}
            />
            
            {nameError && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-error mt-2"
              >
                {nameError}
              </motion.p>
            )}
          </div>

          <button
            onClick={handleCreateCharacter}
            disabled={isCreating || !!nameError || !characterName || !selectedRace || !distributedPoints || !selectedImage}
            className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Criando (mint NFT)...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Criar Personagem
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Character Summary */}
      <div className="lg:sticky lg:top-8">
        <CharacterSummary
          race={selectedRace}
          distributedPoints={distributedPoints}
          characterName={characterName}
          imageUrl={selectedImage}
        />
      </div>

      {nftDialogOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl bg-surface/80 backdrop-blur-lg rounded-xl p-6 shadow-2xl border border-white/10">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-text-primary">NFT criada com sucesso</h2>
                <p className="text-text-secondary text-sm">As informações abaixo vêm do tokenURI da NFT (on-chain).</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNftDialogOpen(false);
                  resetCreation();
                }}
                className="px-4 py-2 bg-surface border border-white/20 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
              >
                Fechar
              </button>
            </div>

            {nftDialogLoading ? (
              <div className="text-text-secondary">Carregando metadata...</div>
            ) : nftData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-background/40 border border-white/10 rounded-lg p-4">
                  <div className="text-xs text-text-secondary mb-2">Imagem (NFT)</div>
                  {nftData.metadata?.image ? (
                    <Image
                      src={nftData.metadata.image}
                      alt={nftData.metadata?.name || 'NFT'}
                      width={800}
                      height={800}
                      unoptimized
                      className="w-full h-auto rounded-lg border border-white/10"
                    />
                  ) : (
                    <div className="text-text-secondary">Sem imagem na metadata.</div>
                  )}

                  {(nftData.metadata?.name || nftData.metadata?.description) && (
                    <div className="mt-4">
                      {nftData.metadata?.name && (
                        <div className="text-text-primary font-semibold">
                          {String(nftData.metadata.name)}
                        </div>
                      )}
                      {nftData.metadata?.description && (
                        <div className="text-sm text-text-secondary mt-1">
                          {String(nftData.metadata.description)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-background/40 border border-white/10 rounded-lg p-4">
                  <div className="text-xs text-text-secondary mb-2">Dados on-chain</div>
                  <div className="text-sm text-text-secondary space-y-2">
                    <div>
                      <span className="text-text-primary font-semibold">Contract:</span>{' '}
                      <span className="break-all">{nftData.contractAddress}</span>
                    </div>
                    <div>
                      <span className="text-text-primary font-semibold">Token ID:</span> {nftData.tokenId}
                    </div>
                    <div>
                      <span className="text-text-primary font-semibold">Chain ID:</span> {nftData.chainId}
                    </div>
                    {nftData.mintTxHash && (
                      <div>
                        <span className="text-text-primary font-semibold">Mint Tx:</span>{' '}
                        <span className="break-all">{nftData.mintTxHash}</span>
                      </div>
                    )}
                    {nftData.mintedAt && (
                      <div>
                        <span className="text-text-primary font-semibold">Minted At:</span>{' '}
                        {new Date(nftData.mintedAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-text-secondary mb-2">Stats (da NFT)</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(() => {
                        const attributes = Array.isArray(nftData.metadata?.attributes)
                          ? (nftData.metadata.attributes as any[])
                          : [];

                        const order = ['Race', 'Class', 'Level', 'STR', 'AGI', 'INT', 'DEF'];
                        const byTrait: Record<string, any> = {};
                        for (const a of attributes) {
                          const t = String(a?.trait_type || '');
                          if (order.includes(t)) byTrait[t] = a;
                        }

                        return order
                          .filter((t) => byTrait[t])
                          .map((t, idx) => {
                            const a = byTrait[t];
                            return (
                              <div key={idx} className="flex items-center justify-between bg-surface/50 border border-white/10 rounded-md px-3 py-2">
                                <span className="text-text-secondary text-sm">{t}</span>
                                <span className="text-text-primary font-bold">{String(a.value)}</span>
                              </div>
                            );
                          });
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-error">Falha ao carregar metadata da NFT.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
