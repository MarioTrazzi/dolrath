'use client';

import { DraggableItem } from '@/components/DraggableItem';
import { EquipmentSlotType } from '@prisma/client';
import { Item } from '@/types/item';

export interface InventoryRow {
  id: string; // id da linha de inventário (CharacterInventory)
  quantity: number;
  enhancementLevel?: number;
  /** Desgasta com o uso na masmorra; 0 = quebrado (sem bônus até reparar). */
  durability?: number;
  maxDurability?: number;
  item: Item;
}

interface CharacterItemGridProps {
  items: InventoryRow[];
  /** Quantidade total de slots a exibir (preenche o resto com slots vazios). */
  totalSlots?: number;
  accent: string;
  characterId: string;
  onEquip?: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip?: (itemId: string) => void;
  onConsume?: (itemId: string) => void;
  onEnhance?: (inventoryId: string, itemName: string, stoneCategory?: 'WEAPON' | 'ARMOR') => void;
  /** Abre a dialog de profissão (Forja/Alquimia/Processamento) com o insumo já posicionado. */
  onOpenCraft?: (craft: 'alchemy' | 'forge' | 'process' | 'cook', itemName: string) => void;
  /** Envia o item de volta ao inventário global (opcional — usado em /inventory).
   *  Recebe a quantidade (1 = uma unidade; stack inteiro no "Enviar tudo"). */
  onSendToGlobal?: (itemId: string, quantity?: number) => void;
  /** Inventário global: transfere o item para o personagem ativo (opcional).
   *  Recebe a quantidade disponível na pilha (1 = uma unidade). */
  onTransfer?: (itemId: string, quantity?: number) => void;
  /** Vende o equipamento ao ferreiro (burn). Recebe a linha de inventário. */
  onSell?: (inventoryId: string, quantity?: number) => void;
  /** Texto de busca para filtrar por nome. */
  search?: string;
  gridTemplateColumns?: string;
  gap?: number;
  /** Painel de origem dos itens ('character' | 'global'), repassado ao drag. */
  dragSource?: 'character' | 'global';
  /** Encontra a peça equipada no mesmo slot de um item do inventário, para o
   *  card mostrar a diferença de stats antes de trocar (ver ItemTooltip). */
  getCompareTo?: (item: Item) => { item: Item; enhancementLevel?: number } | null;
}

/**
 * Grade de itens do inventário do personagem (estilo Black Desert), reutilizada
 * na ficha e na página /inventory. Cada item usa o mesmo card (DraggableItem +
 * ItemTooltip) com equipar/desequipar/aprimorar.
 */
export function CharacterItemGrid({
  items,
  totalSlots,
  accent,
  characterId,
  onEquip,
  onUnequip,
  onConsume,
  onEnhance,
  onOpenCraft,
  onSendToGlobal,
  onTransfer,
  onSell,
  search,
  gridTemplateColumns = 'repeat(auto-fill, minmax(50px, 1fr))',
  gap = 5,
  dragSource,
  getCompareTo,
}: CharacterItemGridProps) {
  const q = (search || '').trim().toLowerCase();
  const shown = q ? items.filter((i) => (i.item.name || '').toLowerCase().includes(q)) : items;
  const total = Math.max(totalSlots ?? shown.length, shown.length);

  return (
    <div className="grid" style={{ gridTemplateColumns, gap }}>
      {Array(total).fill(null).map((_, idx) => {
        const row = shown[idx];
        if (row) {
          return (
            <DraggableItem
              key={row.id}
              item={row.item}
              enhancementLevel={row.enhancementLevel || 0}
              durability={row.durability}
              maxDurability={row.maxDurability}
              quantity={row.quantity || 1}
              inventoryId={row.id}
              compact
              accent={accent}
              onEquip={onEquip}
              onUnequip={onUnequip}
              onConsume={onConsume}
              onEnhance={onEnhance}
              onOpenCraft={onOpenCraft}
              onSendToGlobal={onSendToGlobal}
              onTransfer={onTransfer}
              onSell={onSell}
              characterId={characterId}
              dragSource={dragSource}
              compareTo={getCompareTo?.(row.item)}
            />
          );
        }
        return (
          <div
            key={`empty-${idx}`}
            className="aspect-square"
            style={{ background: 'linear-gradient(160deg, #11161b, #0c1015)', border: '1px solid #262e37' }}
          />
        );
      })}
    </div>
  );
}
