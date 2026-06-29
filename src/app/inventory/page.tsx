'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import EnhancementDialog from '@/components/EnhancementDialog';
import VaultBackdrop from '@/components/inventory/VaultBackdrop';
import InventoryPanel from '@/components/inventory/InventoryPanel';
import TransferQuantityDialog from '@/components/inventory/TransferQuantityDialog';
import BankPanel from '@/components/inventory/BankPanel';
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider';
import { getWalletTxErrorMessage } from '@/lib/walletErrors';
import { getPolygonFeeOverrides } from '@/lib/gasFees';

// Baú Geral começa com 50 espaços (User.globalInventorySlots), expansível como o do personagem.
const GLOBAL_SLOTS_DEFAULT = 50;
// Expansão (espelha o personagem): +5 slots por 1000 GOLD on-chain.
const EXPAND_SLOTS = 5;
const EXPAND_COST_GOLD = 1000;

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

interface EquippedItem {
  id: string;
  slot: string;
  item: Item;
}

export default function InventoryPage() {
  const { data: session } = useSession();
  // Personagem ATIVO global: o inventário sempre mostra o herói selecionado na
  // navbar — sem seletor próprio nesta página.
  const { activeCharacter, activeCharacterId, refresh: refreshActiveCharacter } = useActiveCharacter();
  const selectedCharacter = activeCharacterId ?? '';
  const [userInventory, setUserInventory] = useState<UserInventoryItem[]>([]);
  const [characterInventory, setCharacterInventory] = useState<CharacterInventoryItem[]>([]);
  const [equippedItems, setEquippedItems] = useState<EquippedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [enhanceTarget, setEnhanceTarget] = useState<{ inventoryId: string; itemName: string; category?: 'WEAPON' | 'ARMOR' } | null>(null);
  // Diálogo de quantidade ao arrastar uma pilha (>1) entre inventários.
  const [transferTarget, setTransferTarget] = useState<{
    item: Item;
    maxQuantity: number;
    destination: 'character' | 'global';
  } | null>(null);
  // Gold da poupança da conta (User.goldBalance), exibido na barra de moedas do baú global.
  const [bankGold, setBankGold] = useState<number | null>(null);
  // Slots do Baú Geral (User.globalInventorySlots) — expansível como o do personagem.
  const [globalSlots, setGlobalSlots] = useState<number>(GLOBAL_SLOTS_DEFAULT);
  // Flags de "expandindo…" para desabilitar o botão durante o pagamento on-chain.
  const [expandingChar, setExpandingChar] = useState(false);
  const [expandingGlobal, setExpandingGlobal] = useState(false);

  useEffect(() => {
    fetchUserInventory();
    fetchBankGold();
  }, []);

  useEffect(() => {
    if (selectedCharacter) {
      fetchCharacterInventory(selectedCharacter);
      fetchEquippedItems(selectedCharacter);
    } else {
      setCharacterInventory([]);
      setEquippedItems([]);
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

  const fetchBankGold = async () => {
    try {
      const response = await fetch('/api/bank/status');
      if (response.ok) {
        const data = await response.json();
        setBankGold(Number(data?.bankGold ?? 0));
        setGlobalSlots(Number(data?.globalInventorySlots ?? GLOBAL_SLOTS_DEFAULT));
      }
    } catch (error) {
      console.error('Error fetching bank gold:', error);
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

  const handleTransferToCharacter = async (itemId: string, quantity: number = 1) => {
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
        body: JSON.stringify({ itemId, quantity }),
      });

      if (response.ok) {
        // Refresh both inventories
        fetchUserInventory();
        fetchCharacterInventory(selectedCharacter);
        toast.success(
          quantity > 1
            ? `📦 ${quantity}x transferidos para o personagem!`
            : '📦 Item transferido para o personagem!',
          { duration: 3000 }
        );
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

  const handleTransferToGlobal = async (itemId: string, quantity: number = 1) => {
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
        body: JSON.stringify({ itemId, quantity }),
      });

      if (response.ok) {
        // Refresh both inventories
        fetchUserInventory();
        fetchCharacterInventory(selectedCharacter);
        toast.success(
          quantity > 1
            ? `🌐 ${quantity}x transferidos para o inventário global!`
            : '🌐 Item transferido para o inventário global!',
          {
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

  // 🔀 Drag & drop entre inventários. O item arrastado carrega a quantidade
  // disponível na pilha de origem; pilhas (>1) abrem o diálogo de quantidade,
  // itens únicos (equipamento) transferem direto.
  const handleDropToCharacter = (item: any, availableQuantity: number) => {
    if (!selectedCharacter) {
      toast.error('⚠️ Selecione um personagem primeiro', { duration: 3000 });
      return;
    }
    if (availableQuantity > 1) {
      setTransferTarget({ item, maxQuantity: availableQuantity, destination: 'character' });
    } else {
      handleTransferToCharacter(item.id, 1);
    }
  };

  const handleDropToGlobal = (item: any, availableQuantity: number) => {
    // Itens equipados não podem ir ao global (handler já avisa); vão direto p/ o toast.
    if (availableQuantity > 1 && !isItemEquipped(item.id)) {
      setTransferTarget({ item, maxQuantity: availableQuantity, destination: 'global' });
    } else {
      handleTransferToGlobal(item.id, 1);
    }
  };

  const handleConfirmTransfer = (quantity: number) => {
    if (!transferTarget) return;
    if (transferTarget.destination === 'character') {
      handleTransferToCharacter(transferTarget.item.id, quantity);
    } else {
      handleTransferToGlobal(transferTarget.item.id, quantity);
    }
    setTransferTarget(null);
  };

  // 💳 Pagamento on-chain de GOLD para a treasury (mesmo fluxo do expand da ficha).
  // Retorna o txHash em sucesso, ou null se faltar carteira / rede / saldo / o
  // usuário cancelar (já exibe o toast apropriado). Não lança.
  const payGoldOnChain = async (totalCostGold: number): Promise<string | null> => {
    const eth = (window as any)?.ethereum;
    if (!eth) {
      toast.error('MetaMask não encontrada');
      return null;
    }

    const cfgRes = await fetch('/api/gold/spend-config', { cache: 'no-store' });
    const cfgJson = await cfgRes.json();
    if (!cfgRes.ok) {
      throw new Error(cfgJson?.error || 'Falha ao carregar config do GOLD');
    }

    const { contractAddress, chainId, treasuryAddress } = cfgJson as {
      contractAddress: string;
      chainId: number;
      treasuryAddress: string;
    };

    const provider = new ethers.BrowserProvider(eth);
    await provider.send('eth_requestAccounts', []);

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== Number(chainId)) {
      toast.error(`Troque a rede para chainId ${chainId} na MetaMask`);
      return null;
    }

    const signer = await provider.getSigner();
    const from = await signer.getAddress();

    const erc20Abi = [
      'function decimals() view returns (uint8)',
      'function balanceOf(address) view returns (uint256)',
      'function transfer(address to, uint256 value) returns (bool)',
    ] as const;

    const gold = new ethers.Contract(contractAddress, erc20Abi, signer);
    const decimals = Number(await gold.decimals());
    const costWei = ethers.parseUnits(String(totalCostGold), decimals);
    const balanceWei = (await gold.balanceOf(from)) as bigint;

    if (balanceWei < costWei) {
      toast.error(`💰 GOLD insuficiente on-chain! Você precisa de ${totalCostGold} GOLD.`);
      return null;
    }

    const payTx = await gold.transfer(treasuryAddress, costWei, await getPolygonFeeOverrides(provider));
    toast.success('Pagamento enviado! Aguardando confirmação…');
    const payReceipt = await payTx.wait();
    if (!payReceipt || payReceipt.status !== 1) {
      throw new Error('Pagamento falhou');
    }
    return payTx.hash as string;
  };

  // Confirma a expansão no servidor com retry — RPCs podem demorar a propagar o tx.
  const confirmExpansion = async (url: string, txHash: string): Promise<Response | null> => {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: EXPAND_SLOTS, txHash }),
      });
      if (response.ok) break;

      let lastError: any = null;
      try { lastError = await response.json(); } catch { lastError = null; }
      const msg = String(lastError?.error || '').toLowerCase();
      const looksLikePropagation = msg.includes('ainda não encontrada') || msg.includes('not found');
      if (!looksLikePropagation) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return response;
  };

  const handleExpandCharacterInventory = async () => {
    if (!selectedCharacter) {
      toast.error('⚠️ Selecione um personagem primeiro');
      return;
    }
    setExpandingChar(true);
    try {
      const txHash = await payGoldOnChain(EXPAND_COST_GOLD);
      if (!txHash) return;

      const response = await confirmExpansion(
        `/api/character/${selectedCharacter}/expand-inventory`,
        txHash
      );
      if (response?.ok) {
        toast.success(`📦 +${EXPAND_SLOTS} slots no personagem! (${EXPAND_COST_GOLD} GOLD)`);
        refreshActiveCharacter();
      } else {
        const error = await response?.json().catch(() => null);
        toast.error(`❌ ${error?.error || 'Falha ao confirmar expansão'}`);
      }
    } catch (error) {
      console.error('Error expanding character inventory:', error);
      toast.error(getWalletTxErrorMessage(error, '💥 Erro inesperado ao expandir inventário'));
    } finally {
      setExpandingChar(false);
    }
  };

  const handleExpandGlobalInventory = async () => {
    setExpandingGlobal(true);
    try {
      const txHash = await payGoldOnChain(EXPAND_COST_GOLD);
      if (!txHash) return;

      const response = await confirmExpansion('/api/user/expand-global-inventory', txHash);
      if (response?.ok) {
        const data = await response.json().catch(() => null);
        if (typeof data?.globalInventorySlots === 'number') {
          setGlobalSlots(data.globalInventorySlots);
        } else {
          fetchBankGold();
        }
        toast.success(`🌐 +${EXPAND_SLOTS} slots no Baú Geral! (${EXPAND_COST_GOLD} GOLD)`);
      } else {
        const error = await response?.json().catch(() => null);
        toast.error(`❌ ${error?.error || 'Falha ao confirmar expansão'}`);
      }
    } catch (error) {
      console.error('Error expanding global inventory:', error);
      toast.error(getWalletTxErrorMessage(error, '💥 Erro inesperado ao expandir Baú Geral'));
    } finally {
      setExpandingGlobal(false);
    }
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
        case 'BELT':
          return 'BELT';
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

        {/* 🏦 Banco: poupança da conta + carteira do personagem ativo */}
        <BankPanel characterId={activeCharacterId} onChanged={fetchBankGold} />

        {!selectedCharacter && (
          <p className="mb-3 text-xs text-amber-300/80">Selecione um personagem na navbar para equipar e transferir itens.</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ⚔️ Inventário do herói ativo — mesma UI da ficha do personagem */}
          <InventoryPanel
            title={activeCharacter ? `Inventário — ${activeCharacter.name}` : 'Inventário'}
            items={characterInventory as any}
            totalSlots={Number(activeCharacter?.inventorySlots) || 10}
            accent="#d9a441"
            characterId={selectedCharacter}
            isEquipped={(itemId) => isItemEquipped(itemId)}
            onEquip={(itemId) => handleEquipItem(itemId)}
            onUnequip={(itemId) => handleUnequipItem(itemId)}
            onConsume={(itemId) => handleConsumeItem(itemId)}
            onEnhance={(invId, name, category) => setEnhanceTarget({ inventoryId: invId, itemName: name, category })}
            onSendToGlobal={(itemId, quantity) => handleTransferToGlobal(itemId, quantity)}
            onExpand={selectedCharacter ? handleExpandCharacterInventory : undefined}
            expanding={expandingChar}
            expandTitle={`Expandir +${EXPAND_SLOTS} slots (custo: ${EXPAND_COST_GOLD} GOLD)`}
            goldText={typeof activeCharacter?.gold === 'number' ? activeCharacter.gold.toLocaleString('pt-BR') : '0'}
            dragSource="character"
            onItemDropped={handleDropToCharacter}
          />

          {/* 🌐 Baú Geral — mesma UI, exibindo o inventário global da conta */}
          <InventoryPanel
            title="Baú Geral"
            items={userInventory as any}
            totalSlots={globalSlots}
            accent="#3b82f6"
            characterId={selectedCharacter}
            slotLabel="Slots do Baú"
            onTransfer={(itemId) => handleTransferToCharacter(itemId)}
            onExpand={handleExpandGlobalInventory}
            expanding={expandingGlobal}
            expandTitle={`Expandir +${EXPAND_SLOTS} slots (custo: ${EXPAND_COST_GOLD} GOLD)`}
            goldText={bankGold != null ? bankGold.toLocaleString('pt-BR') : '0'}
            dragSource="global"
            onItemDropped={handleDropToGlobal}
          />
        </div>

        {/* Diálogo de quantidade ao arrastar pilhas entre inventários 📦 */}
        {transferTarget && (
          <TransferQuantityDialog
            open={!!transferTarget}
            item={transferTarget.item as any}
            maxQuantity={transferTarget.maxQuantity}
            destinationLabel={
              transferTarget.destination === 'character'
                ? (activeCharacter?.name || 'personagem')
                : 'Baú Geral'
            }
            destinationAccent={transferTarget.destination === 'character' ? '#d9a441' : '#3b82f6'}
            onConfirm={handleConfirmTransfer}
            onClose={() => setTransferTarget(null)}
          />
        )}

        {/* Diálogo de aprimoramento ⚒️ */}
        {enhanceTarget && selectedCharacter && (
          <EnhancementDialog
            open={!!enhanceTarget}
            onClose={() => setEnhanceTarget(null)}
            characterId={selectedCharacter}
            inventoryId={enhanceTarget.inventoryId || undefined}
            itemName={enhanceTarget.itemName}
            filterCategory={enhanceTarget.category}
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
