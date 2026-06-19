'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: 0, left: 0, placement: 'top' });
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const hideTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => setMounted(true), []);

  const TOOLTIP_WIDTH = 256; // w-64

  // Posiciona o tooltip (via portal, position: fixed) a partir da posição do item,
  // escapando de overflow/stacking contexts dos painéis ao redor.
  useLayoutEffect(() => {
    if (!showTooltip || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const GAP = 8;
    const centerX = rect.left + rect.width / 2;
    let left = centerX - TOOLTIP_WIDTH / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - 8));
    // Sem espaço suficiente acima → mostra abaixo do item.
    const placeBelow = rect.top < 340;
    const top = placeBelow ? rect.bottom + GAP : rect.top - GAP;
    setCoords({ top, left, placement: placeBelow ? 'bottom' : 'top' });
  }, [showTooltip]);

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

  // Fecha o card ao clicar fora dele (quando aberto por clique).
  useEffect(() => {
    if (!showTooltip) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setShowTooltip(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [showTooltip]);

  const handleClick = () => {
    // Clicar abre/fecha o card de opções (alternativa ao drag and drop).
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setShowTooltip((prev) => !prev);
  };

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
      onClick={handleClick}
    >
      {children}

      {showTooltip && mounted && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed w-64 p-4 border rounded-lg shadow-2xl backdrop-blur-sm ${getRarityColor(item.level)}`}
          style={{
            background: 'rgba(17, 24, 39, 0.98)',
            top: coords.top,
            left: coords.left,
            zIndex: 9999,
            transform: coords.placement === 'top' ? 'translateY(-100%)' : 'none',
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
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
              ? '⚔️ Desequipar'
              : '🛡️ Equipar'
            }
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
