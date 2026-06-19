'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import EnhancementDialog from '@/components/EnhancementDialog';
import VaultBackdrop from '@/components/inventory/VaultBackdrop';
import { DraggableItem } from '@/components/DraggableItem';
import { CharacterItemGrid } from '@/components/inventory/CharacterItemGrid';

interface Item {
  id: string;
  name: string;
  type: string;
  stats: any;
  description?: string;
  image?: string | null;
  level?: number;
  goldPrice?: number;
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
  const [enhanceTarget, setEnhanceTarget] = useState<{ inventoryId: string; itemName: string } | null>(null);

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
    <DndProvider backend={HTML5Backend}>
    <div className="relative min-h-screen text-white overflow-hidden">
      {/* Cenário animado da câmara do tesouro */}
      <div className="fixed inset-0 z-0">
        <VaultBackdrop />
      </div>

      <div className="relative z-10 container mx-auto p-4 pt-20">
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-dark mb-2">
            📦 Inventário
          </h1>
          <p className="text-text-secondary">Gerencie seus itens e equipamentos</p>
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
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name} ({character.class})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Global Inventory */}
          <div className="bg-surface/50 border border-white/20 rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-text-primary flex items-center gap-2">
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
              <>
                {!selectedCharacter && (
                  <p className="mb-2 text-xs text-amber-300/80">Selecione um personagem para transferir os itens.</p>
                )}
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))', gap: 5 }}>
                  {userInventory.map((inventoryItem) => (
                    <div key={inventoryItem.id} className="relative">
                      <DraggableItem
                        item={inventoryItem.item as any}
                        compact
                        accent="#3b82f6"
                        characterId={selectedCharacter}
                        onTransfer={(itemId) => handleTransferToCharacter(itemId)}
                      />
                      {inventoryItem.quantity > 1 && (
                        <span
                          className="absolute top-0 left-0 text-[10px] font-black leading-none text-white px-0.5"
                          style={{ textShadow: '0 1px 2px #000, 0 0 3px #000' }}
                        >
                          x{inventoryItem.quantity}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Character Inventory */}
          <div className="bg-surface/50 border border-white/20 rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-text-primary flex items-center gap-2">
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
              <CharacterItemGrid
                items={characterInventory as any}
                isEquipped={(itemId) => isItemEquipped(itemId)}
                accent="#d9a441"
                characterId={selectedCharacter}
                onEquip={(itemId) => handleEquipItem(itemId)}
                onUnequip={(itemId) => handleUnequipItem(itemId)}
                onConsume={(itemId) => handleConsumeItem(itemId)}
                onEnhance={(invId, name) => setEnhanceTarget({ inventoryId: invId, itemName: name })}
                onSendToGlobal={(itemId) => handleTransferToGlobal(itemId)}
              />
            )}
          </div>
        </div>

        {/* Diálogo de aprimoramento ⚒️ */}
        {enhanceTarget && selectedCharacter && (
          <EnhancementDialog
            open={!!enhanceTarget}
            onClose={() => setEnhanceTarget(null)}
            characterId={selectedCharacter}
            inventoryId={enhanceTarget.inventoryId || undefined}
            itemName={enhanceTarget.itemName}
            items={characterInventory
              .filter((i) => i.item.type !== 'CONSUMABLE')
              .map((i) => ({
                id: i.id,
                name: i.item.name,
                type: i.item.type,
                image: i.item.image,
                enhancementLevel: i.enhancementLevel || 0,
              }))}
            onChanged={() => {
              fetchCharacterInventory(selectedCharacter);
              fetchEquippedItems(selectedCharacter);
            }}
          />
        )}
      </div>
    </div>
    </DndProvider>
  );
}
