'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getItemVisual, getItemTypeLabel, getItemCategory } from '@/lib/itemVisuals';
import { getDisplayName, getLevelLabel } from '@/lib/enhancementSystem';
import { formatItemStats } from '@/lib/itemStats';
import { resolveImageUrl } from '@/lib/imageUrl';
import EnhancementDialog, { EnhanceablePickerItem } from '@/components/EnhancementDialog';
import type { EquipmentSlotType } from '@prisma/client';

const REPAIR_PER_DUPLICATE = 10;

// Mapeia o tipo do item para o slot de equipamento (espelha /inventory).
function getSlotTypeFromItemType(itemType: string): EquipmentSlotType {
  switch (itemType) {
    case 'LIGHT_HELMET':
    case 'MEDIUM_HELMET':
    case 'HEAVY_HELMET':
      return 'HELMET';
    case 'LIGHT_ARMOR':
    case 'MEDIUM_ARMOR':
    case 'HEAVY_ARMOR':
      return 'ARMOR';
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
      return 'RING_1';
    default:
      return 'WEAPON';
  }
}

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
    description?: string | null;
    level?: number | null;
    goldPrice?: number | null;
    stats?: Record<string, any> | null;
  };
}

export default function RepairBench({
  characters,
  characterId,
  refreshSignal,
}: {
  characters: Character[];
  /** Personagem controlado pela loja. Se ausente, a bancada gerencia o próprio. */
  characterId?: string;
  /** Muda quando o inventário do personagem foi alterado fora da bancada (ex.: compra). */
  refreshSignal?: number;
}) {
  const [internalCharacterId, setInternalCharacterId] = useState<string>('');
  // Modo controlado: usa o personagem da loja; senão, o estado interno.
  const controlled = characterId != null;
  const selectedCharacterId = controlled ? characterId : internalCharacterId;
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [loadingInv, setLoadingInv] = useState(false);
  const [enhanceOpen, setEnhanceOpen] = useState(false);

  // Seleciona o primeiro personagem assim que a lista chega (apenas modo interno).
  useEffect(() => {
    if (!controlled && !internalCharacterId && characters.length > 0) {
      setInternalCharacterId(characters[0].id);
    }
  }, [controlled, characters, internalCharacterId]);

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
    // refreshSignal força recarregar após uma compra/transferência na loja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCharacterId, refreshSignal, fetchInventory]);

  // Equipamentos do personagem (consumíveis não entram na forja).
  const equipment = useMemo(
    () =>
      inventory
        .filter((inv) => getItemCategory(inv.item.type) !== 'consumable')
        .sort((a, b) => a.durability / a.maxDurability - b.durability / b.maxDurability),
    [inventory]
  );

  // O inventário do personagem não agrupa (cada peça é uma linha), mas a bancada
  // PODE agrupar visualmente instâncias idênticas (mesmo item, aprimoramento e
  // durabilidade) num único slot com contador, pra não poluir a forja.
  const displayGroups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    for (const inv of equipment) {
      const key = `${inv.itemId}:${inv.enhancementLevel}:${inv.durability}:${inv.maxDurability}`;
      const arr = map.get(key);
      if (arr) arr.push(inv);
      else map.set(key, [inv]);
    }
    return Array.from(map.values()).map((rows) => ({ rep: rows[0], rows, count: rows.length }));
  }, [equipment]);

  // Mantém uma seleção válida. Qualquer equipamento pode ser selecionado (para
  // reparar e/ou vender); ao perder a seleção, prioriza um item danificado.
  useEffect(() => {
    if (equipment.length === 0) {
      if (selectedInventoryId) setSelectedInventoryId('');
      return;
    }
    if (!equipment.some((e) => e.id === selectedInventoryId)) {
      const firstDamaged = equipment.find((e) => e.durability < e.maxDurability);
      setSelectedInventoryId(firstDamaged ? firstDamaged.id : '');
    }
  }, [equipment, selectedInventoryId]);

  const selected = useMemo(
    () => inventory.find((inv) => inv.id === selectedInventoryId) || null,
    [inventory, selectedInventoryId]
  );

  // Grupo de exibição da peça selecionada (instâncias idênticas), para vender em lote.
  const selectedGroup = useMemo(
    () => displayGroups.find((g) => g.rows.some((r) => r.id === selectedInventoryId)) || null,
    [displayGroups, selectedInventoryId]
  );
  const selectedCount = selectedGroup?.count ?? (selected ? 1 : 0);

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

  // Raridade decide a fonte de reparo: comum/incomum = cópia nível-0;
  // rara/épica/lendária = Estilhaço de Memória (só de chefe).
  const itemRarity = selected
    ? String((selected.item.stats as Record<string, unknown> | null)?.rarity ?? '').toUpperCase()
    : '';
  const usesMemoryShard = ['RARE', 'EPIC', 'LEGENDARY'].includes(itemRarity);

  const memoryShardsAvailable = useMemo(
    () =>
      inventory
        .filter((inv) => inv.item.name === 'Estilhaço de Memória')
        .reduce((sum, inv) => sum + inv.quantity, 0),
    [inventory]
  );

  // Unidades disponíveis/necessárias para reparar (cópias OU estilhaços de memória).
  const repairUnitsAvailable = usesMemoryShard ? memoryShardsAvailable : copiesAvailable;
  const repairMatLabel = usesMemoryShard ? 'Estilhaço de Memória' : 'cópia nível 0';

  const missing = selected ? selected.maxDurability - selected.durability : 0;
  const repairUnitsNeeded = Math.ceil(missing / REPAIR_PER_DUPLICATE);
  const durabilityPct = selected
    ? Math.round((selected.durability / selected.maxDurability) * 100)
    : 0;

  const handleRepair = async (mode: 'single' | 'full') => {
    if (!selected || !selectedCharacterId) return;
    if (repairUnitsAvailable < 1) {
      toast.error(
        usesMemoryShard
          ? `Você precisa de um Estilhaço de Memória (de chefe) para reparar ${selected.item.name}.`
          : `Você precisa de uma cópia de ${selected.item.name} para reparar.`
      );
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

  // Venda ao ferreiro por metade do preço (burn off-chain).
  const sellUnitPrice = selected ? Math.max(0, Math.floor((selected.item.goldPrice ?? 0) / 2)) : 0;

  // Cada peça de equipamento é uma linha (quantity 1). Vender N significa
  // destruir N linhas idênticas do grupo selecionado.
  const handleSell = async (rowIds: string[]) => {
    if (!selected || !selectedCharacterId || rowIds.length === 0) return;
    const n = rowIds.length;
    const name = getDisplayName(selected.item.name, selected.enhancementLevel);
    const ok = window.confirm(
      `Vender ${n}x ${name} ao ferreiro por ${sellUnitPrice * n} gold?\nO${n > 1 ? 's itens serão destruídos' : ' item será destruído'} (não dá pra desfazer).`
    );
    if (!ok) return;
    setBusy(true);
    try {
      let sold = 0;
      for (const id of rowIds) {
        const res = await fetch(`/api/character/${selectedCharacterId}/sell-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventoryId: id, quantity: 1 }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toast.error(json.error || 'Erro ao vender');
          break;
        }
        sold++;
      }
      if (sold > 0) {
        toast.success(`💰 Vendeu ${sold}x ${name} por ${sellUnitPrice * sold} gold!`);
      }
      await fetchInventory(selectedCharacterId);
    } catch {
      toast.error('Erro inesperado ao vender');
    } finally {
      setBusy(false);
    }
  };

  // Equipa a peça selecionada no personagem ativo. A API resolve o slot final
  // (anéis em RING_1/RING_2) e devolve ao inventário a peça que já estava no slot.
  const handleEquip = async () => {
    if (!selected || !selectedCharacterId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/character/${selectedCharacterId}/equip-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selected.itemId,
          slotType: getSlotTypeFromItemType(selected.item.type),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Erro ao equipar');
        return;
      }
      toast.success(`⚡ ${getDisplayName(selected.item.name, selected.enhancementLevel)} equipado!`);
      await fetchInventory(selectedCharacterId);
    } catch {
      toast.error('Erro inesperado ao equipar');
    } finally {
      setBusy(false);
    }
  };

  // Itens enhanceáveis do personagem para o seletor do diálogo de aprimoramento.
  const enhanceableItems: EnhanceablePickerItem[] = useMemo(
    () =>
      equipment.map((inv) => ({
        id: inv.id,
        name: inv.item.name,
        type: inv.item.type,
        image: inv.item.image,
        enhancementLevel: inv.enhancementLevel,
      })),
    [equipment]
  );

  const visual = selected ? getItemVisual(selected.item.type) : null;
  const selectedImage = selected ? resolveImageUrl(selected.item.image) : null;
  const selectedDamaged = selected ? selected.durability < selected.maxDurability : false;
  const selectedStats = selected ? formatItemStats(selected.item.stats ?? undefined, selected.item.type) : [];

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-black/50 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-2xl font-black text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          🔧 Bancada de Reparo
        </h2>
        {!controlled && characters.length > 1 && (
          <select
            value={selectedCharacterId}
            onChange={(e) => setInternalCharacterId(e.target.value)}
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
        Clique num item do inventário para ver os detalhes, repará-lo (queimando cópias nível 0,{' '}
        <span className="text-amber-300 font-semibold">+{REPAIR_PER_DUPLICATE}</span> cada) ou vendê-lo
        ao ferreiro por metade do preço.
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
            Inventário do personagem — clique num item para reparar ou vender
          </label>
          <div
            className="grid mb-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}
          >
            {displayGroups.map(({ rep, count }) => {
              const itemVisual = getItemVisual(rep.item.type);
              const image = resolveImageUrl(rep.item.image);
              const pct = Math.round((rep.durability / rep.maxDurability) * 100);
              const isSelected = rep.id === selectedInventoryId;
              const barColor = pct < 30 ? '#ef4444' : pct < 70 ? '#f59e0b' : '#10b981';

              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => setSelectedInventoryId(rep.id)}
                  title={`${getDisplayName(rep.item.name, rep.enhancementLevel)}${count > 1 ? ` (x${count})` : ''} — ${rep.durability}/${rep.maxDurability} (${pct}%)`}
                  className="group relative aspect-square overflow-hidden rounded-lg cursor-pointer hover:scale-105 transition-transform"
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
                        alt={rep.item.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-2xl">{itemVisual.emoji ?? '🗡️'}</span>
                    )}
                  </div>

                  {/* Contador de instâncias idênticas (agrupadas só na forja) */}
                  {count > 1 && (
                    <span
                      className="absolute top-0.5 left-1 text-[10px] font-black leading-none text-white"
                      style={{ textShadow: '0 1px 2px #000, 0 0 3px #000' }}
                    >
                      x{count}
                    </span>
                  )}

                  {/* Nível de aprimoramento */}
                  {rep.enhancementLevel > 0 && (
                    <span
                      className="absolute top-0.5 right-1 text-[10px] font-bold"
                      style={{ color: '#f1d79a', textShadow: '0 1px 2px #000' }}
                    >
                      {getLevelLabel(rep.enhancementLevel)}
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

          {!selected ? (
            <div className="text-white/50 text-sm py-4 text-center">
              👆 Selecione um item acima para ver detalhes, reparar ou vender.
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-black/30 p-4">
              {/* Cabeçalho: imagem + infos do item */}
              <div className="flex gap-4 mb-4">
                <div
                  className="w-24 h-24 shrink-0 rounded-xl border-2 flex items-center justify-center overflow-hidden bg-black/40 relative"
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

                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-lg text-white truncate">
                    {getDisplayName(selected.item.name, selected.enhancementLevel)}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 mb-2 flex-wrap">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ background: (visual?.accent ?? '#f59e0b') + '33' }}
                    >
                      {visual?.emoji} {getItemTypeLabel(selected.item.type)}
                    </span>
                    {selected.item.level != null && (
                      <span className="text-xs font-semibold bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full">
                        Lv.{selected.item.level}
                      </span>
                    )}
                    {selectedCount > 1 && (
                      <span className="text-xs font-semibold bg-white/10 text-white/80 px-2 py-0.5 rounded-full">
                        x{selectedCount} no inventário
                      </span>
                    )}
                  </div>
                  {selectedStats.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStats.map((stat, i) => (
                        <span
                          key={i}
                          className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full"
                        >
                          {stat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Barra de durabilidade */}
              <div className="mb-4">
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

              {/* Ações: equipar no personagem e aprimorar */}
              <div className="mb-4 pb-4 border-b border-white/10 flex gap-3">
                <button
                  onClick={handleEquip}
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-sky-700/70 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ⚡ Equipar
                </button>
                <button
                  onClick={() => setEnhanceOpen(true)}
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-black bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ⚒️ Aprimorar
                </button>
              </div>

              {/* Reparo (somente itens desgastados) */}
              {selectedDamaged && (
                <div className="mb-4 pb-4 border-b border-white/10">
                  {/* Os dois slots da forja */}
                  <div className="flex items-center justify-center gap-4 mb-3">
                    {/* Slot: item a reparar */}
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="w-20 h-20 rounded-xl border-2 flex items-center justify-center overflow-hidden bg-black/40 relative"
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
                          <span className="text-3xl">{visual?.emoji ?? '🗡️'}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/50">item</span>
                    </div>

                    <span className="text-3xl text-amber-400">＋</span>

                    {/* Slot: material consumido (cópia ou Estilhaço de Memória) */}
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className={`w-20 h-20 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden relative ${
                          repairUnitsAvailable > 0 ? 'bg-black/40' : 'bg-black/20 opacity-50'
                        }`}
                        style={{ borderColor: repairUnitsAvailable > 0 ? '#f59e0b99' : '#ffffff33' }}
                      >
                        {usesMemoryShard ? (
                          <span className={`text-3xl ${repairUnitsAvailable > 0 ? '' : 'grayscale'}`}>🧠</span>
                        ) : repairUnitsAvailable > 0 && selectedImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedImage}
                            alt={selected.item.name}
                            className="w-full h-full object-cover grayscale"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-3xl grayscale">{visual?.emoji ?? '🗡️'}</span>
                        )}
                        {repairUnitsAvailable > 0 && (
                          <span className="absolute bottom-0.5 right-1 text-xs font-bold bg-black/70 text-amber-300 px-1.5 rounded">
                            x{repairUnitsAvailable}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/50">{repairMatLabel}</span>
                    </div>
                  </div>

                  {usesMemoryShard && (
                    <p className="text-[11px] text-amber-200/70 mb-2 text-center">
                      Peça {itemRarity === 'RARE' ? 'rara' : itemRarity === 'EPIC' ? 'épica' : 'lendária'} — reparada com Estilhaço de Memória (de chefe), não com cópias.
                    </p>
                  )}

                  <p className="text-xs text-white/50 mb-3 text-center">
                    Faltam <span className="text-amber-300">{missing}</span> — precisa de{' '}
                    <span className="text-amber-300">{repairUnitsNeeded}</span> {repairMatLabel}
                    {repairUnitsNeeded > 1 ? 's' : ''}, você tem{' '}
                    <span className={repairUnitsAvailable >= repairUnitsNeeded ? 'text-emerald-300' : 'text-red-300'}>
                      {repairUnitsAvailable}
                    </span>
                    .
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleRepair('single')}
                      disabled={busy || repairUnitsAvailable < 1}
                      className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-amber-600/80 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      🔧 Reparar +{REPAIR_PER_DUPLICATE} (1 {repairMatLabel})
                    </button>
                    <button
                      onClick={() => handleRepair('full')}
                      disabled={busy || repairUnitsAvailable < 1}
                      className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ⚒️ Reparar 100% ({Math.min(repairUnitsNeeded, repairUnitsAvailable)} un.)
                    </button>
                  </div>
                </div>
              )}

              {/* Venda ao ferreiro (½ preço) — também serve de burn */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] text-white/40">
                  Vender ao ferreiro destrói o item por metade do preço (½ de {selected.item.goldPrice ?? 0} 🪙).
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSell([selected.id])}
                    disabled={busy}
                    className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-rose-700/70 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    💰 Vender 1 por {sellUnitPrice} 🪙
                  </button>
                  {selectedGroup && selectedCount > 1 && (
                    <button
                      onClick={() => handleSell(selectedGroup.rows.map((r) => r.id))}
                      disabled={busy}
                      className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-rose-800/70 hover:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      💰 Vender {selectedCount} por {sellUnitPrice * selectedCount} 🪙
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Diálogo de aprimoramento (estilo BDO), partilhado com /inventory */}
      {selectedCharacterId && (
        <EnhancementDialog
          open={enhanceOpen}
          onClose={() => setEnhanceOpen(false)}
          characterId={selectedCharacterId}
          inventoryId={selected?.id}
          itemName={selected?.item.name}
          items={enhanceableItems}
          onChanged={() => fetchInventory(selectedCharacterId)}
        />
      )}
    </div>
  );
}
