'use client';

import { useDrop } from 'react-dnd';
import type { ConnectDropTarget } from 'react-dnd';
import ItemIcon from './ItemIcon';
import { ItemTooltip } from './ItemTooltip';
import { Item } from '@/types/item';
import { EquipmentSlotType } from '@prisma/client';
import { useRef, useState } from 'react';
import { resolveImageUrl } from '@/lib/imageUrl';
import { itemImagePath } from '@/lib/itemCatalog';
import { getLevelLabel } from '@/lib/enhancementSystem';

interface EquipmentSlotProps {
  type: EquipmentSlotType;
  item?: Item;
  /** Nível de aprimoramento da instância equipada (+1, +2, ...). 0 = sem aprimoramento. */
  enhancementLevel?: number;
  /** Durabilidade da peça equipada (desgasta com o uso; 0 = quebrada, sem bônus). */
  durability?: number;
  maxDurability?: number;
  onEquip: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip: (itemId: string) => void;
  /** Modo compacto estilo Black Desert: slot pequeno e quadrado, com emoji-placeholder */
  compact?: boolean;
  /** Cor de destaque (hex) para borda/realce do slot */
  accent?: string;
  /**
   * Slot "fantasma": exibe o item de forma opaca/esmaecida porque ele está
   * ocupado indiretamente (ex.: luva bloqueada por manopla equipada nas mãos).
   * O item ainda pode ser desequipado a partir daqui, mas não fica em destaque.
   */
  ghost?: boolean;
}

// Emoji-placeholder por tipo de slot (mostrado quando o slot está vazio no modo compacto)
const SLOT_EMOJI: Record<string, string> = {
  HELMET: '⛑️',
  ARMOR: '🥋',
  GLOVES: '🧤',
  BOOTS: '🥾',
  WEAPON: '⚔️',
  SHIELD: '🛡️', // slot de secundária/offhand (escudo, orbe, adaga, manopla)
  NECKLACE: '📿',
  RING_1: '💍',
  RING_2: '💍',
  BELT: '🎗️',
};

function canEquipInSlot(itemType: string, slotType: EquipmentSlotType): boolean {
  switch (slotType) {
    case EquipmentSlotType.WEAPON:
      // Arma primária por classe (GAUNTLET = punhos do Monge)
      return ['SWORD', 'AXE', 'DAGGER', 'STAFF', 'BOW', 'GAUNTLET'].includes(itemType);
    case EquipmentSlotType.ARMOR:
      return ['LIGHT_ARMOR', 'MEDIUM_ARMOR', 'HEAVY_ARMOR'].includes(itemType);
    case EquipmentSlotType.SHIELD:
      // Secundária/offhand: escudo (guerreiro), orbe (mago),
      // adaga de parada (ladino) e talismã (monge)
      return ['SHIELD', 'ORB', 'PARRY_DAGGER', 'TALISMAN'].includes(itemType);
    case EquipmentSlotType.BELT:
      return itemType === 'BELT';
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

export function EquipmentSlot({ type, item, enhancementLevel = 0, durability, maxDurability, onEquip, onUnequip, compact, accent, ghost }: EquipmentSlotProps) {
  // Imagem: banco (item.image) → asset estático por nome (/items/<slug>.webp) →
  // ícone genérico só se a arte 404. Espelha DraggableItem/ItemTooltip e cobre
  // itens criados sem `image` no banco (ex.: acessórios novos), que antes caíam
  // direto no ícone SVG ao serem equipados.
  const [imgError, setImgError] = useState(false);
  const itemImage = item && !imgError
    ? (resolveImageUrl(item.image) ?? (item.name ? itemImagePath(item.name) : null))
    : null;
  const showEnhancement = enhancementLevel > 0;

  // Barra de durabilidade da peça equipada (só quando a instância informa o valor).
  const hasDurability = typeof durability === 'number' && typeof maxDurability === 'number' && maxDurability > 0;
  const durabilityPct = hasDurability ? Math.max(0, Math.min(100, Math.round((durability! / maxDurability!) * 100))) : 100;
  const broken = hasDurability && durability! <= 0;
  const durabilityColor = durabilityPct < 30 ? '#ef4444' : durabilityPct < 70 ? '#f59e0b' : '#10b981';
  const durabilityBar = hasDurability && (broken || durabilityPct < 100) ? (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/70 z-10">
      <div className="h-full" style={{ width: `${durabilityPct}%`, background: durabilityColor }} />
    </div>
  ) : null;
  const brokenBadge = broken ? (
    <span className="absolute top-0.5 left-0.5 text-[11px] z-10 select-none" title="Quebrado — sem bônus até reparar" style={{ filter: 'drop-shadow(0 1px 2px #000)' }}>
      💔
    </span>
  ) : null;

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
    const slotAccent = accent || '#d9a441';
    const borderColor =
      isOver && canDrop ? '#22c55e'
      : isOver && !canDrop ? '#ef4444'
      : slotAccent;

    return (
      <div
        ref={ref}
        title={ghost ? `${slotLabel} (ocupado pela manopla)` : slotLabel}
        className="w-[52px] h-[52px] sm:w-[54px] sm:h-[54px] flex items-center justify-center relative transition-all"
        style={{
          // Borda o mais fina possível (1px) p/ a arte do item dominar o slot.
          border: `1px solid ${borderColor}`,
          background: 'linear-gradient(155deg, #1c232b, #0d1116)',
          boxShadow: `inset 0 0 13px ${slotAccent}${item ? '4d' : '26'}`,
        }}
      >
        {item ? (
          <ItemTooltip item={item} isEquipped={true} enhancementLevel={enhancementLevel} durability={durability} maxDurability={maxDurability} onUnequip={onUnequip}>
            <div className={`relative w-full h-full cursor-pointer group flex items-center justify-center overflow-hidden ${ghost ? 'opacity-40' : ''}`}>
              {itemImage ? (
                <img
                  src={itemImage}
                  alt={item.name}
                  onError={() => setImgError(true)}
                  className={`w-full h-full object-cover art-bright group-hover:scale-110 transition-transform ${broken ? 'grayscale opacity-60' : ''}`}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <ItemIcon type={item.type} size={24} className="group-hover:scale-110 transition-transform text-white" />
              )}
              {brokenBadge}
              {durabilityBar}
            </div>
          </ItemTooltip>
        ) : (
          <span className="text-xl opacity-30 select-none">{SLOT_EMOJI[type] || '▫️'}</span>
        )}
        {item && showEnhancement && (
          <span
            className="pointer-events-none"
            style={{
              position: 'absolute', top: -7, right: -6, zIndex: 20, background: '#0e1318',
              border: `1px solid ${slotAccent}`, color: '#f1d79a', fontSize: '9.5px',
              fontWeight: 700, padding: '0 3px', lineHeight: '13px',
            }}
          >
            {getLevelLabel(enhancementLevel)}
          </span>
        )}
      </div>
    );
  }

  // ---------------------- Modo padrão ----------------------
  return (
    <div
      ref={ref}
      className={`equipment-slot aspect-square bg-surface/50 rounded-lg border
        ${isOver && canDrop ? 'border-green-500' : ''}
        ${isOver && !canDrop ? 'border-red-500' : ''}
        ${!isOver ? 'border-primary/30' : ''}
        flex items-center justify-center relative`}
    >
      {item ? (
        <ItemTooltip
          item={item}
          isEquipped={true}
          enhancementLevel={enhancementLevel}
          durability={durability}
          maxDurability={maxDurability}
          onUnequip={onUnequip}
        >
          <div className="relative w-full h-full cursor-pointer group flex items-center justify-center overflow-hidden rounded-md">
            {itemImage ? (
              <img
                src={itemImage}
                alt={item.name}
                onError={() => setImgError(true)}
                className={`w-full h-full object-cover art-bright group-hover:scale-110 transition-transform ${broken ? 'grayscale opacity-60' : ''}`}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <ItemIcon type={item.type} size={32} className="group-hover:scale-110 transition-transform" />
            )}
            {brokenBadge}
            {durabilityBar}
            {showEnhancement && (
              <div className="absolute bottom-1 right-1 text-xs font-bold text-[#f1d79a] bg-black/60 px-1 rounded">
                {getLevelLabel(enhancementLevel)}
              </div>
            )}
          </div>
        </ItemTooltip>
      ) : (
        <span className="text-text-secondary text-sm">{slotLabel}</span>
      )}
    </div>
  );
}
