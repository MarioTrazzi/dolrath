'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getItemVisual, getItemTypeLabel, getItemCategory } from '@/lib/itemVisuals';
import { getDisplayName, getLevelLabel } from '@/lib/enhancementSystem';
import { resolveImageUrl } from '@/lib/imageUrl';

const REPAIR_PER_DUPLICATE = 10;

interface Character {
  id: string;
  name: string;
  class: string;
  race: string;
}

interface InventoryItem {
  id: string;
  itemId: string;
  quantity: number;
  enhancementLevel: number;
  durability: number;
  maxDurability: number;
  item: {
    id: string;
    name: string;
    type: string;
    image?: string | null;
  };
}

export default function RepairBench({ characters }: { characters: Character[] }) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [loadingInv, setLoadingInv] = useState(false);

  // Seleciona o primeiro personagem assim que a lista chega.
  useEffect(() => {
    if (!selectedCharacterId && characters.length > 0) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId]);

  const fetchInventory = useCallback(async (characterId: string) => {
    setLoadingInv(true);
    try {
      const res = await fetch(`/api/store/inventory?characterId=${characterId}`);
      if (res.ok) {
        const data = await res.json();
        setInventory(Array.isArray(data) ? data : []);
      } else {
        setInventory([]);
      }
    } catch {
      setInventory([]);
    } finally {
      setLoadingInv(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCharacterId) fetchInventory(selectedCharacterId);
  }, [selectedCharacterId, fetchInventory]);

  // Equipamentos do personagem (consumíveis não entram na forja).
  const equipment = useMemo(
    () =>
      inventory
        .filter((inv) => getItemCategory(inv.item.type) !== 'consumable')
        .sort((a, b) => a.durability / a.maxDurability - b.durability / b.maxDurability),
    [inventory]
  );

  // Equipamentos danificados (passíveis de reparo).
  const damaged = useMemo(
    () => equipment.filter((inv) => inv.durability < inv.maxDurability),
    [equipment]
  );

  // Mantém uma seleção válida (sempre um item danificado).
  useEffect(() => {
    if (damaged.length === 0) {
      if (selectedInventoryId) setSelectedInventoryId('');
      return;
    }
    if (!damaged.some((d) => d.id === selectedInventoryId)) {
      setSelectedInventoryId(damaged[0].id);
    }
  }, [damaged, selectedInventoryId]);

  const selected = useMemo(
    () => inventory.find((inv) => inv.id === selectedInventoryId) || null,
    [inventory, selectedInventoryId]
  );

  // Cópias base (nível 0) disponíveis do mesmo item, excluindo a peça selecionada.
  const copiesAvailable = useMemo(() => {
    if (!selected) return 0;
    return inventory
      .filter(
        (inv) =>
          inv.itemId === selected.itemId &&
          inv.enhancementLevel === 0 &&
          inv.id !== selected.id
      )
      .reduce((sum, inv) => sum + inv.quantity, 0);
  }, [inventory, selected]);

  const missing = selected ? selected.maxDurability - selected.durability : 0;
  const copiesNeeded = Math.ceil(missing / REPAIR_PER_DUPLICATE);
  const durabilityPct = selected
    ? Math.round((selected.durability / selected.maxDurability) * 100)
    : 0;

  const handleRepair = async (mode: 'single' | 'full') => {
    if (!selected || !selectedCharacterId) return;
    if (copiesAvailable < 1) {
      toast.error(`Você precisa de uma cópia de ${selected.item.name} para reparar.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/character/${selectedCharacterId}/repair-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId: selected.id, mode }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Erro ao reparar');
        return;
      }
      toast.success(json.message || '🔧 Item reparado!');
      await fetchInventory(selectedCharacterId);
    } catch {
      toast.error('Erro inesperado ao reparar');
    } finally {
      setBusy(false);
    }
  };

  const visual = selected ? getItemVisual(selected.item.type) : null;
  const selectedImage = selected ? resolveImageUrl(selected.item.image) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-black/50 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-2xl font-black text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          🔧 Bancada de Reparo
        </h2>
        {characters.length > 1 && (
          <select
            value={selectedCharacterId}
            onChange={(e) => setSelectedCharacterId(e.target.value)}
            className="px-3 py-2 bg-black/40 border border-amber-500/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.class})
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-sm text-white/60 mb-4">
        Escolha um equipamento desgastado do inventário e queime cópias dele (nível 0) para restaurar
        a durabilidade. Cada cópia repara{' '}
        <span className="text-amber-300 font-semibold">+{REPAIR_PER_DUPLICATE}</span>.
      </p>

      {loadingInv ? (
        <div className="text-white/50 text-sm py-8 text-center">Carregando inventário…</div>
      ) : equipment.length === 0 ? (
        <div className="text-white/50 text-sm py-8 text-center">
          🎒 Este personagem não possui equipamentos.
        </div>
      ) : (
        <>
          {/* Inventário do personagem (estilo /inventory) */}
          <label className="block text-xs font-semibold text-amber-200/80 mb-2">
            Inventário do personagem — clique em um item desgastado para reparar
          </label>
          <div
            className="grid mb-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}
          >
            {equipment.map((inv) => {
              const itemVisual = getItemVisual(inv.item.type);
              const image = resolveImageUrl(inv.item.image);
              const pct = Math.round((inv.durability / inv.maxDurability) * 100);
              const isDamaged = inv.durability < inv.maxDurability;
              const isSelected = inv.id === selectedInventoryId;
              const barColor = pct < 30 ? '#ef4444' : pct < 70 ? '#f59e0b' : '#10b981';

              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => {
                    if (isDamaged) setSelectedInventoryId(inv.id);
                  }}
                  title={`${getDisplayName(inv.item.name, inv.enhancementLevel)} — ${inv.durability}/${inv.maxDurability} (${pct}%)`}
                  disabled={!isDamaged}
                  className={`group relative aspect-square overflow-hidden rounded-lg transition-transform ${
                    isDamaged ? 'cursor-pointer hover:scale-105' : 'cursor-default opacity-70'
                  }`}
                  style={{
                    border: `2px solid ${isSelected ? '#fbbf24' : (itemVisual.accent || '#3f7fd6') + '66'}`,
                    background: 'linear-gradient(160deg, #262e38, #141a20)',
                    boxShadow: isSelected
                      ? '0 0 0 2px #fbbf2455, inset 0 0 8px rgba(0,0,0,0.6)'
                      : 'inset 0 0 7px rgba(0,0,0,0.5)',
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image}
                        alt={inv.item.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-2xl">{itemVisual.emoji ?? '🗡️'}</span>
                    )}
                  </div>

                  {/* Quantidade */}
                  {inv.quantity > 1 && (
                    <span
                      className="absolute top-0.5 left-1 text-[10px] font-black leading-none text-white"
                      style={{ textShadow: '0 1px 2px #000, 0 0 3px #000' }}
                    >
                      x{inv.quantity}
                    </span>
                  )}

                  {/* Nível de aprimoramento */}
                  {inv.enhancementLevel > 0 && (
                    <span
                      className="absolute top-0.5 right-1 text-[10px] font-bold"
                      style={{ color: '#f1d79a', textShadow: '0 1px 2px #000' }}
                    >
                      {getLevelLabel(inv.enhancementLevel)}
                    </span>
                  )}

                  {/* Barra de durabilidade */}
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {damaged.length === 0 ? (
            <div className="text-emerald-300/70 text-sm py-4 text-center">
              ✨ Nenhum equipamento desgastado — está tudo em ótimo estado!
            </div>
          ) : selected ? (
            <>
              {/* Os dois slots da forja */}
              <div className="flex items-center justify-center gap-4 mb-4">
                {/* Slot: item a reparar */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-24 h-24 rounded-xl border-2 flex items-center justify-center overflow-hidden bg-black/40 relative"
                    style={{ borderColor: (visual?.accent ?? '#f59e0b') + '99' }}
                  >
                    {selectedImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedImage}
                        alt={selected.item.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-4xl">{visual?.emoji ?? '🗡️'}</span>
                    )}
                    {selected.enhancementLevel > 0 && (
                      <span
                        className="absolute bottom-0.5 right-1.5 text-sm font-black"
                        style={{ color: '#f1d79a', textShadow: '0 1px 2px #000, 0 0 3px #000' }}
                      >
                        {getLevelLabel(selected.enhancementLevel)}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-white/70 max-w-[96px] text-center truncate">
                    {getDisplayName(selected.item.name, selected.enhancementLevel)}
                  </span>
                  <span className="text-[10px] text-white/40">{getItemTypeLabel(selected.item.type)}</span>
                </div>

                <span className="text-3xl text-amber-400">＋</span>

                {/* Slot: cópia consumida */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-24 h-24 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden relative ${
                      copiesAvailable > 0 ? 'bg-black/40' : 'bg-black/20 opacity-50'
                    }`}
                    style={{ borderColor: copiesAvailable > 0 ? '#f59e0b99' : '#ffffff33' }}
                  >
                    {copiesAvailable > 0 && selectedImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedImage}
                        alt={selected.item.name}
                        className="w-full h-full object-cover grayscale"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-4xl grayscale">{visual?.emoji ?? '🗡️'}</span>
                    )}
                    {copiesAvailable > 0 && (
                      <span className="absolute bottom-0.5 right-1 text-xs font-bold bg-black/70 text-amber-300 px-1.5 rounded">
                        x{copiesAvailable}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-white/70">Cópia (nível 0)</span>
                  <span className="text-[10px] text-white/40">
                    {copiesAvailable > 0 ? `${copiesAvailable} disponível${copiesAvailable > 1 ? 'eis' : ''}` : 'nenhuma'}
                  </span>
                </div>
              </div>

              {/* Barra de durabilidade */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-white/60 mb-1">
                  <span>Durabilidade</span>
                  <span>
                    {selected.durability}/{selected.maxDurability} ({durabilityPct}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-black/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      durabilityPct < 30 ? 'bg-red-500' : durabilityPct < 70 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${durabilityPct}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-white/50 mb-3">
                Faltam <span className="text-amber-300">{missing}</span> de durabilidade — precisa de{' '}
                <span className="text-amber-300">{copiesNeeded}</span> cópia{copiesNeeded > 1 ? 's' : ''}, você tem{' '}
                <span className={copiesAvailable >= copiesNeeded ? 'text-emerald-300' : 'text-red-300'}>
                  {copiesAvailable}
                </span>
                .
              </p>

              {/* Botões */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleRepair('single')}
                  disabled={busy || copiesAvailable < 1}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-amber-600/80 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  🔧 Reparar +{REPAIR_PER_DUPLICATE} (1 cópia)
                </button>
                <button
                  onClick={() => handleRepair('full')}
                  disabled={busy || copiesAvailable < 1}
                  className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ⚒️ Reparar 100% ({Math.min(copiesNeeded, copiesAvailable)} cópia{Math.min(copiesNeeded, copiesAvailable) > 1 ? 's' : ''})
                </button>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
