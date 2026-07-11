'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sword, Zap, Brain, Star, HelpCircle, RefreshCw } from 'lucide-react';
import { Character } from '@/types/game';
import { sellUnitPrice as sellPrice } from '@/lib/sellPricing';
import { EquipmentSlotType } from '@prisma/client';
import { getRaceById, getClassById } from '@/lib/gameData';
import { applyEnhancementToStats } from '@/lib/enhancementSystem';
import { getRaceTransformations, getTransformationGlow, TRANSFORMATION_CONFIG, TransformationType } from '@/lib/transformationSystem';
import Link from 'next/link';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { EquipmentSlot } from '@/components/EquipmentSlot';
import InventoryPanel from '@/components/inventory/InventoryPanel';
import EnhancementDialog from '@/components/EnhancementDialog';
import ForgeDialog from '@/components/crafting/ForgeDialog';
import AlchemyDialog from '@/components/crafting/AlchemyDialog';
import ProcessingDialog from '@/components/crafting/ProcessingDialog';
import CookingDialog from '@/components/crafting/CookingDialog';
import CharacterHistory from '@/components/CharacterHistory';
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop';
import PersonSilhouette from '@/components/character/PersonSilhouette';
import { getBlendedVisual } from '@/lib/creationVisuals';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { getWalletTxErrorMessage } from '@/lib/walletErrors';
import { getPolygonFeeOverrides } from '@/lib/gasFees';
import { resolveImageUrl } from '@/lib/imageUrl';
import { getSlotTypeFromItemType } from '@/lib/equipmentSlot';

import { Item } from '@/types/item';

// Paleta chumbo + ouro envelhecido — a mesma da EnhancementDialog, para que a
// ficha inteira leia como um conjunto de janelas do mesmo jogo.
const GOLD = '#c9a25f';
const GOLD_BRIGHT = '#e7c682';
const FRAME = '#8a6d3b';
const PANEL_BG = 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))';
const TITLEBAR_BG = 'linear-gradient(180deg, #2b2b2f, #1a1a1d)';

interface InventoryItem {
  id: string;
  itemId: string;
  quantity: number;
  enhancementLevel?: number;
  item: Item;
}

export default function CharacterDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [effectiveCharacterId, setEffectiveCharacterId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [expandingSlots, setExpandingSlots] = useState(false);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [goldOnchainText, setGoldOnchainText] = useState<string>('—');
  const [enhanceTarget, setEnhanceTarget] = useState<{ inventoryId: string; itemName: string; category?: 'WEAPON' | 'ARMOR' } | null>(null);
  // Dialogs de profissão (Forja/Alquimia) abertas pelo card do insumo — mesmo
  // padrão do aprimoramento: nada de redirecionar para a loja do NPC.
  const [craftTarget, setCraftTarget] = useState<{ craft: 'alchemy' | 'forge' | 'process' | 'cook'; itemName: string } | null>(null);
  // Índice da forma exibida na figura central (0 = forma original; demais = transformações).
  const [appearanceIndex, setAppearanceIndex] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const raw = Array.isArray((params as any)?.characterId)
          ? String((params as any).characterId[0] || '')
          : String((params as any)?.characterId || '');

        if (!raw) return;

        // First load the character. The API supports either DB id or numeric NFT tokenId.
        const characterResponse = await fetch(`/api/character/${raw}`);
        if (!characterResponse.ok) {
          setCharacter(null);
          return;
        }

        const characterData = await characterResponse.json();
        const resolvedId = String(characterData?.id || '');
        setEffectiveCharacterId(resolvedId);
        setCharacter(characterData);

        // Then load inventory using the resolved DB character id.
        if (resolvedId) {
          const inventoryResponse = await fetch(`/api/store/inventory?characterId=${resolvedId}`);
          if (inventoryResponse.ok) {
            const inventoryData = await inventoryResponse.json();
            setInventory(inventoryData);
          }
        }

        // Fetch on-chain GOLD balance for display.
        try {
          const goldBalRes = await fetch('/api/wallet/gold-balance', { cache: 'no-store' });
          const goldBalJson = await goldBalRes.json();
          if (goldBalRes.ok && goldBalJson?.walletLinked) {
            const formatted = String(goldBalJson?.formatted || '').trim();
            const symbol = String(goldBalJson?.symbol || 'GOLD').trim();
            setGoldOnchainText(formatted ? `${formatted} ${symbol}` : `… ${symbol}`);
          } else {
            setGoldOnchainText('—');
          }
        } catch {
          setGoldOnchainText('—');
        }

        // Fetch equipment data when implemented
        // const equipResponse = await fetch(`/api/character/${params.characterId}/equipment`);
        // if (equipResponse.ok) {
        //   const equipData = await equipResponse.json();
        //   setEquipment(equipData);
        // }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (params?.characterId) {
      fetchData();
    }
  }, [params?.characterId]);

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  if (!character) {
    return <div className="flex justify-center items-center min-h-screen">Character not found</div>;
  }

  const raceObj = getRaceById(typeof character.race === 'string' ? character.race : character.race.id);
  const classObj = getClassById(typeof character.class === 'string' ? character.class : character.class.id);

  // Identidade visual mesclando cores de raça e classe (mesmo padrão do dashboard/criação)
  const visual = getBlendedVisual(raceObj?.id, classObj?.id);

  // Função para calcular stats totais incluindo equipamentos
  const calculateTotalStats = () => {
    const baseStats = {
      hp: character.hp,
      maxHp: character.maxHp,
      mp: (character as any).mp || 0,
      maxMp: (character as any).maxMp || 50,
      stamina: character.stamina,
      maxStamina: character.maxStamina,
      str: (character.baseStats as any)?.str || 10,
      def:
        (character.attributes as any)?.def ||
        (character.attributes as any)?.defense ||
        (character.baseStats as any)?.def ||
        (character.baseStats as any)?.res ||
        5,
      agi: (character.attributes as any)?.agi || (character.baseStats as any)?.agi || 0,
      int: (character.attributes as any)?.int || (character.baseStats as any)?.int || 0
    };

    // Somar stats dos equipamentos (com o aprimoramento aplicado, igual ao combate)
    const equipmentStats = (character.equipment || []).reduce((total, equipment) => {
      const itemStats = applyEnhancementToStats(equipment.item.stats, equipment.enhancementLevel || 0);
      return {
        hp: total.hp + (itemStats.hp || 0),
        maxHp: total.maxHp + (itemStats.hp || 0), // HP adicional aumenta o max também
        mp: total.mp + (itemStats.mp || 0),
        maxMp: total.maxMp + (itemStats.mp || 0), // MP adicional aumenta o max também
        stamina: total.stamina + (itemStats.stamina || 0),
        maxStamina: total.maxStamina + (itemStats.stamina || 0), // Stamina adicional aumenta o max também
        str: total.str + (itemStats.str || 0),
        def: total.def + (itemStats.def || 0),
        agi: total.agi, // AGI não existe em ItemStats, mantenha o valor base
        int: total.int, // INT não existe em ItemStats, mantenha o valor base
        bonusDamage: total.bonusDamage + (itemStats.bonusDamage || 0),
        bonusSpeed: total.bonusSpeed + (itemStats.bonusSpeed || 0)
      };
    }, {
      hp: 0,
      maxHp: 0,
      mp: 0,
      maxMp: 0,
      stamina: 0,
      maxStamina: 0,
      str: 0,
      def: 0,
      agi: 0,
      int: 0,
      bonusDamage: 0,
      bonusSpeed: 0
    });

    return {
      base: baseStats,
      equipment: equipmentStats,
      total: {
        hp: baseStats.hp + equipmentStats.hp,
        maxHp: baseStats.maxHp + equipmentStats.maxHp,
        mp: baseStats.mp + equipmentStats.mp,
        maxMp: baseStats.maxMp + equipmentStats.maxMp,
        stamina: baseStats.stamina + equipmentStats.stamina,
        maxStamina: baseStats.maxStamina + equipmentStats.maxStamina,
        str: baseStats.str + equipmentStats.str,
        def: baseStats.def + equipmentStats.def,
        agi: baseStats.agi + equipmentStats.agi,
        int: baseStats.int + equipmentStats.int,
        bonusDamage: equipmentStats.bonusDamage,
        bonusSpeed: equipmentStats.bonusSpeed
      }
    };
  };

  const stats = calculateTotalStats();

  // Formas de aparência da figura central: avatar base + transformações com imagem gerada.
  // Metamorfo tem 3 formas (lobo/urso/águia); demais raças têm 1. Clicar na figura alterna (flip).
  const transformationImagesMap = ((character as any).transformationImages || {}) as Record<string, string>;
  const raceForms = getRaceTransformations(raceObj?.id);
  const appearances: Array<{ key: string; label: string; img: string | null; glow: string }> = [
    { key: 'base', label: 'Forma Original', img: resolveImageUrl(character.avatar), glow: visual.borderColor },
  ];
  for (const form of raceForms) {
    const rawImg =
      transformationImagesMap[form] ||
      ((character as any).unlockedTransformation === form ? (character as any).transformationImage : null);
    const img = resolveImageUrl(rawImg);
    if (img) {
      appearances.push({
        key: form,
        label: TRANSFORMATION_CONFIG[form]?.name || form,
        img,
        glow: getTransformationGlow(form).hex,
      });
    }
  }
  const canFlip = appearances.length > 1;
  const appearanceIdx = canFlip ? appearanceIndex % appearances.length : 0;
  const currentAppearance = appearances[appearanceIdx] || appearances[0];

  // Modificadores da forma exibida (null = forma original). A transformação deixa de
  // ser exibida como % e passa a aparecer como bônus plano (+N) nos atributos abaixo,
  // além de mudar a base de Ataque/Poder Mágico/Defesa (AP/DP).
  const activeFormMods =
    currentAppearance.key !== 'base'
      ? TRANSFORMATION_CONFIG[currentAppearance.key as TransformationType]?.statModifiers
      : null;

  const refreshCharacterAndInventory = async () => {
    if (!effectiveCharacterId) return;
    try {
      const [characterResponse, inventoryResponse] = await Promise.all([
        fetch(`/api/character/${effectiveCharacterId}`),
        fetch(`/api/store/inventory?characterId=${effectiveCharacterId}`),
      ]);
      if (characterResponse.ok) setCharacter(await characterResponse.json());
      if (inventoryResponse.ok) {
        const data = await inventoryResponse.json();
        setInventory(Array.isArray(data) ? data : (data.items || []));
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  // Botões de teste de XP (removível em produção) — mesma lógica para +100/+1000.
  const handleAddXp = async (xp: number) => {
    try {
      if (!effectiveCharacterId) return;
      const response = await fetch(`/api/character/${effectiveCharacterId}/add-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp }),
      });
      const raw = await response.text().catch(() => '');
      const result = raw ? JSON.parse(raw) : null;
      if (response.ok && result?.success) {
        toast.success(result.message);
        const updatedResponse = await fetch(`/api/character/${effectiveCharacterId}`);
        if (updatedResponse.ok) {
          setCharacter(await updatedResponse.json());
        }
      } else {
        toast.error(String(result?.error || `Erro ao adicionar XP (HTTP ${response.status})`));
      }
    } catch (error) {
      toast.error(getWalletTxErrorMessage(error, 'Erro ao adicionar XP'));
    }
  };

  const handleEquip = async (itemId: string, slotType: EquipmentSlotType) => {
    try {
      if (!effectiveCharacterId) return;
      
      const response = await fetch(`/api/character/${effectiveCharacterId}/equip-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId, slotType }),
      });

      if (response.ok) {
        // Recarregar os dados do personagem e inventário
        console.log('Item equipped successfully');
        const [updatedCharacter, updatedInventory] = await Promise.all([
          fetch(`/api/character/${effectiveCharacterId}`).then(res => res.json()),
          fetch(`/api/store/inventory?characterId=${effectiveCharacterId}`).then(res => res.json())
        ]);
        console.log('Updated character after equip:', updatedCharacter);
        console.log('Updated equipment after equip:', updatedCharacter.equipment);
        setCharacter(updatedCharacter);
        setInventory(updatedInventory);
        toast.success('⚡ Item equipado com sucesso!');
      } else {
        const error = await response.json();
        toast.error(`❌ ${error.error}`);
      }
    } catch (error) {
      console.error('Error equipping item:', error);
      toast.error('💥 Erro inesperado ao equipar item');
    }
  };

  const handleUnequip = async (itemId: string) => {
    try {
      if (!effectiveCharacterId) return;
      
      const response = await fetch(`/api/character/${effectiveCharacterId}/unequip-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ itemId }),
      });

      if (response.ok) {
        console.log('Item unequipped successfully');
        // Refresh data
        const [characterResponse, inventoryResponse] = await Promise.all([
          fetch(`/api/character/${effectiveCharacterId}`),
          fetch(`/api/store/inventory?characterId=${effectiveCharacterId}`)
        ]);

        if (characterResponse.ok) {
          const characterData = await characterResponse.json();
          setCharacter(characterData);
        }

        if (inventoryResponse.ok) {
          const inventoryData = await inventoryResponse.json();
          setInventory(Array.isArray(inventoryData) ? inventoryData : (inventoryData.items || []));
        }
        toast.success('🎒 Item desequipado!');
      } else {
        const error = await response.json().catch(() => ({}));
        toast.error(`❌ ${error.error || 'Falha ao desequipar item'}`);
      }
    } catch (error) {
      console.error('Error unequipping item:', error);
      toast.error('💥 Erro inesperado ao desequipar item');
    }
  };

  const handleConsume = async (itemId: string) => {
    try {
      if (!effectiveCharacterId) return;
      
      const response = await fetch('/api/inventory/use-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          itemId,
          characterId: effectiveCharacterId 
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`✅ ${result.effect}`);
        
        // Refresh character data and inventory
        const [characterResponse, inventoryResponse] = await Promise.all([
          fetch(`/api/character/${effectiveCharacterId}`),
          fetch(`/api/store/inventory?characterId=${effectiveCharacterId}`)
        ]);

        if (characterResponse.ok) {
          const characterData = await characterResponse.json();
          setCharacter(characterData);
        }

        if (inventoryResponse.ok) {
          const inventoryData = await inventoryResponse.json();
          setInventory(inventoryData);
        }
      } else {
        toast.error(`❌ ${result.error}`);
      }
    } catch (error) {
      console.error('Error consuming item:', error);
      toast.error('❌ Erro ao consumir item');
    }
  };

  // 🔥 Vender ao ferreiro (burn): destrói o equipamento por metade do preço; o gold
  // vai pra carteira do personagem (Character.gold). Mesmo endpoint da RepairBench.
  const handleSell = async (inventoryId: string) => {
    if (!effectiveCharacterId) return;
    const row = inventory.find((i: any) => i.id === inventoryId);
    const name = row?.item?.name ?? 'item';
    const price = row?.item ? sellPrice(row.item) : 0; // sellPricing (fonte única)
    if (!window.confirm(`Vender ${name} ao ferreiro por ${price} gold?\nO item será destruído (não dá pra desfazer).`)) return;

    try {
      const response = await fetch(`/api/character/${effectiveCharacterId}/sell-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId }),
      });
      if (response.ok) {
        const data = await response.json();
        const [characterResponse, inventoryResponse] = await Promise.all([
          fetch(`/api/character/${effectiveCharacterId}`),
          fetch(`/api/store/inventory?characterId=${effectiveCharacterId}`),
        ]);
        if (characterResponse.ok) setCharacter(await characterResponse.json());
        if (inventoryResponse.ok) {
          const inventoryData = await inventoryResponse.json();
          setInventory(Array.isArray(inventoryData) ? inventoryData : (inventoryData.items || []));
        }
        toast.success(data?.message ?? `💰 Vendido por ${price} gold!`);
      } else {
        const error = await response.json().catch(() => ({}));
        toast.error(`❌ ${error.error || 'Falha ao vender item'}`);
      }
    } catch (error) {
      console.error('Error selling item:', error);
      toast.error('💥 Erro inesperado ao vender item');
    }
  };

  const handleExpandInventory = async () => {
    if (!character || !effectiveCharacterId) return;

    const slotsToAdd = 5;
    const totalCostGold = 1000;

    setExpandingSlots(true);
    try {
      // 1) Tenta pagar OFF-CHAIN com o GOLD "na mão" do personagem (sem txHash).
      let response: Response | null = await fetch(`/api/character/${effectiveCharacterId}/expand-inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: slotsToAdd }),
      });
      let lastError: any = null;

      // 2) Sem GOLD na mão → compra ON-CHAIN pela carteira (abre a MetaMask).
      if (response.status === 402) {
        lastError = await response.json().catch(() => null);
        if (lastError?.requiresPayment) {
          const eth = (window as any)?.ethereum;
          if (!eth) {
            toast.error('💰 Sem GOLD na mão e MetaMask não encontrada');
            return;
          }
          toast('💰 Sem GOLD na mão — pagando on-chain pela carteira…');

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
            return;
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
            return;
          }

          const payTx = await gold.transfer(treasuryAddress, costWei, await getPolygonFeeOverrides(provider));
          toast.success('Pagamento enviado! Aguardando confirmação…');
          const payReceipt = await payTx.wait();
          if (!payReceipt || payReceipt.status !== 1) {
            throw new Error('Pagamento falhou');
          }

          // RPCs can lag (especially on testnet). Try confirming the purchase a few times.
          response = null;
          for (let attempt = 0; attempt < 4; attempt++) {
            response = await fetch(`/api/character/${effectiveCharacterId}/expand-inventory`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ slots: slotsToAdd, txHash: payTx.hash }),
            });

            if (response.ok) break;

            try {
              lastError = await response.json();
            } catch {
              lastError = null;
            }

            const msg = String(lastError?.error || '').toLowerCase();
            const looksLikePropagation = msg.includes('ainda não encontrada') || msg.includes('not found');
            if (!looksLikePropagation) break;

            await new Promise((r) => setTimeout(r, 1200));
          }
        }
      }

      if (!response) {
        throw new Error('Falha ao confirmar expansão (sem resposta do servidor)')
      }

      if (response.ok) {
        const data = await response.json();
        setCharacter(data.character);
        toast.success(`📦 +${slotsToAdd} slots adicionados! (${totalCostGold} GOLD gastos)`);
      } else {
        const error = lastError || (await response.json().catch(() => null));
        toast.error(`❌ ${error?.error || 'Falha ao confirmar expansão'}`);
      }
    } catch (error) {
      console.error('Error expanding inventory:', error);
      toast.error(getWalletTxErrorMessage(error, '💥 Erro inesperado ao expandir inventário'));
    } finally {
      // Always re-sync character data so UI reflects server state.
      try {
        const refreshed = await fetch(`/api/character/${effectiveCharacterId}`, { cache: 'no-store' });
        if (refreshed.ok) {
          const refreshedCharacter = await refreshed.json();
          setCharacter(refreshedCharacter);
        }
      } catch {
        // ignore
      }
      setExpandingSlots(false);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="relative min-h-screen">
        {/* Cenário animado da raça (fundo da página) */}
        <div className="fixed inset-0 z-0">
          <CreationCardBackdrop theme={visual.backdropTheme} />
          <div className="absolute inset-0 bg-black/70" />
        </div>

        <div className="relative z-10 container mx-auto px-2 sm:px-4 py-8">
        <div
          className="relative overflow-hidden rounded-lg border p-3 sm:p-8"
          style={{ borderColor: `${visual.borderColor}40`, boxShadow: '0 14px 44px rgba(0,0,0,0.55)', fontFamily: "'Barlow', sans-serif" }}
        >
          {/* Cenário animado da raça/classe como fundo do card (igual ao dashboard) */}
          <div className="absolute inset-0 pointer-events-none">
            <CreationCardBackdrop theme={visual.backdropTheme} />
          </div>
          <div className="absolute inset-0 bg-black/55 pointer-events-none" />
          <div className="relative">
          {/* Cabeçalho do personagem — janela chumbo no mesmo estilo do aprimoramento */}
          <div
            className="relative mb-6 overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60"
            style={{ background: PANEL_BG }}
          >
            {/* Barra de título em bisel */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}>
              <span className="flex items-center gap-2 text-[15px] font-semibold tracking-wide text-[#dcdce0]">
                <span style={{ color: GOLD }}>✦</span> Ficha do Personagem
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-[#77777d]">
                Nível {character.level}
              </span>
            </div>

            <div className="flex flex-col items-center gap-5 p-5 sm:flex-row">
              {/* Retrato com moldura dourada */}
              <div
                className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[3px] border-2"
                style={{ borderColor: FRAME, background: visual.gradient, boxShadow: '0 0 0 1px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.55)' }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl text-white">
                    {character.name?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>

                {(() => {
                  const avatarUrl = resolveImageUrl(character.avatar);
                  if (!avatarUrl) return null;

                  return (
                    // Use a plain <img> to avoid next/image remotePatterns issues.
                    <img
                      src={avatarUrl}
                      alt={`${character.name} avatar`}
                      className="absolute inset-0 w-full h-full object-cover art-bright"
                      loading="eager"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        // If the URL is invalid/404, keep the fallback initial visible.
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  );
                })()}
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h1 className="text-3xl font-black text-[#ece7da] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" style={{ letterSpacing: '0.5px' }}>
                  {character.name}
                </h1>
                <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <span
                    className="rounded-[3px] border px-3 py-1 text-sm font-semibold text-[#dcdce0]"
                    style={{ borderColor: `${visual.raceVisual.accent}66`, background: `linear-gradient(180deg, ${visual.raceVisual.accent}2e, ${visual.raceVisual.accent}12)` }}
                  >
                    {visual.raceVisual.emoji} {raceObj?.name}
                  </span>
                  <span
                    className="rounded-[3px] border px-3 py-1 text-sm font-semibold text-[#dcdce0]"
                    style={{ borderColor: `${visual.classVisual.accent}66`, background: `linear-gradient(180deg, ${visual.classVisual.accent}2e, ${visual.classVisual.accent}12)` }}
                  >
                    {visual.classVisual.emoji} {classObj?.name}
                  </span>
                  {(character.availablePoints ?? 0) > 0 && (
                    <span
                      className="rounded-[3px] border px-3 py-1 text-sm font-bold"
                      style={{ borderColor: FRAME, background: 'linear-gradient(180deg, #3a3325, #241f16)', color: GOLD_BRIGHT }}
                    >
                      ✦ {character.availablePoints} pontos disponíveis
                    </span>
                  )}
                </div>

                {/* Barra de experiência */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[#77777d]">
                    <span>Experiência</span>
                    <span className="normal-case tracking-normal tabular-nums text-[#8a8a90]">
                      {character.experience} / {character.nextLevelExperience || '?'}
                    </span>
                  </div>
                  <div className="h-[7px] overflow-hidden rounded-[2px] border border-black/70 bg-[#101013]">
                    <div
                      className="h-full bg-gradient-to-r from-[#8a6d3b] to-[#e7c682] transition-all"
                      style={{
                        width: `${
                          character.nextLevelExperience
                            ? Math.min(100, Math.round((character.experience / character.nextLevelExperience) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Botões de teste XP - removível em produção */}
              <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                <button
                  onClick={() => handleAddXp(100)}
                  className="rounded-[3px] border border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] px-3 py-1 text-xs font-semibold text-[#c9c9ce] transition-colors hover:border-[#8a6d3b] hover:text-white"
                >
                  +100 XP (Teste)
                </button>
                <button
                  onClick={() => handleAddXp(1000)}
                  className="rounded-[3px] border border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] px-3 py-1 text-xs font-semibold text-[#c9c9ce] transition-colors hover:border-[#8a6d3b] hover:text-white"
                >
                  +1000 XP (Level Up)
                </button>
              </div>
            </div>
          </div>

          {/* Ações rápidas — botões em bisel, como os da forja */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push('/combat-lobby')}
              className="flex-1 sm:flex-none rounded-[3px] border px-8 py-3 text-[15px] font-semibold tracking-wide transition-all hover:brightness-125 flex items-center justify-center gap-2"
              style={{
                borderColor: '#8a3b3b',
                background: 'linear-gradient(180deg, #3a2525, #241616)',
                color: '#f0a8a8',
                boxShadow: 'inset 0 1px 0 rgba(240,168,168,0.2), 0 0 14px rgba(201,70,70,0.15)',
              }}
            >
              <Sword className="w-5 h-5" />
              Entrar em Combate
            </button>
            <button
              onClick={() => router.push('/dungeons')}
              className="flex-1 sm:flex-none rounded-[3px] border px-8 py-3 text-[15px] font-semibold tracking-wide transition-all hover:brightness-125 flex items-center justify-center gap-2"
              style={{
                borderColor: '#5b3b8a',
                background: 'linear-gradient(180deg, #2e2540, #1c1626)',
                color: '#c9b3ec',
                boxShadow: 'inset 0 1px 0 rgba(201,179,236,0.2), 0 0 14px rgba(139,92,246,0.15)',
              }}
            >
              <Shield className="w-5 h-5" />
              Explorar Dungeon
            </button>
          </div>

        {/* 🌳 Subiu de nível → só um chamariz pra Árvore de Habilidades. A distribuição
            de pontos saiu da ficha e agora vive em /character/[id]/skill-tree. */}
        {(character.availablePoints ?? 0) > 0 && (
          <button
            onClick={() => router.push(`/character/${effectiveCharacterId}/skill-tree`)}
            className="mt-4 w-full rounded-[4px] border px-6 py-4 text-left transition-all hover:brightness-110"
            style={{
              borderColor: FRAME,
              background: 'linear-gradient(180deg, #3a3325, #241f16)',
              boxShadow: 'inset 0 1px 0 rgba(231,198,130,0.15), 0 0 18px rgba(201,162,95,0.18)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>🌳</span>
                <div>
                  <div className="text-[15px] font-bold" style={{ color: GOLD_BRIGHT }}>
                    Você subiu de nível!
                  </div>
                  <div className="text-[13px]" style={{ color: '#d8c8a0' }}>
                    {character.availablePoints} ponto{character.availablePoints === 1 ? '' : 's'} para distribuir na Árvore de Habilidades
                  </div>
                </div>
              </div>
              <span className="shrink-0 rounded-[3px] border px-3 py-1.5 text-sm font-bold" style={{ borderColor: GOLD, color: GOLD_BRIGHT, background: 'rgba(0,0,0,0.3)' }}>
                Distribuir →
              </span>
            </div>
          </button>
        )}

        {/* ====== Janelas estilo Black Desert (Equipamento + Inventário) ====== */}
        <style>{`
          .equip-figure-wrap { width: 100%; display: flex; justify-content: center; }
          .equip-figure { flex: none; }
          @media (max-width: 579px) {
            .equip-figure-wrap { height: calc(396px * var(--equip-scale, 0.6)); overflow: hidden; }
            .equip-figure { transform: scale(var(--equip-scale, 0.6)); transform-origin: top center; }
          }
          @media (max-width: 400px) {
            .equip-figure-wrap { --equip-scale: 0.5; }
          }
        `}</style>
        <div className="w-full overflow-x-auto pb-2 mt-8">
        <div className="flex flex-col items-center gap-4 xl:flex-row xl:items-stretch xl:justify-center xl:gap-2 xl:min-w-[1026px] mx-auto">

          {/* ============ PAINEL EQUIPAMENTO ============ */}
          <div
            className="relative flex flex-col w-full max-w-[548px] rounded-[4px] overflow-hidden border border-[#46464c] shadow-2xl shadow-black/70"
            style={{ background: PANEL_BG }}
          >
            {/* Retrato flutuante */}
            <div
              className="absolute z-[5] overflow-hidden flex items-center justify-center"
              style={{ left: -1, top: -1, width: 66, height: 66, border: `2px solid ${FRAME}`, background: '#141210', boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 6px 14px rgba(0,0,0,0.5)' }}
            >
              {(() => {
                const avatarUrl = resolveImageUrl(character.avatar);
                return avatarUrl ? (
                  <img src={avatarUrl} alt={character.name} className="w-full h-full object-cover art-bright" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-2xl text-white/80">{character.name?.[0]?.toUpperCase() || '?'}</span>
                );
              })()}
            </div>

            {/* Barra de título */}
            <div className="flex items-center gap-2" style={{ height: 38, padding: '0 12px 0 76px', background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}>
              <Sword size={17} style={{ color: GOLD }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: '#dcdce0', letterSpacing: '0.4px' }}>Equipamento</span>
              <div className="flex-1" />
              <Link
                href="/doc#items"
                title="Ver documentação de itens"
                className="transition-colors hover:text-white"
                style={{ color: '#7e8893' }}
              >
                <HelpCircle size={15} />
              </Link>
            </div>

            {/* Corpo: figura central + anel de slots */}
            <div className="relative flex-1" style={{ padding: '14px 18px 0' }}>
              <div className="absolute text-center" style={{ top: 8, left: 0, right: 0, fontSize: '11px', color: '#77777d', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Aparência</div>

              <div className="equip-figure-wrap">
              <div className="relative equip-figure" style={{ height: 392, width: 512, margin: '4px 0 0' }}>
                {/* Sombra + figura central */}
                <div className="absolute" style={{ top: 290, left: '50%', transform: 'translateX(-50%)', width: 120, height: 16, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 70%)', zIndex: 0 }} />
                <div
                  className="absolute flex items-center justify-center"
                  onClick={() => { if (canFlip) setAppearanceIndex((i) => (i + 1) % appearances.length); }}
                  title={canFlip ? 'Clique para alternar entre as formas' : undefined}
                  style={{ top: 24, left: '50%', transform: 'translateX(-50%)', width: 150, height: 272, background: `radial-gradient(70% 50% at 50% 20%, ${currentAppearance.glow}1f, transparent 60%)`, zIndex: 1, cursor: canFlip ? 'pointer' : 'default', perspective: 900 }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {currentAppearance.img ? (
                      <motion.img
                        key={currentAppearance.key}
                        src={currentAppearance.img}
                        alt={`${character.name} — ${currentAppearance.label}`}
                        initial={{ rotateY: -90, opacity: 0 }}
                        animate={{ rotateY: 0, opacity: 1 }}
                        exit={{ rotateY: 90, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        style={{ width: 142, height: 264, objectFit: 'cover', borderRadius: 6, opacity: 0.96, backfaceVisibility: 'hidden', boxShadow: currentAppearance.key === 'base' ? 'none' : `0 0 22px ${currentAppearance.glow}66` }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <PersonSilhouette key="silhouette" color={visual.borderColor} className="h-full w-auto" />
                    )}
                  </AnimatePresence>

                  {canFlip && (
                    <div
                      className="absolute flex items-center justify-center"
                      style={{ bottom: 6, right: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: `1px solid ${currentAppearance.glow}99`, pointerEvents: 'none' }}
                    >
                      <RefreshCw size={14} style={{ color: currentAppearance.glow }} />
                    </div>
                  )}
                </div>

                {/* Anel de 10 slots funcionais, todos com moldura em ouro envelhecido */}
                {(() => {
                  // Manopla (arma do Monge) e luva ocupam as mesmas mãos e nunca
                  // acumulam (ver mutex em equip-item/route.ts). Quando uma manopla
                  // está equipada na arma principal ou na secundária, o slot de luva
                  // mostra o mesmo desenho de forma opaca para indicar que está
                  // ocupado, em vez de aparecer livre.
                  const gauntletEquipment = character.equipment?.find(
                    (e) => (e.slot === 'WEAPON' || e.slot === 'SHIELD') && e.item.type === 'GAUNTLET'
                  );

                  const RING: Array<{ key: string; type: EquipmentSlotType; top: number; left: number }> = [
                    { key: 'HELMET', type: 'HELMET' as EquipmentSlotType, top: 8, left: 229 },
                    { key: 'ARMOR', type: 'ARMOR' as EquipmentSlotType, top: 76, left: 78 },
                    { key: 'NECKLACE', type: 'NECKLACE' as EquipmentSlotType, top: 76, left: 380 },
                    { key: 'WEAPON', type: 'WEAPON' as EquipmentSlotType, top: 156, left: 44 },
                    { key: 'SHIELD', type: 'SHIELD' as EquipmentSlotType, top: 156, left: 414 },
                    { key: 'GLOVES', type: 'GLOVES' as EquipmentSlotType, top: 236, left: 78 },
                    { key: 'RING_1', type: 'RING_1' as EquipmentSlotType, top: 236, left: 380 },
                    { key: 'BOOTS', type: 'BOOTS' as EquipmentSlotType, top: 304, left: 150 },
                    { key: 'BELT', type: 'BELT' as EquipmentSlotType, top: 304, left: 229 },
                    { key: 'RING_2', type: 'RING_2' as EquipmentSlotType, top: 304, left: 308 },
                  ];
                  return RING.map((s) => {
                    const equipped = character.equipment?.find(e => e.slot === s.type);
                    // Slot de luva sem luva equipada, mas com manopla nas mãos:
                    // mostra a manopla de forma opaca para sinalizar que o slot
                    // está ocupado pela mecânica mão-a-mão.
                    const showGauntletGhost = s.type === 'GLOVES' && !equipped && gauntletEquipment;
                    const displayed = showGauntletGhost ? gauntletEquipment : equipped;
                    return (
                      <div key={s.key} style={{ position: 'absolute', top: s.top, left: s.left, zIndex: 2 }}>
                        <EquipmentSlot
                          compact
                          accent={FRAME}
                          type={s.type}
                          item={displayed?.item}
                          enhancementLevel={displayed?.enhancementLevel || 0}
                          durability={(displayed as any)?.durability}
                          maxDurability={(displayed as any)?.maxDurability}
                          ghost={!!showGauntletGhost}
                          onEquip={handleEquip}
                          onUnequip={handleUnequip}
                        />
                      </div>
                    );
                  });
                })()}
              </div>
              </div>

              {/* Seletor de forma (flip): nome da forma + dots */}
              {canFlip && (
                <div className="flex items-center justify-center" style={{ gap: 10, marginTop: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: currentAppearance.glow, letterSpacing: '0.3px' }}>
                    {currentAppearance.label}
                  </span>
                  <div className="flex items-center" style={{ gap: 6 }}>
                    {appearances.map((a, i) => (
                      <button
                        key={a.key}
                        onClick={() => setAppearanceIndex(i)}
                        aria-label={a.label}
                        title={a.label}
                        style={{ width: 8, height: 8, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: i === appearanceIdx ? a.glow : 'rgba(255,255,255,0.25)', boxShadow: i === appearanceIdx ? `0 0 8px ${a.glow}` : 'none' }}
                      />
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Atributos secundários (FOR/DEF/AGI/INT/CRÍT). A transformação aparece como
                bônus plano (+N) ao lado do valor, em vez de porcentagem. */}
            <div className="flex justify-center" style={{ gap: 18, padding: '10px 14px 12px', marginTop: 4, background: '#19191c', borderTop: '1px solid rgba(0,0,0,0.6)' }}>
              {[
                { icon: <Sword size={18} style={{ color: '#e8d08a' }} />, base: stats.total.str, label: 'FOR', mult: activeFormMods?.strength },
                { icon: <Shield size={18} style={{ color: '#6aa9d6' }} />, base: stats.total.def, label: 'DEF', mult: activeFormMods?.defense },
                { icon: <Zap size={18} style={{ color: '#8fd6e0' }} />, base: stats.base.agi, label: 'AGI', mult: activeFormMods?.agility },
                { icon: <Brain size={18} style={{ color: '#c3a6ec' }} />, base: stats.base.int, label: 'INT', mult: activeFormMods?.intelligence },
                { icon: <Star size={18} style={{ color: '#f0c873' }} />, base: stats.base.agi * 0.2, label: 'CRÍT', mult: activeFormMods?.critical, isPercent: true },
              ].map((a) => {
                const rawDelta = activeFormMods && a.mult ? a.base * a.mult - a.base : 0;
                const delta = a.isPercent ? rawDelta : Math.round(rawDelta);
                const total = a.base + delta;
                const positive = delta > 0;
                return (
                  <div key={a.label} className="flex flex-col items-center" style={{ gap: 3 }}>
                    {a.icon}
                    <div className="flex items-baseline" style={{ gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#dcdce0' }}>
                        {a.isPercent ? `${total.toFixed(1)}%` : Math.round(total)}
                      </span>
                      {delta !== 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: positive ? '#86efac' : '#fca5a5' }}>
                          ({positive ? '+' : ''}{a.isPercent ? delta.toFixed(1) : delta})
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '9.5px', color: '#77777d', letterSpacing: '0.14em' }}>{a.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Stats principais (AP/DP). O número grande é o total já modificado
                pela transformação; entre parênteses vem o bônus da transformação
                e o +N verde é o bônus somado pelos equipamentos. */}
            <div style={{ padding: '4px 22px 10px', borderTop: '1px solid rgba(0,0,0,0.6)' }}>
              {[
                { icon: <Sword size={18} style={{ color: '#c98a6a' }} />, label: 'Ataque (AD)', base: stats.base.str, equip: stats.equipment.str + (stats.total.bonusDamage || 0), mult: activeFormMods?.attack },
                { icon: <Zap size={18} style={{ color: '#b06ae0' }} />, label: 'Poder Mágico (AP)', base: stats.base.int, equip: 0, mult: activeFormMods?.attack },
                { icon: <Shield size={18} style={{ color: '#6aa9d6' }} />, label: 'Defesa (DP)', base: stats.base.def, equip: stats.equipment.def, mult: activeFormMods?.defense },
              ].map((row, i, arr) => {
                const transformedBase = activeFormMods && row.mult ? Math.round(row.base * row.mult) : row.base;
                const transformDelta = transformedBase - row.base;
                const equip = Math.round(row.equip);
                return (
                  <div key={row.label} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div className="flex items-center" style={{ gap: 9 }}>
                      <span style={{ fontSize: 9, color: GOLD }}>✦</span>
                      {row.icon}
                      <span style={{ fontSize: 14, color: '#c9c9ce' }}>{row.label}</span>
                    </div>
                    <div className="flex items-baseline" style={{ gap: 6 }}>
                      <span style={{ fontSize: 22, fontWeight: 700, color: '#ece7da' }}>{transformedBase}</span>
                      {transformDelta !== 0 && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: transformDelta > 0 ? '#86efac' : '#fca5a5' }}>
                          ({transformDelta > 0 ? '+' : ''}{transformDelta})
                        </span>
                      )}
                      {equip > 0 && (
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#86efac' }}>+{equip}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ============ PAINEL INVENTÁRIO ============ */}
          <div className="w-full max-w-[548px] xl:max-w-[470px]">
            <InventoryPanel
              items={inventory}
              totalSlots={character.inventorySlots || 20}
              accent={visual.borderColor}
              characterId={effectiveCharacterId || ''}
              onEquip={handleEquip}
              onUnequip={handleUnequip}
              onConsume={handleConsume}
              onEnhance={(invId, name, category) => setEnhanceTarget({ inventoryId: invId, itemName: name, category })}
              onOpenCraft={(craft, itemName) => setCraftTarget({ craft, itemName })}
              onSell={(inventoryId) => handleSell(inventoryId)}
              onExpand={handleExpandInventory}
              expanding={expandingSlots}
              expandTitle="Expandir +5 slots (custo: 1000 GOLD)"
              goldText={goldOnchainText}
              getCompareTo={(item) => {
                if (item.type === 'CONSUMABLE') return null;
                // Anel pode ir em RING_1 ou RING_2 — compara com qualquer um
                // que já esteja equipado (não há um slot "canônico" pro tipo).
                const equipped = item.type === 'RING'
                  ? character.equipment?.find((e) => e.slot === 'RING_1') || character.equipment?.find((e) => e.slot === 'RING_2')
                  : character.equipment?.find((e) => e.slot === getSlotTypeFromItemType(item.type));
                return equipped ? { item: equipped.item, enhancementLevel: equipped.enhancementLevel || 0 } : null;
              }}
            />
          </div>
        </div>
        </div>

        {/* Painel de Histórico do Personagem */}
        <div className="max-w-3xl mx-auto mt-6">
          <CharacterHistory characterId={effectiveCharacterId || ''} />
        </div>
          </div>
        </div>
        </div>
      </div>

      {/* Dialog de aprimoramento (acionado pelo card do item ou por uma Pedra Negra) */}
      {enhanceTarget && effectiveCharacterId && (
        <EnhancementDialog
          open={!!enhanceTarget}
          onClose={() => setEnhanceTarget(null)}
          characterId={effectiveCharacterId}
          inventoryId={enhanceTarget.inventoryId || undefined}
          itemName={enhanceTarget.itemName}
          filterCategory={enhanceTarget.category}
          items={inventory
            .filter((i) => i.item.type !== 'CONSUMABLE')
            .map((i) => ({
              id: i.id,
              name: i.item.name,
              type: i.item.type,
              image: i.item.image,
              enhancementLevel: i.enhancementLevel || 0,
            }))}
          onChanged={refreshCharacterAndInventory}
        />
      )}

      {/* Dialogs de profissão ⚒️⚗️ — abertas pelo card do material/ingrediente */}
      <ForgeDialog
        open={craftTarget?.craft === 'forge'}
        onClose={() => setCraftTarget(null)}
        characterId={effectiveCharacterId || undefined}
        characterGold={typeof character?.gold === 'number' ? character.gold : null}
        initialMaterialName={craftTarget?.craft === 'forge' ? craftTarget.itemName : undefined}
        onChanged={refreshCharacterAndInventory}
      />
      <AlchemyDialog
        open={craftTarget?.craft === 'alchemy'}
        onClose={() => setCraftTarget(null)}
        characterId={effectiveCharacterId || undefined}
        characterGold={typeof character?.gold === 'number' ? character.gold : null}
        initialPlaceName={craftTarget?.craft === 'alchemy' ? craftTarget.itemName : undefined}
        onChanged={refreshCharacterAndInventory}
      />
      <ProcessingDialog
        open={craftTarget?.craft === 'process'}
        onClose={() => setCraftTarget(null)}
        characterId={effectiveCharacterId || undefined}
        characterGold={typeof character?.gold === 'number' ? character.gold : null}
        initialInputName={craftTarget?.craft === 'process' ? craftTarget.itemName : undefined}
        onChanged={refreshCharacterAndInventory}
      />
      <CookingDialog
        open={craftTarget?.craft === 'cook'}
        onClose={() => setCraftTarget(null)}
        characterId={effectiveCharacterId || undefined}
        characterGold={typeof character?.gold === 'number' ? character.gold : null}
        initialInputName={craftTarget?.craft === 'cook' ? craftTarget.itemName : undefined}
        onChanged={refreshCharacterAndInventory}
      />
    </DndProvider>
  );
}
