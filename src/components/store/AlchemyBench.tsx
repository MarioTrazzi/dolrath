'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { findRecipeByIngredients } from '@/lib/alchemy';
import { getIngredientByName, isIngredientItem, type Rarity } from '@/lib/itemCatalog';
// Miniatura com card de detalhe ao passar o mouse (ver TODO ícone grande).
import { CraftItemThumb as ItemThumb } from './CraftItemThumb';

// Cores por raridade (espelha o /doc).
const RARITY_UI: Record<Rarity, { text: string; ring: string; glow: string }> = {
  COMMON: { text: 'text-zinc-300', ring: '#a1a1aa', glow: 'rgba(161,161,170,0.6)' },
  UNCOMMON: { text: 'text-emerald-300', ring: '#34d399', glow: 'rgba(52,211,153,0.6)' },
  RARE: { text: 'text-sky-300', ring: '#38bdf8', glow: 'rgba(56,189,248,0.6)' },
  EPIC: { text: 'text-fuchsia-300', ring: '#e879f9', glow: 'rgba(232,121,249,0.6)' },
  LEGENDARY: { text: 'text-amber-300', ring: '#fbbf24', glow: 'rgba(251,191,36,0.6)' },
};
const RARITY_ORDER: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

interface Character {
  id: string;
  name: string;
  class: string;
  race: string;
}

interface InventoryItem {
  id: string;
  quantity: number;
  item: { name: string; type: string; stats?: Record<string, any> | null };
}

// Posições dos vértices/centro dentro da caixa 340×280 (px).
const SLOT = 76;
const POS = {
  top: { x: 170, y: 50 },
  left: { x: 70, y: 224 },
  right: { x: 270, y: 224 },
  center: { x: 170, y: 168 },
};
const SLOT_KEYS = ['top', 'left', 'right'] as const;

export default function AlchemyBench({
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
  // Os 3 vértices do triângulo (nome do ingrediente ou null).
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);

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

  // Limpa o triângulo ao trocar de personagem.
  useEffect(() => {
    setSlots([null, null, null]);
  }, [selectedCharacterId]);

  // Ingredientes do inventário: nome → quantidade total.
  const ingredientCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      // Inclui registros antigos sem stats.kind (classificados pelo catálogo). [[dolrath-alchemy-crafting]]
      if (isIngredientItem(inv.item)) {
        map.set(inv.item.name, (map.get(inv.item.name) ?? 0) + inv.quantity);
      }
    }
    return map;
  }, [inventory]);

  const placedCount = (name: string) => slots.filter((s) => s === name).length;
  const available = (name: string) => (ingredientCounts.get(name) ?? 0) - placedCount(name);

  // Ingredientes disponíveis, ordenados por raridade depois nome.
  const palette = useMemo(() => {
    return Array.from(ingredientCounts.keys())
      .map((name) => ({ name, info: getIngredientByName(name), total: ingredientCounts.get(name) ?? 0 }))
      .filter((p) => p.info)
      .sort((a, b) => {
        const ra = RARITY_ORDER.indexOf(a.info!.rarity);
        const rb = RARITY_ORDER.indexOf(b.info!.rarity);
        return ra - rb || a.name.localeCompare(b.name);
      });
  }, [ingredientCounts]);

  const filled = slots.filter((s): s is string => s != null);
  const matchedRecipe = filled.length === 3 ? findRecipeByIngredients(filled) : undefined;

  const placeIngredient = (name: string) => {
    if (available(name) <= 0) return;
    const idx = slots.findIndex((s) => s == null);
    if (idx === -1) return;
    setSlots((prev) => prev.map((s, i) => (i === idx ? name : s)));
  };

  // Vindo do inventário com "⚗️ Usar na Alquimia" (/alchemist?place=<nome>): põe o
  // ingrediente num vértice assim que ele aparece no inventário e limpa a URL para
  // não repetir ao recarregar. Aguarda mais ingredientes para fechar a receita.
  const placedFromUrlRef = useRef(false);
  useEffect(() => {
    if (placedFromUrlRef.current || loadingInv) return;
    const params = new URLSearchParams(window.location.search);
    const name = params.get('place');
    if (!name) return;
    if (getIngredientByName(name) && (ingredientCounts.get(name) ?? 0) > 0) {
      placeIngredient(name);
      placedFromUrlRef.current = true;
      params.delete('place');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingInv, ingredientCounts]);

  const removeSlot = (idx: number) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? null : s)));
  };

  const handleTransmute = async () => {
    if (!matchedRecipe || !selectedCharacterId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/character/${selectedCharacterId}/craft-potion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: matchedRecipe.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Erro ao transmutar');
        return;
      }
      toast.success(json.message || '⚗️ Poção criada!');
      setSlots([null, null, null]);
      await fetchInventory(selectedCharacterId);
      onCrafted?.();
    } catch {
      toast.error('Erro inesperado ao transmutar');
    } finally {
      setBusy(false);
    }
  };

  const resultRarity = matchedRecipe?.rarity ?? 'COMMON';
  const resultUi = RARITY_UI[resultRarity];

  const renderSlot = (idx: number) => {
    const key = SLOT_KEYS[idx];
    const p = POS[key];
    const name = slots[idx];
    const info = name ? getIngredientByName(name) : undefined;
    const ring = info ? RARITY_UI[info.rarity].ring : '#ffffff33';
    return (
      <button
        key={key}
        type="button"
        onClick={() => removeSlot(idx)}
        disabled={busy}
        title={name ? `${name} (clique para remover)` : 'Vértice vazio'}
        className="absolute grid place-items-center rounded-2xl border-2 transition-transform hover:scale-105 disabled:cursor-not-allowed"
        style={{
          width: SLOT,
          height: SLOT,
          left: p.x - SLOT / 2,
          top: p.y - SLOT / 2,
          borderColor: ring,
          borderStyle: name ? 'solid' : 'dashed',
          background: 'radial-gradient(circle at 50% 35%, rgba(16,40,32,0.9), rgba(5,8,10,0.95))',
          boxShadow: name ? `0 0 16px ${RARITY_UI[info!.rarity].glow}` : 'inset 0 0 10px rgba(0,0,0,0.6)',
        }}
      >
        {name ? (
          <span className="block w-[88%] h-[88%] overflow-hidden rounded-xl drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)] grid place-items-center">
            <ItemThumb name={name} emoji={info?.emoji ?? '•'} className="text-3xl" />
          </span>
        ) : (
          <span className="text-2xl text-white/30">＋</span>
        )}
      </button>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-purple-950/30 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-2xl font-black text-emerald-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          ⚗️ Triângulo de Transmutação
        </h2>
        {!controlled && characters.length > 1 && (
          <select
            value={selectedCharacterId}
            onChange={(e) => setInternalCharacterId(e.target.value)}
            className="px-3 py-2 bg-black/40 border border-emerald-500/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.class})</option>
            ))}
          </select>
        )}
      </div>

      <p className="text-sm text-white/60 mb-5">
        Coloque <strong className="text-white">3 ingredientes</strong> nos vértices do triângulo. Se a combinação
        formar uma receita, a poção surge no centro e vai para o inventário. Consulte as combinações no{' '}
        <a href="/doc#crafting" className="text-emerald-300 hover:underline">livro de receitas (/doc)</a>.
      </p>

      {loadingInv ? (
        <div className="text-white/50 text-sm py-8 text-center">Carregando ingredientes…</div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start">
          {/* Triângulo */}
          <div className="relative mx-auto shrink-0" style={{ width: 340, height: 280 }}>
            <svg
              className="absolute inset-0 pointer-events-none"
              width={340}
              height={280}
              viewBox="0 0 340 280"
            >
              <polygon
                points={`${POS.top.x},${POS.top.y} ${POS.left.x},${POS.left.y} ${POS.right.x},${POS.right.y}`}
                fill="none"
                stroke={matchedRecipe ? resultUi.ring : 'rgba(52,211,153,0.35)'}
                strokeWidth={2}
                strokeDasharray={matchedRecipe ? undefined : '6 6'}
                style={{ filter: matchedRecipe ? `drop-shadow(0 0 8px ${resultUi.glow})` : undefined }}
              />
            </svg>

            {/* Vértices */}
            {SLOT_KEYS.map((_, i) => renderSlot(i))}

            {/* Resultado no centro */}
            <div
              className="absolute grid place-items-center rounded-full border-2 transition-all"
              style={{
                width: 84,
                height: 84,
                left: POS.center.x - 42,
                top: POS.center.y - 42,
                borderColor: matchedRecipe ? resultUi.ring : '#ffffff22',
                background: 'radial-gradient(circle at 50% 35%, rgba(20,50,40,0.95), rgba(4,6,8,0.98))',
                boxShadow: matchedRecipe ? `0 0 26px ${resultUi.glow}` : 'inset 0 0 12px rgba(0,0,0,0.7)',
              }}
              title={matchedRecipe ? matchedRecipe.outputName : 'Combinação ainda incompleta'}
            >
              {matchedRecipe ? (
                <span className="block w-[86%] h-[86%] overflow-hidden rounded-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] grid place-items-center animate-pulse">
                  <ItemThumb name={matchedRecipe.outputName} emoji="🧪" className="text-4xl" />
                </span>
              ) : (
                <span className="text-3xl text-white/20">?</span>
              )}
            </div>
          </div>

          {/* Painel: ingredientes + ação */}
          <div className="flex-1 w-full">
            {/* Status da combinação */}
            <div className="mb-3 min-h-[2.5rem]">
              {filled.length < 3 ? (
                <p className="text-sm text-white/50">
                  Vértices preenchidos: <span className="text-white font-semibold">{filled.length}/3</span>
                </p>
              ) : matchedRecipe ? (
                <p className="text-sm">
                  ✨ Combinação: <span className={`font-bold ${resultUi.text}`}>{matchedRecipe.outputName}</span>{' '}
                  <span className="text-amber-300">· taxa {matchedRecipe.goldCost} 🪙</span>
                </p>
              ) : (
                <p className="text-sm text-red-300">
                  ❌ Combinação desconhecida — confira o <a href="/doc#crafting" className="underline">livro de receitas</a>.
                </p>
              )}
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={handleTransmute}
                disabled={busy || !matchedRecipe || !selectedCharacterId}
                className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 bg-gradient-to-r from-emerald-600 to-teal-500"
              >
                {busy ? 'Transmutando…' : '⚗️ Transmutar'}
              </button>
              <button
                onClick={() => setSlots([null, null, null])}
                disabled={busy || filled.length === 0}
                className="px-4 py-2.5 rounded-xl font-bold text-sm text-white/80 bg-white/10 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Limpar
              </button>
            </div>

            {/* Inventário de ingredientes — clique para colocar no triângulo */}
            <label className="block text-xs font-semibold text-emerald-200/80 mb-2">
              Seus ingredientes — clique para adicionar a um vértice
            </label>
            {palette.length === 0 ? (
              <div className="text-white/40 text-sm py-4 text-center rounded-lg border border-white/5 bg-black/20">
                🎒 Nenhum ingrediente. Explore masmorras para coletar espólios.
              </div>
            ) : (
              <div
                className="grid"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}
              >
                {palette.map(({ name, info }) => {
                  const left = available(name);
                  const ui = RARITY_UI[info!.rarity];
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => placeIngredient(name)}
                      disabled={busy || left <= 0}
                      title={`${name} — ${left} disponível`}
                      className="relative flex flex-col items-center gap-1 rounded-lg border p-2 transition-transform hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                      style={{ borderColor: ui.ring + '66', background: 'rgba(0,0,0,0.3)' }}
                    >
                      <span className="block w-10 h-10 overflow-hidden rounded-md grid place-items-center">
                        <ItemThumb name={name} emoji={info!.emoji} />
                      </span>
                      <span className={`text-[10px] font-semibold leading-tight text-center ${ui.text}`}>{name}</span>
                      <span className="absolute top-0.5 right-1 text-[11px] font-black text-white"
                        style={{ textShadow: '0 1px 2px #000' }}>
                        {left}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
