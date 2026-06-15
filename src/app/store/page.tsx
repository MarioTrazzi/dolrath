'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Search, Filter, X } from 'lucide-react';
import { ethers } from 'ethers';
import { resolveImageUrl } from '@/lib/imageUrl';
import { decodeContractCustomErrorMessage, getWalletTxErrorMessage } from '@/lib/walletErrors';
import BazaarBackdrop from '@/components/store/BazaarBackdrop';
import ItemCardBackdrop from '@/components/store/ItemCardBackdrop';
import { getItemVisual, getItemTypeLabel } from '@/lib/itemVisuals';

interface StoreItem {
  id: string;
  name: string;
  description?: string;
  type: string;
  level?: number;
  image?: string;
  goldPrice: number;
}

interface Character {
  id: string;
  name: string;
  class: string;
}

interface UserInventoryItem {
  id: string;
  quantity: number;
  item: StoreItem;
}

// Filtro para preço
interface PriceFilter {
  min: number;
  max: number;
}

export default function Store() {
  const { data: session } = useSession();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [userInventory, setUserInventory] = useState<UserInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(true);
  
  // Estados para busca e filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>({ min: 0, max: 50000 });
  const [levelFilter, setLevelFilter] = useState<{ min: number; max: number }>({ min: 1, max: 50 });
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'level' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

  // Valores máximos para os filtros baseados nos itens carregados
  const maxPrice = useMemo(() => {
    return items.length > 0 ? Math.max(...items.map(item => item.goldPrice)) : 5000;
  }, [items]);

  const maxLevel = useMemo(() => {
    return items.length > 0 ? Math.max(...items.map(item => item.level || 1)) : 10;
  }, [items]);

  // Atualizar filtros quando os itens carregam
  useEffect(() => {
    if (items.length > 0) {
      const currentMaxPrice = Math.max(...items.map(item => item.goldPrice));
      const currentMaxLevel = Math.max(...items.map(item => item.level || 1));
      
      // Só atualizar se os filtros ainda estão nos valores padrão
      setPriceFilter(prev => ({ 
        min: prev.min, 
        max: prev.max < currentMaxPrice ? currentMaxPrice : prev.max 
      }));
      setLevelFilter(prev => ({ 
        min: prev.min, 
        max: prev.max < currentMaxLevel ? currentMaxLevel : prev.max 
      }));
    }
  }, [items]);

  // Tipos únicos para o filtro
  const itemTypes = useMemo(() => {
    const types = Array.from(new Set(items.map(item => item.type)));
    return types.sort();
  }, [items]);

  // Filtrar e ordenar itens
  const filteredItems = useMemo(() => {
    let filtered = items.filter(item => {
      // Filtro de busca por nome
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Filtro de tipo
      const matchesType = selectedType === 'ALL' || item.type === selectedType;
      
      // Filtro de preço
      const matchesPrice = item.goldPrice >= priceFilter.min && item.goldPrice <= priceFilter.max;
      
      // Filtro de level
      const itemLevel = item.level || 1;
      const matchesLevel = itemLevel >= levelFilter.min && itemLevel <= levelFilter.max;
      
      return matchesSearch && matchesType && matchesPrice && matchesLevel;
    });

    // Ordenar
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'price':
          comparison = a.goldPrice - b.goldPrice;
          break;
        case 'level':
          comparison = (a.level || 1) - (b.level || 1);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [items, searchQuery, selectedType, priceFilter, levelFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchItems();
    fetchCharacters();
    fetchUserInventory();
  }, []);

  const fetchItems = async () => {
    setItemsLoading(true);
    try {
      const response = await fetch('/api/store/items');
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      } else {
        console.error('Failed to fetch items:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setItemsLoading(false);
    }
  };

  const fetchCharacters = async () => {
    try {
      const response = await fetch('/api/character/me');
      if (response.ok) {
        const data = await response.json();
        setCharacters(Array.isArray(data) ? data : [data]);
        if (data.length > 0) {
          setSelectedCharacter(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching characters:', error);
    }
  };

  const fetchUserInventory = async () => {
    try {
      const response = await fetch('/api/inventory/user');
      if (response.ok) {
        const data = await response.json();
        setUserInventory(data);
      }
    } catch (error) {
      console.error('Error fetching user inventory:', error);
    }
  };

  const handlePurchase = async (itemId: string) => {
    setLoading(true);
    try {
      const eth = (window as any)?.ethereum;
      if (!eth) {
        toast.error('MetaMask não encontrada');
        return;
      }

      const cfgRes = await fetch(`/api/store/purchase-config?itemId=${encodeURIComponent(itemId)}`, {
        cache: 'no-store',
      });
      const cfgJson = await cfgRes.json();
      if (!cfgRes.ok) {
        throw new Error(cfgJson?.error || 'Falha ao carregar config da compra');
      }

      const {
        chainId,
        goldContractAddress,
        treasuryAddress,
        itemNftContractAddress,
        item,
      } = cfgJson as {
        chainId: number;
        goldContractAddress: string;
        treasuryAddress: string;
        itemNftContractAddress: string;
        item: { id: string; name: string; goldPrice: number };
      };

      const provider = new ethers.BrowserProvider(eth);
      await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== Number(chainId)) {
        toast.error(`Troque a rede para chainId ${chainId} na MetaMask`);
        return;
      }

      const signer = await provider.getSigner();
      const from = await signer.getAddress();

      const erc20Abi = [
        'function decimals() view returns (uint8)',
        'function balanceOf(address) view returns (uint256)',
        'function transfer(address to, uint256 value) returns (bool)',
      ] as const;

      const gold = new ethers.Contract(goldContractAddress, erc20Abi, signer);
      const decimals = Number(await gold.decimals());
      const costWei = ethers.parseUnits(String(item.goldPrice), decimals);
      const balanceWei = (await gold.balanceOf(from)) as bigint;

      if (balanceWei < costWei) {
        toast.error(`💰 GOLD insuficiente on-chain! Você precisa de ${item.goldPrice} GOLD.`);
        return;
      }

      const payTx = await gold.transfer(treasuryAddress, costWei);
      toast.success('Pagamento enviado! Aguardando confirmação…');
      const payReceipt = await payTx.wait();
      if (!payReceipt || payReceipt.status !== 1) {
        throw new Error('Pagamento falhou');
      }

      const intentRes = await fetch('/api/store/purchase-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, paymentTxHash: payTx.hash }),
      });
      const intentJson = await intentRes.json();
      if (!intentRes.ok) {
        throw new Error(intentJson?.error || 'Falha ao criar intent de mint');
      }

      const mintArgs = intentJson.mint as {
        to: string;
        purchaseId: string;
        itemKey: string;
        paidGold: string;
        tokenURI: string;
        deadline: string;
        signature: string;
      };

      const itemNftAbi = [
        'function mintWithSig(address to, bytes32 purchaseId, bytes32 itemKey, uint256 paidGold, string tokenURI, uint256 deadline, bytes signature) returns (uint256)',
      ] as const;

      const itemNft = new ethers.Contract(itemNftContractAddress, itemNftAbi, signer);

      // Preflight: MetaMask/RPC can return opaque -32603 on send. estimateGas helps surface the real revert.
      let gasLimit: bigint | undefined = undefined;
      try {
        const est = (await itemNft.mintWithSig.estimateGas(
          mintArgs.to,
          mintArgs.purchaseId,
          mintArgs.itemKey,
          BigInt(mintArgs.paidGold),
          mintArgs.tokenURI,
          BigInt(mintArgs.deadline),
          mintArgs.signature
        )) as bigint;
        gasLimit = (est * 12n) / 10n;
      } catch (preErr: any) {
        const decoded = decodeContractCustomErrorMessage({
          contractInterface: itemNft.interface,
          err: preErr,
          messagesByName: {
            OnlyRecipient: 'Carteira conectada não confere com o destinatário do mint.',
            AlreadyMinted: 'Essa compra já foi usada para mintar (purchaseId já utilizado).',
          },
        });
        if (decoded) throw new Error(decoded);

        throw new Error(getWalletTxErrorMessage(preErr));
      }

      const mintTx = await itemNft.mintWithSig(
        mintArgs.to,
        mintArgs.purchaseId,
        mintArgs.itemKey,
        BigInt(mintArgs.paidGold),
        mintArgs.tokenURI,
        BigInt(mintArgs.deadline),
        mintArgs.signature,
        gasLimit ? { gasLimit } : {}
      );
      toast.success('Mint do item enviado! Aguardando confirmação…');
      const mintReceipt = await mintTx.wait();
      if (!mintReceipt || mintReceipt.status !== 1) {
        throw new Error('Mint falhou');
      }

      // Confirm can fail briefly if RPC/indexing is laggy. Retry a few times.
      let confirmJson: any = null;
      let lastConfirmErr: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const confirmRes = await fetch('/api/store/purchase-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, paymentTxHash: payTx.hash, mintTxHash: mintTx.hash }),
        });
        confirmJson = await confirmRes.json();
        if (confirmRes.ok) {
          lastConfirmErr = null;
          break;
        }

        lastConfirmErr = new Error(confirmJson?.error || 'Falha ao confirmar compra');
        const msg = String(confirmJson?.error || '')
        const shouldRetry = msg.includes('ainda não encontrada') || msg.includes('Aguarde')
        if (!shouldRetry) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (lastConfirmErr) throw lastConfirmErr;

      fetchUserInventory();
      toast.success(`🛒 Item comprado e NFT mintada! (${item.goldPrice} GOLD)`, { duration: 3000 });
    } catch (error) {
      console.error('Error purchasing item:', error);
      const message = error instanceof Error ? error.message : getWalletTxErrorMessage(error, '💥 Erro inesperado na compra')
      toast.error(message, { duration: 4000 });
    }
    setLoading(false);
  };

  const handleTransferToCharacter = async (itemId: string) => {
    if (!selectedCharacter) {
      toast.error('⚠️ Selecione um personagem primeiro', {
        duration: 3000,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/character/${selectedCharacter}/transfer-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, quantity: 1 }),
      });

      if (response.ok) {
        // Refresh user inventory
        fetchUserInventory();
        toast.success('📦 Item transferido para o personagem!', {
          duration: 3000,
        });
      } else {
        const error = await response.json();
        toast.error(`❌ Erro na transferência: ${error.error}`, {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error transferring item:', error);
      toast.error('💥 Erro inesperado na transferência', {
        duration: 4000,
      });
    }
    setLoading(false);
  };

  const handleQuickEquip = async (itemId: string) => {
    if (!selectedCharacter) {
      toast.error('⚠️ Selecione um personagem primeiro', {
        duration: 3000,
      });
      return;
    }

    setLoading(true);
    try {
      // First transfer to character inventory
      await handleTransferToCharacter(itemId);
      
      // Then equip the item
      const response = await fetch(`/api/character/${selectedCharacter}/equip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId }),
      });

      if (response.ok) {
        toast.success('⚡ Item equipado com sucesso!', {
          duration: 3000,
        });
      } else {
        const error = await response.json();
        toast.error(`❌ Erro ao equipar: ${error.error}`, {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error equipping item:', error);
      toast.error('💥 Erro inesperado ao equipar', {
        duration: 4000,
      });
    }
    setLoading(false);
  };

  const getInventoryQuantity = (itemId: string): number => {
    const inventoryItem = userInventory.find(inv => inv.item.id === itemId);
    return inventoryItem?.quantity || 0;
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">Acesso Restrito</h1>
          <p className="text-text-secondary">Você precisa estar logado para acessar a loja.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      {/* Cenário animado do bazaar */}
      <div className="fixed inset-0 z-0">
        <BazaarBackdrop />
      </div>

      <div className="relative z-10 container mx-auto p-4 pt-20">
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark mb-2">
            🏪 Loja do Aventureiro
          </h1>
          <p className="text-text-secondary">Encontre os melhores equipamentos para sua aventura!</p>
        </div>
        
        {/* Barra de Busca */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar itens..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-surface/50 border border-white/20 rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Filtros e Ordenação */}
        <div className="mb-6">
          {/* Indicadores de filtros ativos */}
          {(searchQuery || selectedType !== 'ALL' || priceFilter.min > 0 || priceFilter.max < maxPrice || levelFilter.min > 1 || levelFilter.max < maxLevel) && (
            <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-primary font-medium">🔍 Filtros ativos:</span>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedType('ALL');
                    setPriceFilter({ min: 0, max: maxPrice });
                    setLevelFilter({ min: 1, max: maxLevel });
                  }}
                  className="text-xs text-primary hover:text-primary-dark underline"
                >
                  Remover todos
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {searchQuery && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                    Busca: &quot;{searchQuery}&quot;
                  </span>
                )}
                {selectedType !== 'ALL' && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                    Tipo: {selectedType}
                  </span>
                )}
                {(priceFilter.min > 0 || priceFilter.max < maxPrice) && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                    Preço: {priceFilter.min}-{priceFilter.max}🪙
                  </span>
                )}
                {(levelFilter.min > 1 || levelFilter.max < maxLevel) && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                    Level: {levelFilter.min}-{levelFilter.max}
                  </span>
                )}
              </div>
            </div>
          )}
          
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-surface/50 border border-white/20 rounded-lg text-text-primary hover:bg-surface/70 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filtros
              {showFilters && <X className="w-4 h-4" />}
            </button>
            
            <div className="flex gap-4 items-center">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 bg-surface/50 border border-white/20 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="name">Nome</option>
                <option value="price">Preço</option>
                <option value="level">Level</option>
                <option value="type">Tipo</option>
              </select>
              
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 bg-surface/50 border border-white/20 rounded-lg text-text-primary hover:bg-surface/70 transition-colors"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            
            <div className="text-text-secondary">
              {itemsLoading ? 'Carregando...' : `${filteredItems.length} de ${items.length} itens`}
            </div>
          </div>

          {/* Painel de Filtros Expansível */}
          {showFilters && (
            <div className="mt-4 p-4 bg-surface/30 border border-white/10 rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Filtro de Tipo */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-text-secondary">Tipo</label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full px-3 py-2 bg-surface/50 border border-white/20 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="ALL">Todos os tipos</option>
                    {itemTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Filtro de Preço */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-text-secondary">
                    Preço: {priceFilter.min} - {priceFilter.max} 🪙
                  </label>
                  <div className="space-y-2">
                    <input
                      type="range"
                      min="0"
                      max={maxPrice}
                      value={priceFilter.min}
                      onChange={(e) => setPriceFilter(prev => ({ ...prev, min: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                    <input
                      type="range"
                      min="0"
                      max={maxPrice}
                      value={priceFilter.max}
                      onChange={(e) => setPriceFilter(prev => ({ ...prev, max: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Filtro de Level */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-text-secondary">
                    Level: {levelFilter.min} - {levelFilter.max}
                  </label>
                  <div className="space-y-2">
                    <input
                      type="range"
                      min="1"
                      max={maxLevel}
                      value={levelFilter.min}
                      onChange={(e) => setLevelFilter(prev => ({ ...prev, min: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                    <input
                      type="range"
                      min="1"
                      max={maxLevel}
                      value={levelFilter.max}
                      onChange={(e) => setLevelFilter(prev => ({ ...prev, max: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Reset Filtros */}
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedType('ALL');
                      setPriceFilter({ min: 0, max: maxPrice });
                      setLevelFilter({ min: 1, max: maxLevel });
                    }}
                    className="w-full px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    Limpar Filtros
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Character Selection */}
        {characters.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-text-secondary">
              Selecionar Personagem:
            </label>
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="px-4 py-2 bg-surface/50 border border-white/20 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Selecione um personagem</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name} ({character.class})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* User Inventory Summary */}
        {userInventory.length > 0 && (
          <div className="mb-6 p-4 bg-surface/30 border border-white/10 rounded-lg">
            <h2 className="text-lg font-semibold mb-3 text-text-primary">📦 Seu Inventário Global</h2>
            <div className="flex flex-wrap gap-2">
              {userInventory.map((inventoryItem) => (
                <div key={inventoryItem.id} className="flex items-center gap-2 bg-surface/50 border border-white/20 px-3 py-2 rounded">
                  <span className="text-text-primary">{inventoryItem.item.name}</span>
                  <span className="text-sm text-text-secondary">x{inventoryItem.quantity}</span>
                  <button
                    onClick={() => handleTransferToCharacter(inventoryItem.item.id)}
                    disabled={loading || !selectedCharacter}
                    className="text-xs bg-primary/80 text-white px-2 py-1 rounded hover:bg-primary disabled:opacity-50 transition-colors"
                  >
                    Transferir
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items Grid */}
        {itemsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="bg-surface/50 border border-white/20 rounded-lg p-4 shadow-lg animate-pulse">
                <div className="w-full h-32 bg-surface/70 rounded mb-3"></div>
                <div className="h-6 bg-surface/70 rounded mb-2"></div>
                <div className="h-4 bg-surface/70 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-surface/70 rounded w-1/2 mb-3"></div>
                <div className="h-8 bg-surface/70 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map((item) => {
              const ownedQuantity = getInventoryQuantity(item.id);
              const resolvedImageUrl = resolveImageUrl(item.image) ?? item.image;
              const shouldBypassNextImageOptimization = Boolean(
                item.image && !/^(https?:\/\/|data:|ipfs:\/\/)/i.test(item.image)
              );

              const visual = getItemVisual(item.type);

              return (
                <motion.div
                  key={item.id}
                  whileHover={{ scale: 1.02 }}
                  className="relative overflow-hidden rounded-2xl border-2 group"
                  style={{ borderColor: visual.accent + '55' }}
                >
                  {/* Backdrop animado por categoria */}
                  <div className="absolute inset-0">
                    <ItemCardBackdrop category={visual.category} />
                  </div>
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/15 transition-colors" />

                  {/* Conteúdo */}
                  <div className="relative p-4 flex flex-col min-h-[280px]">
                    {resolvedImageUrl && (
                      <div className="w-full h-32 relative mb-3 rounded-lg overflow-hidden bg-black/20">
                        <Image
                          src={resolvedImageUrl}
                          alt={item.name}
                          fill
                          className="object-contain group-hover:scale-110 transition-transform duration-300"
                          unoptimized={shouldBypassNextImageOptimization}
                        />
                      </div>
                    )}

                    <h3 className="font-black text-lg mb-2 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{item.name}</h3>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${visual.chipBg} ${visual.chipText}`}>
                        {visual.emoji} {getItemTypeLabel(item.type)}
                      </span>
                      {item.level && (
                        <span className="text-xs font-semibold bg-amber-500/30 text-amber-300 px-2 py-1 rounded-full">
                          Lv.{item.level}
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-sm text-white/60 mb-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{item.description}</p>
                    )}

                    <div className="text-base font-semibold text-amber-400 mb-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      💰 {item.goldPrice} gold
                    </div>

                    {ownedQuantity > 0 && (
                      <div className="text-sm text-amber-300 mb-2">
                        ✓ Você possui: {ownedQuantity}
                      </div>
                    )}

                    <div className="mt-auto flex flex-col gap-2">
                      <button
                        onClick={() => handlePurchase(item.id)}
                        disabled={loading}
                        className="w-full px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: `linear-gradient(90deg, ${visual.accent}cc, ${visual.accent}77)`,
                          boxShadow: `0 4px 20px ${visual.accentSoft}`,
                        }}
                      >
                        🛒 Comprar
                      </button>

                      {ownedQuantity > 0 && selectedCharacter && (
                        <button
                          onClick={() => handleQuickEquip(item.id)}
                          disabled={loading}
                          className="w-full px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: `linear-gradient(90deg, ${visual.accent}99, ${visual.accent}55)`,
                            boxShadow: `0 4px 14px ${visual.accentSoft}`,
                          }}
                        >
                          ⚡ Equipar Rápido
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {!itemsLoading && filteredItems.length === 0 && items.length > 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Nenhum item encontrado</h3>
            <p className="text-text-secondary mb-4">Tente ajustar seus filtros de busca</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedType('ALL');
                setPriceFilter({ min: 0, max: maxPrice });
                setLevelFilter({ min: 1, max: maxLevel });
              }}
              className="px-4 py-2 bg-primary/80 text-white rounded-lg hover:bg-primary transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        )}

        {!itemsLoading && items.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏪</div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">Loja vazia</h3>
            <p className="text-text-secondary">Não há itens disponíveis no momento</p>
          </div>
        )}
      </div>
    </div>
  );
}
