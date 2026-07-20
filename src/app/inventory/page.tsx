'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { sellUnitPrice as sellPrice } from '@/lib/sellPricing';
import { ethers } from 'ethers';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import EnhancementDialog from '@/components/EnhancementDialog';
import ForgeDialog from '@/components/crafting/ForgeDialog';
import AlchemyDialog from '@/components/crafting/AlchemyDialog';
import ProcessingDialog from '@/components/crafting/ProcessingDialog';
import CookingDialog from '@/components/crafting/CookingDialog';
import VaultBackdrop from '@/components/inventory/VaultBackdrop';
import InventoryPanel from '@/components/inventory/InventoryPanel';
import TransferQuantityDialog from '@/components/inventory/TransferQuantityDialog';
import BankPanel from '@/components/inventory/BankPanel';
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider';
import { getWalletTxErrorMessage } from '@/lib/walletErrors';
import { getPolygonFeeOverrides } from '@/lib/gasFees';
import { getSlotTypeFromItemType } from '@/lib/equipmentSlot';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { localizeItemName } from '@/lib/i18n/catalog';

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

export default function InventoryPage() {
  const { locale, t } = useI18n();
  const { data: session } = useSession();
  // Personagem ATIVO global: o inventário sempre mostra o herói selecionado na
  // navbar — sem seletor próprio nesta página.
  const { activeCharacter, activeCharacterId, refresh: refreshActiveCharacter } = useActiveCharacter();
  const selectedCharacter = activeCharacterId ?? '';
  const [userInventory, setUserInventory] = useState<UserInventoryItem[]>([]);
  const [characterInventory, setCharacterInventory] = useState<CharacterInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [enhanceTarget, setEnhanceTarget] = useState<{ inventoryId: string; itemName: string; category?: 'WEAPON' | 'ARMOR' } | null>(null);
  // Dialogs de profissão (Forja/Alquimia/Processamento) abertas pelo card do insumo
  // — mesmo padrão do aprimoramento: nada de redirecionar para a loja do NPC.
  const [craftTarget, setCraftTarget] = useState<{ craft: 'alchemy' | 'forge' | 'process' | 'cook'; itemName: string } | null>(null);
  // Diálogo de quantidade ao arrastar uma pilha (>1) entre inventários.
  const [transferTarget, setTransferTarget] = useState<{
    item: Item;
    maxQuantity: number;
    destination: 'character' | 'global';
  } | null>(null);
  // Gold da poupança da conta (User.goldBalance) — reservado a caminho do claim.
  const [bankGold, setBankGold] = useState<number | null>(null);
  // Saldo GOLD on-chain: o Baú Geral representa a carteira do jogador, então a
  // barra de moedas dele mostra o token GOLD de verdade (mintado via claim).
  const [onchainGold, setOnchainGold] = useState<string | null>(null);
  // Slots do Baú Geral (User.globalInventorySlots) — expansível como o do personagem.
  const [globalSlots, setGlobalSlots] = useState<number>(GLOBAL_SLOTS_DEFAULT);
  // Flags de "expandindo…" para desabilitar o botão durante o pagamento on-chain.
  const [expandingChar, setExpandingChar] = useState(false);
  const [expandingGlobal, setExpandingGlobal] = useState(false);

  useEffect(() => {
    fetchUserInventory();
    fetchBankGold();
    fetchOnchainGold();
  }, []);

  useEffect(() => {
    if (selectedCharacter) {
      fetchCharacterInventory(selectedCharacter);
    } else {
      setCharacterInventory([]);
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

  const fetchOnchainGold = async () => {
    try {
      const response = await fetch('/api/wallet/gold-balance', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const n = Number(data?.formatted);
        setOnchainGold(data?.walletLinked && Number.isFinite(n) ? n.toLocaleString('pt-BR') : null);
      }
    } catch (error) {
      console.error('Error fetching on-chain gold:', error);
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
            ? t('📦 {n}x transferred to the character!', { n: quantity })
            : t('📦 Item transferred to the character!'),
          { duration: 3000 }
        );
      } else {
        const error = await response.json();
        toast.error(t('❌ Transfer error: {error}', { error: error.error }), {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error transferring item:', error);
      toast.error(t('💥 Unexpected transfer error'), {
        duration: 4000,
      });
    }
    setLoading(false);
  };

  const handleTransferToGlobal = async (itemId: string, quantity: number = 1) => {
    if (!selectedCharacter) {
      toast.error(t('⚠️ Select a character first'), {
        duration: 3000,
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
            ? t('🌐 {n}x transferred to the global inventory!', { n: quantity })
            : t('🌐 Item transferred to the global inventory!'),
          {
          duration: 3000,
        });
      } else {
        const error = await response.json();
        toast.error(t('❌ Transfer error: {error}', { error: error.error }), {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Error transferring item to global:', error);
      toast.error(t('💥 Unexpected transfer error'), {
        duration: 4000,
      });
    }
    setLoading(false);
  };

  // 🔥 Vender ao ferreiro (burn) a partir do INVENTÁRIO DO PERSONAGEM: destrói a
  // peça por metade do preço; o gold vai pra CARTEIRA do personagem (Character.gold).
  // quantity vem do ItemTooltip: 1 direto no clique (equipamento/pilha única) ou a
  // quantidade escolhida no SellQuantityDialog quando a pilha tem mais de 1 item.
  const handleSellFromCharacter = async (inventoryId: string, quantity: number = 1) => {
    if (!selectedCharacter) {
      toast.error(t('⚠️ Select a character first'), { duration: 3000 });
      return;
    }
    const row = characterInventory.find((i) => i.id === inventoryId);
    const name = row?.item?.name ? localizeItemName(row.item.name, locale) : t('item');
    // sellPricing (fonte única): peça desgastada vende por menos.
    const unitPrice = row?.item ? sellPrice(row.item, row.durability, row.maxDurability) : 0;
    const total = unitPrice * quantity;
    const label = quantity > 1 ? `${quantity}x ${name}` : name;
    if (!window.confirm(t('Sell {label} to the blacksmith for {total} gold?\nThe item will be destroyed (cannot be undone).', { label, total }))) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/character/${selectedCharacter}/sell-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId, quantity }),
      });
      if (res.ok) {
        const data = await res.json();
        fetchCharacterInventory(selectedCharacter);
        refreshActiveCharacter();
        toast.success(data?.message ?? t('💰 Sold for {total} gold!', { total }), { duration: 3000 });
      } else {
        const error = await res.json();
        toast.error(`❌ ${error?.error ?? t('Failed to sell')}`, { duration: 4000 });
      }
    } catch (error) {
      console.error('Error selling item:', error);
      toast.error(t('💥 Unexpected error selling'), { duration: 4000 });
    }
    setLoading(false);
  };

  // 🔥 Vender ao ferreiro (burn) a partir do BAÚ GERAL: destrói a peça por metade do
  // preço; o gold vai pro BANCO da conta (User.goldBalance), exibido no rodapé do baú.
  const handleSellFromGlobal = async (inventoryId: string, quantity: number = 1) => {
    const row = userInventory.find((i) => i.id === inventoryId);
    const name = row?.item?.name ? localizeItemName(row.item.name, locale) : t('item');
    const unitPrice = row?.item ? sellPrice(row.item) : 0; // sellPricing (fonte única)
    const total = unitPrice * quantity;
    const label = quantity > 1 ? `${quantity}x ${name}` : name;
    if (!window.confirm(t('Sell {label} to the blacksmith for {total} gold?\nThe gold goes to the bank. The item will be destroyed (cannot be undone).', { label, total }))) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/sell-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId, quantity }),
      });
      if (res.ok) {
        const data = await res.json();
        fetchUserInventory();
        fetchBankGold();
        toast.success(data?.message ?? t('💰 Sold for {total} gold!', { total }), { duration: 3000 });
      } else {
        const error = await res.json();
        toast.error(`❌ ${error?.error ?? t('Failed to sell')}`, { duration: 4000 });
      }
    } catch (error) {
      console.error('Error selling global item:', error);
      toast.error(t('💥 Unexpected error selling'), { duration: 4000 });
    }
    setLoading(false);
  };

  // 🔀 Drag & drop entre inventários. O item arrastado carrega a quantidade
  // disponível na pilha de origem; pilhas (>1) abrem o diálogo de quantidade,
  // itens únicos (equipamento) transferem direto.
  const handleDropToCharacter = (item: any, availableQuantity: number) => {
    if (!selectedCharacter) {
      toast.error(t('⚠️ Select a character first'), { duration: 3000 });
      return;
    }
    if (availableQuantity > 1) {
      setTransferTarget({ item, maxQuantity: availableQuantity, destination: 'character' });
    } else {
      handleTransferToCharacter(item.id, 1);
    }
  };

  const handleDropToGlobal = (item: any, availableQuantity: number) => {
    if (availableQuantity > 1) {
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
      toast.error(t('MetaMask not found'));
      return null;
    }

    const cfgRes = await fetch('/api/gold/spend-config', { cache: 'no-store' });
    const cfgJson = await cfgRes.json();
    if (!cfgRes.ok) {
      throw new Error(cfgJson?.error || t('Failed to load GOLD config'));
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
      toast.error(t('Switch to chainId {chainId} in MetaMask', { chainId }));
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
      toast.error(t('💰 Insufficient GOLD on-chain! You need {n} GOLD.', { n: totalCostGold }));
      return null;
    }

    const payTx = await gold.transfer(treasuryAddress, costWei, await getPolygonFeeOverrides(provider));
    toast.success(t('Payment sent! Awaiting confirmation…'));
    const payReceipt = await payTx.wait();
    if (!payReceipt || payReceipt.status !== 1) {
      throw new Error(t('Payment failed'));
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
      toast.error(t('⚠️ Select a character first'));
      return;
    }
    setExpandingChar(true);
    try {
      // 1) Tenta pagar OFF-CHAIN, com o GOLD "na mão" do personagem (sem txHash).
      let response: Response | null = await fetch(
        `/api/character/${selectedCharacter}/expand-inventory`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slots: EXPAND_SLOTS }),
        }
      );

      // 2) Sem GOLD na mão → cai pro fluxo ON-CHAIN (compra pela carteira).
      if (response.status === 402) {
        const info = await response.json().catch(() => null);
        if (info?.requiresPayment) {
          toast(t('💰 No GOLD on hand — paying on-chain via wallet…'));
          const txHash = await payGoldOnChain(EXPAND_COST_GOLD);
          if (!txHash) return;
          response = await confirmExpansion(
            `/api/character/${selectedCharacter}/expand-inventory`,
            txHash
          );
        }
      }

      if (response?.ok) {
        toast.success(t('📦 +{n} slots on the character! ({cost} GOLD)', { n: EXPAND_SLOTS, cost: EXPAND_COST_GOLD }));
        refreshActiveCharacter();
      } else {
        const error = await response?.json().catch(() => null);
        toast.error(`❌ ${error?.error || t('Failed to confirm expansion')}`);
      }
    } catch (error) {
      console.error('Error expanding character inventory:', error);
      toast.error(getWalletTxErrorMessage(error, t('💥 Unexpected error expanding inventory')));
    } finally {
      setExpandingChar(false);
    }
  };

  const handleExpandGlobalInventory = async () => {
    setExpandingGlobal(true);
    try {
      // 1) Tenta pagar OFF-CHAIN com o GOLD do banco/Baú Geral (sem txHash).
      let response: Response | null = await fetch('/api/user/expand-global-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: EXPAND_SLOTS }),
      });

      // 2) Sem GOLD no banco → cai pro fluxo ON-CHAIN (compra pela carteira).
      if (response.status === 402) {
        const info = await response.json().catch(() => null);
        if (info?.requiresPayment) {
          toast(t('💰 No GOLD in the bank — paying on-chain via wallet…'));
          const txHash = await payGoldOnChain(EXPAND_COST_GOLD);
          if (!txHash) return;
          response = await confirmExpansion('/api/user/expand-global-inventory', txHash);
        }
      }

      if (response?.ok) {
        const data = await response.json().catch(() => null);
        if (typeof data?.globalInventorySlots === 'number') {
          setGlobalSlots(data.globalInventorySlots);
        }
        // Re-sincroniza o saldo do banco (mudou se pagou off-chain).
        fetchBankGold();
        toast.success(t('🌐 +{n} slots in the Global Chest! ({cost} GOLD)', { n: EXPAND_SLOTS, cost: EXPAND_COST_GOLD }));
      } else {
        const error = await response?.json().catch(() => null);
        toast.error(`❌ ${error?.error || t('Failed to confirm expansion')}`);
      }
    } catch (error) {
      console.error('Error expanding global inventory:', error);
      toast.error(getWalletTxErrorMessage(error, t('💥 Unexpected error expanding the Global Chest')));
    } finally {
      setExpandingGlobal(false);
    }
  };

  const handleEquipItem = async (itemId: string) => {
    if (!selectedCharacter) {
      toast.error(t('⚠️ Select a character first'), {
        duration: 3000,
      });
      return;
    }

    // Determinar o tipo de slot baseado no tipo do item
    const item = characterInventory.find(inv => inv.item.id === itemId)?.item;
    if (!item) {
      toast.error(t('❌ Item not found'), {
        duration: 3000,
      });
      return;
    }

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

  if (!session) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">{t('Restricted Access')}</h1>
          <p className="text-text-secondary">{t('Please sign in to see your inventory')}</p>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
    <div className="relative min-h-[100dvh] text-white overflow-hidden">
      {/* Cenário animado da câmara do tesouro */}
      <div className="fixed inset-0 z-0">
        <VaultBackdrop />
      </div>

      <div className="relative z-10 container mx-auto p-4 pt-20" style={{ fontFamily: "'Barlow', sans-serif" }}>
        <div className="mb-8">
          <h1 className="text-4xl font-black text-[#ece7da] mb-2" style={{ letterSpacing: '0.5px' }}>
            📦 {t('Inventory')}
          </h1>
          <p className="text-[#8a8a90]">{t('Manage your items and equipment')}</p>
        </div>

        {/* ⛓️ Claim de GOLD: bolso do herói → token on-chain na carteira */}
        <BankPanel characterId={activeCharacterId} onChanged={() => { fetchBankGold(); fetchOnchainGold(); }} />

        {!selectedCharacter && (
          <p className="mb-3 text-xs text-amber-300/80">{t('Select a character in the navbar to equip and transfer items.')}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ⚔️ Inventário do herói ativo — mesma UI da ficha do personagem */}
          <InventoryPanel
            title={activeCharacter ? t('Inventory — {name}', { name: activeCharacter.name }) : t('Inventory')}
            items={characterInventory as any}
            totalSlots={Number(activeCharacter?.inventorySlots) || 20}
            accent="#d9a441"
            characterId={selectedCharacter}
            onEquip={(itemId) => handleEquipItem(itemId)}
            onUnequip={(itemId) => handleUnequipItem(itemId)}
            onConsume={(itemId) => handleConsumeItem(itemId)}
            onEnhance={(invId, name, category) => setEnhanceTarget({ inventoryId: invId, itemName: name, category })}
            onOpenCraft={(craft, itemName) => setCraftTarget({ craft, itemName })}
            onSendToGlobal={(itemId, quantity) => handleTransferToGlobal(itemId, quantity)}
            onSell={(inventoryId, quantity) => handleSellFromCharacter(inventoryId, quantity)}
            onExpand={selectedCharacter ? handleExpandCharacterInventory : undefined}
            expanding={expandingChar}
            expandTitle={t('Expand +{n} slots (cost: {cost} GOLD)', { n: EXPAND_SLOTS, cost: EXPAND_COST_GOLD })}
            goldText={typeof activeCharacter?.gold === 'number' ? activeCharacter.gold.toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US') : '0'}
            dragSource="character"
            onItemDropped={handleDropToCharacter}
          />

          {/* 🌐 Baú Geral — mesma UI, exibindo o inventário global da conta */}
          <InventoryPanel
            title={t('Global Chest')}
            items={userInventory as any}
            totalSlots={globalSlots}
            accent="#3b82f6"
            characterId={selectedCharacter}
            slotLabel={t('Chest Slots')}
            onTransfer={(itemId, quantity = 1) => {
              // Pilha > 1: abre o diálogo de quantidade (mesmo do drag & drop) em
              // vez de mandar sempre 1 — permite escolher um valor ou enviar tudo.
              if (quantity > 1) {
                const row = userInventory.find((i) => i.item.id === itemId);
                if (row) {
                  setTransferTarget({ item: row.item, maxQuantity: quantity, destination: 'character' });
                  return;
                }
              }
              handleTransferToCharacter(itemId, 1);
            }}
            onSell={(inventoryId, quantity) => handleSellFromGlobal(inventoryId, quantity)}
            onExpand={handleExpandGlobalInventory}
            expanding={expandingGlobal}
            expandTitle={`Expandir +${EXPAND_SLOTS} slots (custo: ${EXPAND_COST_GOLD} GOLD)`}
            // O Baú Geral é a carteira on-chain: a barra de moedas mostra o token
            // GOLD mintado via claim (— sem carteira vinculada).
            goldText={onchainGold ?? '—'}
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
                ? (activeCharacter?.name || t('character'))
                : t('Global Chest')
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
            }}
          />
        )}

        {/* Dialogs de profissão ⚒️⚗️ — abertas pelo card do material/ingrediente */}
        <ForgeDialog
          open={craftTarget?.craft === 'forge'}
          onClose={() => setCraftTarget(null)}
          characterId={selectedCharacter || undefined}
          characterGold={typeof activeCharacter?.gold === 'number' ? activeCharacter.gold : null}
          initialMaterialName={craftTarget?.craft === 'forge' ? craftTarget.itemName : undefined}
          onChanged={() => {
            fetchCharacterInventory(selectedCharacter);
            refreshActiveCharacter();
          }}
        />
        <AlchemyDialog
          open={craftTarget?.craft === 'alchemy'}
          onClose={() => setCraftTarget(null)}
          characterId={selectedCharacter || undefined}
          characterGold={typeof activeCharacter?.gold === 'number' ? activeCharacter.gold : null}
          initialPlaceName={craftTarget?.craft === 'alchemy' ? craftTarget.itemName : undefined}
          onChanged={() => {
            fetchCharacterInventory(selectedCharacter);
            refreshActiveCharacter();
          }}
        />
        <ProcessingDialog
          open={craftTarget?.craft === 'process'}
          onClose={() => setCraftTarget(null)}
          characterId={selectedCharacter || undefined}
          characterGold={typeof activeCharacter?.gold === 'number' ? activeCharacter.gold : null}
          initialInputName={craftTarget?.craft === 'process' ? craftTarget.itemName : undefined}
          onChanged={() => {
            fetchCharacterInventory(selectedCharacter);
            refreshActiveCharacter();
          }}
        />
        <CookingDialog
          open={craftTarget?.craft === 'cook'}
          onClose={() => setCraftTarget(null)}
          characterId={selectedCharacter || undefined}
          characterGold={typeof activeCharacter?.gold === 'number' ? activeCharacter.gold : null}
          initialInputName={craftTarget?.craft === 'cook' ? craftTarget.itemName : undefined}
          onChanged={() => {
            fetchCharacterInventory(selectedCharacter);
            refreshActiveCharacter();
          }}
        />
      </div>
    </div>
    </DndProvider>
  );
}
