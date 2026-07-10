'use client';

// 🍳 Dialog de CULINÁRIA — Cozinha do acampamento no estilo BDO.
//
// Clone estrutural do ProcessingDialog (primitivos de bdoTheme.tsx): o prato
// fica no losango central e os insumos em molduras num arco abaixo, ligados
// por linhas-circuito. Mesma regra do processamento: conversão SEM falha
// (chance 1), XP fixo da receita, gating por minLevel próprio. Diferença de
// conteúdo: a saída é COMIDA (FOOD_CATALOG) e o card mostra o BUFF por tempo
// real do prato (lib/foodBuff.ts) — o efeito acontece ao COMER, não ao cozinhar.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { buyGoldOnChain, parseNeededGold, isInsufficientGold } from '@/lib/buyGold';
import { confirmBuyGold } from '@/lib/buyGoldPrompt';
import {
  cookingRecipesByGroup,
  cookingRecipesUsingInput,
  getCookingOutput,
  cookingItemEmoji,
  COOKING_GROUP_LABEL,
  type CookingRecipe,
} from '@/lib/cooking';
import { foodBuffSpecLabel, parseFoodBuffSpec } from '@/lib/foodBuff';
import { type Rarity } from '@/lib/itemCatalog';
import type { ProfessionLevelInfo } from '@/lib/professionSystem';
import { ProfessionBar } from '@/components/gathering/GatheringPanel';
import { CraftItemThumb as ItemThumb } from '@/components/store/CraftItemThumb';
import {
  BdoDialogShell,
  DiamondSlot,
  BevelButton,
  RARITY_UI,
  GOLD,
  GOLD_BRIGHT,
  CHARGE_MS,
  BORDER_GOLD,
} from './bdoTheme';

export interface CookingInventoryItem {
  id: string;
  quantity: number;
  item: { name: string; type: string; stats?: Record<string, any> | null };
}

export interface CookingProfessionInfo {
  xp: number;
  levelInfo: ProfessionLevelInfo;
}

export interface CookingCraftResult {
  attempted: number;
  succeeded: number;
  failed: number;
  chance: number;
  xpGained: number;
  levelInfo: ProfessionLevelInfo;
  characterGold: number | null;
  outputName: string;
  rarity: Rarity;
  message: string;
}

interface CookingDialogProps {
  open: boolean;
  onClose: () => void;
  characterId?: string;
  characterGold?: number | null;
  /** "🍳 Cozinhar" no card do insumo no inventário: pré-seleciona uma receita que o consome. */
  initialInputName?: string;
  // Overrides para páginas de mock/teste (sem DB)
  fetchInfoOverride?: () => Promise<CookingProfessionInfo>;
  fetchInventoryOverride?: () => Promise<CookingInventoryItem[]>;
  attemptOverride?: (recipeId: string, quantity: number) => Promise<CookingCraftResult>;
  onChanged?: () => void;
}

// Geometria do circuito (mesma do ProcessingDialog): prato no alto, insumos num arco abaixo.
const BOX_W = 320;
const BOX_H = 252;
const CENTER = { x: 160, y: 86 };
const CENTER_SLOT = 116;
const MAT_SIZE = 56;
const MAT_Y = 208;
const MAT_XS: Record<number, number[]> = {
  1: [160],
  2: [104, 216],
  3: [64, 160, 256],
  4: [48, 123, 197, 272],
};

const GROUP_EMOJI: Record<CookingRecipe['group'], string> = {
  oven: '🔥',
  pot: '🍲',
  fresh: '🥗',
};

export default function CookingDialog({
  open,
  onClose,
  characterId,
  characterGold,
  initialInputName,
  fetchInfoOverride,
  fetchInventoryOverride,
  attemptOverride,
  onChanged,
}: CookingDialogProps) {
  const [inventory, setInventory] = useState<CookingInventoryItem[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [levelInfo, setLevelInfo] = useState<ProfessionLevelInfo | null>(null);
  const [recipe, setRecipe] = useState<CookingRecipe | null>(null);
  const [craftQty, setCraftQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'charging' | 'done'>('idle');
  const [chargeId, setChargeId] = useState(0);
  const [result, setResult] = useState<CookingCraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const pickedFromLinkRef = useRef(false);

  const level = levelInfo?.level ?? 1;

  const fetchInventory = useCallback(async () => {
    if (!characterId && !fetchInventoryOverride) return;
    setLoadingInv(true);
    try {
      if (fetchInventoryOverride) {
        setInventory(await fetchInventoryOverride());
      } else {
        const res = await fetch(`/api/store/inventory?characterId=${characterId}`);
        const data = res.ok ? await res.json() : [];
        setInventory(Array.isArray(data) ? data : []);
      }
    } catch {
      setInventory([]);
    } finally {
      setLoadingInv(false);
    }
  }, [characterId, fetchInventoryOverride]);

  const fetchInfo = useCallback(async () => {
    try {
      if (fetchInfoOverride) {
        setLevelInfo((await fetchInfoOverride()).levelInfo);
      } else if (characterId) {
        const res = await fetch(`/api/character/${characterId}/cook-food`);
        const data = await res.json();
        if (res.ok) setLevelInfo(data.levelInfo);
      }
    } catch {
      /* barra fica oculta; o POST segue autoritativo no servidor */
    }
  }, [characterId, fetchInfoOverride]);

  // Reset SÓ na abertura (callbacks mudam de identidade a cada render do pai).
  useEffect(() => {
    if (!open) return;
    setRecipe(null);
    setResult(null);
    setError(null);
    setPhase('idle');
    setCraftQty(1);
    pickedFromLinkRef.current = false;
    fetchInfo();
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Insumos do inventário: nome → quantidade (a rota casa por nome dentro de CONSUMABLE).
  const inputCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      if (inv.item.type === 'CONSUMABLE') {
        map.set(inv.item.name, (map.get(inv.item.name) ?? 0) + inv.quantity);
      }
    }
    return map;
  }, [inventory]);
  const have = useCallback((name: string) => inputCounts.get(name) ?? 0, [inputCounts]);

  const unlocked = recipe ? level >= recipe.minLevel : true;

  const canCraftRecipe = useCallback(
    (r: CookingRecipe) => r.inputs.every((m) => have(m.name) >= m.quantity),
    [have],
  );

  const maxCraftable = useMemo(() => {
    if (!recipe) return 0;
    let n = Math.min(...recipe.inputs.map((m) => Math.floor(have(m.name) / m.quantity)));
    if (characterGold != null && recipe.goldCost > 0) {
      n = Math.min(n, Math.floor(characterGold / recipe.goldCost));
    }
    return Math.max(0, Math.min(99, n));
  }, [recipe, have, characterGold]);

  useEffect(() => {
    setCraftQty((q) => Math.min(Math.max(1, q), Math.max(1, maxCraftable)));
  }, [maxCraftable]);

  const loadRecipe = (r: CookingRecipe) => {
    setRecipe(r);
    setResult(null);
    setPhase('idle');
    setBookOpen(false);
  };

  // "🍳 Cozinhar" no card do insumo: assim que o inventário chegar, pré-seleciona
  // a receita que consome o insumo (preferindo uma craftável e desbloqueada).
  useEffect(() => {
    if (!open || pickedFromLinkRef.current || loadingInv || !initialInputName) return;
    const candidates = cookingRecipesUsingInput(initialInputName);
    if (candidates.length === 0) return;
    const best =
      candidates.find((r) => canCraftRecipe(r) && level >= r.minLevel) ?? candidates[0];
    loadRecipe(best);
    pickedFromLinkRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadingInv, initialInputName, canCraftRecipe, level]);

  const handleCook = async () => {
    if (!recipe || busy || !unlocked || maxCraftable < 1) return;
    const qty = Math.max(1, Math.min(99, craftQty));

    setBusy(true);
    setResult(null);
    setError(null);
    setChargeId((c) => c + 1);
    setPhase('charging');
    const minDelay = new Promise((resolve) => setTimeout(resolve, CHARGE_MS));

    try {
      let data: CookingCraftResult;
      if (attemptOverride) {
        data = await attemptOverride(recipe.id, qty);
      } else {
        const doCook = () =>
          fetch(`/api/character/${characterId}/cook-food`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipeId: recipe.id, quantity: qty }),
          });
        let res = await doCook();
        let json = await res.json().catch(() => ({}));

        // Sem GOLD na mão → recarga on-chain (compra de GOLD, nunca do item) e
        // refaz o cozimento. [[dolrath-onchain-gold-not-items]]
        if (!res.ok && isInsufficientGold(json.error)) {
          const needed = parseNeededGold(json.error);
          if (!needed || !(await confirmBuyGold(needed))) {
            setPhase('idle');
            setBusy(false);
            return;
          }
          const credited = await buyGoldOnChain({ characterId: characterId!, amountGold: needed });
          if (!credited) {
            setPhase('idle');
            setBusy(false);
            return;
          }
          onChanged?.();
          res = await doCook();
          json = await res.json().catch(() => ({}));
        }

        if (!res.ok) {
          await minDelay;
          setError(json.error || 'Erro ao cozinhar');
          setPhase('idle');
          setBusy(false);
          return;
        }
        data = json;
      }

      await minDelay;
      setResult(data);
      setPhase('done');
      if (data.levelInfo) setLevelInfo(data.levelInfo);
      fetchInventory();
      onChanged?.();
    } catch {
      setError('Erro inesperado ao cozinhar');
      setPhase('idle');
    }
    setBusy(false);
  };

  // Culinária não falha: o veredito, quando existe, é sempre sucesso.
  const verdict = phase === 'done' && result ? ('success' as const) : null;

  const output = recipe ? getCookingOutput(recipe) : null;
  const outputDescription = output?.description ?? null;
  // O que o prato faz ao COMER: buff por tempo real ou restauração fora de combate.
  const buffSpec = output ? parseFoodBuffSpec(output.stats) : null;
  const effectLabel = buffSpec
    ? `🍽 Ao comer: ${foodBuffSpecLabel(buffSpec)}`
    : output && Number((output.stats as any)?.healAmount) > 0
      ? `🍽 Ao comer: restaura ${Number((output.stats as any).healAmount)} HP fora de combate`
      : null;
  const centerUi = recipe ? RARITY_UI[recipe.rarity] : null;

  const matXs = recipe ? (MAT_XS[recipe.inputs.length] ?? MAT_XS[4]) : [];

  const groups = useMemo(
    () => cookingRecipesByGroup().filter((g) => g.recipes.length > 0),
    [],
  );

  return (
    <>
      <BdoDialogShell open={open} onClose={onClose} icon="🍳" title="Culinária">
        {/* Nível da profissão (conta inteira, como Forja/Alquimia/Processamento) */}
        <div className="border-b border-black/60 bg-[#19191c] px-5 py-3">
          {levelInfo ? (
            <ProfessionBar label="Culinária" emoji="🍳" info={levelInfo} />
          ) : (
            <div className="text-xs text-[#8a8a90]">Acendendo o fogão…</div>
          )}
        </div>

        {!recipe ? (
          /* Sem receita: convite ao livro */
          <div className="px-6 py-10 text-center text-sm text-[#b8b8be]">
            <div className="mb-2 text-3xl">🍳</div>
            Escolha no livro o prato que deseja cozinhar.
            <div className="mt-4">
              <BevelButton onClick={() => setBookOpen(true)}>📖 Livro de Receitas</BevelButton>
            </div>
          </div>
        ) : (
          <>
            {/* ✦ Circuito da cozinha: insumos em arco → cometas → prato no losango */}
            <div className="relative px-5 pb-1 pt-4">
              <div
                className="pointer-events-none absolute left-1/2 top-16 h-36 w-36 -translate-x-1/2"
                style={{ background: 'radial-gradient(circle, rgba(201,162,95,0.14) 0%, transparent 65%)' }}
              />
              <div className="relative mx-auto" style={{ width: BOX_W, height: BOX_H }}>
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={BOX_W}
                  height={BOX_H}
                  viewBox={`0 0 ${BOX_W} ${BOX_H}`}
                >
                  {recipe.inputs.map((m, i) => (
                    <line
                      key={m.name}
                      x1={matXs[i]}
                      y1={MAT_Y - MAT_SIZE / 2}
                      x2={CENTER.x}
                      y2={CENTER.y}
                      stroke="rgba(201,162,95,0.5)"
                      strokeWidth={1}
                    />
                  ))}
                </svg>

                {/* Nós em losango no meio das linhas */}
                {recipe.inputs.map((m, i) => (
                  <span
                    key={`node-${m.name}`}
                    className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border bg-[#1e1e21]"
                    style={{
                      left: (matXs[i] + CENTER.x) / 2,
                      top: (MAT_Y - MAT_SIZE / 2 + CENTER.y) / 2,
                      borderColor: GOLD,
                    }}
                  />
                ))}

                {/* 💫 Cometas dos insumos ao prato */}
                {phase === 'charging' &&
                  recipe.inputs.map((m, i) => (
                    <motion.span
                      key={`comet-${chargeId}-${m.name}`}
                      initial={{ left: matXs[i], top: MAT_Y - MAT_SIZE / 2, opacity: 0 }}
                      animate={{
                        left: [matXs[i], CENTER.x],
                        top: [MAT_Y - MAT_SIZE / 2, CENTER.y],
                        opacity: [0, 1, 0.9],
                      }}
                      transition={{
                        delay: 0.15 + i * 0.15,
                        duration: (CHARGE_MS - 600) / 1000,
                        ease: 'easeIn',
                      }}
                      className="absolute z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        background: GOLD_BRIGHT,
                        boxShadow: '0 0 10px 4px rgba(231,198,130,0.85), 0 0 22px 8px rgba(201,162,95,0.35)',
                      }}
                    />
                  ))}

                {/* Sem falha / gating no canto (cozinhar é conversão garantida) */}
                <div className="absolute left-0 top-1" style={{ width: 92 }}>
                  {!unlocked ? (
                    <div className="text-center">
                      <div className="text-lg font-black text-red-400">🔒</div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-red-400">
                        Culin. nv {recipe.minLevel}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <span className="text-lg font-bold text-emerald-300">✓</span>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[#77777d]">sem falha</div>
                    </div>
                  )}
                </div>

                {/* ◆ O prato sendo cozinhado */}
                <div
                  className="absolute"
                  style={{ left: CENTER.x - CENTER_SLOT / 2, top: CENTER.y - CENTER_SLOT / 2 }}
                >
                  <DiamondSlot
                    size={CENTER_SLOT}
                    active
                    verdict={verdict}
                    verdictKey={chargeId}
                    glowColor={centerUi?.glow}
                    title={recipe.outputName}
                    plate={
                      phase === 'done' && result && result.succeeded > 1 ? `×${result.succeeded}` : null
                    }
                  >
                    {phase === 'charging' ? (
                      <span className="animate-ping text-2xl text-white/40">✦</span>
                    ) : (
                      <span
                        className="block h-[64%] w-[64%] overflow-hidden"
                        style={{
                          opacity: phase === 'done' ? 1 : 0.5,
                          filter: phase === 'done' ? undefined : 'grayscale(0.8) brightness(0.8)',
                          transition: 'filter 1s ease, opacity 1s ease',
                        }}
                      >
                        <ItemThumb
                          name={recipe.outputName}
                          emoji={cookingItemEmoji(recipe.outputName)}
                          className="text-3xl"
                        />
                      </span>
                    )}
                  </DiamondSlot>
                </div>

                {/* Molduras de insumo */}
                {recipe.inputs.map((m, i) => {
                  const enough = have(m.name) >= m.quantity * craftQty;
                  return (
                    <div
                      key={m.name}
                      className="absolute flex flex-col items-center gap-1"
                      style={{ left: matXs[i] - MAT_SIZE / 2, top: MAT_Y - MAT_SIZE / 2, width: MAT_SIZE }}
                    >
                      <div
                        className={`relative rounded-[3px] border p-px shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] ${
                          enough
                            ? 'border-[#8a6d3b] bg-gradient-to-b from-[#26262a] to-[#101013]'
                            : 'border-[#5a2e2e] bg-gradient-to-b from-[#241a1a] to-[#100c0c]'
                        }`}
                        style={{ width: MAT_SIZE, height: MAT_SIZE }}
                      >
                        <span className={`block h-full w-full overflow-hidden rounded-[2px] ${enough ? '' : 'opacity-40 grayscale'}`}>
                          <ItemThumb name={m.name} emoji={cookingItemEmoji(m.name)} className="text-xl" />
                        </span>
                        <span
                          className={`absolute -bottom-1.5 -right-1.5 rounded-[2px] border border-black/80 px-1 text-[10px] font-bold ${
                            enough ? 'bg-[#101012] text-[#e7c682]' : 'bg-[#1c0f0f] text-red-400'
                          }`}
                        >
                          {have(m.name)}/{m.quantity * craftQty}
                        </span>
                        {phase === 'charging' && (
                          <motion.div
                            animate={{ opacity: [0.15, 0.75, 0.15] }}
                            transition={{ duration: 0.75, repeat: Infinity }}
                            className="pointer-events-none absolute -inset-2 z-10"
                            style={{
                              background: 'radial-gradient(circle, rgba(231,198,130,0.5) 0%, transparent 70%)',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Nome + custo */}
            <div className="px-5 pb-2 text-center">
              <div className={`text-[15px] font-semibold leading-tight ${centerUi?.text ?? 'text-white'}`}>
                {recipe.outputName}
              </div>
              <p className="mt-0.5 text-sm">
                <span style={{ color: GOLD }}>taxa {recipe.goldCost} 🪙</span>
                <span className="text-[#77777d]"> · +{recipe.xp} XP</span>
                {maxCraftable > 1 && <span className="text-[#77777d]"> · até {maxCraftable}×</span>}
              </p>
            </div>

            {/* Descrição do prato + o que ele faz ao comer (buff por tempo real) */}
            {(outputDescription || effectLabel) && (
              <div className="border-y border-black/60 bg-[#19191c] px-5 py-2.5 text-center text-[12.5px] leading-snug text-[#c9c9ce]">
                {outputDescription}
                {effectLabel && (
                  <div className="mt-1 font-semibold text-emerald-300">{effectLabel}</div>
                )}
              </div>
            )}

            {!unlocked && (
              <div className="px-5 pb-1 pt-3 text-center text-[12.5px] font-semibold text-red-400">
                Requer Culinária nível {recipe.minLevel} para esta receita.
              </div>
            )}

            {/* Veredito em texto */}
            {phase !== 'idle' && (
              <div className="px-5 pb-1 pt-2">
                <div className="text-center text-sm font-semibold">
                  {phase === 'charging' && (
                    <motion.span
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 0.7 }}
                      style={{ color: GOLD_BRIGHT }}
                    >
                      🍳 Cozinhando...
                    </motion.span>
                  )}
                  {phase === 'done' && result && (
                    <span style={{ color: GOLD_BRIGHT }}>✨ PRONTO!</span>
                  )}
                </div>
                {phase === 'done' && result && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1 text-center text-sm font-bold text-emerald-300"
                  >
                    {result.message}
                    <div className="mt-0.5 text-xs font-normal" style={{ color: GOLD }}>
                      +{result.xpGained} XP de Culinária
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {error && (
              <div className="mx-4 mb-3 rounded-[3px] border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Quantidade + ação */}
            <div className="px-4 pb-4 pt-2">
              {unlocked && maxCraftable > 1 && (
                <div className="mb-2 flex items-center justify-center gap-2">
                  <span className="text-xs text-[#8a8a90]">Quantidade:</span>
                  <button
                    type="button"
                    onClick={() => setCraftQty((q) => Math.max(1, q - 1))}
                    disabled={busy || craftQty <= 1}
                    className="grid h-7 w-7 place-items-center rounded-[3px] border border-[#46464c] bg-[#232327] text-sm font-bold text-white transition-colors hover:border-[#8a6d3b] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxCraftable}
                    value={craftQty}
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value));
                      setCraftQty(Number.isFinite(v) ? Math.min(maxCraftable, Math.max(1, v)) : 1);
                    }}
                    disabled={busy}
                    className="w-14 rounded-[3px] border border-[#46464c] bg-[#101013] py-1 text-center text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setCraftQty((q) => Math.min(maxCraftable, q + 1))}
                    disabled={busy || craftQty >= maxCraftable}
                    className="grid h-7 w-7 place-items-center rounded-[3px] border border-[#46464c] bg-[#232327] text-sm font-bold text-white transition-colors hover:border-[#8a6d3b] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setCraftQty(maxCraftable)}
                    disabled={busy || craftQty === maxCraftable}
                    className="text-xs font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: GOLD_BRIGHT }}
                  >
                    máx {maxCraftable}
                  </button>
                </div>
              )}
              <BevelButton
                onClick={handleCook}
                disabled={!unlocked || maxCraftable < 1 || (!characterId && !attemptOverride)}
                busy={busy}
                busyLabel="🍳 Cozinhando..."
              >
                {craftQty > 1 ? `🍳 Cozinhar ×${craftQty}` : '🍳 Cozinhar'}
              </BevelButton>
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => setBookOpen(true)}
                  className="text-xs font-semibold text-[#9a9aa0] transition-colors hover:text-white"
                >
                  📖 Livro de Receitas — trocar prato
                </button>
              </div>
            </div>
          </>
        )}
      </BdoDialogShell>

      {/* ===== 📖 LIVRO DE RECEITAS (portal próprio, acima da dialog) ===== */}
      {bookOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setBookOpen(false)}
          >
            <div
              className="relative max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-[4px] border border-[#46464c] bg-[#1e1e21] shadow-2xl shadow-black/80 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d] px-4 py-2.5">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-wide text-[#dcdce0]">
                  <span style={{ color: GOLD }}>📖</span> Livro de Receitas
                </h3>
                <button
                  onClick={() => setBookOpen(false)}
                  className="px-2 py-0.5 text-[#8a8a90] transition-colors hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-4">
                <p className="mb-4 text-xs text-[#8a8a90]">
                  Clique num prato para levá-lo ao fogão. Receitas com insumos completos ficam
                  acesas. 🔒 = requer nível de Culinária. Cozinhar nunca falha; o buff do prato
                  vale por tempo REAL ao comer.
                </p>
                <div className="space-y-4">
                  {groups.map(({ group, recipes }) => (
                    <div key={group}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a9aa0]">
                        {GROUP_EMOJI[group]} {COOKING_GROUP_LABEL[group]}
                      </label>
                      <div
                        className="grid"
                        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}
                      >
                        {recipes.map((r) => {
                          const ui = RARITY_UI[r.rarity];
                          const rUnlocked = level >= r.minLevel;
                          const ok = rUnlocked && canCraftRecipe(r);
                          const food = getCookingOutput(r);
                          const spec = food ? parseFoodBuffSpec(food.stats) : null;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => loadRecipe(r)}
                              className={`flex items-center gap-2 rounded-[3px] border p-2 text-left transition-all hover:border-[#c9a25f] ${
                                ok ? 'cursor-pointer' : 'opacity-50'
                              }`}
                              style={{
                                borderColor: ok ? BORDER_GOLD : '#3c3c41',
                                background: 'linear-gradient(160deg, #232327, #101013)',
                                boxShadow: ok ? `0 0 10px ${ui.glow.replace('0.6', '0.25')}` : undefined,
                              }}
                            >
                              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[3px]">
                                <ItemThumb
                                  name={r.outputName}
                                  emoji={cookingItemEmoji(r.outputName)}
                                  className="text-2xl"
                                />
                              </span>
                              <span className="min-w-0">
                                <span className={`block truncate text-[11px] font-bold leading-tight ${ui.text}`}>
                                  {r.outputName}
                                </span>
                                <span
                                  className={`block text-[10px] leading-tight ${
                                    !rUnlocked ? 'text-red-400' : ok ? 'text-emerald-300' : 'text-[#77777d]'
                                  }`}
                                >
                                  {!rUnlocked
                                    ? `🔒 Culin. nv ${r.minLevel}`
                                    : ok
                                      ? '✓ insumos completos'
                                      : 'faltam insumos'}
                                </span>
                                <span className="block truncate text-[10px] leading-tight text-[#77777d]">
                                  {spec ? foodBuffSpecLabel(spec) : `sem falha · +${r.xp} XP`}
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
          </div>,
          document.body,
        )}
    </>
  );
}
