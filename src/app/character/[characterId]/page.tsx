'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Heart, Shield, Sword, Zap, Plus, Coins, Battery, Brain, Star, Gauge } from 'lucide-react';
import { Character } from '@/types/game';
import { EquipmentSlotType } from '@prisma/client';
import { getRaceById, getClassById } from '@/lib/gameData';
import Link from 'next/link';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { EquipmentSlot } from '@/components/EquipmentSlot';
import { DraggableItem } from '@/components/DraggableItem';
import AttributeDistributionPanel from '@/components/AttributeDistributionPanel';
import CharacterHistory from '@/components/CharacterHistory';
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop';
import PersonSilhouette from '@/components/character/PersonSilhouette';
import { getBlendedVisual } from '@/lib/creationVisuals';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { getWalletTxErrorMessage } from '@/lib/walletErrors';
import { resolveImageUrl } from '@/lib/imageUrl';

import { Item } from '@/types/item';

interface InventoryItem {
  id: string;
  itemId: string;
  quantity: number;
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
        (character.attributes as any)?.def ??
        (character.attributes as any)?.defense ??
        (character.baseStats as any)?.def ??
        (character.baseStats as any)?.res ??
        5,
      agi: (character.attributes as any)?.agi || (character.baseStats as any)?.agi || 0,
      int: (character.attributes as any)?.int || (character.baseStats as any)?.int || 0
    };

    // Somar stats dos equipamentos
    const equipmentStats = (character.equipment || []).reduce((total, equipment) => {
      const itemStats = equipment.item.stats || {};
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
          console.log('Inventory data:', inventoryData);
          setInventory(inventoryData.items || []);
        }
      }
    } catch (error) {
      console.error('Error unequipping item:', error);
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

  const handleExpandInventory = async () => {
    if (!character || !effectiveCharacterId) return;

    const slotsToAdd = 5;
    const totalCostGold = 1000;

    const eth = (window as any)?.ethereum;
    if (!eth) {
      toast.error('MetaMask não encontrada');
      return;
    }

    setExpandingSlots(true);
    try {
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

      const payTx = await gold.transfer(treasuryAddress, costWei);
      toast.success('Pagamento enviado! Aguardando confirmação…');
      const payReceipt = await payTx.wait();
      if (!payReceipt || payReceipt.status !== 1) {
        throw new Error('Pagamento falhou');
      }

      // RPCs can lag (especially on testnet). Try confirming the purchase a few times.
      let response: Response | null = null;
      let lastError: any = null;
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
    }
    setExpandingSlots(false);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="relative min-h-screen">
        {/* Cenário animado da raça (fundo da página) */}
        <div className="fixed inset-0 z-0">
          <CreationCardBackdrop theme={visual.backdropTheme} />
          <div className="absolute inset-0 bg-black/70" />
        </div>

        <div className="relative z-10 container mx-auto px-4 py-8">
        <div
          className="relative overflow-hidden rounded-3xl border-2 p-6 sm:p-8"
          style={{ borderColor: visual.borderColor, boxShadow: visual.glow }}
        >
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
          <div className="relative">
          {/* Character Header */}
          <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
            <div
              className="relative w-32 h-32 rounded-2xl border-4 shadow-lg overflow-hidden"
              style={{ background: visual.gradient, borderColor: visual.borderColor }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl text-white">
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
                    className="absolute inset-0 w-full h-full object-cover"
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
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-black text-white mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{character.name}</h1>
              <div className="flex flex-wrap gap-2 mb-4 justify-center md:justify-start">
                <span
                  className="text-base font-bold text-white rounded-full px-4 py-1.5 border"
                  style={{ background: `${visual.raceVisual.accent}33`, borderColor: `${visual.raceVisual.accent}66` }}
                >
                  {visual.raceVisual.emoji} {raceObj?.name}
                </span>
                <span
                  className="text-base font-bold text-white rounded-full px-4 py-1.5 border"
                  style={{ background: `${visual.classVisual.accent}33`, borderColor: `${visual.classVisual.accent}66` }}
                >
                  {visual.classVisual.emoji} {classObj?.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                <span className="bg-black/40 px-4 py-2 rounded-xl text-white/80 border border-white/10">
                  Level {character.level}
                </span>
                <span className="bg-black/40 px-4 py-2 rounded-xl text-white/80 border border-white/10">
                  XP: {character.experience}/{character.nextLevelExperience || '?'}
                </span>
                {character.availablePoints && character.availablePoints > 0 && (
                  <span
                    className="px-4 py-2 rounded-xl text-white font-bold border"
                    style={{ background: `${visual.borderColor}33`, borderColor: `${visual.borderColor}66` }}
                  >
                    {character.availablePoints} pontos disponíveis
                  </span>
                )}
              </div>
              
              {/* Botões de teste XP - removível em produção */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={async () => {
                    try {
                      if (!effectiveCharacterId) return;
                      const response = await fetch(`/api/character/${effectiveCharacterId}/add-xp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ xp: 100 }),
                      });
                      const raw = await response.text().catch(() => '');
                      const result = raw ? JSON.parse(raw) : null;
                      if (response.ok && result?.success) {
                        toast.success(result.message);
                        // Recarregar dados do personagem
                        const updatedResponse = await fetch(`/api/character/${effectiveCharacterId}`);
                        if (updatedResponse.ok) {
                          const characterData = await updatedResponse.json();
                          setCharacter(characterData);
                        }
                      } else {
                        toast.error(String(result?.error || `Erro ao adicionar XP (HTTP ${response.status})`));
                      }
                    } catch (error) {
                      toast.error(getWalletTxErrorMessage(error, 'Erro ao adicionar XP'));
                    }
                  }}
                  className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                >
                  +100 XP (Teste)
                </button>
                <button
                  onClick={async () => {
                    try {
                      if (!effectiveCharacterId) return;
                      const response = await fetch(`/api/character/${effectiveCharacterId}/add-xp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ xp: 1000 }),
                      });
                      const raw = await response.text().catch(() => '');
                      const result = raw ? JSON.parse(raw) : null;
                      if (response.ok && result?.success) {
                        toast.success(result.message);
                        // Recarregar dados do personagem
                        const updatedResponse = await fetch(`/api/character/${effectiveCharacterId}`);
                        if (updatedResponse.ok) {
                          const characterData = await updatedResponse.json();
                          setCharacter(characterData);
                        }
                      } else {
                        toast.error(String(result?.error || `Erro ao adicionar XP (HTTP ${response.status})`));
                      }
                    } catch (error) {
                      toast.error(getWalletTxErrorMessage(error, 'Erro ao adicionar XP'));
                    }
                  }}
                  className="px-3 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600"
                >
                  +1000 XP (Level Up)
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons - estilo masmorras */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
            <button
              onClick={() => router.push('/combat-lobby')}
              className="flex-1 sm:flex-none px-6 py-3 rounded-xl font-black text-white shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(90deg, #ef4444cc, #ef444477)', boxShadow: '0 4px 20px rgba(239,68,68,0.35)' }}
            >
              <Sword className="w-5 h-5" />
              Entrar em Combate
            </button>
            <button
              onClick={() => router.push('/dungeons')}
              className="flex-1 sm:flex-none px-6 py-3 rounded-xl font-black text-white shadow-lg transition-transform hover:scale-105 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(90deg, #a855f7cc, #a855f777)', boxShadow: '0 4px 20px rgba(168,85,247,0.35)' }}
            >
              <Shield className="w-5 h-5" />
              Explorar Dungeon
            </button>
          </div>

        {/* Attribute Distribution Panel */}
        {character.availablePoints && character.availablePoints > 0 && (
          <AttributeDistributionPanel
            characterId={effectiveCharacterId || ''}
            availablePoints={character.availablePoints}
            currentAttributes={{
              str: (character.attributes as any)?.str || (character.baseStats as any)?.str || 0,
              agi: (character.attributes as any)?.agi || 0,
              int: (character.attributes as any)?.int || 0,
              def:
                (character.attributes as any)?.def ??
                (character.attributes as any)?.defense ??
                (character.attributes as any)?.res ??
                (character.baseStats as any)?.def ??
                (character.baseStats as any)?.res ??
                0,
            }}
            currentStats={{
              hp: character.hp,
              maxHp: character.maxHp,
              mp: (character as any).mp || 0,
              maxMp: (character as any).maxMp || 50,
              stamina: character.stamina,
              maxStamina: character.maxStamina,
              crit: ((character.attributes as any)?.agi || 0) * 0.2,
              speed: ((character.attributes as any)?.agi || 0) * 0.5,
            }}
            onPointsDistributed={async () => {
              // Recarregar dados do personagem
              if (!effectiveCharacterId) return;
              const response = await fetch(`/api/character/${effectiveCharacterId}`);
              if (response.ok) {
                const characterData = await response.json();
                setCharacter(characterData);
              }
            }}
          />
        )}

        {/* Character Stats and Equipment Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Stats Panel */}
          <div className="glass-card p-6">
            <h2 className="text-2xl font-bold mb-4 text-text-primary">Stats</h2>
            <div className="space-y-3">
              {/* HP */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-500" />
                  <span className="text-text-secondary">HP:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {stats.total.hp}/{stats.total.maxHp}
                  </div>
                  {stats.equipment.hp > 0 && (
                    <div className="text-xs text-green-400">
                      {stats.base.hp} + {stats.equipment.hp}
                    </div>
                  )}
                </div>
              </div>

              {/* MP */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-500" />
                  <span className="text-text-secondary">MP:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {stats.total.mp}/{stats.total.maxMp}
                  </div>
                  {stats.equipment.mp > 0 && (
                    <div className="text-xs text-green-400">
                      {stats.base.mp} + {stats.equipment.mp}
                    </div>
                  )}
                </div>
              </div>

              {/* Stamina */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Battery className="w-5 h-5 text-orange-500" />
                  <span className="text-text-secondary">Stamina:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {stats.total.stamina}/{stats.total.maxStamina}
                  </div>
                  {stats.equipment.stamina > 0 && (
                    <div className="text-xs text-green-400">
                      {stats.base.stamina} + {stats.equipment.stamina}
                    </div>
                  )}
                </div>
              </div>

              {/* STR */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sword className="w-5 h-5 text-yellow-500" />
                  <span className="text-text-secondary">STR:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {stats.total.str}
                  </div>
                  {stats.equipment.str > 0 && (
                    <div className="text-xs text-green-400">
                      {stats.base.str} + {stats.equipment.str}
                    </div>
                  )}
                </div>
              </div>

              {/* DEF */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-500" />
                  <span className="text-text-secondary">DEF:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {stats.total.def}
                  </div>
                  {stats.equipment.def > 0 && (
                    <div className="text-xs text-green-400">
                      {stats.base.def} + {stats.equipment.def}
                    </div>
                  )}
                </div>
              </div>

              {/* AGI */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-cyan-500" />
                  <span className="text-text-secondary">AGI:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {stats.base.agi}
                  </div>
                </div>
              </div>

              {/* INT */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  <span className="text-text-secondary">INT:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {stats.base.int}
                  </div>
                </div>
              </div>

              {/* CRIT */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <span className="text-text-secondary">CRIT:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {(stats.base.agi * 0.2).toFixed(1)}%
                  </div>
                  <div className="text-xs text-text-secondary">
                    AGI × 0.2
                  </div>
                </div>
              </div>

              {/* SPEED */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-green-400" />
                  <span className="text-text-secondary">SPEED:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {(stats.base.agi * 0.5).toFixed(1)}
                  </div>
                  <div className="text-xs text-text-secondary">
                    AGI × 0.5
                  </div>
                </div>
              </div>

              {/* Bonus Stats (se existirem) */}
              {stats.total.bonusDamage > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sword className="w-5 h-5 text-orange-500" />
                    <span className="text-text-secondary">Bonus DMG:</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg text-orange-400">
                      +{stats.total.bonusDamage}
                    </div>
                  </div>
                </div>
              )}

              {stats.total.bonusSpeed > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-cyan-500" />
                    <span className="text-text-secondary">Bonus SPD:</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg text-cyan-400">
                      +{stats.total.bonusSpeed}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

            {/* Equipment Panel - estilo Black Desert (slots em volta da silhueta) */}
          <div className="glass-card p-6 col-span-2">
            <h2 className="text-2xl font-bold mb-4 text-white">Equipamentos</h2>
            <div
              className="relative overflow-hidden rounded-2xl border p-4 sm:p-6"
              style={{ borderColor: `${visual.borderColor}44` }}
            >
              {/* Cenário animado + silhueta central */}
              <div className="absolute inset-0 opacity-40">
                <CreationCardBackdrop theme={visual.backdropTheme} />
              </div>
              <div className="absolute inset-0 bg-black/55" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <PersonSilhouette color={visual.borderColor} className="h-[90%] w-auto" />
              </div>

              {/* Slots em duas colunas ao redor da silhueta */}
              <div className="relative flex items-stretch justify-between gap-2 min-h-[290px]">
                {/* Coluna esquerda: defensivos (cor da raça) */}
                <div className="flex flex-col justify-between gap-3">
                  {(['HELMET', 'ARMOR', 'GLOVES', 'BOOTS'] as const).map((slot) => (
                    <EquipmentSlot
                      key={slot}
                      compact
                      accent={visual.raceVisual.accent}
                      type={slot}
                      item={character.equipment?.find(e => e.slot === slot)?.item}
                      onEquip={handleEquip}
                      onUnequip={handleUnequip}
                    />
                  ))}
                </div>
                {/* Coluna direita: ofensivos/acessórios (cor da classe) */}
                <div className="flex flex-col justify-between gap-3">
                  {(['WEAPON', 'SHIELD', 'NECKLACE', 'RING_1', 'RING_2'] as const).map((slot) => (
                    <EquipmentSlot
                      key={slot}
                      compact
                      accent={visual.classVisual.accent}
                      type={slot}
                      item={character.equipment?.find(e => e.slot === slot)?.item}
                      onEquip={handleEquip}
                      onUnequip={handleUnequip}
                    />
                  ))}
                </div>
              </div>
            </div>            {/* Inventory Section */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-xl font-bold text-white">
                  Inventário ({inventory.length}/{character.inventorySlots || 10})
                </h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Coins className="w-4 h-4 text-yellow-500" />
                    <span>{goldOnchainText}</span>
                  </div>
                  <button
                    onClick={handleExpandInventory}
                    disabled={expandingSlots}
                    title="Custo: 1000 GOLD"
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-black rounded-xl shadow-lg hover:scale-105 disabled:opacity-50 transition-transform"
                    style={{ background: 'linear-gradient(90deg, #eab308cc, #eab30877)', boxShadow: '0 4px 16px rgba(234,179,8,0.3)' }}
                  >
                    <Plus className="w-4 h-4" />
                    {expandingSlots ? 'Expandindo...' : '+5 Slots (1000 GOLD)'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 p-3 bg-black/40 rounded-2xl border border-white/10">
                {/* Renderizar itens nos slots disponíveis */}
                {Array(character.inventorySlots || 10).fill(null).map((_, idx) => {
                  const inventoryItem = inventory[idx];
                  if (inventoryItem) {
                    const isEquipped = character.equipment?.some(e => e.item.id === inventoryItem.item.id) || false;
                    return (
                      <DraggableItem
                        key={inventoryItem.item.id}
                        item={inventoryItem.item}
                        isEquipped={isEquipped}
                        compact
                        accent={visual.borderColor}
                        onEquip={handleEquip}
                        onUnequip={handleUnequip}
                        onConsume={handleConsume}
                        characterId={effectiveCharacterId || ''}
                      />
                    );
                  }
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="aspect-square rounded-md bg-black/40 border border-white/10"
                    />
                  );
                })}
              </div>
              {inventory.length > (character.inventorySlots || 10) && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">
                    ⚠️ Você tem mais itens do que slots disponíveis! Expanda seu inventário ou mova itens para o inventário global.
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Character History Panel */}
          <CharacterHistory characterId={effectiveCharacterId || ''} />
        </div>
          </div>
        </div>
        </div>
      </div>
    </DndProvider>
  );
}
