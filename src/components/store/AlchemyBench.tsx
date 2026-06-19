'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { recipesByRarity, type PotionRecipe } from '@/lib/alchemy';
import { getIngredientByName, type Rarity } from '@/lib/itemCatalog';

// Cores por raridade (espelha o /doc).
const RARITY_UI: Record<Rarity, { label: string; text: string; ring: string; bg: string }> = {
  COMMON: { label: 'Comum', text: 'text-zinc-300', ring: 'ring-zinc-500/40', bg: 'bg-zinc-500/10' },
  UNCOMMON: { label: 'Incomum', text: 'text-emerald-300', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10' },
  RARE: { label: 'Raro', text: 'text-sky-300', ring: 'ring-sky-500/40', bg: 'bg-sky-500/10' },
  EPIC: { label: 'Épico', text: 'text-fuchsia-300', ring: 'ring-fuchsia-500/40', bg: 'bg-fuchsia-500/10' },
  LEGENDARY: { label: 'Lendário', text: 'text-amber-300', ring: 'ring-amber-500/40', bg: 'bg-amber-500/10' },
};

interface Character {
  id: string;
  name: string;
  class: string;
  race: string;
}

interface InventoryItem {
  id: string;
  quantity: number;
  item: {
    name: string;
    type: string;
    stats?: Record<string, any> | null;
  };
}

export default function AlchemyBench({
  characters,
  characterId,
  refreshSignal,
  onCrafted,
}: {
  characters: Character[];
  characterId?: string;
  refreshSignal?: number;
  /** Avisa a vitrine que o inventário mudou (após craft). */
  onCrafted?: () => void;
}) {
  const [internalCharacterId, setInternalCharacterId] = useState<string>('');
  const controlled = characterId != null;
  const selectedCharacterId = controlled ? characterId : internalCharacterId;
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [busyRecipe, setBusyRecipe] = useState<string>('');
  const [loadingInv, setLoadingInv] = useState(false);

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

  // Mapa nome→quantidade dos ingredientes que o personagem tem.
  const ingredientCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      if (inv.item.type === 'CONSUMABLE' && (inv.item.stats as any)?.kind === 'ingredient') {
        map.set(inv.item.name, (map.get(inv.item.name) ?? 0) + inv.quantity);
      }
    }
    return map;
  }, [inventory]);

  const groups = useMemo(() => recipesByRarity(), []);

  const canCraft = (recipe: PotionRecipe) =>
    recipe.ingredients.every((ing) => (ingredientCounts.get(ing.name) ?? 0) >= ing.quantity);

  const handleCraft = async (recipe: PotionRecipe) => {
    if (!selectedCharacterId) {
      toast.error('Selecione um personagem.');
      return;
    }
    setBusyRecipe(recipe.id);
    try {
      const res = await fetch(`/api/character/${selectedCharacterId}/craft-potion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: recipe.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Erro ao craftar');
        return;
      }
      toast.success(json.message || '⚗️ Poção criada!');
      await fetchInventory(selectedCharacterId);
      onCrafted?.();
    } catch {
      toast.error('Erro inesperado ao craftar');
    } finally {
      setBusyRecipe('');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-purple-950/30 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-2xl font-black text-emerald-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          ⚗️ Bancada de Alquimia
        </h2>
        {!controlled && characters.length > 1 && (
          <select
            value={selectedCharacterId}
            onChange={(e) => setInternalCharacterId(e.target.value)}
            className="px-3 py-2 bg-black/40 border border-emerald-500/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.class})
              </option>
            ))}
          </select>
        )}
      </div>

      <p className="text-sm text-white/60 mb-5">
        Combine ingredientes obtidos como espólio nas masmorras para destilar poções.
        Cada craft consome os ingredientes + uma taxa em gold.{' '}
        Consulte as receitas no{' '}
        <a href="/doc#crafting" className="text-emerald-300 hover:underline">livro de receitas (/doc)</a>.
      </p>

      {loadingInv ? (
        <div className="text-white/50 text-sm py-8 text-center">Carregando ingredientes…</div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ rarity, recipes }) => (
            <div key={rarity}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${RARITY_UI[rarity].text} ${RARITY_UI[rarity].ring} ${RARITY_UI[rarity].bg}`}>
                  {RARITY_UI[rarity].label}
                </span>
                <span className="text-xs text-white/40">{recipes.length} receita(s)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recipes.map((recipe) => {
                  const craftable = canCraft(recipe);
                  const busy = busyRecipe === recipe.id;
                  return (
                    <div
                      key={recipe.id}
                      className={`rounded-xl border p-4 ${
                        craftable ? 'border-emerald-500/40 bg-black/30' : 'border-white/10 bg-black/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h3 className={`font-bold text-base ${RARITY_UI[recipe.rarity].text}`}>
                          🧪 {recipe.outputName}
                        </h3>
                        <span className="text-xs font-semibold text-amber-300 shrink-0">
                          💰 {recipe.goldCost}
                        </span>
                      </div>

                      <ul className="space-y-1 mb-3">
                        {recipe.ingredients.map((ing) => {
                          const have = ingredientCounts.get(ing.name) ?? 0;
                          const ok = have >= ing.quantity;
                          const emoji = getIngredientByName(ing.name)?.emoji ?? '•';
                          return (
                            <li key={ing.name} className="flex items-center justify-between text-xs">
                              <span className="text-white/80">
                                {emoji} {ing.name}
                              </span>
                              <span className={ok ? 'text-emerald-300' : 'text-red-300'}>
                                {have}/{ing.quantity}
                              </span>
                            </li>
                          );
                        })}
                      </ul>

                      <button
                        onClick={() => handleCraft(recipe)}
                        disabled={busy || !craftable || !selectedCharacterId}
                        className="w-full px-4 py-2 rounded-lg font-black text-sm text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 bg-gradient-to-r from-emerald-600 to-teal-500"
                      >
                        {busy ? 'Destilando…' : craftable ? '⚗️ Craftar' : 'Ingredientes insuficientes'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
