
'use client';
import { useState, useEffect, useRef } from 'react';

import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import { LogOut, User, Shield, Sword, Heart, Zap, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import XPProgressBar from '@/components/XPProgressBar';
import CharacterStats from '@/components/CharacterStats';
// ...existing code...
import { Character } from '@/types/game';
import { getRaceById, getClassById } from '@/lib/gameData';
import { ethers } from 'ethers';
import Image from 'next/image';
import { getWalletTxErrorMessage } from '@/lib/walletErrors';
// ...existing code...
// ...existing code...

export default function DashboardPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterDetails, setCharacterDetails] = useState<any[]>([]);
  const [nftMetaByCharacterId, setNftMetaByCharacterId] = useState<Record<string, any>>({});
  const [ownedNfts, setOwnedNfts] = useState<any[]>([]);
  const [nftMetaByTokenId, setNftMetaByTokenId] = useState<Record<string, any>>({});
  const [ownedNftContext, setOwnedNftContext] = useState<{ chainId?: number; contractAddress?: string } | null>(null);
  const [ownedNftsError, setOwnedNftsError] = useState<string>('');
  const [loadingCharacter, setLoadingCharacter] = useState<boolean>(true);
  const [dolLoading, setDolLoading] = useState<boolean>(false);
  const [dolBalance, setDolBalance] = useState<string | null>(null);
  const [dolSymbol, setDolSymbol] = useState<string | null>(null);
  const [dolError, setDolError] = useState<string | null>(null);
  const [isLinkingWallet, setIsLinkingWallet] = useState<boolean>(false);
  const [walletLinkError, setWalletLinkError] = useState<string>('');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item?: any; input: string }>({ open: false, item: null, input: '' });
  const inputRef = useRef<HTMLInputElement>(null);

  const POLYGON_AMOY_CHAIN_ID_DEC = BigInt(80002);
  const POLYGON_AMOY_CHAIN_ID_HEX = '0x13882';

  const handleLinkWallet = async () => {
    setWalletLinkError('');
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
      setWalletLinkError(e instanceof Error ? e.message : getWalletTxErrorMessage(e));
    } finally {
      setIsLinkingWallet(false);
    }
  };

  // Função para adicionar XP (para teste)
  const addXPToCharacter = async (characterId: string, xpAmount: number) => {
    try {
      const response = await fetch(`/api/character/${characterId}/add-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp: xpAmount }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Mostrar mensagem de sucesso
        alert(result.message);
        
        // Recarregar personagens
        await fetchCharacters();
      } else {
        alert('Erro ao adicionar XP.');
      }
    } catch (err) {
      alert('Erro ao adicionar XP.');
    }
  };

  // Função para sincronizar níveis
  const syncCharacterLevels = async () => {
    try {
      const response = await fetch('/api/character/sync-levels', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        alert(`${result.message}. ${result.updatedCount} personagens atualizados.`);
        
        // Recarregar personagens
        await fetchCharacters();
      } else {
        alert('Erro ao sincronizar níveis.');
      }
    } catch (err) {
      alert('Erro ao sincronizar níveis.');
    }
  };

  // Função para buscar personagens
  const fetchCharacters = async () => {
    try {
      const response = await fetch('/api/nft/character/owned');
      if (!response.ok) {
        let msg = '';
        try {
          const j = await response.json();
          msg = typeof j?.error === 'string' ? j.error : '';
        } catch {
          // ignore
        }
        setOwnedNftsError(msg || 'Falha ao carregar NFTs.');
        setOwnedNfts([]);
        setOwnedNftContext(null);
        setNftMetaByTokenId({});
        setCharacters([]);
        setCharacterDetails([]);
        setNftMetaByCharacterId({});
        return;
      }

      const payload = await response.json();
      setOwnedNftsError('');
      const items = Array.isArray(payload?.items) ? payload.items : [];

      setOwnedNfts(items);
      setOwnedNftContext({
        chainId: typeof payload?.chainId === 'number' ? payload.chainId : undefined,
        contractAddress: typeof payload?.contractAddress === 'string' ? payload.contractAddress : undefined,
      });

      const loadMetadataFromTokenUri = async (tokenUri: string) => {
        if (!tokenUri || typeof tokenUri !== 'string') return null;
        if (tokenUri.startsWith('data:application/json;base64,')) {
          const b64 = tokenUri.replace('data:application/json;base64,', '');
          const jsonStr = atob(b64);
          return JSON.parse(jsonStr);
        }
        const res = await fetch(tokenUri);
        if (!res.ok) return null;
        return await res.json();
      };

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

      const byToken: Record<string, any> = {};
      for (const [tokenId, meta] of entries) {
        if (tokenId && meta) byToken[tokenId] = meta;
      }
      setNftMetaByTokenId(byToken);

      const dbChars = (items as any[])
        .map((it) => it?.character)
        .filter(Boolean) as Character[];

      setCharacters(dbChars);
      setCharacterDetails(
        dbChars.map((char: any) => ({
          character: char,
          raceObj: getRaceById(typeof char.race === 'string' ? char.race : char.race.id),
          classObj: getClassById(typeof char.class === 'string' ? char.class : char.class.id),
        }))
      );

      // Map token metadata to character.id when there is a DB character (so existing UI keeps working)
      const byCharId: Record<string, any> = {};
      for (const it of items as any[]) {
        const c = it?.character;
        const tokenId = String(it?.tokenId || '');
        if (!c?.id || !tokenId) continue;
        if (byToken[tokenId]) byCharId[String(c.id)] = byToken[tokenId];
      }
      setNftMetaByCharacterId(byCharId);
    } finally {
      setLoadingCharacter(false);
    }
  };

  const openDeleteDialog = (item: any) => {
    setDeleteDialog({ open: true, item, input: '' });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ open: false, item: null, input: '' });
  };

  const handleDeleteCharacter = async () => {
    const tokenId = String(deleteDialog.item?.tokenId || deleteDialog.item?.character?.nftTokenId || '').trim();
    if (!tokenId) return;
    try {
      const burnAddress = process.env.NEXT_PUBLIC_CHARACTER_NFT_BURN_ADDRESS || '0x000000000000000000000000000000000000dEaD';
      const contractAddress = ownedNftContext?.contractAddress;
      if (!contractAddress) throw new Error('Contract address da NFT não disponível.');

      const eth = (window as any)?.ethereum;
      if (!eth) throw new Error('MetaMask não encontrada.');

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

      closeDeleteDialog();
      await fetchCharacters();
    } catch (err) {
      alert(err instanceof Error ? err.message : getWalletTxErrorMessage(err));
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchCharacters();

      if (session?.user?.walletAddress) {
        setDolLoading(true);
        setDolError(null);
        fetch('/api/wallet/dol-balance')
          .then(async (res) => {
            const json = await res.json();
            if (!res.ok) {
              throw new Error(json?.error || 'Falha ao buscar saldo on-chain');
            }
            if (json?.walletLinked && typeof json?.formatted === 'string') {
              setDolBalance(json.formatted);
              setDolSymbol(typeof json?.symbol === 'string' ? json.symbol : 'DOL');
            } else {
              setDolBalance(null);
              setDolSymbol(null);
            }
          })
          .catch((e) => {
            setDolError(e instanceof Error ? e.message : 'Erro ao buscar saldo on-chain');
          })
          .finally(() => setDolLoading(false));
      } else {
        setDolBalance(null);
        setDolSymbol(null);
        setDolError(null);
      }
    } else if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router, session?.user?.walletAddress]);

  return (
    <div>
      <main>
        {/* Saldo on-chain (DOL) */}
        <div className="glass-card p-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="text-sm text-text-secondary">Carteira vinculada</div>
              <div className="text-text-primary font-medium">
                {session?.user?.walletAddress ? session.user.walletAddress : 'Não vinculada'}
              </div>
              {!session?.user?.walletAddress && status === 'authenticated' && (
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLinkWallet}
                    disabled={isLinkingWallet}
                    className="text-xs inline-flex items-center gap-2"
                  >
                    <Wallet className="w-4 h-4" />
                    {isLinkingWallet ? 'Conectando...' : 'Conectar e assinar'}
                  </Button>
                  {walletLinkError && (
                    <div className="mt-2 text-xs text-error">{walletLinkError}</div>
                  )}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-text-secondary">Saldo on-chain</div>
              <div className="text-text-primary font-bold">
                {session?.user?.walletAddress ? (
                  dolLoading ? (
                    'Carregando...'
                  ) : dolError ? (
                    dolError
                  ) : dolBalance ? (
                    `${dolBalance} ${dolSymbol || 'DOL'}`
                  ) : (
                    `0 ${dolSymbol || 'DOL'}`
                  )
                ) : (
                  '—'
                )}
              </div>
            </div>
          </div>
        </div>


        {/* NFTs owned on-chain (shows even if DB characters were deleted) */}
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <div className="text-sm text-text-secondary">Suas NFTs</div>
              <div className="text-text-primary font-bold">Personagens (on-chain)</div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchCharacters}>
              Atualizar
            </Button>
          </div>

          {ownedNftsError ? (
            <div className="text-xs text-error mb-3">{ownedNftsError}</div>
          ) : null}

          {ownedNfts.length === 0 ? (
            <div className="text-text-secondary text-sm">Nenhuma NFT encontrada na sua carteira.</div>
          ) : (
            <div className="divide-y divide-border/30">
              {ownedNfts.map((it: any) => {
                const tokenId = String(it?.tokenId || '');
                const meta = nftMetaByTokenId[tokenId];
                const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
                const getTrait = (traitType: string) =>
                  attrs.find((a: any) => String(a?.trait_type) === traitType)?.value;

                const displayName = String(getTrait('CharacterName') || meta?.name || `NFT #${tokenId}`);
                const displayRace = String(getTrait('Race') || '');
                const displayClass = String(getTrait('Class') || '');
                const displayLevel = String(getTrait('Level') || '');
                const characterId = it?.character?.id ? String(it.character.id) : '';

                return (
                  <div key={tokenId} className="py-3 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden border border-border/40 bg-surface/40 flex-shrink-0">
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

                    <Link href={`/character/${characterId || tokenId}`}>
                      <Button variant="outline" size="sm">Abrir</Button>
                    </Link>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog({ tokenId, character: it?.character || null })}
                      className="text-red-500 border-red-500/40 hover:border-red-500"
                    >
                      Excluir
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {characterDetails.length > 0 ? (
          <div className="grid gap-8 mb-12">
            {characterDetails.map(({ character, raceObj, classObj }: any, idx: number) => (
              <motion.div
                key={character.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * idx }}
                className="glass-card p-8 flex flex-col md:flex-row items-center md:items-start gap-8 relative"
              >
                <button
                  className="absolute top-4 right-4 text-red-500 hover:text-red-700 transition-colors"
                  title="Excluir personagem"
                  onClick={() => openDeleteDialog({ tokenId: String((character as any)?.nftTokenId || ''), character })}
                >
                  <Trash2 className="w-6 h-6" />
                </button>
                <div className="flex flex-col md:flex-row w-full gap-8">
                  {/* Character Picture */}
                  <div className="flex-shrink-0 flex justify-center md:justify-start items-center">
                    {nftMetaByCharacterId[String(character.id)]?.image ? (
                      <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary shadow-lg bg-surface/40">
                        <Image
                          src={String(nftMetaByCharacterId[String(character.id)].image)}
                          alt={String(nftMetaByCharacterId[String(character.id)]?.name || character.name || 'NFT')}
                          width={256}
                          height={256}
                          unoptimized
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-32 h-32 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-primary-dark text-5xl text-white border-4 border-primary shadow-lg">
                        <User className="w-16 h-16" />
                      </div>
                    )}
                  </div>
                  {/* Character Info */}
                  <div className="flex-1 text-center md:text-left">
                    {(() => {
                      const meta = nftMetaByCharacterId[String(character.id)];
                      const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
                      const getTrait = (traitType: string) =>
                        attrs.find((a: any) => String(a?.trait_type) === traitType)?.value;

                      const orderedTraits = [
                        { label: 'Race', value: getTrait('Race') || raceObj?.name },
                        { label: 'Class', value: getTrait('Class') || classObj?.name },
                        { label: 'Level', value: getTrait('Level') || character.level },
                        { label: 'STR', value: getTrait('STR') },
                        { label: 'AGI', value: getTrait('AGI') },
                        { label: 'INT', value: getTrait('INT') },
                        { label: 'DEF', value: getTrait('DEF') },
                      ].filter((t) => t.value !== undefined && t.value !== null && String(t.value) !== '');

                      return (
                        <>
                          <h3 className="text-3xl font-bold text-text-primary mb-1">
                            {String(getTrait('CharacterName') || character.name)}
                          </h3>

                          {meta?.name && (
                            <div className="text-text-secondary text-sm mb-1">{String(meta.name)}</div>
                          )}
                          {meta?.description && (
                            <div className="text-text-secondary text-sm mb-3">{String(meta.description)}</div>
                          )}

                          <div className="flex flex-col sm:flex-row gap-2 items-center justify-center md:justify-start mb-3">
                            <span className="text-base font-semibold text-primary bg-surface/70 rounded px-3 py-1">
                              {String(getTrait('Race') || raceObj?.name || '')}
                            </span>
                            <span className="text-base font-semibold text-primary bg-surface/70 rounded px-3 py-1">
                              {String(getTrait('Class') || classObj?.name || '')}
                            </span>
                            <span className="text-base font-semibold text-primary bg-surface/70 rounded px-3 py-1">
                              Lv {String(getTrait('Level') || character.level || 1)}
                            </span>
                          </div>

                          {orderedTraits.length > 0 && (
                            <div className="mb-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {orderedTraits.map((t) => (
                                  <div
                                    key={t.label}
                                    className="bg-surface/60 rounded px-3 py-2 border border-border/40"
                                  >
                                    <div className="text-xs text-text-secondary">{t.label}</div>
                                    <div className="text-sm font-semibold text-text-primary truncate">
                                      {String(t.value)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {(character.nftTokenUri || meta) && (
                            <div className="mb-4">
                              <div className="text-xs text-text-secondary">TokenURI</div>
                              <div className="text-xs text-text-primary break-all">
                                {String(character.nftTokenUri || '')}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="flex flex-col md:flex-row gap-2 mb-4">
                      <Link href={`/character/${character.id}`} passHref>
                        <Button variant="outline" size="sm">
                          View Details
                        </Button>
                      </Link>
                      {/* Botões de teste para XP */}
                      <div className="flex gap-1">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => addXPToCharacter(character.id, 50)}
                          className="text-xs"
                        >
                          +50 XP
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => addXPToCharacter(character.id, 200)}
                          className="text-xs"
                        >
                          +200 XP
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => addXPToCharacter(character.id, 1000)}
                          className="text-xs"
                        >
                          +1000 XP
                        </Button>
                      </div>
                    </div>
                    
                    {/* XP Progress Bar */}
                    {character.levelInfo && (
                      <div className="mb-4">
                        <XPProgressBar levelInfo={character.levelInfo} />
                      </div>
                    )}
                    
                    {/* Available Points Alert */}
                    {character.availablePoints && character.availablePoints > 0 && (
                      <div className="mb-4 p-3 bg-gradient-to-r from-primary/20 to-primary-dark/20 border border-primary/30 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-bold text-sm">
                              📊 {character.availablePoints} pontos para distribuir
                            </span>
                          </div>
                          <Link href={`/character/${character.id}`} passHref>
                            <Button variant="primary" size="sm" className="text-xs">
                              Distribuir Pontos
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                    
                    {/* Character Stats */}
                    <div className="mb-4">
                      <CharacterStats character={character} />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card p-8 mb-12 text-center"
          >
            <h3 className="text-2xl font-bold text-text-primary mb-4">
              Nenhum Personagem Encontrado
            </h3>
            <p className="text-text-secondary mb-6">
              Parece que você ainda não criou um personagem. Comece sua aventura agora!
            </p>
            <Link href="/character/create" passHref>
              <Button size="lg">
                <User className="w-5 h-5 mr-2" />
                Criar Novo Personagem
              </Button>
            </Link>
          </motion.div>
        )}

        {characterDetails.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
            <Link href="/combat-lobby" passHref>
              <Button size="lg" className="flex-1 sm:flex-none">
                <Sword className="w-5 h-5 mr-2" />
                Entrar em Combate
              </Button>
            </Link>
            <Link href="/dungeons" passHref>
              <Button variant="outline" size="lg" className="flex-1 sm:flex-none">
                <Shield className="w-5 h-5 mr-2" />
                Explorar Dungeon
              </Button>
            </Link>
            <Link href="/character/create" passHref>
              <Button size="lg" variant="secondary" className="flex-1 sm:flex-none">
                <User className="w-5 h-5 mr-2" />
                Criar Novo Personagem
              </Button>
            </Link>
          </div>
        )}

        {/* Delete Character Dialog */}
        {deleteDialog.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-surface rounded-xl shadow-2xl p-8 w-full max-w-md relative animate-fade-in">
              <button
                className="absolute top-3 right-3 text-text-secondary hover:text-text-primary"
                onClick={closeDeleteDialog}
                aria-label="Fechar"
              >
                ×
              </button>
              <h2 className="text-xl font-bold mb-4 text-text-primary">Excluir NFT</h2>
              <p className="mb-2 text-text-secondary">
                Isso vai transferir a NFT para uma carteira BURN (você vai assinar a transação e pagar gas).<br />
                Esta ação não pode ser desfeita.
              </p>

              {deleteDialog.item?.character?.name ? (
                <>
                  <p className="mb-2 text-text-secondary">
                    Para confirmar, digite o nome do personagem <span className="font-bold text-primary">{deleteDialog.item.character.name}</span> abaixo:
                  </p>
                  <input
                    ref={inputRef}
                    className="w-full px-3 py-2 border rounded mb-4 text-text-primary bg-background outline-none focus:ring-2 focus:ring-primary"
                    value={deleteDialog.input}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDeleteDialog((d: any) => ({ ...d, input: e.target.value }))
                    }
                    placeholder="Digite o nome do personagem"
                    autoFocus
                  />
                </>
              ) : (
                <div className="text-xs text-text-secondary mb-4">
                  Token ID: {String(deleteDialog.item?.tokenId || '')}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={closeDeleteDialog}>Cancelar</Button>
                <Button
                  variant="primary"
                  onClick={handleDeleteCharacter}
                  disabled={
                    Boolean(deleteDialog.item?.character?.name) &&
                    deleteDialog.input !== deleteDialog.item?.character?.name
                  }
                >
                  Excluir
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
