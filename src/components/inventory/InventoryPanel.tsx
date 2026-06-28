'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, LayoutGrid, Search, Plus, HelpCircle } from 'lucide-react';
import { EquipmentSlotType } from '@prisma/client';
import { CharacterItemGrid, InventoryRow } from '@/components/inventory/CharacterItemGrid';

interface InventoryPanelProps {
  /** Título exibido na barra de topo e na aba (ex.: "Inventário", "Baú Geral"). */
  title?: string;
  items: InventoryRow[];
  /** Total de slots a desenhar (preenche o resto com slots vazios). */
  totalSlots: number;
  /** Cor de destaque do painel (bordas/realces). */
  accent: string;
  characterId: string;
  isEquipped?: (itemId: string) => boolean;
  // Ações do grid (todas opcionais — o baú global, p.ex., só usa onTransfer).
  onEquip?: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip?: (itemId: string) => void;
  onConsume?: (itemId: string) => void;
  onEnhance?: (inventoryId: string, itemName: string, stoneCategory?: 'WEAPON' | 'ARMOR') => void;
  onSendToGlobal?: (itemId: string) => void;
  onTransfer?: (itemId: string) => void;
  /** Rótulo do rodapé de slots (ex.: "Slots do Inventário"). */
  slotLabel?: string;
  /** Quando definido, mostra o botão "+" de expandir slots. */
  onExpand?: () => void;
  expanding?: boolean;
  expandTitle?: string;
  /** Texto de gold exibido na barra de moedas; oculta a barra se não definido. */
  goldText?: string | null;
  gridTemplateColumns?: string;
}

/**
 * 📦 Painel de inventário estilo Black Desert — barra de título, busca, grade de
 * slots, rodapé com contagem/expansão e barra de moedas. Reutilizado na ficha do
 * personagem (/character/[id]) e na página /inventory (herói ativo + baú global),
 * para que ambos exibam exatamente a mesma UI.
 */
export default function InventoryPanel({
  title = 'Inventário',
  items,
  totalSlots,
  accent,
  characterId,
  isEquipped,
  onEquip,
  onUnequip,
  onConsume,
  onEnhance,
  onSendToGlobal,
  onTransfer,
  slotLabel = 'Slots do Inventário',
  onExpand,
  expanding = false,
  expandTitle = 'Expandir +5 slots',
  goldText,
  gridTemplateColumns = 'repeat(8, 1fr)',
}: InventoryPanelProps) {
  const [search, setSearch] = useState('');
  const overCapacity = items.length > totalSlots;

  return (
    <div
      className="relative flex flex-col w-full rounded-2xl overflow-hidden border-2 backdrop-blur-md shadow-xl"
      style={{ background: 'linear-gradient(180deg, rgba(26,32,38,0.78), rgba(20,25,30,0.82))', borderColor: `${accent}40` }}
    >
      {/* Barra de título */}
      <div className="flex items-center gap-2" style={{ height: 38, padding: '0 12px', background: 'linear-gradient(180deg, #2b333c, #232a31)', borderBottom: '1px solid #11161a' }}>
        <Box size={17} style={{ color: accent }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: '#ece7da', letterSpacing: '0.3px' }}>{title}</span>
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

      {/* Abas */}
      <div className="flex items-end" style={{ gap: 26, padding: '8px 16px 0', borderBottom: '1px solid #2a323b' }}>
        <div className="relative" style={{ paddingBottom: 9, fontSize: 14, fontWeight: 600, color: '#f1d79a' }}>
          {title}
          <div className="absolute" style={{ left: 0, right: 0, bottom: -1, height: 2, background: accent }} />
        </div>
      </div>

      {/* Barra de ferramentas */}
      <div className="flex items-center gap-2" style={{ padding: '11px 14px' }}>
        <div className="flex-1 flex items-center gap-2" style={{ height: 30, padding: '0 10px', background: '#0f141a', border: '1px solid #313a44' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no inventário"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#c4cad1', fontSize: '12.5px' }}
          />
          <Search size={14} style={{ color: '#7e8893' }} />
        </div>
        <div className="flex items-center justify-center" style={{ width: 30, height: 30, background: `linear-gradient(180deg, ${accent}33, ${accent}14)`, border: `1px solid ${accent}` }}>
          <LayoutGrid size={15} style={{ color: '#f1d79a' }} />
        </div>
      </div>

      {/* Grade de itens */}
      <div className="flex-1" style={{ padding: '2px 14px 8px' }}>
        <CharacterItemGrid
          items={items}
          totalSlots={totalSlots}
          isEquipped={isEquipped}
          accent={accent}
          characterId={characterId}
          search={search}
          gridTemplateColumns={gridTemplateColumns}
          gap={5}
          onEquip={onEquip}
          onUnequip={onUnequip}
          onConsume={onConsume}
          onEnhance={onEnhance}
          onSendToGlobal={onSendToGlobal}
          onTransfer={onTransfer}
        />
      </div>

      {/* Rodapé: slots / expandir */}
      <div style={{ padding: '4px 16px 0', borderTop: '1px solid #2a323b' }}>
        <div className="flex items-center gap-2" style={{ padding: '9px 0' }}>
          <LayoutGrid size={16} style={{ color: '#8d96a1' }} />
          <span style={{ fontSize: 13, color: '#c4cad1' }}>{slotLabel}</span>
          <div className="flex-1" />
          <span style={{ fontSize: '13.5px', color: '#aeb5be' }}>{items.length} / {totalSlots}</span>
          {onExpand && (
            <button
              onClick={onExpand}
              disabled={expanding}
              title={expandTitle}
              className="flex items-center justify-center disabled:opacity-50"
              style={{ width: 22, height: 22, background: 'linear-gradient(180deg, #2f3842, #262e37)', border: '1px solid #46505c', cursor: 'pointer' }}
            >
              <Plus size={13} style={{ color: '#cdd3da' }} />
            </button>
          )}
        </div>
      </div>

      {overCapacity && (
        <div style={{ margin: '0 16px 8px', padding: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <p style={{ color: '#f0a8a8', fontSize: 12 }}>⚠️ Você tem mais itens do que slots. Expanda o inventário.</p>
        </div>
      )}

      {/* Moedas */}
      {goldText != null && (
        <div className="flex items-center flex-wrap" style={{ gap: '16px 24px', padding: '11px 18px 13px', borderTop: '1px solid #2a323b', background: 'rgba(0,0,0,0.18)' }}>
          <div className="flex items-center" style={{ gap: 7 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #f6e08a, #c9962a)', border: '1px solid #8a6418' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#ece7da' }}>{goldText}</span>
            <span style={{ fontSize: 11, color: '#7e8893' }}>GOLD</span>
          </div>
        </div>
      )}
    </div>
  );
}
