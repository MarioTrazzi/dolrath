'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, RefreshCw } from 'lucide-react';
import { CharacterSummary } from './CharacterSummary';
import { StatRevealRadar } from './StatRevealRadar';
import { createCharacter } from '@/lib/api';
import { useCharacterCreationStore } from '@/lib/stores/characterCreationStore';
import { getRaceTransformations } from '@/lib/transformationSystem';
import { getClassRollProfile } from '@/lib/characterStats';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { ethers } from 'ethers';
import Image from 'next/image';
import { decodeContractCustomErrorMessage, getWalletTxErrorMessage } from '@/lib/walletErrors';
import { ensureTargetNetwork } from '@/lib/chainConfig';
import { useI18n } from '@/lib/i18n/I18nProvider';

export function NameConfirmStep() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const { selectedRace, selectedClass, selectedImage, chosenTransformation, transformationImage, transformationImages, characterName, creationPaymentTxHash, setCharacterName, markStepComplete, resetCreation } = useCharacterCreationStore();
  const [isCreating, setIsCreating] = useState(false);
  const [nameError, setNameError] = useState('');

  const [nftDialogOpen, setNftDialogOpen] = useState(false);
  const [nftDialogLoading, setNftDialogLoading] = useState(false);
  const [nftFlipped, setNftFlipped] = useState(false);

  // Imagem de transformação para o flip do card (forma escolhida; para metamorfo,
  // a primeira forma disponível).
  const previewTransformationImage =
    transformationImage ||
    (chosenTransformation ? transformationImages?.[chosenTransformation] : null) ||
    (transformationImages ? Object.values(transformationImages).find(Boolean) ?? null : null) ||
    null;
  const [nftData, setNftData] = useState<null | {
    chainId: number;
    contractAddress: string;
    tokenId: string;
    tokenURI: string;
    mintTxHash?: string;
    mintedAt?: string;
    metadata: any;
  }>(null);
  // Pontos brutos rolados na criação (antes dos bônus de raça/classe) — usados
  // só para destacar quando o stat principal da classe saiu "sortudo" no reveal.
  const [rolledPoints, setRolledPoints] = useState<null | { str: number; agi: number; int: number; def: number }>(null);

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
    if (name.length < 2) return t('Name must be at least 2 characters');
    if (name.length > 20) return t('Name must be at most 20 characters');
    if (!/^[a-zA-ZÀ-ÿ\s]+$/.test(name)) return t('Name must contain only letters');
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
      setNameError(t('Incomplete character data. Go back and finish the previous steps.'));
      return;
    }

    setIsCreating(true);
    try {
      let mintTxHashForRecovery: string | null = null;
      if (!creationPaymentTxHash) {
        throw new Error(t('Payment required to create the character'));
      }
      if (!selectedRace?.id) {
        throw new Error(t('Race not selected'));
      }
      if (!selectedClass?.id) {
        throw new Error(t('Class not selected'));
      }

      const eth = (window as any)?.ethereum;
      if (!eth) {
        throw new Error(t('MetaMask not found. Install/enable the extension to continue.'));
      }

      const provider = new ethers.BrowserProvider(eth);
      await provider.send('eth_requestAccounts', []);

      // Garante a rede alvo (usuário paga o gas)
      await ensureTargetNetwork(provider);

      const providerAfterSwitch = new ethers.BrowserProvider(eth);
      const signerAfterSwitch = await providerAfterSwitch.getSigner();
      const to = await signerAfterSwitch.getAddress();
      const linkedWallet = (session?.user as any)?.walletAddress;
      if (linkedWallet && String(linkedWallet).toLowerCase() !== String(to).toLowerCase()) {
        throw new Error(t('The wallet connected in MetaMask is not the one linked to your account.'));
      }

      // 1) Signed mint intent from server
      const mintIntentRes = await fetch('/api/nft/character/mint-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: characterName.trim(),
          race: selectedRace.id,
          characterClass: selectedClass.id,
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
        throw new Error(t('Invalid mint intent (server)'));
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
        throw new Error(t('Could not identify the minted tokenId'));
      }

      const onchainTokenUri = String(await nftContract.tokenURI(mintedTokenId));

      // 🐉 Transformação: metamorfo gera TODAS as formas (mapa) e fica destravado
      // (escolhe a forma em combate). Demais raças têm 1 forma travada.
      const raceForms = getRaceTransformations(selectedRace.id);
      const isMultiForm = raceForms.length > 1;
      const formImagesMap = isMultiForm
        ? transformationImages
        : (chosenTransformation && transformationImage ? { [chosenTransformation]: transformationImage } : {});
      const defaultTransformationImage = isMultiForm
        ? (raceForms.map((f) => transformationImages[f]).find(Boolean) ?? null)
        : transformationImage;

      // 3) Create character in DB (includes mint proof)
      const characterData = {
        name: characterName.trim(),
        race: selectedRace.id,
        characterClass: selectedClass.id,
        avatar: selectedImage,
        // Metamorfo destravado: null deixa todas as formas disponíveis no combate.
        unlockedTransformation: isMultiForm ? null : chosenTransformation,
        transformationImage: defaultTransformationImage,
        transformationImages: formImagesMap,
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
        throw new Error(t('Failed to create character: invalid server response'));
      }

      const rolled = character.attributes;
      if (rolled && typeof rolled === 'object') {
        setRolledPoints({
          str: Number(rolled.distributedStr ?? 0),
          agi: Number(rolled.distributedAgi ?? 0),
          int: Number(rolled.distributedInt ?? 0),
          def: Number(rolled.distributedDef ?? 0),
        });
      }

      // 4) Dialog: load from the NFT tokenURI (not from DB)
      let mintedMetadata: any = null;
      setNftFlipped(false);
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
        mintedMetadata = metadata;

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
      // Include the freshly-minted NFT data so the list can show it
      // optimistically — the on-chain log scan (RPC) often lags a few
      // seconds behind a just-confirmed mint, so a plain refresh may miss it.
      try {
        window.dispatchEvent(
          new CustomEvent('dolrath:character-created', {
            detail: {
              characterId: String(character.id),
              tokenId: mintedTokenId.toString(),
              tokenURI: onchainTokenUri,
              metadata: mintedMetadata,
              contractAddress,
              chainId: chainIdNumber,
            },
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
            {t('Character Name')}
          </h2>
          <p className="text-text-secondary">
            {t('Choose an epic name for your hero')}
          </p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="characterName" className="block text-sm font-medium text-text-primary mb-2">
              {t('Character Name')}
            </label>
            <input
              type="text"
              id="characterName"
              value={characterName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t('Enter your character\'s name')}
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
            disabled={isCreating || !!nameError || !characterName || !selectedRace || !selectedClass || !selectedImage}
            className="w-full bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {t('Creating (minting NFT)...')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('Create Character')}
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Character Summary */}
      <div className="lg:sticky lg:top-8">
        <CharacterSummary
          race={selectedRace}
          characterClass={selectedClass}
          characterName={characterName}
          imageUrl={selectedImage}
        />
      </div>

      {nftDialogOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl bg-surface/80 backdrop-blur-lg rounded-xl p-6 shadow-2xl border border-white/10">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-text-primary">{t('NFT created successfully')}</h2>
                <p className="text-text-secondary text-sm">{t('The information below comes from the NFT tokenURI (on-chain).')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNftDialogOpen(false);
                  resetCreation();
                }}
                className="px-4 py-2 bg-surface border border-white/20 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
              >
                {t('Close')}
              </button>
            </div>

            {nftDialogLoading ? (
              <div className="text-text-secondary">{t('Loading metadata...')}</div>
            ) : nftData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-background/40 border border-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-text-secondary">
                      {nftFlipped ? t('Transformation') : t('Image (NFT)')}
                    </div>
                    {previewTransformationImage && (
                      <button
                        type="button"
                        onClick={() => setNftFlipped((f) => !f)}
                        className="text-xs flex items-center gap-1 text-primary hover:underline"
                      >
                        <RefreshCw className="w-3 h-3" />
                        {nftFlipped ? t('See base form') : t('See transformation')}
                      </button>
                    )}
                  </div>

                  {nftData.metadata?.image ? (
                    previewTransformationImage ? (
                      // Card com flip 3D: frente = NFT base, verso = transformação.
                      <div
                        className="relative w-full aspect-square cursor-pointer select-none"
                        style={{ perspective: 1200 }}
                        onClick={() => setNftFlipped((f) => !f)}
                        title={t('Click to see the transformation')}
                      >
                        <motion.div
                          className="relative w-full h-full"
                          style={{ transformStyle: 'preserve-3d' }}
                          animate={{ rotateY: nftFlipped ? 180 : 0 }}
                          transition={{ duration: 0.6, ease: 'easeInOut' }}
                        >
                          {/* Frente: imagem base (NFT) */}
                          <div
                            className="absolute inset-0"
                            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                          >
                            <Image
                              src={nftData.metadata.image}
                              alt={nftData.metadata?.name || 'NFT'}
                              width={800}
                              height={800}
                              unoptimized
                              className="w-full h-full object-cover art-bright rounded-lg border border-white/10"
                            />
                          </div>
                          {/* Verso: transformação */}
                          <div
                            className="absolute inset-0"
                            style={{
                              backfaceVisibility: 'hidden',
                              WebkitBackfaceVisibility: 'hidden',
                              transform: 'rotateY(180deg)',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={previewTransformationImage}
                              alt={t('Transformation')}
                              className="w-full h-full object-cover art-bright rounded-lg border border-primary/40"
                              style={{ boxShadow: '0 0 24px 2px rgba(124,58,237,0.45)' }}
                            />
                          </div>
                        </motion.div>
                      </div>
                    ) : (
                      <Image
                        src={nftData.metadata.image}
                        alt={nftData.metadata?.name || 'NFT'}
                        width={800}
                        height={800}
                        unoptimized
                        className="w-full h-auto art-bright rounded-lg border border-white/10"
                      />
                    )
                  ) : (
                    <div className="text-text-secondary">{t('No image in the metadata.')}</div>
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
                  <div className="text-xs text-text-secondary mb-2">{t('On-chain data')}</div>
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

                    const finalStr = Number(byTrait.STR?.value ?? 0);
                    const finalAgi = Number(byTrait.AGI?.value ?? 0);
                    const finalInt = Number(byTrait.INT?.value ?? 0);
                    const finalDef = Number(byTrait.DEF?.value ?? 0);
                    const hasFinalStats = ['STR', 'AGI', 'INT', 'DEF'].every((t) => byTrait[t]);

                    // Destaca o stat principal da classe quando o roll saiu no topo da faixa (cap 10).
                    const rollProfile = selectedClass ? getClassRollProfile(selectedClass.id) : null;
                    const dominantKey = rollProfile
                      ? (Object.keys(rollProfile.weights) as (keyof typeof rollProfile.weights)[]).reduce((best, key) =>
                          rollProfile.weights[key] > rollProfile.weights[best] ? key : best
                        )
                      : null;
                    const dominantValue = dominantKey && rolledPoints ? rolledPoints[dominantKey] : null;
                    const luckyLabels = { str: t('STRENGTH'), agi: t('AGILITY'), int: t('INTELLIGENCE'), def: t('DEFENSE') } as const;
                    const isLucky = dominantKey && dominantValue !== null && dominantValue >= 9;

                    return (
                      <>
                        {hasFinalStats && (
                          <div className="mt-4 pt-4 border-t border-white/10">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs text-text-secondary">{t('Attributes revealed')}</div>
                              {isLucky && dominantKey && (
                                <motion.span
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: 0.7 }}
                                  className="text-xs font-semibold text-[#e7c682]"
                                >
                                  {t('✨ EXCEPTIONAL {stat}!', { stat: luckyLabels[dominantKey] })}
                                </motion.span>
                              )}
                            </div>
                            <StatRevealRadar str={finalStr} agi={finalAgi} int={finalInt} def={finalDef} />
                          </div>
                        )}

                        <div className="mt-4">
                          <div className="text-xs text-text-secondary mb-2">{t('Stats (from NFT)')}</div>
                          <div className="grid grid-cols-2 gap-2">
                            {order
                              .filter((t) => byTrait[t])
                              .map((t, idx) => {
                                const a = byTrait[t];
                                return (
                                  <div key={idx} className="flex items-center justify-between bg-surface/50 border border-white/10 rounded-md px-3 py-2">
                                    <span className="text-text-secondary text-sm">{t}</span>
                                    <span className="text-text-primary font-bold">{String(a.value)}</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-error">{t('Failed to load NFT metadata.')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
