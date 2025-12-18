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
import toast from 'react-hot-toast';
import { useGold } from '@/components/providers/GoldProvider';
import { useRouter } from 'next/navigation';

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
  const { goldBalance, updateGoldBalance } = useGold();
  const [character, setCharacter] = useState<Character | null>(null);
  const [effectiveCharacterId, setEffectiveCharacterId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [expandingSlots, setExpandingSlots] = useState(false);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

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
      res: (character.baseStats as any)?.res || 5,
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
        res: total.res + (itemStats.def || 0), // ItemStats usa 'def' em vez de 'res'
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
      res: 0,
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
        res: baseStats.res + equipmentStats.res,
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

  const calculateExpansionCost = (currentSlots: number, slotsToAdd: number) => {
    const baseCost = 100;
    let totalCost = 0;
    for (let i = 0; i < slotsToAdd; i++) {
      const slotNumber = currentSlots + i;
      const slotCost = baseCost * Math.floor(slotNumber / 10 + 1);
      totalCost += slotCost;
    }
    return totalCost;
  };

  const handleExpandInventory = async () => {
    if (!character || !effectiveCharacterId) return;
    
    // Calcular custo para 5 slots adicionais
    const slotsToAdd = 5;
    const currentSlots = character.inventorySlots || 10;
    const totalCost = calculateExpansionCost(currentSlots, slotsToAdd);

    if (!goldBalance || goldBalance < totalCost) {
      toast.error(`💰 Gold insuficiente! Você precisa de ${totalCost} gold, mas tem ${goldBalance || 0}.`);
      return;
    }

    setExpandingSlots(true);
    try {
      const response = await fetch(`/api/character/${effectiveCharacterId}/expand-inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slots: slotsToAdd }),
      });

      if (response.ok) {
        const data = await response.json();
        setCharacter(data.character);
        // Atualizar o gold no contexto
        updateGoldBalance((goldBalance || 0) - totalCost);
        toast.success(`📦 +${slotsToAdd} slots adicionados! (${totalCost} gold gastos)`);
      } else {
        const error = await response.json();
        toast.error(`❌ ${error.error}`);
      }
    } catch (error) {
      console.error('Error expanding inventory:', error);
      toast.error('💥 Erro inesperado ao expandir inventário');
    }
    setExpandingSlots(false);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="container mx-auto px-4 py-8">
        <div className="glass-card p-8">
          {/* Character Header */}
          <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-5xl text-white border-4 border-primary shadow-lg">
              {character.avatar || character.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-4xl font-bold text-text-primary mb-2">{character.name}</h1>
              <div className="flex gap-4 mb-4">
                <span className="text-lg font-semibold text-primary bg-surface/70 rounded px-4 py-2">
                  {raceObj?.name}
                </span>
                <span className="text-lg font-semibold text-primary bg-surface/70 rounded px-4 py-2">
                  {classObj?.name}
                </span>
              </div>
              <div className="flex gap-4">
                <span className="bg-surface/70 px-4 py-2 rounded text-text-secondary">
                  Level {character.level}
                </span>
                <span className="bg-surface/70 px-4 py-2 rounded text-text-secondary">
                  XP: {character.experience}/{character.nextLevelExperience || '?'}
                </span>
                {character.availablePoints && character.availablePoints > 0 && (
                  <span className="bg-primary/20 px-4 py-2 rounded text-primary font-bold">
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
                      const result = await response.json();
                      if (result.success) {
                        toast.success(result.message);
                        // Recarregar dados do personagem
                        const updatedResponse = await fetch(`/api/character/${effectiveCharacterId}`);
                        if (updatedResponse.ok) {
                          const characterData = await updatedResponse.json();
                          setCharacter(characterData);
                        }
                      } else {
                        toast.error('Erro ao adicionar XP');
                      }
                    } catch (error) {
                      toast.error('Erro ao adicionar XP');
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
                      const result = await response.json();
                      if (result.success) {
                        toast.success(result.message);
                        // Recarregar dados do personagem
                        const updatedResponse = await fetch(`/api/character/${effectiveCharacterId}`);
                        if (updatedResponse.ok) {
                          const characterData = await updatedResponse.json();
                          setCharacter(characterData);
                        }
                      } else {
                        toast.error('Erro ao adicionar XP');
                      }
                    } catch (error) {
                      toast.error('Erro ao adicionar XP');
                    }
                  }}
                  className="px-3 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600"
                >
                  +1000 XP (Level Up)
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
            <button
              onClick={() => router.push('/combat-lobby')}
              className="flex-1 sm:flex-none bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:from-red-600 hover:to-red-700 transition-all flex items-center justify-center gap-2"
            >
              <Sword className="w-5 h-5" />
              Entrar em Combate
            </button>
            <button
              onClick={() => router.push('/dungeons')}
              className="flex-1 sm:flex-none bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:from-purple-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
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
              res: (character.attributes as any)?.res || (character.baseStats as any)?.res || 0,
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
                  <span className="text-text-secondary">RES:</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">
                    {stats.total.res}
                  </div>
                  {stats.equipment.res > 0 && (
                    <div className="text-xs text-green-400">
                      {stats.base.res} + {stats.equipment.res}
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

            {/* Equipment Panel - Diablo Style */}
          <div className="glass-card p-6 col-span-2">
            <h2 className="text-2xl font-bold mb-4 text-text-primary">Equipment</h2>
            <div className="grid grid-cols-3 gap-4 p-4 bg-surface/30 rounded-lg">
              <EquipmentSlot
                type="HELMET"
                item={character.equipment?.find(e => e.slot === 'HELMET')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
              <EquipmentSlot
                type="NECKLACE"
                item={character.equipment?.find(e => e.slot === 'NECKLACE')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
              <EquipmentSlot
                type="RING_1"
                item={character.equipment?.find(e => e.slot === 'RING_1')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
              <EquipmentSlot
                type="ARMOR"
                item={character.equipment?.find(e => e.slot === 'ARMOR')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
              <EquipmentSlot
                type="WEAPON"
                item={character.equipment?.find(e => e.slot === 'WEAPON')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
              <EquipmentSlot
                type="SHIELD"
                item={character.equipment?.find(e => e.slot === 'SHIELD')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
              <EquipmentSlot
                type="GLOVES"
                item={character.equipment?.find(e => e.slot === 'GLOVES')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
              <EquipmentSlot
                type="RING_2"
                item={character.equipment?.find(e => e.slot === 'RING_2')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
              <EquipmentSlot
                type="BOOTS"
                item={character.equipment?.find(e => e.slot === 'BOOTS')?.item}
                onEquip={handleEquip}
                onUnequip={handleUnequip}
              />
            </div>            {/* Inventory Section */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-text-primary">
                  Inventory ({inventory.length}/{character.inventorySlots || 10})
                </h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <Coins className="w-4 h-4 text-yellow-500" />
                    <span>{goldBalance || 0} Gold</span>
                  </div>
                  <button
                    onClick={handleExpandInventory}
                    disabled={expandingSlots}
                    title={`Custo: ${calculateExpansionCost(character.inventorySlots || 10, 5)} gold`}
                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white text-sm rounded-lg hover:from-yellow-600 hover:to-yellow-700 disabled:opacity-50 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    {expandingSlots ? 'Expandindo...' : `+5 Slots (${calculateExpansionCost(character.inventorySlots || 10, 5)}g)`}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2">
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
                      className="aspect-square bg-surface/50 rounded-lg border-2 border-primary/30"
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
    </DndProvider>
  );
}
