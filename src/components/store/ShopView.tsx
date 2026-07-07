'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { buyGoldOnChain } from '@/lib/buyGold';
import { confirmBuyGold } from '@/lib/buyGoldPrompt';
import { Search, Filter, X, ShoppingCart, Trash2 } from 'lucide-react';
import BazaarBackdrop from '@/components/store/BazaarBackdrop';
import ItemCardBackdrop from '@/components/store/ItemCardBackdrop';
import RepairBench from '@/components/store/RepairBench';
import AlchemyDialog from '@/components/crafting/AlchemyDialog';
import ForgeDialog from '@/components/crafting/ForgeDialog';
import { getItemVisual, getItemTypeLabel, getItemCategory } from '@/lib/itemVisuals';
import { formatItemStats } from '@/lib/itemStats';
import { useGold } from '@/components/providers/GoldProvider';
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider';

// Configuração de cada "loja NPC". O ferreiro vende equipamento (armas/armaduras
// e acessórios) e tem a bancada de reparo; o alquimista vende consumíveis.
export type ShopKind = 'blacksmith' | 'alchemist';

const SHOP_CONFIG: Record<
  ShopKind,
  {
    title: string;
    subtitle: string;
    /** Mostra apenas itens cuja categoria casa com este predicado. */
    showItem: (type?: string | null) => boolean;
    hasRepairBench: boolean;
    hasCraftingBench: boolean;
    emptyEmoji: string;
    emptyLabel: string;
  }
> = {
  blacksmith: {
    title: '⚒️ Ferreiro de Dolrath',
    subtitle: 'Forje, compre e repare armas, armaduras e equipamentos!',
    showItem: (type) => getItemCategory(type) !== 'consumable',
    hasRepairBench: true,
    hasCraftingBench: true,
    emptyEmoji: '⚒️',
    emptyLabel: 'A forja está fria',
  },
  alchemist: {
    title: '⚗️ Alquimista de Dolrath',
    subtitle: 'Poções, elixires e consumíveis para sua jornada!',
    showItem: (type) => getItemCategory(type) === 'consumable',
    hasRepairBench: false,
    hasCraftingBench: true,
    emptyEmoji: '⚗️',
    emptyLabel: 'As prateleiras estão vazias',
  },
};

interface StoreItem {
  id: string;
  name: string;
  description?: string;
  type: string;
  level?: number;
  image?: string;
  goldPrice: number;
  stats?: Record<string, any>;
}

interface Character {
  id: string;
  name: string;
  class: string;
  race: string;
  level?: number;
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

export default function ShopView({ kind }: { kind: ShopKind }) {
  const config = SHOP_CONFIG[kind];
  const { data: session } = useSession();
  const { refreshGoldBalance } = useGold();
  // Carteira do PERSONAGEM selecionado (Character.gold) — é ESTE saldo que a loja
  // gasta no modelo do banco. Para usar o gold do banco, o jogador saca em
  // /inventory. O useGold() mostra o on-chain (claimado), que não compra. [[bank]]
  // Personagem ATIVO global (navbar). A loja compra/equipa SEMPRE neste herói —
  // sem seletor próprio. `characters`/`selectedCharacter` derivam do contexto
  // para preservar o resto da lógica original sem reescrevê-la.
  const { characters: ctxCharacters, activeCharacterId, refresh: refreshActiveCharacter } = useActiveCharacter();
  const characters = ctxCharacters as unknown as Character[];
  const selectedCharacter = activeCharacterId ?? '';
  const [characterGold, setCharacterGold] = useState<number | null>(null);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [userInventory, setUserInventory] = useState<UserInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(true);
  // Quantidade a comprar por item (default 1). Reparar 100% gasta 10 cópias,
  // então comprar em lote evita o tédio de comprar 1 por 1.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const getQty = (id: string) => Math.max(1, quantities[id] ?? 1);
  const setQty = (id: string, value: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(1, Math.min(99, Math.floor(value || 1))) }));

  // 🛒 Carrinho de compras: o jogador junta itens e fecha tudo de uma vez no
  // dialog de checkout. Guardamos um snapshot do item (preço/nome/imagem) para
  // o carrinho sobreviver à troca de filtros/loja que recarrega `items`.
  const [cart, setCart] = useState<Record<string, { item: StoreItem; quantity: number }>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const cartEntries = useMemo(() => Object.values(cart), [cart]);
  const cartCount = useMemo(() => cartEntries.reduce((s, e) => s + e.quantity, 0), [cartEntries]);
  const cartTotal = useMemo(
    () => cartEntries.reduce((s, e) => s + e.item.goldPrice * e.quantity, 0),
    [cartEntries]
  );

  const addToCart = (item: StoreItem, qty: number) => {
    const add = Math.max(1, Math.min(99, Math.floor(qty || 1)));
    setCart((prev) => {
      const existing = prev[item.id];
      const nextQty = Math.min(99, (existing?.quantity ?? 0) + add);
      return { ...prev, [item.id]: { item, quantity: nextQty } };
    });
    toast.success(`🛒 ${add}× ${item.name} no carrinho`);
  };

  const setCartQty = (itemId: string, value: number) =>
    setCart((prev) => {
      if (!prev[itemId]) return prev;
      const q = Math.max(1, Math.min(99, Math.floor(value || 1)));
      return { ...prev, [itemId]: { ...prev[itemId], quantity: q } };
    });

  const removeFromCart = (itemId: string) =>
    setCart((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

  const clearCart = () => setCart({});

  // Fecha o carrinho inteiro num laço de compras (o endpoint é por-item e
  // servidor-autoritativo no preço). Continua mesmo se uma linha falhar.
  const handleCheckout = async () => {
    if (!selectedCharacter) {
      toast.error('Selecione um personagem para receber os itens.');
      return;
    }
    if (cartEntries.length === 0) return;
    // Sem GOLD na mão → oferece recarga on-chain (compra de GOLD, não dos itens)
    // do valor exato que falta e segue com a compra off-chain.
    if ((characterGold ?? 0) < cartTotal) {
      const shortfall = cartTotal - (characterGold ?? 0);
      if (!(await confirmBuyGold(shortfall))) return;
      const credited = await buyGoldOnChain({ characterId: selectedCharacter, amountGold: shortfall });
      if (!credited) return;
      setCharacterGold(credited.characterGold);
    }
    setCheckingOut(true);
    let purchased = 0;
    let failed = 0;
    let lastGold: number | null = null;
    for (const entry of cartEntries) {
      try {
        const res = await fetch('/api/store/purchase-offchain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: entry.item.id, characterId: selectedCharacter, quantity: entry.quantity }),
        });
        const data = await res.json();
        if (!res.ok) {
          failed++;
          toast.error(`${entry.item.name}: ${data?.error || 'falha na compra'}`);
          continue;
        }
        purchased++;
        if (typeof data?.characterGold === 'number') lastGold = data.characterGold;
      } catch {
        failed++;
        toast.error(`${entry.item.name}: erro de conexão`);
      }
    }
    if (lastGold !== null) setCharacterGold(lastGold);
    else fetchCharacterGold(selectedCharacter);
    refreshGoldBalance();
    refreshActiveCharacter(); // atualiza o gold do personagem na navbar
    setInventoryRefreshKey((k) => k + 1);
    fetchUserInventory();
    if (purchased > 0) {
      toast.success(`✅ ${purchased} ${purchased === 1 ? 'item comprado' : 'itens comprados'}!`);
      clearCart();
      if (failed === 0) setCartOpen(false);
    }
    setCheckingOut(false);
  };
  // Sinaliza à Bancada de Reparo que o inventário do personagem mudou (compra/transferência).
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

  // Dialogs de profissão (Forja/Alquimia) — substituem as bancadas inline.
  const [forgeOpen, setForgeOpen] = useState(false);
  const [alchemyOpen, setAlchemyOpen] = useState(false);
  // Deep-link "⚗️ Usar na Alquimia" (/alchemist?place=<nome>): abre a dialog já
  // com o ingrediente num vértice e limpa a URL para não repetir no reload.
  const [alchemyPlaceName, setAlchemyPlaceName] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (kind !== 'alchemist' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const name = params.get('place');
    if (!name) return;
    setAlchemyPlaceName(name);
    setAlchemyOpen(true);
    params.delete('place');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [kind]);

  // Forja/alquimia/reparo gastam Character.gold no servidor. Além de recarregar o
  // inventário das bancadas, precisamos atualizar o gold do personagem ativo na
  // navbar (useActiveCharacter) e o saldo local da loja — senão o número fica preso.
  const handleBenchChanged = useCallback(() => {
    setInventoryRefreshKey((k) => k + 1);
    refreshActiveCharacter();
    if (selectedCharacter) fetchCharacterGold(selectedCharacter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshActiveCharacter, selectedCharacter]);
  // Filtro por raça e level do personagem ativo (ligado por padrão).
  const [showAll, setShowAll] = useState(false);

  const activeCharacter = useMemo(
    () => characters.find((c) => c.id === selectedCharacter),
    [characters, selectedCharacter]
  );
  const activeRace = activeCharacter?.race;
  const activeClass = (activeCharacter as any)?.class;
  const activeLevel = activeCharacter?.level;
  
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
      // Filtro por loja (ferreiro = equipamento, alquimista = consumíveis)
      if (!config.showItem(item.type)) return false;

      // Filtro por level do personagem: só mostra o que ele já pode usar/comprar
      // (a menos que o usuário marque "ignorar raça e level").
      const itemLevelValue = item.level || 1;
      if (!showAll && activeLevel != null && itemLevelValue > activeLevel) return false;

      // Filtro de busca por nome
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());

      // Filtro de tipo
      const matchesType = selectedType === 'ALL' || item.type === selectedType;

      // Filtro de preço
      const matchesPrice = item.goldPrice >= priceFilter.min && item.goldPrice <= priceFilter.max;

      // Filtro de level (slider)
      const matchesLevel = itemLevelValue >= levelFilter.min && itemLevelValue <= levelFilter.max;

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
  }, [items, searchQuery, selectedType, priceFilter, levelFilter, sortBy, sortOrder, config, showAll, activeLevel]);

  useEffect(() => {
    fetchUserInventory();
  }, []);

  // Carteira do personagem selecionado (Character.gold) — o que a loja gasta.
  const fetchCharacterGold = useCallback(async (characterId: string) => {
    if (!characterId) { setCharacterGold(null); return; }
    try {
      const res = await fetch('/api/bank/status');
      if (!res.ok) return;
      const data = await res.json();
      const c = (Array.isArray(data?.characters) ? data.characters : []).find((x: any) => x.id === characterId);
      setCharacterGold(c ? Number(c.gold ?? 0) : 0);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { fetchCharacterGold(selectedCharacter); }, [selectedCharacter, fetchCharacterGold]);

  // Recarrega a vitrine sempre que o personagem ativo (ou o toggle) muda,
  // filtrando pela raça do personagem por padrão.
  useEffect(() => {
    fetchItems(showAll ? undefined : activeRace, showAll ? undefined : activeClass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRace, activeClass, showAll]);

  const fetchItems = async (race?: string, charClass?: string) => {
    setItemsLoading(true);
    try {
      const params = new URLSearchParams();
      if (race) params.set('race', race);
      if (charClass) params.set('class', charClass);
      const qs = params.toString();
      const url = qs ? `/api/store/items?${qs}` : '/api/store/items';
      const response = await fetch(url);
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
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">Acesso Restrito</h1>
          <p className="text-text-secondary">Você precisa estar logado para acessar a loja.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] text-white overflow-hidden">
      {/* Cenário animado do bazaar */}
      <div className="fixed inset-0 z-0">
        <BazaarBackdrop />
      </div>

      <div className="relative z-10 container mx-auto p-4 pt-20">
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark mb-2">
            {config.title}
          </h1>
          <p className="text-text-secondary">{config.subtitle}</p>
        </div>

        {/* Bancada de reparo (só o ferreiro) — o craft saiu dos NPCs e virou
            profissão do jogador, aberta pelo card-vitrine abaixo. */}
        {config.hasRepairBench && (
          <div className="mb-8">
            <RepairBench
              characters={characters}
              characterId={selectedCharacter || undefined}
              refreshSignal={inventoryRefreshKey}
              onChanged={handleBenchChanged}
            />
          </div>
        )}

        {/* Card-vitrine da profissão: abre a dialog estilo BDO (Forja/Alquimia). */}
        {config.hasCraftingBench && (
          <button
            type="button"
            onClick={() => (kind === 'blacksmith' ? setForgeOpen(true) : setAlchemyOpen(true))}
            className="group mb-8 flex w-full items-center gap-4 rounded-[4px] border border-[#8a6d3b] bg-gradient-to-b from-[#26262a] to-[#141215] p-4 text-left shadow-[inset_0_1px_0_rgba(231,198,130,0.15),0_0_18px_rgba(201,162,95,0.15)] transition-all hover:border-[#c9a25f] hover:shadow-[inset_0_1px_0_rgba(231,198,130,0.25),0_0_26px_rgba(201,162,95,0.3)]"
          >
            <span className="grid h-14 w-14 shrink-0 rotate-45 place-items-center rounded-[3px] border border-[#8a6d3b] bg-gradient-to-br from-[#2c2620] to-[#141210] shadow-[0_0_16px_rgba(201,162,95,0.3)]">
              <span className="-rotate-45 text-2xl">{kind === 'blacksmith' ? '⚒️' : '⚗️'}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-[#e7c682]">
                {kind === 'blacksmith' ? 'Mesa de Forja' : 'Círculo de Transmutação'}
              </span>
              <span className="block text-sm text-[#9a9aa0]">
                {kind === 'blacksmith'
                  ? 'Forje equipamento e refine pedras. A chance de sucesso cresce com seu nível de Forja.'
                  : 'Combine 3 ingredientes no triângulo. A chance de sucesso cresce com seu nível de Alquimia.'}
              </span>
            </span>
            <span className="shrink-0 rounded-[3px] border border-[#8a6d3b] bg-gradient-to-b from-[#3a3325] to-[#241f16] px-4 py-2 text-sm font-semibold text-[#e7c682] transition-colors group-hover:border-[#c9a25f]">
              {kind === 'blacksmith' ? '⚒ Forjar' : '⚗ Transmutar'}
            </span>
          </button>
        )}

        <ForgeDialog
          open={forgeOpen}
          onClose={() => setForgeOpen(false)}
          characterId={selectedCharacter || undefined}
          characterGold={characterGold}
          onChanged={handleBenchChanged}
        />
        <AlchemyDialog
          open={alchemyOpen}
          onClose={() => {
            setAlchemyOpen(false);
            setAlchemyPlaceName(undefined);
          }}
          characterId={selectedCharacter || undefined}
          characterGold={characterGold}
          initialPlaceName={alchemyPlaceName}
          onChanged={handleBenchChanged}
        />

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
        
        {/* Personagem ativo (sem seletor — definido na navbar) + carteira */}
        {activeCharacter && (
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-semibold text-white bg-surface/50 border border-white/15 rounded-lg px-3 py-2">
                ⚔️ {activeCharacter.name}
                <span className="ml-1 text-text-secondary capitalize">({activeClass})</span>
              </span>

              <span className="text-sm font-semibold text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2">
                Carteira: {characterGold === null ? '…' : characterGold} 🪙
              </span>

              {/* Toggle de filtro por raça e level */}
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                Mostrar todos (ignorar raça e level)
              </label>
            </div>

            {/* Indicador do filtro por raça e level ativo */}
            {activeRace && !showAll && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs bg-primary/15 border border-primary/25 text-primary px-3 py-1.5 rounded-full">
                🛡️ Mostrando só o que <span className="font-semibold capitalize">{activeRace}</span>
                {activeLevel != null && (
                  <> de até <span className="font-semibold">level {activeLevel}</span></>
                )}{' '}
                pode comprar
              </div>
            )}
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
              // A API já resolve public IDs do Cloudinary server-side → item.image é sempre URL completa ou null
              const resolvedImageUrl = item.image ?? null;

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
                  <div className="relative p-4 flex flex-col h-full min-h-[280px]">
                    {resolvedImageUrl && (
                      <div className="w-full aspect-square relative mb-3 rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                        <Image
                          src={resolvedImageUrl}
                          alt={item.name}
                          fill
                          className="object-cover art-bright group-hover:scale-105 transition-transform duration-300"
                          unoptimized={Boolean(resolvedImageUrl && !/^https?:\/\//i.test(resolvedImageUrl))}
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

                    {/* Stats do item */}
                    {formatItemStats(item.stats, item.type).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {formatItemStats(item.stats, item.type).map((stat, i) => (
                          <span key={i} className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full">
                            {stat}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto flex flex-col gap-2 pt-2">
                      <div className="text-base font-semibold text-amber-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                        💰 {item.goldPrice} gold
                      </div>

                      {ownedQuantity > 0 && (
                        <div className="text-sm text-amber-300">
                          ✓ Você possui: {ownedQuantity}
                        </div>
                      )}

                      {/* Seletor de quantidade */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/60">Qtd:</span>
                        <div className="flex items-center rounded-lg overflow-hidden border border-white/20">
                          <button
                            type="button"
                            onClick={() => setQty(item.id, getQty(item.id) - 1)}
                            disabled={loading || getQty(item.id) <= 1}
                            className="px-2.5 py-1.5 text-white bg-black/30 hover:bg-black/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={getQty(item.id)}
                            onChange={(e) => setQty(item.id, parseInt(e.target.value, 10))}
                            className="w-12 text-center bg-black/20 text-white text-sm py-1.5 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => setQty(item.id, getQty(item.id) + 1)}
                            disabled={loading || getQty(item.id) >= 99}
                            className="px-2.5 py-1.5 text-white bg-black/30 hover:bg-black/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            +
                          </button>
                        </div>
                        {getQty(item.id) > 1 && (
                          <span className="text-xs text-amber-300/90 font-semibold">
                            = {item.goldPrice * getQty(item.id)} 🪙
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => addToCart(item, getQty(item.id))}
                        disabled={loading}
                        title="Adiciona ao carrinho — feche tudo no checkout"
                        className="w-full px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: `linear-gradient(90deg, ${visual.accent}cc, ${visual.accent}77)`,
                          boxShadow: `0 4px 20px ${visual.accentSoft}`,
                        }}
                      >
                        🛒 Adicionar{getQty(item.id) > 1 ? ` ${getQty(item.id)}×` : ''} ({item.goldPrice * getQty(item.id)} 🪙)
                      </button>
                      {cart[item.id] && (
                        <div className="text-xs text-center text-amber-300/90">
                          No carrinho: {cart[item.id].quantity}
                        </div>
                      )}

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
            <div className="text-6xl mb-4">{config.emptyEmoji}</div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">{config.emptyLabel}</h3>
            <p className="text-text-secondary">Não há itens disponíveis no momento</p>
          </div>
        )}
      </div>

      {/* 🛒 Botão flutuante do carrinho — aparece quando há itens. */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            onClick={() => setCartOpen(true)}
            className="fixed bottom-6 right-6 z-30 flex items-center gap-3 px-5 py-3 rounded-2xl font-black text-white shadow-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:scale-105 transition-transform"
          >
            <span className="relative">
              <ShoppingCart className="w-6 h-6" />
              <span className="absolute -top-2 -right-2 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-600 text-[11px] leading-none">
                {cartCount}
              </span>
            </span>
            <span className="text-sm">{cartTotal} 🪙</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Dialog de checkout */}
      <AnimatePresence>
        {cartOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !checkingOut && setCartOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[85dvh] flex flex-col rounded-2xl border border-white/15 bg-[#15151f] shadow-2xl overflow-hidden"
            >
              {/* Cabeçalho */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <h2 className="flex items-center gap-2 text-lg font-black text-white">
                  <ShoppingCart className="w-5 h-5 text-amber-400" />
                  Carrinho
                  <span className="text-sm font-semibold text-text-secondary">({cartCount})</span>
                </h2>
                <button
                  onClick={() => !checkingOut && setCartOpen(false)}
                  className="text-text-secondary hover:text-white transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lista de itens */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {cartEntries.length === 0 ? (
                  <div className="text-center py-10 text-text-secondary">Seu carrinho está vazio.</div>
                ) : (
                  cartEntries.map(({ item, quantity }) => {
                    const visual = getItemVisual(item.type);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2.5 rounded-xl bg-surface/40 border border-white/10"
                      >
                        <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-black/40 ring-1 ring-white/10 relative flex items-center justify-center text-xl">
                          {item.image ? (
                            <Image
                              src={item.image}
                              alt={item.name}
                              fill
                              className="object-cover art-bright"
                              unoptimized={Boolean(item.image && !/^https?:\/\//i.test(item.image))}
                            />
                          ) : (
                            <span>{visual.emoji}</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-white truncate">{item.name}</div>
                          <div className="text-xs text-amber-400">{item.goldPrice} 🪙 / un.</div>
                        </div>

                        {/* Quantidade */}
                        <div className="flex items-center rounded-lg overflow-hidden border border-white/20">
                          <button
                            type="button"
                            onClick={() => setCartQty(item.id, quantity - 1)}
                            disabled={checkingOut || quantity <= 1}
                            className="px-2 py-1 text-white bg-black/30 hover:bg-black/50 disabled:opacity-40 transition-colors"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={quantity}
                            disabled={checkingOut}
                            onChange={(e) => setCartQty(item.id, parseInt(e.target.value, 10))}
                            className="w-10 text-center bg-black/20 text-white text-sm py-1 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => setCartQty(item.id, quantity + 1)}
                            disabled={checkingOut || quantity >= 99}
                            className="px-2 py-1 text-white bg-black/30 hover:bg-black/50 disabled:opacity-40 transition-colors"
                          >
                            +
                          </button>
                        </div>

                        <div className="w-16 text-right text-sm font-bold text-amber-300">
                          {item.goldPrice * quantity} 🪙
                        </div>

                        <button
                          onClick={() => removeFromCart(item.id)}
                          disabled={checkingOut}
                          className="text-text-secondary hover:text-red-400 transition-colors disabled:opacity-40"
                          aria-label="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Rodapé com total e ações */}
              <div className="px-5 py-4 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">Carteira do personagem</span>
                  <span className="font-semibold text-amber-300">
                    {characterGold === null ? '…' : characterGold} 🪙
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-black text-white">Total</span>
                  <span className="text-xl font-black text-amber-400">{cartTotal} 🪙</span>
                </div>
                {characterGold !== null && cartTotal > characterGold && (
                  <div className="text-xs text-amber-400/90">
                    Sem GOLD na mão? Finalize e recarregue on-chain pela carteira.
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={clearCart}
                    disabled={checkingOut || cartEntries.length === 0}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={handleCheckout}
                    disabled={
                      checkingOut ||
                      cartEntries.length === 0 ||
                      !selectedCharacter
                    }
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {checkingOut
                      ? 'Finalizando…'
                      : (characterGold ?? 0) < cartTotal
                        ? `Comprar GOLD e finalizar (${cartTotal} 🪙)`
                        : `Finalizar compra (${cartTotal} 🪙)`}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
