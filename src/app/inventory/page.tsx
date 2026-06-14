'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import EnhancementDialog from '@/components/EnhancementDialog';
import VaultBackdrop from '@/components/inventory/VaultBackdrop';
import ItemCardBackdrop from '@/components/store/ItemCardBackdrop';
import { getItemVisual, getItemTypeLabel } from '@/lib/itemVisuals';
import { getGearCategory, getDisplayName } from '@/lib/enhancementSystem';

interface Item {
  id: string;
  name: string;
  type: string;
  stats: any;
  description?: string;
}

interface UserInventoryItem {
  id: string;
  quantity: number;
  item: Item;
}

interface CharacterInventoryItem {
  id: string;
  quantity: number;
  enhancementLevel?: number;
  durability?: number;
  maxDurability?: number;
  item: Item;
}

interface Character {
  id: string;
  name: string;
  class: string;
}

interface EquippedItem {
  id: string;
  slot: string;
  item: Item;
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const [userInventory, setUserInventory] = useState<UserInventoryItem[]>([]);
  const [characterInventory, setCharacterInventory] = useState<CharacterInventoryItem[]>([]);
  const [equippedItems, setEquippedItems] = useState<EquippedItem[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [enhanceTarget, setEnhanceTarget] = useState<CharacterInventoryItem | null>(null);

  useEffect(() => {
    fetchUserInventory();
    fetchCharacters();
  }, []);

  useEffect(() => {
    if (selectedCharacter) {
      fetchCharacterInventory(selectedCharacter);
      fetchEquippedItems(selectedCharacter);
    }
  }, [selectedCharacter]);

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

  const fetchCharacterInventory = async (characterId: string) => {
    try {
      const response = await fetch(`/api/store/inventory?characterId=${characterId}`);
      if (response.ok) {
        const data = await response.json();
        setCharacterInventory(data);
      }
    } catch (error) {
      console.error('Error fetching character inventory:', error);
    }
  };

  const fetchEquippedItems = async (characterId: string) => {
    try {
      const response = await fetch(`/api/character/${characterId}`);
      if (response.ok) {
        const data = await response.json();
        setEquippedItems(data.equipment || []);
      }
    } catch (error) {
      console.error('Error fetching equipped items:', error);
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
        // Refresh both inventories
        fetchUserInventory();
        fetchCharacterInventory(selectedCharacter);
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

  const handleTransferToGlobal = async (itemId: string) => {
    if (!selectedCharacter) {
      toast.error('⚠️ Selecione um personagem primeiro', {
        duration: 3000,
      });
      return;
    }

    // Check if item is equipped
    if (isItemEquipped(itemId)) {
      toast.error('❌ Não é possível transferir itens equipados. Desequipe o item primeiro.', {
        duration: 4000,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/character/${selectedCharacter}/transfer-to-global`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, quantity: 1 }),
      });

      if (response.ok) {
        // Refresh both inventories
        fetchUserInventory();
        fetchCharacterInventory(selectedCharacter);
        toast.success('🌐 Item transferido para o inventário global!', {
          duration: 3000,
        });
      } else {
        const error = await response.json();
        toast.error(`❌ Erro na transferência: ${error.error}`, {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error transferring item to global:', error);
      toast.error('💥 Erro inesperado na transferência', {
        duration: 4000,
      });
    }
    setLoading(false);
  };

  const handleEquipItem = async (itemId: string) => {
    if (!selectedCharacter) {
      toast.error('⚠️ Selecione um personagem primeiro', {
        duration: 3000,
      });
      return;
    }

    // Determinar o tipo de slot baseado no tipo do item
    const item = characterInventory.find(inv => inv.item.id === itemId)?.item;
    if (!item) {
      toast.error('❌ Item não encontrado', {
        duration: 3000,
      });
      return;
    }

    const getSlotTypeFromItemType = (itemType: string) => {
      switch (itemType) {
        case 'LIGHT_HELMET':
        case 'MEDIUM_HELMET':
        case 'HEAVY_HELMET':
          return 'HELMET';
        case 'LIGHT_ARMOR':
        case 'MEDIUM_ARMOR':
        case 'HEAVY_ARMOR':
          return 'ARMOR';
        case 'SWORD':
        case 'AXE':
        case 'DAGGER':
        case 'STAFF':
        case 'BOW':
          return 'WEAPON';
        case 'SHIELD':
          return 'SHIELD';
        case 'LIGHT_GLOVES':
        case 'MEDIUM_GLOVES':
        case 'HEAVY_GLOVES':
          return 'GLOVES';
        case 'LIGHT_BOOTS':
        case 'MEDIUM_BOOTS':
        case 'HEAVY_BOOTS':
          return 'BOOTS';
        case 'NECKLACE':
          return 'NECKLACE';
        case 'RING':
          return 'RING_1';
        default:
          return 'WEAPON';
      }
    };

    const slotType = getSlotTypeFromItemType(item.type);

    setLoading(true);
    try {
      const response = await fetch(`/api/character/${selectedCharacter}/equip-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, slotType }),
      });

      if (response.ok) {
        fetchCharacterInventory(selectedCharacter);
        fetchEquippedItems(selectedCharacter);
        toast.success('⚡ Item equipado com sucesso!', {
          duration: 3000,
        });
      } else {
        const error = await response.json();
        toast.error(`❌ ${error.error}`, {
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

  const handleUnequipItem = async (itemId: string) => {
    if (!selectedCharacter) {
      toast.error('⚠️ Selecione um personagem primeiro', {
        duration: 3000,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/character/${selectedCharacter}/unequip-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId }),
      });

      if (response.ok) {
        fetchCharacterInventory(selectedCharacter);
        fetchEquippedItems(selectedCharacter);
        toast.success('🔓 Item desequipado com sucesso!', {
          duration: 3000,
        });
      } else {
        const error = await response.json();
        toast.error(`❌ Erro ao desequipar: ${error.error}`, {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error unequipping item:', error);
      toast.error('💥 Erro inesperado ao desequipar', {
        duration: 4000,
      });
    }
    setLoading(false);
  };

  const handleConsumeItem = async (itemId: string) => {
    if (!selectedCharacter) {
      toast.error('⚠️ Selecione um personagem primeiro', {
        duration: 3000,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/inventory/use-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          itemId,
          characterId: selectedCharacter 
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`✅ ${result.effect}`, {
          duration: 4000,
        });
        
        // Refresh inventory after consuming
        fetchCharacterInventory(selectedCharacter);
      } else {
        toast.error(`❌ ${result.error}`, {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error consuming item:', error);
      toast.error('💥 Erro inesperado ao consumir item', {
        duration: 4000,
      });
    }
    setLoading(false);
  };

  const isItemEquipped = (itemId: string) => {
    return equippedItems.some(equippedItem => equippedItem.item.id === itemId);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">Acesso Restrito</h1>
          <p className="text-text-secondary">Por favor, faça login para ver seu inventário</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-white overflow-hidden">
      {/* Cenário animado da câmara do tesouro (igual às masmorras) */}
      <div className="fixed inset-0 z-0">
        <VaultBackdrop />
      </div>

      <div className="relative z-10 container mx-auto p-4 pt-20">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-white mb-2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            📦 Inventário
          </h1>
          <p className="text-white/60 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Gerencie seus itens e equipamentos</p>
        </div>

        {/* Character Selection */}
        {characters.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-white/60">
              Selecionar Personagem:
            </label>
            <select
              value={selectedCharacter}
              onChange={(e) => setSelectedCharacter(e.target.value)}
              className="px-4 py-2.5 bg-black/60 border border-white/20 rounded-xl text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {characters.map((character) => (
                <option key={character.id} value={character.id} className="bg-stone-900 text-white">
                  {character.name} ({character.class})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Global Inventory */}
          <div className="bg-black/30 backdrop-blur-md border-2 border-amber-500/40 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              🌐 Inventário Global do Usuário
            </h2>
            <p className="text-sm text-text-secondary mb-4">
              Itens comprados que podem ser transferidos para qualquer personagem
            </p>
            
            {userInventory.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-text-secondary">Nenhum item no inventário global</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userInventory.map((inventoryItem) => {
                  const visual = getItemVisual(inventoryItem.item.type);
                  return (
                  <div
                    key={inventoryItem.id}
                    className="relative overflow-hidden border-2 p-4 rounded-2xl flex items-center justify-between gap-3 group"
                    style={{ borderColor: `${visual.accent}55` }}
                  >
                    <div className="absolute inset-0">
                      <ItemCardBackdrop category={visual.category} />
                    </div>
                    <div className="absolute inset-0 bg-black/55 group-hover:bg-black/45 transition-colors" />
                    <div className="relative min-w-0">
                      <h3 className="font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{inventoryItem.item.name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={`text-xs font-semibold ${visual.chipBg} ${visual.chipText} px-2 py-0.5 rounded-md border`}
                          style={{ borderColor: `${visual.accent}55` }}
                        >
                          {visual.emoji} {getItemTypeLabel(inventoryItem.item.type)}
                        </span>
                        <span className="text-xs font-semibold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">x{inventoryItem.quantity}</span>
                      </div>
                      {inventoryItem.item.description && (
                        <p className="text-xs text-white/65 mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{inventoryItem.item.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleTransferToCharacter(inventoryItem.item.id)}
                      disabled={loading || !selectedCharacter}
                      className="relative flex-shrink-0 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all shadow-lg font-semibold"
                    >
                      Transferir →
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Character Inventory */}
          <div className="bg-black/30 backdrop-blur-md border-2 border-amber-500/40 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              ⚔️ Inventário do Personagem
              {selectedCharacter && characters.find(c => c.id === selectedCharacter) && 
                <span className="text-primary">- {characters.find(c => c.id === selectedCharacter)?.name}</span>
              }
            </h2>
            <p className="text-sm text-text-secondary mb-4">
              Itens específicos deste personagem que podem ser equipados
            </p>

            {!selectedCharacter ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">👤</div>
                <p className="text-text-secondary">Selecione um personagem para ver seu inventário</p>
              </div>
            ) : characterInventory.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🎒</div>
                <p className="text-text-secondary">Este personagem não possui itens</p>
              </div>
            ) : (
              <div className="space-y-3">
                {characterInventory.map((inventoryItem) => {
                  const isEquipped = isItemEquipped(inventoryItem.item.id);
                  const enhancementLevel = inventoryItem.enhancementLevel || 0;
                  const isEnhanceable = !!getGearCategory(inventoryItem.item.type);
                  const visual = getItemVisual(inventoryItem.item.type);
                  return (
                    <div
                      key={inventoryItem.id}
                      className="relative overflow-hidden border-2 p-4 rounded-2xl flex items-center justify-between gap-3 group"
                      style={{ borderColor: isEquipped ? 'rgba(34,197,94,0.6)' : `${visual.accent}55` }}
                    >
                      <div className="absolute inset-0">
                        <ItemCardBackdrop category={visual.category} />
                      </div>
                      <div className="absolute inset-0 bg-black/55 group-hover:bg-black/45 transition-colors" />
                      <div className="relative min-w-0">
                        <h3 className="font-bold text-white flex items-center gap-2 flex-wrap drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                          <span className={enhancementLevel >= 16 ? 'text-orange-400' : enhancementLevel > 0 ? 'text-cyan-300' : ''}>
                            {getDisplayName(inventoryItem.item.name, enhancementLevel)}
                          </span>
                          {isEquipped && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
                              ✓ Equipado
                            </span>
                          )}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                          <span
                            className={`font-semibold ${visual.chipBg} ${visual.chipText} px-2 py-0.5 rounded-md border`}
                            style={{ borderColor: `${visual.accent}55` }}
                          >
                            {visual.emoji} {getItemTypeLabel(inventoryItem.item.type)}
                          </span>
                          <span className="font-semibold text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">x{inventoryItem.quantity}</span>
                          {isEnhanceable && inventoryItem.durability !== undefined && (
                            <span className="text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                              🛡️ <span className={inventoryItem.durability > 50 ? 'text-green-400' : inventoryItem.durability > 20 ? 'text-yellow-400' : 'text-red-400'}>
                                {inventoryItem.durability}/{inventoryItem.maxDurability ?? 100}
                              </span>
                            </span>
                          )}
                        </div>
                        {inventoryItem.item.description && (
                          <p className="text-xs text-white/65 mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{inventoryItem.item.description}</p>
                        )}
                      </div>
                      <div className="relative flex gap-2 flex-shrink-0 flex-wrap justify-end">
                        {inventoryItem.item.type === 'CONSUMABLE' ? (
                          <button
                            onClick={() => handleConsumeItem(inventoryItem.item.id)}
                            disabled={loading}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all shadow-lg font-semibold"
                          >
                            🧪 Consumir
                          </button>
                        ) : (
                          <button
                            onClick={() => isEquipped ? handleUnequipItem(inventoryItem.item.id) : handleEquipItem(inventoryItem.item.id)}
                            disabled={loading}
                            className={`px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-all shadow-lg font-semibold ${
                              isEquipped 
                                ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700' 
                                : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700'
                            }`}
                          >
                            {isEquipped ? '🔓 Desequipar' : '⚡ Equipar'}
                          </button>
                        )}
                        {isEnhanceable && (
                          <button
                            onClick={() => setEnhanceTarget(inventoryItem)}
                            disabled={loading}
                            className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-2 rounded-lg text-sm hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 transition-all shadow-lg font-semibold"
                          >
                            ⚒️ Aprimorar
                          </button>
                        )}
                        {!isEquipped && inventoryItem.item.type !== 'CONSUMABLE' && (
                          <button
                            onClick={() => handleTransferToGlobal(inventoryItem.item.id)}
                            disabled={loading}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all shadow-lg font-semibold"
                          >
                            🌐 Global
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Diálogo de aprimoramento ⚒️ */}
        {enhanceTarget && selectedCharacter && (
          <EnhancementDialog
            open={!!enhanceTarget}
            onClose={() => setEnhanceTarget(null)}
            characterId={selectedCharacter}
            inventoryId={enhanceTarget.id}
            itemName={enhanceTarget.item.name}
            onChanged={() => {
              fetchCharacterInventory(selectedCharacter);
              fetchEquippedItems(selectedCharacter);
            }}
          />
        )}
      </div>
    </div>
  );
}
