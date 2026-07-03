'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { findRecipeByIngredients, recipesByRarity, expandRecipe, recipesUsingIngredient, type PotionRecipe } from '@/lib/alchemy';
import { getIngredientByName, getConsumableByName, isIngredientItem, type Rarity } from '@/lib/itemCatalog';
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

const RARITY_LABEL: Record<Rarity, string> = {
  COMMON: 'Comuns',
  UNCOMMON: 'Incomuns',
  RARE: 'Raras',
  EPIC: 'Épicas',
  LEGENDARY: 'Lendárias',
};

// Efeito da poção em texto curto (ex.: "❤️25 · 💧20") — lido direto do
// CONSUMABLE_CATALOG (fonte única de verdade dos stats de consumível).
function potionEffectLine(outputName: string): string | null {
  const c = getConsumableByName(outputName);
  if (!c) return null;
  const s = c.stats;
  const parts: string[] = [];
  if (s.healAmount) parts.push(`❤️${s.healAmount >= 9999 ? '∞' : s.healAmount}`);
  if (s.manaAmount) parts.push(`💧${s.manaAmount >= 9999 ? '∞' : s.manaAmount}`);
  if (s.staminaAmount) parts.push(`⚡${s.staminaAmount}`);
  if (s.reviveHpPercent) parts.push(`✨revive ${s.reviveHpPercent}%`);
  if (s.attackBonus) parts.push(`⚔️+${s.attackBonus}${s.duration ? `(${s.duration}t)` : ''}`);
  if (s.defenseBonus) parts.push(`🛡️+${s.defenseBonus}${s.duration ? `(${s.duration}t)` : ''}`);
  if (s.dodgeBonus) parts.push(`💨+${s.dodgeBonus}%${s.duration ? `(${s.duration}t)` : ''}`);
  if (s.shieldAmount) parts.push(`🔰${s.shieldAmount}${s.duration ? `(${s.duration}t)` : ''}`);
  if (s.cure) parts.push(`☠️cura ${s.cure === 'poison' ? 'veneno' : s.cure}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface HoverInfo {
  id: string;
  top: number;
  left: number;
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
  // Livro de receitas (modal) + popover de ingredientes ao passar o mouse.
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  // Popover "usado em" ao passar o mouse sobre um ingrediente da paleta (fora do livro).
  const [ingHover, setIngHover] = useState<HoverInfo | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  // Animação da transmutação: uma luz percorre os 3 vértices ('tracing') e então
  // o item surge no centro com um brilho ('reveal'). Dispara quando o triângulo
  // fecha numa receita válida (via clique manual ou pelo livro de receitas).
  const [animPhase, setAnimPhase] = useState<'idle' | 'tracing' | 'reveal'>('idle');
  const prevRecipeId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const id = matchedRecipe?.id;
    if (id && id !== prevRecipeId.current) {
      prevRecipeId.current = id;
      setAnimPhase('tracing');
      const t1 = setTimeout(() => setAnimPhase('reveal'), 900);
      const t2 = setTimeout(() => setAnimPhase('idle'), 900 + 650);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    if (!id) prevRecipeId.current = undefined;
  }, [matchedRecipe?.id]);

  // Receitas agrupadas por raridade para o livro de receitas.
  const recipeGroups = useMemo(() => recipesByRarity(), []);
  const allRecipes = useMemo(() => recipeGroups.flatMap((g) => g.recipes), [recipeGroups]);
  const hoverRecipe = hover ? allRecipes.find((r) => r.id === hover.id) ?? null : null;

  // Quantidade TOTAL do ingrediente no inventário (independe do que está no triângulo).
  const have = useCallback((name: string) => ingredientCounts.get(name) ?? 0, [ingredientCounts]);
  const canCraftRecipe = useCallback(
    (r: PotionRecipe) => r.ingredients.every((i) => have(i.name) >= i.quantity),
    [have]
  );

  // Atalho do livro: clicar numa receita pronta já preenche os 3 vértices do triângulo.
  const loadRecipe = (r: PotionRecipe) => {
    if (!canCraftRecipe(r)) return;
    setSlots(expandRecipe(r));
    setRecipesOpen(false);
    setHover(null);
  };

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
        {/* Flash da luz ao passar por este vértice (sequencial: topo → esq → dir). */}
        {animPhase === 'tracing' && name && (
          <span
            className="alchemy-vertex pointer-events-none absolute inset-0 rounded-2xl"
            style={{ animationDelay: `${idx * 0.3}s`, boxShadow: `0 0 22px 2px ${ring}, inset 0 0 12px ${ring}` }}
          />
        )}
      </button>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-purple-950/30 p-5 backdrop-blur-sm">
      <style>{`
        @keyframes alchemy-trace {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -100; }
        }
        .alchemy-trace { animation: alchemy-trace 0.9s linear both; }
        @keyframes alchemy-vertex {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
        .alchemy-vertex { animation: alchemy-vertex 0.5s ease-in-out both; }
        @keyframes alchemy-pop {
          0% { opacity: 0; transform: scale(0.2); filter: brightness(2.4); }
          55% { opacity: 1; transform: scale(1.14); filter: brightness(1.6); }
          100% { opacity: 1; transform: scale(1); filter: brightness(1); }
        }
        .alchemy-pop { animation: alchemy-pop 0.6s cubic-bezier(.2,.9,.3,1.3) both; }
        @keyframes alchemy-flash {
          0% { opacity: 0; transform: scale(0.3); }
          35% { opacity: 0.95; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1.9); }
        }
        .alchemy-flash { animation: alchemy-flash 0.65s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .alchemy-trace, .alchemy-vertex, .alchemy-pop, .alchemy-flash { animation: none; }
        }
      `}</style>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-black text-emerald-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            ⚗️ Triângulo de Transmutação
          </h2>
          <button
            onClick={() => setRecipesOpen(true)}
            title="Livro de receitas"
            aria-label="Receitas de alquimia"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 transition-colors"
          >
            <Info size={15} />
          </button>
        </div>
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
        formar uma receita, a poção surge no centro e vai para o inventário. Abra o{' '}
        <button
          type="button"
          onClick={() => setRecipesOpen(true)}
          className="font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
        >
          livro de receitas
        </button>
        {' '}e clique numa receita pronta para montar o triângulo de uma vez.
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
              {/* Luz-cometa que percorre o triângulo passando pelos 3 vértices. */}
              {animPhase === 'tracing' && (
                <polygon
                  points={`${POS.top.x},${POS.top.y} ${POS.left.x},${POS.left.y} ${POS.right.x},${POS.right.y}`}
                  pathLength={100}
                  fill="none"
                  stroke={resultUi.ring}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray="16 84"
                  className="alchemy-trace"
                  style={{ filter: `drop-shadow(0 0 8px ${resultUi.glow})` }}
                />
              )}
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
                animPhase === 'tracing' ? (
                  // A luz ainda está percorrendo os vértices: centro "carregando".
                  <span className="text-3xl text-white/40 animate-ping">✦</span>
                ) : (
                  <span
                    className={`block w-[86%] h-[86%] overflow-hidden rounded-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] grid place-items-center ${animPhase === 'reveal' ? 'alchemy-pop' : 'animate-pulse'}`}
                  >
                    <ItemThumb name={matchedRecipe.outputName} emoji="🧪" className="text-4xl" />
                  </span>
                )
              ) : (
                <span className="text-3xl text-white/20">?</span>
              )}
              {/* Estouro de brilho no item recém-formado. */}
              {matchedRecipe && animPhase === 'reveal' && (
                <span
                  className="alchemy-flash pointer-events-none absolute inset-[-30%] rounded-full"
                  style={{ background: `radial-gradient(circle, ${resultUi.glow} 0%, transparent 65%)` }}
                />
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
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const left = Math.min(rect.right + 8, window.innerWidth - 250);
                        setIngHover({ id: name, top: rect.top, left });
                      }}
                      onMouseLeave={() => setIngHover((h) => (h?.id === name ? null : h))}
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

      {/* ===== MODAL DE RECEITAS + POPOVER (portal: fora do container com blur/overflow) ===== */}
      {mounted && createPortal(
        <>
          {recipesOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={() => { setRecipesOpen(false); setHover(null); }}
            >
              <div
                className="relative w-full max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-zinc-950 to-emerald-950/40 p-5 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-black text-emerald-300">📖 Receitas de Alquimia</h3>
                  <button onClick={() => { setRecipesOpen(false); setHover(null); }} className="text-white/50 hover:text-white text-lg">✕</button>
                </div>
                <p className="text-xs text-white/50 mb-4">
                  Passe o mouse (ou segure o dedo) para ver os ingredientes (em vermelho os que faltam). Receitas{' '}
                  <span className="text-emerald-300">prontas</span> ficam acesas — clique para montar o triângulo;
                  ou posicione os ingredientes você mesmo.
                </p>

                <div className="space-y-4">
                  {recipeGroups.map(({ rarity, recipes }) => (
                    <div key={rarity}>
                      <label className={`block text-xs font-semibold mb-2 ${RARITY_UI[rarity].text}`}>
                        {RARITY_LABEL[rarity]}
                      </label>
                      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                        {recipes.map((r) => {
                          const ui = RARITY_UI[r.rarity];
                          const ok = canCraftRecipe(r);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => loadRecipe(r)}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const left = Math.min(rect.right + 8, window.innerWidth - 240);
                                setHover({ id: r.id, top: rect.top, left });
                              }}
                              onMouseLeave={() => setHover((h) => (h?.id === r.id ? null : h))}
                              className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-transform ${ok ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-not-allowed opacity-45'}`}
                              style={{
                                borderColor: ok ? ui.ring : ui.ring + '40',
                                background: 'rgba(0,0,0,0.35)',
                                boxShadow: ok ? `0 0 10px ${ui.glow}` : undefined,
                              }}
                            >
                              <span className="block w-9 h-9 shrink-0 overflow-hidden rounded-md grid place-items-center">
                                <ItemThumb name={r.outputName} emoji="🧪" className="text-2xl" />
                              </span>
                              <span className="min-w-0">
                                <span className={`block text-[11px] font-bold leading-tight truncate ${ui.text}`}>{r.outputName}</span>
                                {potionEffectLine(r.outputName) && (
                                  <span className="block text-[9px] leading-tight text-white/40 truncate">{potionEffectLine(r.outputName)}</span>
                                )}
                                <span className={`block text-[10px] leading-tight ${ok ? 'text-emerald-300' : 'text-white/35'}`}>
                                  {ok ? '✓ pronto' : 'faltam ingredientes'}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Popover de disponibilidade (hover sobre uma receita) — só informação. */}
          {hover && hoverRecipe && (
            <div
              className="pointer-events-none fixed z-[60] w-[224px] rounded-xl border border-emerald-500/40 bg-zinc-950/95 p-3 shadow-2xl"
              style={{ top: Math.min(hover.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220), left: hover.left }}
            >
              <p className={`text-xs font-black ${RARITY_UI[hoverRecipe.rarity].text}`}>{hoverRecipe.outputName}</p>
              <p className="text-[9px] text-white/40 mb-2">{potionEffectLine(hoverRecipe.outputName) ?? ' '}</p>
              <div className="space-y-1">
                {hoverRecipe.ingredients.map((ing) => {
                  const enough = have(ing.name) >= ing.quantity;
                  const info = getIngredientByName(ing.name);
                  return (
                    <div key={ing.name} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="block w-5 h-5 overflow-hidden rounded grid place-items-center">
                          <ItemThumb name={ing.name} emoji={info?.emoji ?? '•'} className="text-sm" />
                        </span>
                        <span className="text-[11px] text-white/75 truncate">{ing.name}</span>
                      </span>
                      <span className={`text-[11px] font-bold shrink-0 ${enough ? 'text-emerald-300' : 'text-red-300'}`}>
                        {have(ing.name)}/{ing.quantity}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-amber-300">taxa {hoverRecipe.goldCost} 🪙</p>
              <p className={`mt-1 text-[10px] font-semibold ${canCraftRecipe(hoverRecipe) ? 'text-emerald-300' : 'text-white/40'}`}>
                {canCraftRecipe(hoverRecipe) ? '✓ clique para montar o triângulo' : 'colete os ingredientes que faltam'}
              </p>
            </div>
          )}

          {/* Popover "usado em" (hover sobre um ingrediente da paleta) — mostra em quais poções ele entra. */}
          {ingHover && (
            <div
              className="pointer-events-none fixed z-[60] w-[230px] rounded-xl border border-emerald-500/40 bg-zinc-950/95 p-3 shadow-2xl"
              style={{ top: Math.min(ingHover.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 260), left: ingHover.left }}
            >
              <p className="text-xs font-black mb-2 text-white/90">Usado em:</p>
              {(() => {
                const recipes = recipesUsingIngredient(ingHover.id);
                if (recipes.length === 0) {
                  return <p className="text-[11px] text-white/40">Nenhuma poção conhecida usa este ingrediente.</p>;
                }
                return (
                  <div className="space-y-1.5">
                    {recipes.map((r) => {
                      const ui = RARITY_UI[r.rarity];
                      const need = r.ingredients.find((i) => i.name === ingHover.id)?.quantity ?? 1;
                      const ok = canCraftRecipe(r);
                      return (
                        <div key={r.id} className="flex items-center gap-2">
                          <span className="block w-6 h-6 shrink-0 overflow-hidden rounded grid place-items-center">
                            <ItemThumb name={r.outputName} emoji="🧪" className="text-base" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[11px] font-bold leading-tight truncate ${ui.text}`}>{r.outputName}</span>
                            <span className={`block text-[10px] leading-tight ${ok ? 'text-emerald-300' : 'text-white/40'}`}>
                              precisa {need}x{ok ? ' · pronta' : ''}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </>,
        document.body,
      )}
    </div>
  );
}
