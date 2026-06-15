'use client';

import { useDrag } from 'react-dnd';
import ItemIcon from './ItemIcon';
import { Item } from '@/types/item';
import { ItemTooltip } from './ItemTooltip';
import { EquipmentSlotType } from '@prisma/client';

interface DraggableItemProps {
  item: Item;
  isEquipped?: boolean;
  onEquip?: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip?: (itemId: string) => void;
  onConsume?: (itemId: string) => void;
  characterId?: string;
  /** Modo compacto estilo Black Desert: slot pequeno, fundo escuro */
  compact?: boolean;
  /** Cor de destaque (hex) para a borda do slot */
  accent?: string;
}

export function DraggableItem({ item, isEquipped, onEquip, onUnequip, onConsume, characterId, compact, accent }: DraggableItemProps) {
  const [{ isDragging }, drag] = useDrag({
    type: 'ITEM',
    item: { ...item },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  if (compact) {
    return (
      <ItemTooltip
        item={item}
        isEquipped={isEquipped}
        onEquip={onEquip}
        onUnequip={onUnequip}
        onConsume={onConsume}
        characterId={characterId}
      >
        <div
          ref={drag as any}
          className={`group relative aspect-square rounded-md border bg-black/50 hover:bg-black/30 transition-all cursor-pointer ${
            isDragging ? 'opacity-50' : 'opacity-100'
          }`}
          style={{
            borderColor: isEquipped ? '#22c55e' : `${accent || '#a855f7'}66`,
            boxShadow: `0 0 8px ${accent || '#a855f7'}33`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <ItemIcon type={item.type} size={22} className="group-hover:scale-110 transition-transform text-white" />
          </div>
          <div className="absolute bottom-0 right-0.5 text-[9px] font-bold bg-black/70 px-0.5 rounded text-white">
            {item.level}
          </div>
          {isEquipped && (
            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full"></div>
          )}
        </div>
      </ItemTooltip>
    );
  }

  return (
    <ItemTooltip
      item={item}
      isEquipped={isEquipped}
      onEquip={onEquip}
      onUnequip={onUnequip}
      onConsume={onConsume}
      characterId={characterId}
    >
      <div
        ref={drag as any}
        className={`
          group relative aspect-square bg-surface/50 rounded-lg border-2
          border-primary/30 hover:border-primary transition-colors p-2 cursor-pointer
          ${isDragging ? 'opacity-50' : 'opacity-100'}
          ${isEquipped ? 'border-green-500' : ''}
        `}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <ItemIcon type={item.type} size={32} className="group-hover:scale-110 transition-transform" />
        </div>
        <div className="absolute bottom-1 right-1 text-xs bg-black/50 px-1 rounded">
          {item.level}
        </div>
        {isEquipped && (
          <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></div>
        )}
      </div>
    </ItemTooltip>
  );
}
