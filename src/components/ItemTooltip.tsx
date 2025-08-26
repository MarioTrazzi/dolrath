'use client';

import { useState, useRef, useEffect } from 'react';
import { Item } from '@/types/item';
import { EquipmentSlotType } from '@prisma/client';

interface ItemTooltipProps {
  item: Item;
  isEquipped?: boolean;
  onEquip?: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip?: (itemId: string) => void;
  onConsume?: (itemId: string) => void;
  characterId?: string;
  children: React.ReactNode;
}

export function ItemTooltip({ item, isEquipped, onEquip, onUnequip, onConsume, characterId, children }: ItemTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const hideTimeoutRef = useRef<NodeJS.Timeout>();

  const getSlotTypeFromItemType = (itemType: string): EquipmentSlotType => {
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
        return 'RING_1'; // Sempre tentar RING_1 primeiro, a API vai decidir o slot final
      default:
        return 'WEAPON';
    }
  };

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Delay antes de esconder o tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 300); // 300ms de delay
  };

  const handleTooltipMouseEnter = () => {
    // Cancelar o timeout de esconder se o mouse entrar no tooltip
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
  };

  const handleTooltipMouseLeave = () => {
    // Esconder imediatamente quando sair do tooltip
    setShowTooltip(false);
  };

  // Limpeza dos timeouts quando o componente for desmontado
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const handleAction = () => {
    // Para itens consumíveis, consumir ao invés de equipar
    if (item.type === 'CONSUMABLE' && onConsume && characterId) {
      onConsume(item.id);
    } else if (isEquipped && onUnequip) {
      onUnequip(item.id);
    } else if (!isEquipped && onEquip) {
      const slotType = getSlotTypeFromItemType(item.type);
      onEquip(item.id, slotType);
    }
    setShowTooltip(false); // Hide tooltip after action
  };

  const formatStats = () => {
    const stats = [];
    
    // Para itens consumíveis, mostrar efeitos de restauração
    if (item.type === 'CONSUMABLE') {
      if ((item.stats as any).staminaRestore) stats.push(`Restaura ${(item.stats as any).staminaRestore} Stamina`);
      if ((item.stats as any).healthRestore) stats.push(`Restaura ${(item.stats as any).healthRestore} HP`);
      if ((item.stats as any).manaRestore) stats.push(`Restaura ${(item.stats as any).manaRestore} MP`);
    } else {
      // Para equipamentos, mostrar stats normais
      if (item.stats.str) stats.push(`STR: +${item.stats.str}`);
      if (item.stats.def) stats.push(`DEF: +${item.stats.def}`);
      if (item.stats.hp) stats.push(`HP: +${item.stats.hp}`);
      if (item.stats.mp) stats.push(`MP: +${item.stats.mp}`);
      if (item.stats.bonusDamage) stats.push(`Damage: +${item.stats.bonusDamage}`);
      if (item.stats.bonusSpeed) stats.push(`Speed: +${item.stats.bonusSpeed}`);
    }
    
    return stats;
  };

  const getRarityColor = (level: number) => {
    if (level >= 80) return 'border-orange-500 bg-orange-900/20'; // Legendary
    if (level >= 60) return 'border-purple-500 bg-purple-900/20'; // Epic
    if (level >= 40) return 'border-blue-500 bg-blue-900/20'; // Rare
    if (level >= 20) return 'border-green-500 bg-green-900/20'; // Uncommon
    return 'border-gray-500 bg-gray-900/20'; // Common
  };

  return (
    <div 
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      {showTooltip && (
        <div 
          ref={tooltipRef}
          className={`absolute z-50 w-64 p-4 border rounded-lg shadow-2xl backdrop-blur-sm ${getRarityColor(item.level)} 
                     bottom-full left-1/2 transform -translate-x-1/2 mb-2`}
          style={{ 
            background: 'rgba(17, 24, 39, 0.98)'
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          {/* Pequena seta apontando para o item */}
          <div 
            className="absolute w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-gray-700
                       top-full left-1/2 transform -translate-x-1/2"
          />
          
          {/* Item Name with rarity color */}
          <h3 className={`text-lg font-bold mb-2 ${
            item.level >= 80 ? 'text-orange-400' :
            item.level >= 60 ? 'text-purple-400' :
            item.level >= 40 ? 'text-blue-400' :
            item.level >= 20 ? 'text-green-400' :
            'text-gray-300'
          }`}>
            {item.name}
          </h3>
          
          {/* Item Level and Type */}
          <div className="text-sm text-gray-300 mb-2 flex justify-between">
            <span>Level {item.level}</span>
            <span className="text-gray-400">{item.type}</span>
          </div>
          
          {/* Item Description */}
          {item.description && (
            <p className="text-sm text-gray-400 mb-3 italic">{item.description}</p>
          )}
          
          {/* Item Stats */}
          {formatStats().length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-green-400 mb-1">Stats:</h4>
              <div className="text-sm text-gray-300 space-y-1">
                {formatStats().map((stat, index) => (
                  <div key={index} className="text-green-300">{stat}</div>
                ))}
              </div>
            </div>
          )}
          
          {/* Special Effect */}
          {item.stats.specialEffect && (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-purple-400 mb-1">Special Effect:</h4>
              <p className="text-sm text-purple-300">{item.stats.specialEffect}</p>
            </div>
          )}
          
          {/* Gold Value */}
          <div className="mb-3 text-sm text-yellow-400">
            💰 {item.goldPrice} gold
          </div>
          
          {/* Action Button */}
          <button
            onClick={handleAction}
            className={`w-full py-2 px-4 rounded font-semibold text-sm transition-all duration-200 ${
              item.type === 'CONSUMABLE'
                ? 'bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 hover:border-blue-400'
                : isEquipped
                ? 'bg-red-600 hover:bg-red-700 text-white border border-red-500 hover:border-red-400'
                : 'bg-green-600 hover:bg-green-700 text-white border border-green-500 hover:border-green-400'
            } shadow-lg hover:shadow-xl transform hover:scale-105`}
          >
            {item.type === 'CONSUMABLE' 
              ? '🧪 Consumir' 
              : isEquipped 
              ? '⚔️ Unequip' 
              : '🛡️ Equip'
            }
          </button>
        </div>
      )}
    </div>
  );
}
