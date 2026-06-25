'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { forgeRecipesByGroup, forgeMaterialEmoji, getForgeOutputCatalogItem, findForgeRecipeByMaterials, type ForgeRecipe } from '@/lib/forge';
import { getItemVisual } from '@/lib/itemVisuals';
import { itemImagePath, type Rarity } from '@/lib/itemCatalog';

const DRAG_MIME = 'text/forge-material';

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

interface HoverInfo {
  id: string;
  top: number;
  left: number;
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
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Materiais colocados na bigorna: nome → quantidade.
  const [placed, setPlaced] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);

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

  // Esvazia a bigorna ao trocar de personagem.
  useEffect(() => {
    setPlaced({});
  }, [selectedCharacterId]);

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

  // Só os itens FORJÁVEIS (materiais + pedras de aprimoramento) — arrastáveis pra mesa.
  const forgeStock = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      const st = inv.item.stats as Record<string, unknown> | null;
      const isForge = inv.item.type === 'CONSUMABLE' && (st?.kind === 'material' || st?.enhancementStone);
      if (isForge) map.set(inv.item.name, (map.get(inv.item.name) ?? 0) + inv.quantity);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory]);

  const groups = useMemo(() => forgeRecipesByGroup(), []);
  const allRecipes = useMemo(() => groups.flatMap((g) => g.recipes), [groups]);

  const have = useCallback((name: string) => matCounts.get(name) ?? 0, [matCounts]);

  // Lista de materiais na bigorna e a receita que ela forma (combinação exata).
  const placedList = useMemo(
    () => Object.entries(placed).filter(([, c]) => c > 0).map(([name, count]) => ({ name, quantity: count })),
    [placed]
  );
  const matched = useMemo(() => findForgeRecipeByMaterials(placedList), [placedList]);
  const availableOf = useCallback((name: string) => have(name) - (placed[name] ?? 0), [have, placed]);

  const addMaterial = useCallback((name: string) => {
    setPlaced((p) => {
      const cur = p[name] ?? 0;
      if (have(name) - cur <= 0) return p; // não coloca mais do que tem
      return { ...p, [name]: cur + 1 };
    });
  }, [have]);

  const removeMaterial = (name: string) => {
    setPlaced((p) => {
      const cur = p[name] ?? 0;
      if (cur <= 1) {
        const next = { ...p };
        delete next[name];
        return next;
      }
      return { ...p, [name]: cur - 1 };
    });
  };

  const canForgeRecipe = useCallback(
    (r: ForgeRecipe) => r.materials.every((m) => have(m.name) >= m.quantity),
    [have]
  );

  const handleForge = async () => {
    if (!matched || !selectedCharacterId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/character/${selectedCharacterId}/forge-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: matched.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Erro ao forjar');
        return;
      }
      toast.success(json.message || '⚒️ Forjado!');
      setPlaced({});
      await fetchInventory(selectedCharacterId);
      onCrafted?.();
    } catch {
      toast.error('Erro inesperado ao forjar');
    } finally {
      setBusy(false);
    }
  };

  // Atalho do livro: clicar numa receita pronta já enche a bigorna com os materiais dela.
  const loadRecipe = (r: ForgeRecipe) => {
    if (!canForgeRecipe(r)) return;
    const next: Record<string, number> = {};
    for (const m of r.materials) next[m.name] = m.quantity;
    setPlaced(next);
    setRecipesOpen(false);
    setHover(null);
  };

  const matchedUi = matched ? RARITY_UI[matched.rarity] : null;
  const hoverRecipe = hover ? allRecipes.find((r) => r.id === hover.id) ?? null : null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border-2 border-orange-500/40 bg-gradient-to-br from-orange-950/40 to-zinc-950/50 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-black text-orange-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            ⚒️ Mesa de Forja
          </h2>
          <button
            onClick={() => setRecipesOpen(true)}
            title="Livro de receitas"
            aria-label="Receitas da forja"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-orange-500/40 text-orange-300 hover:bg-orange-900/60 transition-colors"
          >
            <Info size={15} />
          </button>
        </div>
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

      {/* Só mostra "carregando" no 1º load; refetches (após forjar) são silenciosos. */}
      {loadingInv && inventory.length === 0 ? (
        <div className="text-white/50 text-sm py-8 text-center">Carregando materiais…</div>
      ) : (
        <>
          {/* 🔨 A BIGORNA — zona de drop: arraste materiais até formar uma receita */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const name = e.dataTransfer.getData(DRAG_MIME);
              if (name) addMaterial(name);
            }}
            className="rounded-xl border-2 border-dashed p-4 mb-4 transition-colors"
            style={{
              borderColor: dragOver ? '#f59e0b' : matchedUi ? matchedUi.ring + 'aa' : '#ffffff22',
              background: dragOver ? 'rgba(245,158,11,0.08)' : 'rgba(0,0,0,0.3)',
            }}
          >
            {placedList.length === 0 ? (
              <div className="py-6 text-center text-sm text-white/45">
                Arraste (ou clique) os materiais de baixo até a bigorna. Quando a combinação formar uma{' '}
                <button
                  type="button"
                  onClick={() => setRecipesOpen(true)}
                  className="font-semibold text-orange-300 underline underline-offset-2 hover:text-orange-200"
                >
                  receita
                </button>
                , o item aparece aqui pra forjar.
              </div>
            ) : (
              <>
                {/* Materiais na bigorna */}
                <div className="flex flex-wrap justify-center gap-2 mb-3">
                  {placedList.map(({ name, quantity }) => (
                    <div
                      key={name}
                      className="relative flex flex-col items-center gap-1 rounded-lg border border-orange-500/40 bg-black/40 p-1.5 w-[72px]"
                      title={name}
                    >
                      <span className="absolute -top-1.5 -right-1.5 z-10 rounded-full bg-orange-600 text-white text-[10px] font-black px-1.5 leading-tight shadow-md ring-1 ring-black/40">{quantity}</span>
                      <span className="block w-10 h-10 overflow-hidden rounded grid place-items-center">
                        <ItemThumb name={name} emoji={matEmoji(name)} className="text-xl" />
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => removeMaterial(name)}
                          className="grid h-5 w-5 place-items-center rounded bg-white/10 text-white/80 hover:bg-white/20 text-xs"
                          title="Tirar 1"
                        >－</button>
                        <button
                          onClick={() => addMaterial(name)}
                          disabled={availableOf(name) <= 0}
                          className="grid h-5 w-5 place-items-center rounded bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                          title="Pôr mais 1"
                        >＋</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resultado da combinação */}
                {matched && matchedUi ? (
                  <div
                    className="relative overflow-hidden flex items-center gap-3 rounded-lg border p-2 mb-3"
                    style={{ borderColor: matchedUi.ring, boxShadow: `0 0 14px ${matchedUi.glow}` }}
                  >
                    {/* Barra de "forjando" — preenche o card enquanto a requisição roda (estilo aprimoramento). */}
                    <div
                      className="absolute inset-y-0 left-0 z-0 transition-[width] duration-700 ease-out"
                      style={{ width: busy ? '100%' : '0%', background: `linear-gradient(90deg, ${matchedUi.glow}, transparent)` }}
                    />
                    <div className="relative z-10 w-12 h-12 shrink-0 grid place-items-center rounded-lg border-2 overflow-hidden" style={{ borderColor: matchedUi.ring }}>
                      <ItemThumb name={matched.outputName} emoji={outputEmoji(matched)} className="text-2xl" />
                    </div>
                    <div className="relative z-10 min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wide text-white/40">{busy ? 'forjando…' : 'vai forjar'}</p>
                      <p className={`font-black text-sm leading-tight truncate ${matchedUi.text}`}>{matched.outputName}</p>
                      <p className="text-xs text-amber-300">taxa {matched.goldCost} 🪙</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-xs text-white/45 mb-3">
                    Combinação ainda não forma uma receita — ajuste os materiais.
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleForge}
                    disabled={busy || !matched || !selectedCharacterId}
                    className="flex-1 px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 bg-gradient-to-r from-orange-600 to-amber-500"
                  >
                    {busy ? 'Forjando…' : matched ? `⚒️ Forjar e pagar ${matched.goldCost} 🪙` : '⚒️ Sem receita'}
                  </button>
                  <button
                    onClick={() => setPlaced({})}
                    disabled={busy}
                    className="px-3 py-2.5 rounded-xl text-sm text-white/70 bg-white/10 hover:bg-white/15 disabled:opacity-30 transition-colors"
                  >
                    Limpar
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 🎒 Materiais forjáveis — arraste ou clique para colocar na bigorna */}
          <label className="block text-xs font-semibold text-orange-200/80 mb-2">
            Seus materiais — arraste ou clique para colocar na mesa
          </label>
          {forgeStock.length === 0 ? (
            <div className="text-white/40 text-xs py-4 text-center rounded-lg border border-white/5 bg-black/20">
              🎒 Nenhum material. Explore masmorras para coletar couro, ferro, estilhaços e pedras.
            </div>
          ) : (
            <div
              className="grid gap-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', maxHeight: 180, scrollbarWidth: 'none' }}
            >
              {forgeStock.map(({ name, count }) => {
                const avail = availableOf(name);
                return (
                  <button
                    key={name}
                    draggable={avail > 0}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, name);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => addMaterial(name)}
                    disabled={avail <= 0}
                    title={`${name} — ${avail} disponível${avail === 1 ? '' : 's'} de ${count}`}
                    className="relative flex flex-col items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 p-1.5 transition-transform enabled:cursor-grab enabled:hover:scale-[1.05] enabled:active:cursor-grabbing disabled:opacity-35 disabled:cursor-not-allowed"
                  >
                    <span className="block w-8 h-8 overflow-hidden rounded grid place-items-center pointer-events-none">
                      <ItemThumb name={name} emoji={matEmoji(name)} className="text-lg" />
                    </span>
                    <span className="absolute top-0.5 right-1 text-[10px] font-black text-white" style={{ textShadow: '0 1px 2px #000' }}>
                      {avail}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
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
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border-2 border-orange-500/40 bg-gradient-to-br from-zinc-950 to-orange-950/40 p-5 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-black text-orange-300">📖 Receitas da Forja</h3>
              <button onClick={() => { setRecipesOpen(false); setHover(null); }} className="text-white/50 hover:text-white text-lg">✕</button>
            </div>
            <p className="text-xs text-white/50 mb-4">
              Passe o mouse para ver os materiais (em vermelho os que faltam). Receitas <span className="text-emerald-300">prontas</span> ficam acesas —
              clique para já montar na bigorna; ou arraste os materiais você mesmo.
            </p>

            <div className="space-y-4">
              {groups.map(({ group, recipes }) => (
                <div key={group}>
                  <label className="block text-xs font-semibold text-orange-200/80 mb-2">{GROUP_LABEL[group]}</label>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                    {recipes.map((r) => {
                      const ui = RARITY_UI[r.rarity];
                      const ok = canForgeRecipe(r);
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
                            <ItemThumb name={r.outputName} emoji={outputEmoji(r)} className="text-2xl" />
                          </span>
                          <span className="min-w-0">
                            <span className={`block text-[11px] font-bold leading-tight truncate ${ui.text}`}>{r.outputName}</span>
                            <span className={`block text-[10px] leading-tight ${ok ? 'text-emerald-300' : 'text-white/35'}`}>
                              {ok ? '✓ pronto' : 'faltam materiais'}
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
          className="pointer-events-none fixed z-[60] w-[224px] rounded-xl border border-orange-500/40 bg-zinc-950/95 p-3 shadow-2xl"
          style={{ top: Math.min(hover.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220), left: hover.left }}
        >
          <p className={`text-xs font-black mb-2 ${RARITY_UI[hoverRecipe.rarity].text}`}>{hoverRecipe.outputName}</p>
          <div className="space-y-1">
            {hoverRecipe.materials.map((m) => {
              const enough = have(m.name) >= m.quantity;
              return (
                <div key={m.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="block w-5 h-5 overflow-hidden rounded grid place-items-center">
                      <ItemThumb name={m.name} emoji={matEmoji(m.name)} className="text-sm" />
                    </span>
                    <span className="text-[11px] text-white/75 truncate">{m.name}</span>
                  </span>
                  <span className={`text-[11px] font-bold shrink-0 ${enough ? 'text-emerald-300' : 'text-red-300'}`}>
                    {have(m.name)}/{m.quantity}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-amber-300">taxa {hoverRecipe.goldCost} 🪙</p>
          <p className={`mt-1 text-[10px] font-semibold ${canForgeRecipe(hoverRecipe) ? 'text-emerald-300' : 'text-white/40'}`}>
            {canForgeRecipe(hoverRecipe) ? '✓ clique para montar na bigorna' : 'colete os materiais que faltam'}
          </p>
        </div>
      )}
        </>,
        document.body,
      )}
    </div>
  );
}
