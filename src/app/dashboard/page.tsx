
'use client';
import { useState, useEffect, useRef } from 'react';

import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { User, Shield, Sword, Trash2, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import XPProgressBar from '@/components/XPProgressBar';
import CharacterStats from '@/components/CharacterStats';
import KeepBackdrop from '@/components/dashboard/KeepBackdrop';
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop';
import { CharacterStatChips, computePower } from '@/components/character/CharacterStatChips';
import { getBlendedVisual } from '@/lib/creationVisuals';
import { getProfessionLevel } from '@/lib/professionSystem';
import { getGatherField } from '@/lib/gathering';
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider';
// ...existing code...
import { Character } from '@/types/game';
import { getRaceById, getClassById } from '@/lib/gameData';
import { getRaceTransformations } from '@/lib/transformationSystem';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';
import Image from 'next/image';
import { getWalletTxErrorMessage } from '@/lib/walletErrors';
import { getPolygonFeeOverrides } from '@/lib/gasFees';
// ...existing code...
// ...existing code...

// Paleta chumbo + ouro envelhecido — a mesma da EnhancementDialog e da ficha do
// personagem, para todas as janelas do jogo lerem como um só conjunto.
const GOLD = '#c9a25f';
const GOLD_BRIGHT = '#e7c682';
const FRAME = '#8a6d3b';
const PANEL_BG = 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))';
const TITLEBAR_BG = 'linear-gradient(180deg, #2b2b2f, #1a1a1d)';
// Botão em bisel neutro (o mesmo dos botões secundários da dialog de aprimoramento)
const BEVEL_BTN =
  'rounded-[3px] border border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] font-semibold text-[#c9c9ce] transition-colors hover:border-[#8a6d3b] hover:text-white';

export default function DashboardPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterDetails, setCharacterDetails] = useState<any[]>([]);
  // IDs já tentados no backfill da imagem de transformação (evita disparos duplicados)
  const transformBackfillRef = useRef<Set<string>>(new Set());
  const [nftMetaByCharacterId, setNftMetaByCharacterId] = useState<Record<string, any>>({});
  const [ownedNfts, setOwnedNfts] = useState<any[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string>('');
  const [nftMetaByTokenId, setNftMetaByTokenId] = useState<Record<string, any>>({});
  const [ownedNftContext, setOwnedNftContext] = useState<{ chainId?: number; contractAddress?: string } | null>(null);
  const [ownedNftsError, setOwnedNftsError] = useState<string>('');
  // ⛏️ Sessões de coleta em aberto por personagem (badge "coletando" no card).
  const [gatheringByCharId, setGatheringByCharId] = useState<Record<string, { fieldId: string; status: string; inventoryFull: boolean }>>({});
  const [loadingCharacter, setLoadingCharacter] = useState<boolean>(true);
  const [dolLoading, setDolLoading] = useState<boolean>(false);
  const [dolBalance, setDolBalance] = useState<string | null>(null);
  const [dolSymbol, setDolSymbol] = useState<string | null>(null);
  const [dolError, setDolError] = useState<string | null>(null);
  // Saldo do token GOLD on-chain, exibido lado a lado com o DOL.
  const [goldOnchain, setGoldOnchain] = useState<string | null>(null);
  // Ativar o herói antes de abrir a ficha (mesmo comportamento da navbar).
  const { setActiveCharacterId } = useActiveCharacter();
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
  // Gera (uma vez) a arte de transformação para personagens que ainda não têm.
  const backfillTransformationImages = async (chars: any[]) => {
    for (const char of chars) {
      const id = String(char?.id || '');
      if (!id || transformBackfillRef.current.has(id)) continue;

      const forms = getRaceTransformations(char?.race);
      if (forms.length === 0) continue; // raça sem transformação
      if (char?.transformationImage) {
        transformBackfillRef.current.add(id);
        continue; // já tem
      }
      // Metamorfo (multi-forma) só gera depois de escolher a forma (criação).
      if (forms.length > 1 && !char?.unlockedTransformation) continue;

      transformBackfillRef.current.add(id);
      try {
        const res = await fetch(`/api/character/${id}/generate-transformation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.transformationImage && !data?.alreadyExisted) {
            toast.success('Forma de transformação gerada! ✨');
          }
        }
      } catch {
        // silencioso: backfill é best-effort
      }
    }
  };

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
      // Mantém a seleção atual se ainda existir; senão seleciona a primeira NFT.
      setSelectedTokenId((prev) => {
        const stillExists = items.some((it: any) => String(it?.tokenId || '') === prev);
        if (prev && stillExists) return prev;
        return items.length > 0 ? String(items[0]?.tokenId || '') : '';
      });
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
      // 🐉 Backfill automático da imagem de transformação (sem página dedicada).
      // Gera para personagens de forma única (ex.: elfo→celestial) ou que já
      // tenham uma forma travada. Metamorfo sem forma escolhida é ignorado.
      void backfillTransformationImages(dbChars);
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

  // Abre a ficha ATIVANDO o herói antes — mesmo comportamento do seletor da
  // navbar (CharacterSwitcherDialog), para o resto do app já operar sobre ele.
  const openSheet = (charId: string, fallbackId?: string) => {
    if (charId) setActiveCharacterId(charId);
    router.push(`/character/${charId || fallbackId || ''}`);
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

      const tx = await erc721.transferFrom(from, burnAddress, BigInt(tokenId), await getPolygonFeeOverrides(providerAfterSwitch));
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

      // ⛏️ Quais heróis estão coletando (leitura pura; 1 chamada pra conta toda).
      fetch('/api/gather/active')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const map: Record<string, { fieldId: string; status: string; inventoryFull: boolean }> = {};
          for (const s of data?.sessions ?? []) {
            map[String(s.characterId)] = { fieldId: s.fieldId, status: s.status, inventoryFull: !!s.inventoryFull };
          }
          setGatheringByCharId(map);
        })
        .catch(() => {});

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

        // 🪙 Token GOLD on-chain, exibido junto do DOL (falha em silêncio).
        fetch('/api/wallet/gold-balance', { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            const n = Number(json?.formatted);
            setGoldOnchain(json?.walletLinked && Number.isFinite(n) ? n.toLocaleString('pt-BR') : null);
          })
          .catch(() => setGoldOnchain(null));
      } else {
        setDolBalance(null);
        setDolSymbol(null);
        setDolError(null);
        setGoldOnchain(null);
      }
    } else if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router, session?.user?.walletAddress]);

  // Personagem selecionado (a partir da NFT escolhida no card acima).
  const selectedItem = ownedNfts.find((it: any) => String(it?.tokenId || '') === selectedTokenId);
  const selectedCharId = selectedItem?.character?.id ? String(selectedItem.character.id) : '';
  const detailToShow =
    characterDetails.find((d: any) => String(d?.character?.id) === selectedCharId) ||
    characterDetails[0] ||
    null;

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      {/* Cenário animado da Câmara do Guardião */}
      <div className="fixed inset-0 z-0">
        <KeepBackdrop />
      </div>

      <main className="relative z-10" style={{ fontFamily: "'Barlow', sans-serif" }}>
        {/* Carteira + saldos on-chain — janela chumbo; layout fixo em 2 colunas
            (esquerda carteira / direita saldos), sem trocas por breakpoint. */}
        <div
          className="mb-4 overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60"
          style={{ background: PANEL_BG }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}>
            <Wallet size={16} style={{ color: GOLD }} />
            <span className="text-[15px] font-semibold tracking-wide text-[#dcdce0]">Carteira</span>
          </div>

          <div className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#77777d]">Carteira vinculada</div>
              <div className="truncate font-medium tabular-nums text-[#ece7da]">
                {session?.user?.walletAddress ? session.user.walletAddress : 'Não vinculada'}
              </div>
              {!session?.user?.walletAddress && status === 'authenticated' && (
                <div className="mt-2">
                  <button
                    onClick={handleLinkWallet}
                    disabled={isLinkingWallet}
                    className={`${BEVEL_BTN} inline-flex items-center gap-2 px-3 py-1.5 text-xs disabled:opacity-50`}
                  >
                    <Wallet className="w-4 h-4" />
                    {isLinkingWallet ? 'Conectando...' : 'Conectar e assinar'}
                  </button>
                  {walletLinkError && (
                    <div className="mt-2 text-xs text-red-400">{walletLinkError}</div>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#77777d]">Saldo on-chain</div>
              <div className="font-bold tabular-nums text-[#ece7da]">
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
              {/* Token GOLD (mintado via claim) lado a lado com o DOL */}
              <div className="font-bold tabular-nums" style={{ color: GOLD_BRIGHT }}>
                {session?.user?.walletAddress ? `${goldOnchain ?? '0'} GOLD` : ''}
              </div>
            </div>
          </div>
        </div>


        {/* NFTs owned on-chain (shows even if DB characters were deleted) */}
        <div
          className="mb-8 overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60"
          style={{ background: PANEL_BG }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}>
            <User size={16} style={{ color: GOLD }} />
            <span className="text-[15px] font-semibold tracking-wide text-[#dcdce0]">Personagens (on-chain)</span>
            <div className="flex-1" />
            <button onClick={fetchCharacters} className={`${BEVEL_BTN} px-3 py-1 text-xs`}>
              Atualizar
            </button>
          </div>

          <div className="p-4">
          {ownedNftsError ? (
            <div className="text-xs text-red-400 mb-3">{ownedNftsError}</div>
          ) : null}

          {ownedNfts.length === 0 ? (
            <div className="text-sm text-[#8a8a90]">Nenhuma NFT encontrada na sua carteira.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                const isSelected = selectedTokenId === tokenId;
                const visual = getBlendedVisual(displayRace, displayClass);

                // Vitals + poder total (str+def+int+agi): a rota já traz o Character
                // completo por NFT (hp/mp/stamina/baseStats/gatherXp/farmXp) — sem fetch extra.
                const charRow = it?.character;
                const gatherLevel = charRow ? getProfessionLevel(charRow.gatherXp ?? 0) : 1;
                const farmLevel = charRow ? getProfessionLevel(charRow.farmXp ?? 0) : 1;
                const gatherInfo = characterId ? gatheringByCharId[characterId] : undefined;
                const invFull = !!gatherInfo?.inventoryFull;

                return (
                  <motion.div
                    key={tokenId}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedTokenId(tokenId)}
                    className="relative overflow-hidden rounded-[4px] border cursor-pointer transition-all group"
                    style={{
                      // Seleção em ouro, como o seletor de itens da EnhancementDialog
                      borderColor: isSelected ? GOLD : '#46464c',
                      boxShadow: isSelected ? '0 0 12px rgba(201,162,95,0.4)' : undefined,
                    }}
                  >
                    {/* Cenário animado da raça */}
                    <div className="absolute inset-0">
                      <CreationCardBackdrop theme={visual.backdropTheme} />
                    </div>
                    <div
                      className={`absolute inset-0 transition-colors ${
                        isSelected ? 'bg-black/30' : 'bg-black/50 group-hover:bg-black/40'
                      }`}
                    />

                    <div className="relative p-4 flex items-start gap-4">
                      <div
                        className="w-14 h-14 rounded-[3px] overflow-hidden border-2 flex-shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
                        style={{ borderColor: isSelected ? FRAME : '#46464c', background: '#141210' }}
                      >
                        {meta?.image ? (
                          <Image
                            src={String(meta.image)}
                            alt={displayName}
                            width={112}
                            height={112}
                            unoptimized
                            className="w-full h-full object-cover art-bright"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center text-2xl"
                            style={{ background: visual.gradient }}
                          >
                            {visual.raceVisual.emoji}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-white font-bold truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                          {displayName}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {displayRace && (
                            <span
                              className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] text-[#dcdce0] border"
                              style={{ background: `linear-gradient(180deg, ${visual.raceVisual.accent}2e, ${visual.raceVisual.accent}12)`, borderColor: `${visual.raceVisual.accent}66` }}
                            >
                              {visual.raceVisual.emoji} {displayRace}
                            </span>
                          )}
                          {displayClass && (
                            <span
                              className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] text-[#dcdce0] border"
                              style={{ background: `linear-gradient(180deg, ${visual.classVisual.accent}2e, ${visual.classVisual.accent}12)`, borderColor: `${visual.classVisual.accent}66` }}
                            >
                              {visual.classVisual.emoji} {displayClass}
                            </span>
                          )}
                          {displayLevel && (
                            <span
                              className="px-2 py-0.5 text-[11px] font-bold rounded-[3px] border"
                              style={{ borderColor: FRAME, background: 'linear-gradient(180deg, #3a3325, #241f16)', color: GOLD_BRIGHT }}
                            >
                              Lv {displayLevel}
                            </span>
                          )}
                          {gatherInfo && (() => {
                            const field = getGatherField(gatherInfo.fieldId);
                            const fieldLabel = field ? `${field.emoji} ${field.name}` : '⛏️ Coletando';
                            return (
                              <span
                                className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] text-emerald-200 bg-emerald-500/15 border border-emerald-400/40"
                                title={invFull
                                  ? `Inventário cheio — coleta pausada em ${field?.name ?? 'campo'} sem gastar stamina`
                                  : gatherInfo.status === 'exhausted'
                                    ? `Sessão esgotada em ${field?.name ?? 'campo'} — espólio aguardando coleta`
                                    : `Este herói está coletando em ${field?.name ?? 'campo'}`}
                              >
                                {invFull ? '🎒 Coleta pausada' : gatherInfo.status === 'exhausted' ? '💤 Espólio pronto' : fieldLabel}
                              </span>
                            );
                          })()}
                          {charRow?.gatherXp > 0 && (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] text-lime-200 bg-lime-500/10 border border-lime-400/30">
                              ⛏️ Nv.{gatherLevel}
                            </span>
                          )}
                          {charRow?.farmXp > 0 && (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] text-yellow-200 bg-yellow-500/10 border border-yellow-400/30">
                              🌾 Nv.{farmLevel}
                            </span>
                          )}
                          {charRow && (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] text-sky-200 bg-sky-500/10 border border-sky-400/30">
                              🎒 Inventário: {Number(charRow?._count?.inventory ?? 0)}/{Number(charRow?.inventorySlots ?? 20)}
                            </span>
                          )}
                          {charRow && (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-[3px] text-amber-200 bg-amber-500/10 border border-amber-400/30">
                              💰 Bolso: {Number(charRow?.gold ?? 0).toLocaleString('pt-BR')}g
                            </span>
                          )}
                        </div>
                        {charRow && (
                          <div className="mt-1.5">
                            <CharacterStatChips
                              vitals={{
                                hp: charRow.hp ?? 0, maxHp: charRow.maxHp ?? 0,
                                mp: charRow.mp ?? 0, maxMp: charRow.maxMp ?? 0,
                                stamina: charRow.stamina ?? 0, maxStamina: charRow.maxStamina ?? 0,
                                power: computePower(charRow.baseStats),
                              }}
                            />
                          </div>
                        )}
                        <div className="text-[11px] text-white/50 truncate mt-1">Token ID: {tokenId}</div>
                      </div>

                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openSheet(characterId, tokenId);
                          }}
                          className="w-full px-4 py-2 rounded-[3px] border text-xs font-semibold tracking-wide transition-all hover:brightness-125"
                          style={{
                            borderColor: FRAME,
                            background: 'linear-gradient(180deg, #3a3325, #241f16)',
                            color: GOLD_BRIGHT,
                            boxShadow: 'inset 0 1px 0 rgba(231,198,130,0.25)',
                          }}
                        >
                          Abrir
                        </button>
                        {gatherInfo && characterId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Atalho: leva à página de coleta com este herói já
                              // selecionado — a finalização acontece só lá.
                              router.push(`/gathering?focus=${characterId}`);
                            }}
                            className="px-4 py-2 rounded-[3px] border text-xs font-semibold text-emerald-200 transition-all hover:brightness-125"
                            style={{ borderColor: '#2f6b3a', background: 'linear-gradient(180deg, #25351f, #161f12)' }}
                          >
                            ⛏️ Encerrar coleta
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog({ tokenId, character: it?.character || null });
                          }}
                          className="px-4 py-2 rounded-[3px] border text-xs font-semibold text-red-300 transition-all hover:brightness-125"
                          style={{ borderColor: '#8a3b3b', background: 'linear-gradient(180deg, #3a2525, #241616)' }}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {detailToShow ? (
          (() => {
            const { character, raceObj, classObj } = detailToShow as any;
            const meta = nftMetaByCharacterId[String(character.id)];
            const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
            const getTrait = (traitType: string) =>
              attrs.find((a: any) => String(a?.trait_type) === traitType)?.value;

            const raceName = String(getTrait('Race') || raceObj?.name || '');
            const className = String(getTrait('Class') || classObj?.name || '');
            const visual = getBlendedVisual(raceObj?.id || raceName, classObj?.id || className);

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
              <motion.div
                key={character.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60 mb-12"
                style={{ background: PANEL_BG }}
              >
                {/* Barra de título em bisel */}
                <div className="relative z-10 flex items-center gap-2 px-4 py-2.5" style={{ background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}>
                  <span style={{ color: GOLD }}>✦</span>
                  <span className="text-[15px] font-semibold tracking-wide text-[#dcdce0]">Herói Selecionado</span>
                  <div className="flex-1" />
                  <button
                    className="text-red-400 hover:text-red-300 transition-colors"
                    title="Excluir personagem"
                    onClick={() => openDeleteDialog({ tokenId: String((character as any)?.nftTokenId || ''), character })}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Cenário animado misturando raça e classe (fundo do corpo) */}
                <div className="relative">
                  <div className="absolute inset-0">
                    <CreationCardBackdrop theme={visual.backdropTheme} />
                  </div>
                  <div className="absolute inset-0 bg-black/60" />

                {/* Layout fixo: retrato à esquerda, informações à esquerda-alinhadas —
                    nada re-centraliza entre breakpoints. */}
                <div className="relative p-4 sm:p-6 flex flex-row items-start gap-4 sm:gap-6">
                    {/* Character Picture */}
                    <div className="flex-shrink-0">
                      {meta?.image ? (
                        <div
                          className="w-24 h-24 sm:w-32 sm:h-32 rounded-[3px] overflow-hidden border-2 shadow-lg bg-black/40"
                          style={{ borderColor: FRAME, boxShadow: '0 0 0 1px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.55)' }}
                        >
                          <Image
                            src={String(meta.image)}
                            alt={String(meta?.name || character.name || 'NFT')}
                            width={256}
                            height={256}
                            unoptimized
                            className="w-full h-full object-cover art-bright"
                          />
                        </div>
                      ) : (
                        <div
                          className="w-24 h-24 sm:w-32 sm:h-32 rounded-[3px] flex items-center justify-center text-5xl text-white border-2 shadow-lg"
                          style={{ background: visual.gradient, borderColor: FRAME }}
                        >
                          {visual.raceVisual.emoji}
                        </div>
                      )}
                    </div>
                    {/* Character Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <h3 className="text-2xl sm:text-3xl font-black text-[#ece7da] mb-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" style={{ letterSpacing: '0.5px' }}>
                        {String(getTrait('CharacterName') || character.name)}
                      </h3>

                      {meta?.name && (
                        <div className="text-white/70 text-sm mb-1">{String(meta.name)}</div>
                      )}
                      {meta?.description && (
                        <div className="text-white/60 text-sm mb-3">{String(meta.description)}</div>
                      )}

                      <div className="flex flex-wrap gap-2 items-center justify-start mb-3">
                        {raceName && (
                          <span
                            className="text-sm font-semibold text-[#dcdce0] rounded-[3px] px-3 py-1 border"
                            style={{ background: `linear-gradient(180deg, ${visual.raceVisual.accent}2e, ${visual.raceVisual.accent}12)`, borderColor: `${visual.raceVisual.accent}66` }}
                          >
                            {visual.raceVisual.emoji} {raceName}
                          </span>
                        )}
                        {className && (
                          <span
                            className="text-sm font-semibold text-[#dcdce0] rounded-[3px] px-3 py-1 border"
                            style={{ background: `linear-gradient(180deg, ${visual.classVisual.accent}2e, ${visual.classVisual.accent}12)`, borderColor: `${visual.classVisual.accent}66` }}
                          >
                            {visual.classVisual.emoji} {className}
                          </span>
                        )}
                        <span
                          className="text-sm font-bold rounded-[3px] px-3 py-1 border"
                          style={{ borderColor: FRAME, background: 'linear-gradient(180deg, #3a3325, #241f16)', color: GOLD_BRIGHT }}
                        >
                          Lv {String(getTrait('Level') || character.level || 1)}
                        </span>
                      </div>

                      {orderedTraits.length > 0 && (
                        <div className="mb-4">
                          {/* Grade fixa de 4 colunas: os atributos não trocam de
                              posição entre mobile e desktop. */}
                          <div className="grid grid-cols-4 gap-2">
                            {orderedTraits.map((t) => (
                              <div
                                key={t.label}
                                className="rounded-[3px] px-2 py-1.5 border border-black/60 bg-[#19191c]"
                              >
                                <div className="text-[10px] uppercase tracking-[0.14em] text-[#77777d]">{t.label}</div>
                                <div className="text-sm font-semibold tabular-nums text-[#ece7da] truncate">
                                  {String(t.value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-row flex-wrap gap-2 mb-4 items-center justify-start">
                        <button
                          onClick={() => openSheet(String(character.id))}
                          className="px-5 py-2.5 rounded-[3px] border text-sm font-semibold tracking-wide transition-all hover:brightness-125"
                          style={{
                            borderColor: FRAME,
                            background: 'linear-gradient(180deg, #3a3325, #241f16)',
                            color: GOLD_BRIGHT,
                            boxShadow: 'inset 0 1px 0 rgba(231,198,130,0.25), 0 0 14px rgba(201,162,95,0.2)',
                          }}
                        >
                          Ver Ficha Completa
                        </button>
                        {/* Botões de teste para XP */}
                        <div className="flex gap-1.5">
                          {[50, 200, 1000].map((xp) => (
                            <button
                              key={xp}
                              onClick={() => addXPToCharacter(character.id, xp)}
                              className={`${BEVEL_BTN} px-3 py-2 text-xs`}
                            >
                              +{xp} XP
                            </button>
                          ))}
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
                        <div
                          className="mb-4 p-3 rounded-[3px] border"
                          style={{ borderColor: FRAME, background: 'linear-gradient(180deg, rgba(58,51,37,0.85), rgba(36,31,22,0.85))' }}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold text-sm" style={{ color: GOLD_BRIGHT }}>
                              ✦ {character.availablePoints} pontos para distribuir
                            </span>
                            <button
                              onClick={() => openSheet(String(character.id))}
                              className="px-4 py-2 rounded-[3px] border text-xs font-semibold tracking-wide transition-all hover:brightness-125"
                              style={{ borderColor: FRAME, background: 'linear-gradient(180deg, #3a3325, #241f16)', color: GOLD_BRIGHT }}
                            >
                              Distribuir Pontos
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Character Stats — faixa escura para as barras lerem bem
                          sobre o cenário animado */}
                      <div className="mb-2 rounded-[3px] border border-black/60 bg-[#19191c]/85 p-3">
                        <CharacterStats character={character} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })()
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="rounded-[4px] border border-[#46464c] p-8 mb-12 text-center shadow-2xl shadow-black/60"
            style={{ background: PANEL_BG }}
          >
            <h3 className="text-2xl font-bold text-[#ece7da] mb-4">
              Nenhum Personagem Encontrado
            </h3>
            <p className="text-[#8a8a90] mb-6">
              Parece que você ainda não criou um personagem. Comece sua aventura agora!
            </p>
            <Link
              href="/character/create"
              className="inline-flex items-center gap-2 rounded-[3px] border px-8 py-3 text-[15px] font-semibold tracking-wide transition-all hover:brightness-125"
              style={{
                borderColor: FRAME,
                background: 'linear-gradient(180deg, #3a3325, #241f16)',
                color: GOLD_BRIGHT,
                boxShadow: 'inset 0 1px 0 rgba(231,198,130,0.25), 0 0 14px rgba(201,162,95,0.2)',
              }}
            >
              <User className="w-5 h-5" />
              Criar Novo Personagem
            </Link>
          </motion.div>
        )}

        {characterDetails.length > 0 && (
          <div className="flex flex-row flex-wrap gap-3 justify-center mt-4">
            <Link
              href="/combat-lobby"
              className="inline-flex items-center justify-center gap-2 rounded-[3px] border px-8 py-3 text-[15px] font-semibold tracking-wide transition-all hover:brightness-125"
              style={{
                borderColor: '#8a3b3b',
                background: 'linear-gradient(180deg, #3a2525, #241616)',
                color: '#f0a8a8',
                boxShadow: 'inset 0 1px 0 rgba(240,168,168,0.2), 0 0 14px rgba(201,70,70,0.15)',
              }}
            >
              <Sword className="w-5 h-5" />
              Entrar em Combate
            </Link>
            <Link
              href="/dungeons"
              className="inline-flex items-center justify-center gap-2 rounded-[3px] border px-8 py-3 text-[15px] font-semibold tracking-wide transition-all hover:brightness-125"
              style={{
                borderColor: '#5b3b8a',
                background: 'linear-gradient(180deg, #2e2540, #1c1626)',
                color: '#c9b3ec',
                boxShadow: 'inset 0 1px 0 rgba(201,179,236,0.2), 0 0 14px rgba(139,92,246,0.15)',
              }}
            >
              <Shield className="w-5 h-5" />
              Explorar Dungeon
            </Link>
            <Link
              href="/character/create"
              className="inline-flex items-center justify-center gap-2 rounded-[3px] border px-8 py-3 text-[15px] font-semibold tracking-wide transition-all hover:brightness-125"
              style={{
                borderColor: FRAME,
                background: 'linear-gradient(180deg, #3a3325, #241f16)',
                color: GOLD_BRIGHT,
                boxShadow: 'inset 0 1px 0 rgba(231,198,130,0.25), 0 0 14px rgba(201,162,95,0.2)',
              }}
            >
              <User className="w-5 h-5" />
              Criar Novo Personagem
            </Link>
          </div>
        )}

        {/* Delete Character Dialog — mesma moldura chumbo da EnhancementDialog */}
        {deleteDialog.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-[4px] border border-[#46464c] bg-[#1e1e21] shadow-2xl shadow-black/80 animate-fade-in">
              {/* Barra de título */}
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}>
                <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-wide text-[#dcdce0]">
                  <Trash2 className="w-4 h-4 text-red-400" /> Excluir NFT
                </h2>
                <button
                  className="px-2 py-0.5 text-[#8a8a90] transition-colors hover:text-white"
                  onClick={closeDeleteDialog}
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <div className="p-5">
                <p className="mb-2 text-sm text-[#e09a3a]">
                  Isso vai transferir a NFT para uma carteira BURN (você vai assinar a transação e pagar gas).<br />
                  Esta ação não pode ser desfeita.
                </p>

                {deleteDialog.item?.character?.name ? (
                  <>
                    <p className="mb-2 text-sm text-[#c9c9ce]">
                      Para confirmar, digite o nome do personagem <span className="font-bold" style={{ color: GOLD_BRIGHT }}>{deleteDialog.item.character.name}</span> abaixo:
                    </p>
                    <input
                      ref={inputRef}
                      className="w-full rounded-[3px] border border-[#3c3c41] bg-[#101013] px-3 py-2 mb-4 text-[#ece7da] outline-none transition-colors focus:border-[#8a6d3b]"
                      value={deleteDialog.input}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setDeleteDialog((d: any) => ({ ...d, input: e.target.value }))
                      }
                      placeholder="Digite o nome do personagem"
                      autoFocus
                    />
                  </>
                ) : (
                  <div className="text-xs text-[#8a8a90] mb-4">
                    Token ID: {String(deleteDialog.item?.tokenId || '')}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={closeDeleteDialog} className={`${BEVEL_BTN} px-4 py-2 text-sm`}>
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteCharacter}
                    disabled={
                      Boolean(deleteDialog.item?.character?.name) &&
                      deleteDialog.input !== deleteDialog.item?.character?.name
                    }
                    className="rounded-[3px] border px-4 py-2 text-sm font-semibold text-red-300 transition-all hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ borderColor: '#8a3b3b', background: 'linear-gradient(180deg, #3a2525, #241616)' }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
