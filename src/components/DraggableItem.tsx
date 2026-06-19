'use client';

import { useDrag } from 'react-dnd';
import ItemIcon from './ItemIcon';
import { Item } from '@/types/item';
import { ItemTooltip } from './ItemTooltip';
import { EquipmentSlotType } from '@prisma/client';
import { resolveImageUrl } from '@/lib/imageUrl';
import { getLevelLabel } from '@/lib/enhancementSystem';

interface DraggableItemProps {
  item: Item;
  isEquipped?: boolean;
  /** Nível de aprimoramento da instância (+1, +2, ...). 0 = sem aprimoramento. */
  enhancementLevel?: number;
  /** Quantidade empilhada (consumíveis). Exibe badge quando > 1. */
  quantity?: number;
  /** Id da linha de inventário (CharacterInventory). Necessário para aprimorar. */
  inventoryId?: string;
  onEquip?: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip?: (itemId: string) => void;
  onConsume?: (itemId: string) => void;
  onEnhance?: (inventoryId: string, itemName: string) => void;
  onTransfer?: (itemId: string) => void;
  onSendToGlobal?: (itemId: string) => void;
  characterId?: string;
  /** Modo compacto estilo Black Desert: slot pequeno, fundo escuro */
  compact?: boolean;
  /** Cor de destaque (hex) para a borda do slot */
  accent?: string;
}

export function DraggableItem({ item, isEquipped, enhancementLevel = 0, quantity = 1, inventoryId, onEquip, onUnequip, onConsume, onEnhance, onTransfer, onSendToGlobal, characterId, compact, accent }: DraggableItemProps) {
  const itemImage = resolveImageUrl(item.image);
  const showEnhancement = enhancementLevel > 0;
  const showQuantity = quantity > 1;
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
        enhancementLevel={enhancementLevel}
        inventoryId={inventoryId}
        onEquip={onEquip}
        onUnequip={onUnequip}
        onConsume={onConsume}
        onEnhance={onEnhance}
        onTransfer={onTransfer}
        onSendToGlobal={onSendToGlobal}
        characterId={characterId}
      >
        <div
          ref={drag as any}
          className={`group relative aspect-square cursor-pointer ${isDragging ? 'opacity-50' : 'opacity-100'}`}
          style={{ background: 'linear-gradient(160deg, #11161b, #0c1015)', border: '1px solid #262e37' }}
        >
          <div
            style={{
              position: 'absolute', inset: 3,
              border: `1.5px solid ${isEquipped ? '#22c55e' : (accent || '#3f7fd6')}`,
              background: 'linear-gradient(160deg, #262e38, #141a20)',
              boxShadow: 'inset 0 0 7px rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {itemImage ? (
              <img
                src={itemImage}
                alt={item.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                referrerPolicy="no-referrer"
              />
            ) : (
              <ItemIcon type={item.type} size={20} className="group-hover:scale-110 transition-transform text-white" />
            )}
          </div>
          {showEnhancement && (
            <span
              style={{
                position: 'absolute', right: 3, bottom: 1, fontSize: '10px', fontWeight: 700,
                color: '#f1d79a', textShadow: '0 1px 2px #000',
              }}
            >
              {getLevelLabel(enhancementLevel)}
            </span>
          )}
          {isEquipped && (
            <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-500 rounded-full"></div>
          )}
          {showQuantity && (
            <span
              style={{
                position: 'absolute', left: 3, bottom: 1, fontSize: '10px', fontWeight: 700,
                color: '#fff', textShadow: '0 1px 2px #000, 0 0 3px #000',
              }}
            >
              x{quantity}
            </span>
          )}
        </div>
      </ItemTooltip>
    );
  }

  return (
    <ItemTooltip
      item={item}
      isEquipped={isEquipped}
      enhancementLevel={enhancementLevel}
      inventoryId={inventoryId}
      onEquip={onEquip}
      onUnequip={onUnequip}
      onConsume={onConsume}
      onEnhance={onEnhance}
      onTransfer={onTransfer}
      onSendToGlobal={onSendToGlobal}
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
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg">
          {itemImage ? (
            <img
              src={itemImage}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
              referrerPolicy="no-referrer"
            />
          ) : (
            <ItemIcon type={item.type} size={32} className="group-hover:scale-110 transition-transform" />
          )}
        </div>
        {showEnhancement && (
          <div className="absolute bottom-1 right-1 text-xs font-bold text-[#f1d79a] bg-black/60 px-1 rounded">
            {getLevelLabel(enhancementLevel)}
          </div>
        )}
        {isEquipped && (
          <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full"></div>
        )}
        {showQuantity && (
          <div className="absolute bottom-1 left-1 text-xs font-bold text-white bg-black/60 px-1 rounded">
            x{quantity}
          </div>
        )}
      </div>
    </ItemTooltip>
  );
}
