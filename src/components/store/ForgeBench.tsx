'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
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

// Posição do popover de hover (coordenadas de viewport, fixed).
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
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  // Portal só após montar no cliente (modal/popover saem do container com
  // backdrop-blur + overflow-hidden, que senão recortaria os elementos fixed).
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

  // Limpa a mesa ao trocar de personagem.
  useEffect(() => {
    setSelectedRecipeId('');
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

  // Só os itens FORJÁVEIS do inventário (materiais + pedras de aprimoramento), pra
  // exibir na mesa — exclui poções e outros consumíveis.
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
  const selected = useMemo(
    () => allRecipes.find((r) => r.id === selectedRecipeId) ?? null,
    [allRecipes, selectedRecipeId]
  );

  const have = useCallback((name: string) => matCounts.get(name) ?? 0, [matCounts]);
  const canForgeRecipe = useCallback(
    (r: ForgeRecipe) => r.materials.every((m) => have(m.name) >= m.quantity),
    [have]
  );
  const canForge = selected ? canForgeRecipe(selected) : false;

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

  // Carrega a receita na mesa (com os materiais "inseridos") e fecha o modal.
  const loadRecipe = (r: ForgeRecipe) => {
    if (!canForgeRecipe(r)) return;
    setSelectedRecipeId(r.id);
    setRecipesOpen(false);
    setHover(null);
  };

  const selectedUi = selected ? RARITY_UI[selected.rarity] : RARITY_UI.COMMON;
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

      {loadingInv ? (
        <div className="text-white/50 text-sm py-8 text-center">Carregando materiais…</div>
      ) : (
        <>
          {/* 🔨 A BIGORNA — receita carregada com os materiais "inseridos" */}
          <div
            className="rounded-xl border p-4 mb-4"
            style={{ borderColor: selected ? selectedUi.ring + '88' : '#ffffff14', background: 'rgba(0,0,0,0.3)' }}
          >
            {!selected ? (
              <div className="py-6 text-center text-sm text-white/45">
                A bigorna está vazia. Abra <strong className="text-orange-300">📖 Receitas</strong> e escolha o que forjar —
                os materiais entram aqui automaticamente.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-14 h-14 shrink-0 grid place-items-center rounded-xl border-2 overflow-hidden"
                    style={{ borderColor: selectedUi.ring, boxShadow: `0 0 16px ${selectedUi.glow}` }}
                  >
                    <ItemThumb name={selected.outputName} emoji={outputEmoji(selected)} className="text-3xl" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-black text-base leading-tight truncate ${selectedUi.text}`}>{selected.outputName}</h3>
                    <p className="text-xs text-amber-300">taxa do ferreiro {selected.goldCost} 🪙</p>
                  </div>
                  <button
                    onClick={() => setSelectedRecipeId('')}
                    disabled={busy}
                    className="text-xs text-white/40 hover:text-white/80 transition-colors disabled:opacity-30"
                    title="Esvaziar a bigorna"
                  >
                    ✕ limpar
                  </button>
                </div>

                {/* Materiais inseridos na mesa */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {selected.materials.map((m) => {
                    const enough = have(m.name) >= m.quantity;
                    return (
                      <div
                        key={m.name}
                        className="relative flex flex-col items-center gap-0.5 rounded-lg border p-1.5 w-[68px]"
                        style={{ borderColor: enough ? '#34d39966' : '#ef444466', background: 'rgba(0,0,0,0.35)' }}
                        title={`${m.name} — você tem ${have(m.name)}, precisa de ${m.quantity}`}
                      >
                        <span className="block w-9 h-9 overflow-hidden rounded grid place-items-center">
                          <ItemThumb name={m.name} emoji={matEmoji(m.name)} className="text-xl" />
                        </span>
                        <span className={`text-[10px] font-bold ${enough ? 'text-emerald-300' : 'text-red-300'}`}>
                          {have(m.name)}/{m.quantity}
                        </span>
                        <span className="absolute -top-1.5 -right-1.5 rounded-full bg-orange-600 text-white text-[10px] font-black px-1.5 leading-tight">
                          {m.quantity}
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
                  {busy ? 'Forjando…' : canForge ? `⚒️ Forjar e pagar ${selected.goldCost} 🪙` : 'Materiais insuficientes'}
                </button>
              </>
            )}
          </div>

          {/* 🎒 Materiais forjáveis do personagem */}
          <label className="block text-xs font-semibold text-orange-200/80 mb-2">Seus materiais</label>
          {forgeStock.length === 0 ? (
            <div className="text-white/40 text-xs py-4 text-center rounded-lg border border-white/5 bg-black/20">
              🎒 Nenhum material. Explore masmorras para coletar couro, ferro e estilhaços.
            </div>
          ) : (
            <div
              className="grid gap-2 overflow-y-auto pr-1"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', maxHeight: 160 }}
            >
              {forgeStock.map(({ name, count }) => (
                <div
                  key={name}
                  title={`${name} — ${count}`}
                  className="relative flex flex-col items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 p-1.5"
                >
                  <span className="block w-8 h-8 overflow-hidden rounded grid place-items-center">
                    <ItemThumb name={name} emoji={matEmoji(name)} className="text-lg" />
                  </span>
                  <span className="absolute top-0.5 right-1 text-[10px] font-black text-white" style={{ textShadow: '0 1px 2px #000' }}>
                    {count}
                  </span>
                </div>
              ))}
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
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border-2 border-orange-500/40 bg-gradient-to-br from-zinc-950 to-orange-950/40 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-black text-orange-300">📖 Receitas da Forja</h3>
              <button onClick={() => { setRecipesOpen(false); setHover(null); }} className="text-white/50 hover:text-white text-lg">✕</button>
            </div>
            <p className="text-xs text-white/50 mb-4">
              Passe o mouse para ver os materiais; receitas <span className="text-emerald-300">prontas</span> ficam acesas —
              clique para mandar pra mesa e só pagar o gold.
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
            {canForgeRecipe(hoverRecipe) ? '✓ clique para mandar pra mesa' : 'colete os materiais que faltam'}
          </p>
        </div>
      )}
        </>,
        document.body,
      )}
    </div>
  );
}
