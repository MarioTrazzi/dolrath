'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { Search, Filter, X } from 'lucide-react';
import { useGold } from '@/components/providers/GoldProvider';

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
  const { goldBalance, updateGoldBalance } = useGold();
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
      const response = await fetch('/api/store/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update gold balance
        updateGoldBalance(data.remainingGold);
        // Refresh user inventory
        fetchUserInventory();
        toast.success(`🛒 Item comprado! ${data.goldSpent} gold gastos`, {
          duration: 3000,
        });
      } else {
        const error = await response.json();
        toast.error(`❌ Erro na compra: ${error.error}`, {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error purchasing item:', error);
      toast.error('💥 Erro inesperado na compra', {
        duration: 4000,
      });
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
    <div className="min-h-screen bg-background text-text-primary">
      <div className="container mx-auto p-4 pt-20">
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
                    Busca: "{searchQuery}"
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
              
              return (
                <div key={item.id} className="bg-surface/50 border border-white/20 rounded-lg p-4 shadow-lg hover:shadow-xl transition-all hover:border-primary/50">
                  {item.image && (
                    <div className="w-full h-32 relative mb-3">
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        className="object-contain"
                      />
                    </div>
                  )}
                  
                  <h3 className="font-bold text-lg mb-2 text-text-primary">{item.name}</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-text-secondary">Tipo:</span>
                    <span className="text-sm bg-primary/20 text-primary px-2 py-1 rounded">{item.type}</span>
                    {item.level && (
                      <span className="text-sm bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
                        Lv.{item.level}
                      </span>
                    )}
                  </div>
                  
                  {item.description && (
                    <p className="text-sm text-text-secondary mb-3">{item.description}</p>
                  )}
                  
                  <div className="text-lg font-semibold text-yellow-400 mb-3">
                    💰 {item.goldPrice} gold
                  </div>

                  {ownedQuantity > 0 && (
                    <div className="text-sm text-primary mb-2">
                      Você possui: {ownedQuantity}
                    </div>
                  )}
                  
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handlePurchase(item.id)}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:from-green-600 hover:to-green-700 disabled:opacity-50 transition-all shadow-lg"
                    >
                      Comprar
                    </button>
                    
                    {ownedQuantity > 0 && selectedCharacter && (
                      <button
                        onClick={() => handleQuickEquip(item.id)}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white py-2 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 transition-all shadow-lg"
                      >
                        ⚡ Equipar Rápido
                      </button>
                    )}
                  </div>
                </div>
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
