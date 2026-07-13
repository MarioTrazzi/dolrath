'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Item } from '@/types/item';
import { resolveImageUrl } from '@/lib/imageUrl';
import { itemImagePath } from '@/lib/itemCatalog';
import ItemIcon from '@/components/ItemIcon';

interface SellQuantityDialogProps {
  open: boolean;
  item: Item;
  /** Quantidade disponível na pilha. */
  maxQuantity: number;
  /** Preço de venda por unidade (sellUnitPrice/sellPrice já calculado pelo chamador). */
  unitPrice: number;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
}

/**
 * 🔥 Diálogo de quantidade ao vender uma pilha ao ferreiro (burn). Só aparece
 * quando a pilha tem mais de 1 item — permite escolher uma quantidade
 * (campo + slider) ou vender tudo de uma vez. Mesmo padrão do TransferQuantityDialog.
 */
export default function SellQuantityDialog({
  open,
  item,
  maxQuantity,
  unitPrice,
  onConfirm,
  onClose,
}: SellQuantityDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [qty, setQty] = useState(1);

  useEffect(() => setMounted(true), []);

  // Reseta a quantidade sempre que o diálogo abre para uma nova pilha.
  useEffect(() => {
    if (open) setQty(1);
  }, [open, item.id, maxQuantity]);

  // Fecha com Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const clamp = (n: number) => Math.max(1, Math.min(maxQuantity, Math.floor(n) || 1));
  const itemImage = resolveImageUrl(item.image) ?? (item.name ? itemImagePath(item.name) : null);

  const confirm = (n: number) => {
    onConfirm(clamp(n));
    onClose();
  };

  const accent = '#dc2626';

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(180deg, #1c232b, #11161b)', borderColor: `${accent}66` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid #2a323b' }}>
          <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid #313a44' }}>
            {itemImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={itemImage} alt={item.name} className="w-full h-full object-cover art-bright" referrerPolicy="no-referrer" />
            ) : (
              <ItemIcon type={item.type} size={28} className="text-white/80" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-white text-base truncate">{item.name}</h3>
            <p className="text-xs text-white/60">Disponível: {maxQuantity}</p>
          </div>
        </div>

        {/* Seleção de quantidade */}
        <div className="p-4 flex flex-col gap-3">
          <p className="text-sm text-white/70">Vender quantos ao <span className="font-semibold text-white">ferreiro</span>?</p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setQty((q) => clamp(q - 1))}
              className="w-9 h-9 rounded-lg text-white font-black text-lg shrink-0 disabled:opacity-40"
              style={{ background: '#2f3842', border: '1px solid #46505c' }}
              disabled={qty <= 1}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={maxQuantity}
              value={qty}
              onChange={(e) => setQty(clamp(Number(e.target.value)))}
              className="flex-1 text-center rounded-lg py-2 text-white font-bold outline-none"
              style={{ background: '#0f141a', border: '1px solid #313a44' }}
            />
            <button
              onClick={() => setQty((q) => clamp(q + 1))}
              className="w-9 h-9 rounded-lg text-white font-black text-lg shrink-0 disabled:opacity-40"
              style={{ background: '#2f3842', border: '1px solid #46505c' }}
              disabled={qty >= maxQuantity}
            >
              +
            </button>
          </div>

          <input
            type="range"
            min={1}
            max={maxQuantity}
            value={qty}
            onChange={(e) => setQty(clamp(Number(e.target.value)))}
            className="w-full"
            style={{ accentColor: accent }}
          />

          <p className="text-xs text-white/50">
            ⚠️ O item vendido é destruído — não dá pra desfazer.
          </p>
        </div>

        {/* Ações */}
        <div className="p-4 flex flex-col gap-2" style={{ borderTop: '1px solid #2a323b' }}>
          <button
            onClick={() => confirm(qty)}
            className="w-full px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-[1.02]"
            style={{ background: `linear-gradient(90deg, ${accent}cc, ${accent}77)` }}
          >
            🔥 Vender {qty} por {qty * unitPrice}🪙
          </button>
          <button
            onClick={() => confirm(maxQuantity)}
            className="w-full px-4 py-2.5 rounded-xl font-bold text-sm text-white/90 transition-all hover:scale-[1.02]"
            style={{ background: '#2f3842', border: '1px solid #46505c' }}
          >
            📦 Vender tudo (x{maxQuantity}) por {maxQuantity * unitPrice}🪙
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl font-semibold text-sm text-white/60 hover:text-white/90 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
