'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getItemVisual, getItemTypeLabel, getItemCategory } from '@/lib/itemVisuals';
import { itemImagePath } from '@/lib/itemCatalog';
import {
  getDisplayName,
  getLevelLabel,
  REPAIR_PER_DUPLICATE,
  getGearCategory,
  ACCESSORY_REPAIR_DUST_NAME,
  accessoryRepairGoldCost,
} from '@/lib/enhancementSystem';
import { sellUnitPrice as sellPrice } from '@/lib/sellPricing';
import { formatItemStats } from '@/lib/itemStats';
import { resolveImageUrl } from '@/lib/imageUrl';
import EnhancementDialog, { EnhanceablePickerItem } from '@/components/EnhancementDialog';
import { getSlotTypeFromItemType } from '@/lib/equipmentSlot';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { localizeItemName, localizeItemTypeLabel } from '@/lib/i18n/catalog';

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
  /** true = peça EQUIPADA (id é da linha de CharacterEquipment, não do inventário). */
  equipped?: boolean;
  slot?: string;
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
  onChanged,
}: {
  characters: Character[];
  /** Personagem controlado pela loja. Se ausente, a bancada gerencia o próprio. */
  characterId?: string;
  /** Muda quando o inventário do personagem foi alterado fora da bancada (ex.: compra). */
  refreshSignal?: number;
  /** Chamado quando reparo/venda/aprimoramento muda o gold do personagem (atualiza a navbar). */
  onChanged?: () => void;
}) {
  const { locale, t } = useI18n();
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
      // Inventário + peças EQUIPADAS (desgastam em uso e são reparadas sem desequipar).
      const [invRes, eqRes] = await Promise.all([
        fetch(`/api/store/inventory?characterId=${characterId}`),
        fetch(`/api/character/${characterId}/equipment`),
      ]);
      const inv = invRes.ok ? await invRes.json() : [];
      const eqRows = eqRes.ok ? await eqRes.json() : [];
      const equippedAsInv: InventoryItem[] = (Array.isArray(eqRows) ? eqRows : []).map((eq: any) => ({
        id: eq.id,
        itemId: eq.itemId,
        quantity: 1,
        enhancementLevel: eq.enhancementLevel ?? 0,
        durability: eq.durability ?? 100,
        maxDurability: eq.maxDurability ?? 100,
        equipped: true,
        slot: eq.slot,
        item: eq.item,
      }));
      setInventory([...equippedAsInv, ...(Array.isArray(inv) ? inv : [])]);
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
      // Peça equipada nunca agrupa com as do inventário (flag no fim da chave).
      const key = `${inv.itemId}:${inv.enhancementLevel}:${inv.durability}:${inv.maxDurability}:${inv.equipped ? 'eq' : 'inv'}`;
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
  // Só linhas do INVENTÁRIO servem de cópia (peça equipada não é combustível).
  const copiesAvailable = useMemo(() => {
    if (!selected) return 0;
    return inventory
      .filter(
        (inv) =>
          !inv.equipped &&
          inv.itemId === selected.itemId &&
          inv.enhancementLevel === 0 &&
          inv.id !== selected.id
      )
      .reduce((sum, inv) => sum + inv.quantity, 0);
  }, [inventory, selected]);

  // Acessório (anel/colar/cinto) não usa cópia nem estilhaço — repara com Pó de
  // Joia + gold, sempre, não importa a raridade. Arma/armadura seguem a regra
  // de sempre: raridade decide a fonte (cópia comum/incomum, estilhaço rara+).
  const isAccessorySelected = selected ? getGearCategory(selected.item.type) === 'ACCESSORY' : false;
  const itemRarity = selected
    ? String((selected.item.stats as Record<string, unknown> | null)?.rarity ?? '').toUpperCase()
    : '';
  const usesMemoryShard = !isAccessorySelected && ['RARE', 'EPIC', 'LEGENDARY'].includes(itemRarity);

  const memoryShardsAvailable = useMemo(
    () =>
      inventory
        .filter((inv) => !inv.equipped && inv.item.name === 'Estilhaço de Memória')
        .reduce((sum, inv) => sum + inv.quantity, 0),
    [inventory]
  );

  const gemDustAvailable = useMemo(
    () =>
      inventory
        .filter((inv) => !inv.equipped && inv.item.name === ACCESSORY_REPAIR_DUST_NAME)
        .reduce((sum, inv) => sum + inv.quantity, 0),
    [inventory]
  );

  // Unidades disponíveis/necessárias para reparar (Pó de Joia, cópia ou estilhaço).
  const repairUnitsAvailable = isAccessorySelected
    ? gemDustAvailable
    : usesMemoryShard
    ? memoryShardsAvailable
    : copiesAvailable;
  const repairMatLabel = isAccessorySelected
    ? localizeItemName(ACCESSORY_REPAIR_DUST_NAME, locale)
    : usesMemoryShard
    ? localizeItemName('Estilhaço de Memória', locale)
    : t('level-0 copy');

  const missing = selected ? selected.maxDurability - selected.durability : 0;
  const repairUnitsNeeded = Math.ceil(missing / REPAIR_PER_DUPLICATE);
  const durabilityPct = selected
    ? Math.round((selected.durability / selected.maxDurability) * 100)
    : 0;

  // Prévia do custo em gold do reparo (só acessório cobra — cópia/estilhaço são de graça).
  const repairGoldCostSingle = isAccessorySelected && selected ? accessoryRepairGoldCost(selected.item.goldPrice, 1) : 0;
  const repairGoldCostFull =
    isAccessorySelected && selected
      ? accessoryRepairGoldCost(selected.item.goldPrice, Math.min(repairUnitsNeeded, repairUnitsAvailable))
      : 0;

  const handleRepair = async (mode: 'single' | 'full') => {
    if (!selected || !selectedCharacterId) return;
    if (repairUnitsAvailable < 1) {
      const itemDisplayName = localizeItemName(selected.item.name, locale);
      toast.error(
        isAccessorySelected
          ? t('You need {mat} (Gathering — Ore Valley) to repair {item}.', {
              mat: localizeItemName(ACCESSORY_REPAIR_DUST_NAME, locale),
              item: itemDisplayName,
            })
          : usesMemoryShard
          ? t('You need a Memory Shard (from a boss) to repair {item}.', { item: itemDisplayName })
          : t('You need a copy of {item} to repair.', { item: itemDisplayName })
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/character/${selectedCharacterId}/repair-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          selected.equipped ? { equipmentId: selected.id, mode } : { inventoryId: selected.id, mode }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || t('Failed to repair'));
        return;
      }
      toast.success(json.message || t('🔧 Item repaired!'));
      await fetchInventory(selectedCharacterId);
      onChanged?.();
    } catch {
      toast.error(t('Unexpected error repairing'));
    } finally {
      setBusy(false);
    }
  };

  // Venda ao ferreiro por metade do preço (burn off-chain). Peça desgastada
  // vende por menos — preço escala linear com a durabilidade restante.
  const sellUnitPrice = selected ? sellPrice(selected.item, selected.durability, selected.maxDurability) : 0;

  // Cada peça de equipamento é uma linha (quantity 1). Vender N significa
  // destruir N linhas idênticas do grupo selecionado.
  const handleSell = async (rowIds: string[]) => {
    if (!selected || !selectedCharacterId || rowIds.length === 0) return;
    const n = rowIds.length;
    const name = getDisplayName(localizeItemName(selected.item.name, locale), selected.enhancementLevel);
    const ok = window.confirm(
      n > 1
        ? t('Sell {n}x {name} to the blacksmith for {total} gold?\nThe items will be destroyed (cannot be undone).', {
            n,
            name,
            total: sellUnitPrice * n,
          })
        : t('Sell {n}x {name} to the blacksmith for {total} gold?\nThe item will be destroyed (cannot be undone).', {
            n,
            name,
            total: sellUnitPrice * n,
          })
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
          toast.error(json.error || t('Failed to sell'));
          break;
        }
        sold++;
      }
      if (sold > 0) {
        toast.success(t('💰 Sold {n}x {name} for {total} gold!', { n: sold, name, total: sellUnitPrice * sold }));
        onChanged?.();
      }
      await fetchInventory(selectedCharacterId);
    } catch {
      toast.error(t('Unexpected error selling'));
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
        toast.error(json.error || t('Failed to equip'));
        return;
      }
      toast.success(
        t('⚡ {name} equipped!', {
          name: getDisplayName(localizeItemName(selected.item.name, locale), selected.enhancementLevel),
        })
      );
      await fetchInventory(selectedCharacterId);
    } catch {
      toast.error(t('Unexpected error equipping'));
    } finally {
      setBusy(false);
    }
  };

  // Itens enhanceáveis do personagem para o seletor do diálogo de aprimoramento.
  // (só linhas do inventário — a API de aprimoramento trabalha com inventoryId)
  const enhanceableItems: EnhanceablePickerItem[] = useMemo(
    () =>
      equipment.filter((inv) => !inv.equipped).map((inv) => ({
        id: inv.id,
        name: inv.item.name,
        type: inv.item.type,
        image: inv.item.image,
        enhancementLevel: inv.enhancementLevel,
      })),
    [equipment]
  );

  const visual = selected ? getItemVisual(selected.item.type) : null;
  const selectedImage = selected
    ? resolveImageUrl(selected.item.image) ?? (selected.item.name ? itemImagePath(selected.item.name) : null)
    : null;
  const selectedDamaged = selected ? selected.durability < selected.maxDurability : false;
  const selectedStats = selected ? formatItemStats(selected.item.stats ?? undefined, selected.item.type) : [];

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60 p-5" style={{ background: 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))' }}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-2xl font-black text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {t('🔧 Repair Bench')}
        </h2>
        {!controlled && characters.length > 1 && (
          <select
            value={selectedCharacterId}
            onChange={(e) => setInternalCharacterId(e.target.value)}
            className="rounded-[3px] border border-[#3c3c41] bg-[#101013] px-3 py-2 text-sm text-[#ece7da] outline-none transition-colors focus:border-[#8a6d3b]"
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
        {t('Click an item — including')} <span className="text-sky-300 font-semibold">{t('equipped ⚡')}</span>{' '}
        {t('— to see the details, repair it (weapon/armor burns level-0 copies; accessory consumes')}{' '}
        {localizeItemName(ACCESSORY_REPAIR_DUST_NAME, locale)} {t('+ gold;')}{' '}
        <span className="text-amber-300 font-semibold">+{REPAIR_PER_DUPLICATE}</span>{' '}
        {t('per unit) or sell it to the blacksmith for half price. Gear wears down on every kill in the')}{' '}
        {t('dungeon; at 0 it breaks and gives no bonus until repaired.')}
      </p>

      {loadingInv && inventory.length === 0 ? (
        <div className="text-white/50 text-sm py-8 text-center">{t('Loading inventory…')}</div>
      ) : equipment.length === 0 ? (
        <div className="text-white/50 text-sm py-8 text-center">
          {t('🎒 This character has no equipment.')}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
          {/* Inventário do personagem (estilo /inventory) */}
          <label className="block text-xs font-semibold text-amber-200/80 mb-2">
            {t('Character inventory — click an item to repair or sell')}
          </label>
          <div
            className="grid mb-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}
          >
            {displayGroups.map(({ rep, count }) => {
              const itemVisual = getItemVisual(rep.item.type);
              const image = resolveImageUrl(rep.item.image) ?? (rep.item.name ? itemImagePath(rep.item.name) : null);
              const pct = Math.round((rep.durability / rep.maxDurability) * 100);
              const isSelected = rep.id === selectedInventoryId;
              const barColor = pct < 30 ? '#ef4444' : pct < 70 ? '#f59e0b' : '#10b981';

              return (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => setSelectedInventoryId(rep.id)}
                  title={`${getDisplayName(localizeItemName(rep.item.name, locale), rep.enhancementLevel)}${count > 1 ? ` (x${count})` : ''} — ${rep.durability}/${rep.maxDurability} (${pct}%)`}
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
                        alt={localizeItemName(rep.item.name, locale)}
                        className={`w-full h-full object-cover art-bright group-hover:scale-110 transition-transform ${pct === 0 ? 'grayscale opacity-60' : ''}`}
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

                  {/* Peça equipada no personagem (repara sem desequipar) */}
                  {rep.equipped && (
                    <span
                      className="absolute top-0.5 left-1 text-[11px] leading-none"
                      title={t('Equipped')}
                      style={{ filter: 'drop-shadow(0 1px 2px #000)' }}
                    >
                      {pct === 0 ? '💔' : '⚡'}
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
              {t('👆 Select an item above to see details, repair, or sell.')}
            </div>
          ) : (
            <div className="rounded-[3px] border border-black/60 bg-[#19191c] p-4">
              {/* Cabeçalho: imagem + infos do item */}
              <div className="flex gap-4 mb-4">
                <div
                  className="w-24 h-24 shrink-0 rounded-[3px] border-2 flex items-center justify-center overflow-hidden bg-black/40 relative"
                  style={{ borderColor: (visual?.accent ?? '#f59e0b') + '99' }}
                >
                  {selectedImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedImage}
                      alt={localizeItemName(selected.item.name, locale)}
                      className="w-full h-full object-cover art-bright"
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
                    {getDisplayName(localizeItemName(selected.item.name, locale), selected.enhancementLevel)}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 mb-2 flex-wrap">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-[3px] text-white"
                      style={{ background: (visual?.accent ?? '#f59e0b') + '33' }}
                    >
                      {visual?.emoji} {localizeItemTypeLabel(getItemTypeLabel(selected.item.type), locale)}
                    </span>
                    {selected.item.level != null && (
                      <span className="text-xs font-semibold bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded-[3px]">
                        {t('Lv.')}{selected.item.level}
                      </span>
                    )}
                    {selectedCount > 1 && (
                      <span className="text-xs font-semibold bg-white/10 text-white/80 px-2 py-0.5 rounded-[3px]">
                        {t('x{n} in inventory', { n: selectedCount })}
                      </span>
                    )}
                    {selected.equipped && (
                      <span className="text-xs font-semibold bg-sky-500/30 text-sky-300 px-2 py-0.5 rounded-[3px]">
                        {t('⚡ Equipped')}
                      </span>
                    )}
                    {selected.durability <= 0 && (
                      <span className="text-xs font-black bg-red-500/30 text-red-300 px-2 py-0.5 rounded-[3px]">
                        {t('💔 Broken — no bonus')}
                      </span>
                    )}
                  </div>
                  {selectedStats.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStats.map((stat, i) => (
                        <span
                          key={i}
                          className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-[3px]"
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
                  <span>{t('Durability')}</span>
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

              {/* Ações: equipar no personagem e aprimorar (peça já equipada só repara) */}
              {!selected.equipped && (
                <div className="mb-4 pb-4 border-b border-black/60 flex gap-3">
                  <button
                    onClick={handleEquip}
                    disabled={busy}
                    className="flex-1 rounded-[3px] border border-[#3b5a8a] bg-gradient-to-b from-[#25303a] to-[#161c24] px-4 py-2.5 text-sm font-semibold text-sky-200 transition-all hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('⚡ Equip')}
                  </button>
                  <button
                    onClick={() => setEnhanceOpen(true)}
                    disabled={busy}
                    className="flex-1 rounded-[3px] border border-[#8a6d3b] bg-gradient-to-b from-[#3a3325] to-[#241f16] px-4 py-2.5 text-sm font-semibold tracking-wide text-[#e7c682] shadow-[inset_0_1px_0_rgba(231,198,130,0.25)] transition-all hover:border-[#c9a25f] hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('⚒️ Enhance')}
                  </button>
                </div>
              )}

              {/* Reparo (somente itens desgastados) */}
              {selectedDamaged && (
                <div className="mb-4 pb-4 border-b border-black/60">
                  {/* Os dois slots da forja */}
                  <div className="flex items-center justify-center gap-4 mb-3">
                    {/* Slot: item a reparar */}
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="w-20 h-20 rounded-[3px] border-2 flex items-center justify-center overflow-hidden bg-black/40 relative"
                        style={{ borderColor: (visual?.accent ?? '#f59e0b') + '99' }}
                      >
                        {selectedImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedImage}
                            alt={selected.item.name}
                            className="w-full h-full object-cover art-bright"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-3xl">{visual?.emoji ?? '🗡️'}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/50">{t('item')}</span>
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
                        {isAccessorySelected ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={itemImagePath(ACCESSORY_REPAIR_DUST_NAME)}
                            alt={localizeItemName(ACCESSORY_REPAIR_DUST_NAME, locale)}
                            className={`w-full h-full object-cover ${repairUnitsAvailable > 0 ? 'art-bright' : 'grayscale'}`}
                            referrerPolicy="no-referrer"
                          />
                        ) : usesMemoryShard ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={itemImagePath('Estilhaço de Memória')}
                            alt={localizeItemName('Estilhaço de Memória', locale)}
                            className={`w-full h-full object-cover ${repairUnitsAvailable > 0 ? 'art-bright' : 'grayscale'}`}
                            referrerPolicy="no-referrer"
                          />
                        ) : repairUnitsAvailable > 0 && selectedImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedImage}
                            alt={localizeItemName(selected.item.name, locale)}
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

                  {isAccessorySelected && (
                    <p className="text-[11px] text-amber-200/70 mb-2 text-center">
                      {t('Accessory — repaired with {mat} (Gathering) + gold, not with copies.', {
                        mat: localizeItemName(ACCESSORY_REPAIR_DUST_NAME, locale),
                      })}
                    </p>
                  )}
                  {usesMemoryShard && (
                    <p className="text-[11px] text-amber-200/70 mb-2 text-center">
                      {itemRarity === 'RARE'
                        ? t('Rare piece — repaired with a Memory Shard (from a boss), not with copies.')
                        : itemRarity === 'EPIC'
                        ? t('Epic piece — repaired with a Memory Shard (from a boss), not with copies.')
                        : t('Legendary piece — repaired with a Memory Shard (from a boss), not with copies.')}
                    </p>
                  )}

                  <p className="text-xs text-white/50 mb-3 text-center">
                    {t('Missing')} <span className="text-amber-300">{missing}</span> —{' '}
                    {t('needs')}{' '}
                    <span className="text-amber-300">{repairUnitsNeeded}</span>x {repairMatLabel},{' '}
                    {t('you have')}{' '}
                    <span className={repairUnitsAvailable >= repairUnitsNeeded ? 'text-emerald-300' : 'text-red-300'}>
                      {repairUnitsAvailable}
                    </span>
                    {isAccessorySelected && (
                      <>
                        {' '}
                        {t('(+{cost} gold to fully repair)', { cost: repairGoldCostFull })}
                      </>
                    )}
                    .
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleRepair('single')}
                      disabled={busy || repairUnitsAvailable < 1}
                      className="flex-1 rounded-[3px] border border-[#8a6d3b] bg-gradient-to-b from-[#3a3325] to-[#241f16] px-4 py-2.5 text-sm font-semibold text-[#e7c682] transition-all hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('🔧 Repair +{amount} (1 {mat}{extra})', {
                        amount: REPAIR_PER_DUPLICATE,
                        mat: repairMatLabel,
                        extra: isAccessorySelected ? ` + ${repairGoldCostSingle}🪙` : '',
                      })}
                    </button>
                    <button
                      onClick={() => handleRepair('full')}
                      disabled={busy || repairUnitsAvailable < 1}
                      className="flex-1 rounded-[3px] border border-[#c9a25f] bg-gradient-to-b from-[#4a4030] to-[#2c261a] px-4 py-2.5 text-sm font-semibold tracking-wide text-[#e7c682] shadow-[0_0_14px_rgba(201,162,95,0.3)] transition-all hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('⚒️ Repair 100% ({units} un.{extra})', {
                        units: Math.min(repairUnitsNeeded, repairUnitsAvailable),
                        extra: isAccessorySelected ? ` + ${repairGoldCostFull}🪙` : '',
                      })}
                    </button>
                  </div>
                </div>
              )}

              {/* Venda ao ferreiro (½ preço) — também serve de burn. Peça equipada
                  não vende daqui (desequipa primeiro). */}
              {!selected.equipped && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] text-white/40">
                  {selected.durability < selected.maxDurability
                    ? t('Selling to the blacksmith destroys the item for half price (½ of {price} 🪙), reduced by its current durability ({pct}%).', {
                        price: selected.item.goldPrice ?? 0,
                        pct: durabilityPct,
                      })
                    : t('Selling to the blacksmith destroys the item for half price (½ of {price} 🪙).', {
                        price: selected.item.goldPrice ?? 0,
                      })}
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSell([selected.id])}
                    disabled={busy}
                    className="flex-1 rounded-[3px] border border-[#8a3b3b] bg-gradient-to-b from-[#3a2525] to-[#241616] px-4 py-2.5 text-sm font-semibold text-red-300 transition-all hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t('💰 Sell 1 for {price} 🪙', { price: sellUnitPrice })}
                  </button>
                  {selectedGroup && selectedCount > 1 && (
                    <button
                      onClick={() => handleSell(selectedGroup.rows.map((r) => r.id))}
                      disabled={busy}
                      className="flex-1 rounded-[3px] border border-[#8a3b3b] bg-gradient-to-b from-[#3a2525] to-[#241616] px-4 py-2.5 text-sm font-semibold text-red-300 transition-all hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('💰 Sell {n} for {total} 🪙', { n: selectedCount, total: sellUnitPrice * selectedCount })}
                    </button>
                  )}
                </div>
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Diálogo de aprimoramento (estilo BDO), partilhado com /inventory */}
      {selectedCharacterId && (
        <EnhancementDialog
          open={enhanceOpen}
          onClose={() => setEnhanceOpen(false)}
          characterId={selectedCharacterId}
          inventoryId={selected && !selected.equipped ? selected.id : undefined}
          itemName={selected && !selected.equipped ? selected.item.name : undefined}
          items={enhanceableItems}
          onChanged={() => { fetchInventory(selectedCharacterId); onChanged?.(); }}
        />
      )}
    </div>
  );
}
