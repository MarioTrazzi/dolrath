'use client';

import { useDrop } from 'react-dnd';
import type { ConnectDropTarget } from 'react-dnd';
import ItemIcon from './ItemIcon';
import { ItemTooltip } from './ItemTooltip';
import { Item } from '@/types/item';
import { EquipmentSlotType } from '@prisma/client';
import { useRef } from 'react';

interface EquipmentSlotProps {
  type: EquipmentSlotType;
  item?: Item;
  onEquip: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip: (itemId: string) => void;
  /** Modo compacto estilo Black Desert: slot pequeno e quadrado, com emoji-placeholder */
  compact?: boolean;
  /** Cor de destaque (hex) para borda/realce do slot */
  accent?: string;
}

// Emoji-placeholder por tipo de slot (mostrado quando o slot está vazio no modo compacto)
const SLOT_EMOJI: Record<string, string> = {
  HELMET: '⛑️',
  ARMOR: '🥋',
  GLOVES: '🧤',
  BOOTS: '🥾',
  WEAPON: '⚔️',
  SHIELD: '🛡️',
  NECKLACE: '📿',
  RING_1: '💍',
  RING_2: '💍',
};

function canEquipInSlot(itemType: string, slotType: EquipmentSlotType): boolean {
  switch (slotType) {
    case EquipmentSlotType.WEAPON:
      return ['SWORD', 'AXE', 'DAGGER', 'STAFF', 'BOW'].includes(itemType);
    case EquipmentSlotType.ARMOR:
      return ['LIGHT_ARMOR', 'MEDIUM_ARMOR', 'HEAVY_ARMOR'].includes(itemType);
    case EquipmentSlotType.SHIELD:
      return itemType === 'SHIELD';
    case EquipmentSlotType.HELMET:
      return ['LIGHT_HELMET', 'MEDIUM_HELMET', 'HEAVY_HELMET'].includes(itemType);
    case EquipmentSlotType.BOOTS:
      return ['LIGHT_BOOTS', 'MEDIUM_BOOTS', 'HEAVY_BOOTS'].includes(itemType);
    case EquipmentSlotType.GLOVES:
      return ['LIGHT_GLOVES', 'MEDIUM_GLOVES', 'HEAVY_GLOVES'].includes(itemType);
    case EquipmentSlotType.NECKLACE:
      return itemType === 'NECKLACE';
    case EquipmentSlotType.RING_1:
    case EquipmentSlotType.RING_2:
      return itemType === 'RING';
    default:
      return false;
  }
}

export function EquipmentSlot({ type, item, onEquip, onUnequip, compact, accent }: EquipmentSlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'ITEM',
    drop: (droppedItem: Item) => {
      onEquip(droppedItem.id, type);
    },
    canDrop: (droppedItem: Item) => {
      return canEquipInSlot(droppedItem.type, type);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  // Connect the drop ref to our div
  drop(ref);

  const slotLabel = type.charAt(0) + type.slice(1).toLowerCase().replace('_', ' ');

  // ---------------------- Modo compacto (Black Desert) ----------------------
  if (compact) {
    const borderColor =
      isOver && canDrop ? '#22c55e'
      : isOver && !canDrop ? '#ef4444'
      : item ? (accent || '#a855f7')
      : `${accent || '#a855f7'}55`;

    return (
      <div
        ref={ref}
        title={slotLabel}
        className="equipment-slot w-12 h-12 sm:w-14 sm:h-14 rounded-lg border-2 bg-black/50 backdrop-blur-sm flex items-center justify-center relative transition-all"
        style={{
          borderColor,
          boxShadow: item ? `0 0 12px ${accent || '#a855f7'}55` : undefined,
        }}
      >
        {item ? (
          <ItemTooltip item={item} isEquipped={true} onUnequip={onUnequip}>
            <div className="w-full h-full p-1.5 cursor-pointer group flex items-center justify-center">
              <ItemIcon type={item.type} size={24} className="group-hover:scale-110 transition-transform text-white" />
              <div className="absolute bottom-0.5 right-1 text-[10px] font-bold bg-black/70 px-1 rounded text-white">
                {item.level}
              </div>
            </div>
          </ItemTooltip>
        ) : (
          <span className="text-base opacity-30 select-none">{SLOT_EMOJI[type] || '▫️'}</span>
        )}
      </div>
    );
  }

  // ---------------------- Modo padrão ----------------------
  return (
    <div
      ref={ref}
      className={`equipment-slot aspect-square bg-surface/50 rounded-lg border-2
        ${isOver && canDrop ? 'border-green-500' : ''}
        ${isOver && !canDrop ? 'border-red-500' : ''}
        ${!isOver ? 'border-primary/30' : ''}
        flex items-center justify-center relative`}
    >
      {item ? (
        <ItemTooltip
          item={item}
          isEquipped={true}
          onUnequip={onUnequip}
        >
          <div className="w-full h-full p-2 cursor-pointer group">
            <ItemIcon type={item.type} size={32} className="group-hover:scale-110 transition-transform" />
            <div className="absolute bottom-1 right-1 text-xs bg-black/50 px-1 rounded">
              {item.level}
            </div>
          </div>
        </ItemTooltip>
      ) : (
        <span className="text-text-secondary text-sm">{slotLabel}</span>
      )}
    </div>
  );
}
