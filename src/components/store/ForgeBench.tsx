'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { forgeRecipesByGroup, forgeMaterialEmoji, getForgeOutputCatalogItem, type ForgeRecipe } from '@/lib/forge';
import { getItemVisual } from '@/lib/itemVisuals';
import { itemImagePath, type Rarity } from '@/lib/itemCatalog';

// Miniatura do item: usa a arte /items/<slug>.webp e cai no emoji se a imagem falhar.
function ItemThumb({ name, emoji, className = 'text-2xl' }: { name: string; emoji: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={className}>{emoji}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={itemImagePath(name)}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
      referrerPolicy="no-referrer"
    />
  );
}

const RARITY_UI: Record<Rarity, { text: string; ring: string; glow: string }> = {
  COMMON: { text: 'text-zinc-300', ring: '#a1a1aa', glow: 'rgba(161,161,170,0.6)' },
  UNCOMMON: { text: 'text-emerald-300', ring: '#34d399', glow: 'rgba(52,211,153,0.6)' },
  RARE: { text: 'text-sky-300', ring: '#38bdf8', glow: 'rgba(56,189,248,0.6)' },
  EPIC: { text: 'text-fuchsia-300', ring: '#e879f9', glow: 'rgba(232,121,249,0.6)' },
  LEGENDARY: { text: 'text-amber-300', ring: '#fbbf24', glow: 'rgba(251,191,36,0.6)' },
};

const GROUP_LABEL: Record<ForgeRecipe['group'], string> = {
  armor: '🛡️ Armaduras',
  weapon: '⚔️ Armas',
  stone: '🪨 Refino de Pedra',
};

// Emoji de um insumo: material de forja, ou pedra (estilhaço → pedra → concentrada).
function matEmoji(name: string): string {
  if (name.includes('Concentrada')) return '💠';
  if (name.includes('Pedra Negra')) return '🪨';
  return forgeMaterialEmoji(name);
}

// Emoji da saída da receita.
function outputEmoji(recipe: ForgeRecipe): string {
  if (recipe.kind === 'stone') return recipe.outputName.includes('Concentrada') ? '💠' : '🪨';
  const item = getForgeOutputCatalogItem(recipe);
  return item ? getItemVisual(item.type).emoji ?? '⚒️' : '⚒️';
}

interface Character {
  id: string;
  name: string;
  class: string;
  race: string;
}

interface InventoryItem {
  id: string;
  quantity: number;
  item: { name: string; type: string; stats?: Record<string, unknown> | null };
}

export default function ForgeBench({
  characters,
  characterId,
  refreshSignal,
  onCrafted,
}: {
  characters: Character[];
  characterId?: string;
  refreshSignal?: number;
  onCrafted?: () => void;
}) {
  const [internalCharacterId, setInternalCharacterId] = useState<string>('');
  const controlled = characterId != null;
  const selectedCharacterId = controlled ? characterId : internalCharacterId;
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');

  useEffect(() => {
    if (!controlled && !internalCharacterId && characters.length > 0) {
      setInternalCharacterId(characters[0].id);
    }
  }, [controlled, characters, internalCharacterId]);

  const fetchInventory = useCallback(async (charId: string) => {
    setLoadingInv(true);
    try {
      const res = await fetch(`/api/store/inventory?characterId=${charId}`);
      const data = res.ok ? await res.json() : [];
      setInventory(Array.isArray(data) ? data : []);
    } catch {
      setInventory([]);
    } finally {
      setLoadingInv(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCharacterId) fetchInventory(selectedCharacterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCharacterId, refreshSignal, fetchInventory]);

  // Insumos do inventário (materiais + pedras): nome → quantidade total.
  const matCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      if (inv.item.type === 'CONSUMABLE') {
        map.set(inv.item.name, (map.get(inv.item.name) ?? 0) + inv.quantity);
      }
    }
    return map;
  }, [inventory]);

  const groups = useMemo(() => forgeRecipesByGroup(), []);
  const allRecipes = useMemo(() => groups.flatMap((g) => g.recipes), [groups]);
  const selected = useMemo(
    () => allRecipes.find((r) => r.id === selectedRecipeId) ?? null,
    [allRecipes, selectedRecipeId]
  );

  const have = (name: string) => matCounts.get(name) ?? 0;
  const canForge = selected ? selected.materials.every((m) => have(m.name) >= m.quantity) : false;

  const handleForge = async () => {
    if (!selected || !selectedCharacterId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/character/${selectedCharacterId}/forge-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: selected.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Erro ao forjar');
        return;
      }
      toast.success(json.message || '⚒️ Forjado!');
      await fetchInventory(selectedCharacterId);
      onCrafted?.();
    } catch {
      toast.error('Erro inesperado ao forjar');
    } finally {
      setBusy(false);
    }
  };

  const selectedUi = selected ? RARITY_UI[selected.rarity] : RARITY_UI.COMMON;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-orange-500/40 bg-gradient-to-br from-orange-950/40 to-zinc-950/50 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-2xl font-black text-orange-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          ⚒️ Mesa de Forja
        </h2>
        {!controlled && characters.length > 1 && (
          <select
            value={selectedCharacterId}
            onChange={(e) => setInternalCharacterId(e.target.value)}
            className="px-3 py-2 bg-black/40 border border-orange-500/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.class})</option>
            ))}
          </select>
        )}
      </div>

      <p className="text-sm text-white/60 mb-5">
        Escolha uma receita à esquerda; a bigorna mostra os materiais necessários. Forje
        equipamentos comuns/incomuns ou refine estilhaços em <strong className="text-white">Pedra Negra</strong> e{' '}
        <strong className="text-white">Concentrada</strong> (10:1). Materiais caem em masmorras.
      </p>

      {loadingInv ? (
        <div className="text-white/50 text-sm py-8 text-center">Carregando materiais…</div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Livro de receitas */}
          <div className="lg:w-1/2 space-y-4">
            {groups.map(({ group, recipes }) => (
              <div key={group}>
                <label className="block text-xs font-semibold text-orange-200/80 mb-2">{GROUP_LABEL[group]}</label>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                  {recipes.map((r) => {
                    const ui = RARITY_UI[r.rarity];
                    const ok = r.materials.every((m) => have(m.name) >= m.quantity);
                    const isSel = r.id === selectedRecipeId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRecipeId(r.id)}
                        title={r.outputName}
                        className="flex items-center gap-2 rounded-lg border p-2 text-left transition-transform hover:scale-[1.02]"
                        style={{
                          borderColor: isSel ? ui.ring : ui.ring + '55',
                          background: isSel ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)',
                          boxShadow: isSel ? `0 0 12px ${ui.glow}` : undefined,
                        }}
                      >
                        <span className="block w-9 h-9 shrink-0 overflow-hidden rounded-md grid place-items-center">
                          <ItemThumb name={r.outputName} emoji={outputEmoji(r)} className="text-2xl" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-[11px] font-bold leading-tight truncate ${ui.text}`}>{r.outputName}</span>
                          <span className={`block text-[10px] leading-tight ${ok ? 'text-emerald-300/80' : 'text-white/35'}`}>
                            {ok ? 'pronto' : 'faltam materiais'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Bigorna (receita selecionada) */}
          <div className="lg:w-1/2">
            {!selected ? (
              <div className="text-white/40 text-sm py-10 text-center rounded-xl border border-white/5 bg-black/20">
                👈 Escolha uma receita para ver os materiais.
              </div>
            ) : (
              <div className="rounded-xl border p-4" style={{ borderColor: selectedUi.ring + '66', background: 'rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-16 h-16 shrink-0 grid place-items-center rounded-xl border-2 overflow-hidden"
                    style={{ borderColor: selectedUi.ring, boxShadow: `0 0 16px ${selectedUi.glow}` }}
                  >
                    <ItemThumb name={selected.outputName} emoji={outputEmoji(selected)} className="text-4xl" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`font-black text-lg truncate ${selectedUi.text}`}>{selected.outputName}</h3>
                    <p className="text-xs text-amber-300">taxa de forja {selected.goldCost} 🪙</p>
                  </div>
                </div>

                <label className="block text-xs font-semibold text-orange-200/80 mb-2">Materiais necessários</label>
                <div className="space-y-1.5 mb-4">
                  {selected.materials.map((m) => {
                    const owned = have(m.name);
                    const enough = owned >= m.quantity;
                    return (
                      <div
                        key={m.name}
                        className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5"
                        style={{ background: enough ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)' }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="block w-7 h-7 shrink-0 overflow-hidden rounded grid place-items-center">
                            <ItemThumb name={m.name} emoji={matEmoji(m.name)} className="text-lg" />
                          </span>
                          <span className="text-xs text-white/80 truncate">{m.name}</span>
                        </span>
                        <span className={`text-xs font-bold shrink-0 ${enough ? 'text-emerald-300' : 'text-red-300'}`}>
                          {owned}/{m.quantity}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleForge}
                  disabled={busy || !canForge || !selectedCharacterId}
                  className="w-full px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 bg-gradient-to-r from-orange-600 to-amber-500"
                >
                  {busy ? 'Forjando…' : canForge ? '⚒️ Forjar' : 'Materiais insuficientes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
