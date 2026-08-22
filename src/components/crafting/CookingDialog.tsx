'use client';

// 🍲 Dialog de CULINÁRIA — o Fogão.
//
// Casca chumbo+ouro de bdoTheme.tsx + aparelho próprio da profissão
// (StoveRig de professionFx.tsx): o prato cozinha numa panela de cobre vista
// de cima, sobre a trempe com anel de chama (gás baixo em idle, fogo alto ao
// cozinhar); os ingredientes esperam em tigelinhas na tábua de corte e PULAM
// para a panela, que solta vapor. Regra do processamento: conversão SEM falha
// (chance 1), XP fixo da receita, gating por minLevel próprio. A saída é
// COMIDA (FOOD_CATALOG) e o card mostra o BUFF por tempo real do prato
// (lib/foodBuff.ts) — o efeito acontece ao COMER, não ao cozinhar.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useBatchReveal } from '@/hooks/useBatchReveal';
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
import { useT, useI18n } from '@/lib/i18n/I18nProvider';
import { localizeItemName, localizeItemDesc } from '@/lib/i18n/catalog';
import { type Rarity } from '@/lib/itemCatalog';
import type { ProfessionLevelInfo } from '@/lib/professionSystem';
import { ProfessionBar } from '@/components/gathering/GatheringPanel';
import { CraftItemThumb as ItemThumb } from '@/components/store/CraftItemThumb';
import {
  BdoDialogShell,
  BevelButton,
  RARITY_UI,
  GOLD,
  GOLD_BRIGHT,
  CHARGE_MS,
  BORDER_GOLD,
} from './bdoTheme';
import { StoveRig, COOK_ACCENT, COOK_ACCENT_BRIGHT } from './professionFx';

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
  /**
   * Sequência por unidade, na ordem em que o servidor rolou. É o que o fogão
   * encena um por vez. Ausente = contrato antigo (um bloco só).
   */
  units?: { ok: boolean }[];
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
  const t = useT();
  const { locale } = useI18n();
  const [inventory, setInventory] = useState<CookingInventoryItem[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [levelInfo, setLevelInfo] = useState<ProfessionLevelInfo | null>(null);
  const [recipe, setRecipe] = useState<CookingRecipe | null>(null);
  const [craftQty, setCraftQty] = useState(1);
  const [busy, setBusy] = useState(false);
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

  // Encenação do lote: o servidor devolve a sequência por unidade e o fogão
  // serve UM PRATO POR VEZ. O inventário/`onChanged` só recarregam no fim —
  // senão o insumo some da tela no meio da animação. [[useBatchReveal]]
  const reveal = useBatchReveal({
    maxTickMs: CHARGE_MS,
    onFinish: () => {
      fetchInventory();
      onChanged?.();
    },
  });
  const phase: 'idle' | 'charging' | 'done' =
    reveal.phase === 'idle' ? 'idle' : reveal.phase === 'working' ? 'charging' : 'done';

  // Reset SÓ na abertura (callbacks mudam de identidade a cada render do pai).
  useEffect(() => {
    if (!open) return;
    setRecipe(null);
    setResult(null);
    setError(null);
    reveal.reset();
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

  // Teto de INSUMO — o único que bloqueia o botão. O gold não entra: sem gold
  // o clique precisa chegar na rota p/ disparar a recarga on-chain.
  // [[dolrath-onchain-gold-not-items]]
  const maxCraftable = useMemo(() => {
    if (!recipe) return 0;
    const n = Math.min(...recipe.inputs.map((m) => Math.floor(have(m.name) / m.quantity)));
    return Math.max(0, Math.min(99, n));
  }, [recipe, have]);

  const totalGoldCost = recipe ? recipe.goldCost * craftQty : 0;
  const goldShort = characterGold != null && totalGoldCost > characterGold;

  useEffect(() => {
    setCraftQty((q) => Math.min(Math.max(1, q), Math.max(1, maxCraftable)));
  }, [maxCraftable]);

  const loadRecipe = (r: CookingRecipe) => {
    setRecipe(r);
    setResult(null);
    reveal.reset();
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
    reveal.begin();

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
            reveal.reset();
            setBusy(false);
            return;
          }
          const credited = await buyGoldOnChain({ characterId: characterId!, amountGold: needed });
          if (!credited) {
            reveal.reset();
            setBusy(false);
            return;
          }
          onChanged?.();
          res = await doCook();
          json = await res.json().catch(() => ({}));
        }

        if (!res.ok) {
          setError(json.error || t('Failed to cook'));
          reveal.reset();
          setBusy(false);
          return;
        }
        data = json;
      }

      setResult(data);
      if (data.levelInfo) setLevelInfo(data.levelInfo);
      // Uma unidade por vez: sem a sequência (contrato antigo) encena 1 bloco.
      reveal.start(data.units?.length ?? 1);
    } catch {
      setError(t('Unexpected error cooking'));
      reveal.reset();
    }
    setBusy(false);
  };

  // Encenação unidade a unidade: o que já foi REVELADO na tela. O agregado do
  // `result` continua sendo a verdade do que o banco creditou.
  const revealing = reveal.phase === 'revealing';
  const revealedUnits = result?.units ? result.units.slice(0, reveal.revealed) : [];
  const liveSucceeded = revealing ? revealedUnits.length : (result?.succeeded ?? 0);
  /** Últimos revelados, mais novo em cima (lote grande não vira lista infinita). */
  const revealTail = revealedUnits.slice(-6).reverse();

  const output = recipe ? getCookingOutput(recipe) : null;
  const outputDescription = output?.description ?? null;
  // O que o prato faz ao COMER: buff por tempo real ou restauração fora de combate.
  const buffSpec = output ? parseFoodBuffSpec(output.stats) : null;
  const effectLabel = buffSpec
    ? `${t('🍽 When eaten:')} ${foodBuffSpecLabel(buffSpec, t)}`
    : output && Number((output.stats as any)?.healAmount) > 0
      ? t('🍽 When eaten: restores {n} HP outside combat', {
          n: Number((output.stats as any).healAmount),
        })
      : null;
  const centerUi = recipe ? RARITY_UI[recipe.rarity] : null;

  const groups = useMemo(
    () => cookingRecipesByGroup().filter((g) => g.recipes.length > 0),
    [],
  );

  // ⚠️ Rodapé FIXO da casca: quantidade + ação. Fora da área rolável, senão em
  // tela baixa o botão cai abaixo da dobra (scrollbar escondida, sem pista).
  const footer = recipe ? (
    <div className="px-4 pb-4 pt-3">
      {unlocked && maxCraftable > 1 && (
        <div className="mb-2 flex items-center justify-center gap-2">
          <span className="text-xs text-[#8a8a90]">{t('Quantity:')}</span>
          <button
            type="button"
            onClick={() => setCraftQty((q) => Math.max(1, q - 1))}
            disabled={busy || revealing || craftQty <= 1}
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
            disabled={busy || revealing || craftQty >= maxCraftable}
            className="grid h-7 w-7 place-items-center rounded-[3px] border border-[#46464c] bg-[#232327] text-sm font-bold text-white transition-colors hover:border-[#8a6d3b] disabled:cursor-not-allowed disabled:opacity-30"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setCraftQty(maxCraftable)}
            disabled={busy || revealing || craftQty === maxCraftable}
            className="text-xs font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: GOLD_BRIGHT }}
          >
            {t('max {n}', { n: maxCraftable })}
          </button>
        </div>
      )}
      {!unlocked ? (
        <div className="mb-2 text-center text-xs font-semibold text-red-400">
          {t('🔒 Requires Cooking level {n}.', { n: recipe.minLevel })}
        </div>
      ) : maxCraftable < 1 ? (
        <div className="mb-2 text-center text-xs font-semibold text-red-400">
          {t('Missing inputs for one dish.')}
        </div>
      ) : goldShort ? (
        <div className="mb-2 text-center text-xs font-semibold" style={{ color: GOLD_BRIGHT }}>
          {t('Batch fee: {cost} 🪙 — no GOLD in the wallet, we will top it up.', { cost: totalGoldCost })}
        </div>
      ) : (
        <div className="mb-2 text-center text-xs text-[#8a8a90]">
          {t('Batch fee:')} <span style={{ color: GOLD }}>{totalGoldCost} 🪙</span>
        </div>
      )}
      {revealing ? (
        /* Encenação em curso: quem faz grind não pode ficar refém da animação. */
        <BevelButton onClick={reveal.skip}>
          {t('⏩ Skip ({revealed}/{total})', { revealed: reveal.revealed, total: reveal.total })}
        </BevelButton>
      ) : (
        <BevelButton
          onClick={handleCook}
          disabled={!unlocked || maxCraftable < 1 || (!characterId && !attemptOverride)}
          busy={busy}
          busyLabel={t('🍲 Cooking...')}
        >
          {craftQty > 1 ? t('🍳 Cook ×{n}', { n: craftQty }) : t('🍳 Cook')}
        </BevelButton>
      )}
      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={() => setBookOpen(true)}
          className="text-xs font-semibold text-[#9a9aa0] transition-colors hover:text-white"
        >
          {t('📖 Recipe Book — change dish')}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <BdoDialogShell open={open} onClose={onClose} icon="🍳" title={t('Cooking')} footer={footer}>
        {/* Nível da profissão (conta inteira, como Forja/Alquimia/Processamento) */}
        <div className="border-b border-black/60 bg-[#19191c] px-5 py-3">
          {levelInfo ? (
            <ProfessionBar label={t('Cooking')} emoji="🍳" info={levelInfo} />
          ) : (
            <div className="text-xs text-[#8a8a90]">{t('Lighting the stove…')}</div>
          )}
        </div>

        {!recipe ? (
          /* Sem receita: convite ao livro */
          <div className="px-6 py-10 text-center text-sm text-[#b8b8be]">
            <div className="mb-2 text-3xl" style={{ color: COOK_ACCENT }}>
              🍲
            </div>
            {t('Pick the dish you want to cook from the book.')}
            <div className="mt-4">
              <BevelButton onClick={() => setBookOpen(true)}>{t('📖 Recipe Book')}</BevelButton>
            </div>
          </div>
        ) : (
          <>
            {/* 🍲 O fogão: panela na trempe, chama, vapor e ingredientes pulando */}
            <div className="relative px-5 pb-1 pt-4">
              <StoveRig
                phase={phase}
                working={reveal.phase === 'working' || revealing}
                chargeId={chargeId * 1000 + reveal.tick}
                materials={recipe.inputs.map((m) => ({
                  name: localizeItemName(m.name, locale),
                  emoji: cookingItemEmoji(m.name),
                  have: have(m.name),
                  need: m.quantity * craftQty,
                }))}
                outputName={localizeItemName(recipe.outputName, locale)}
                outputEmoji={cookingItemEmoji(recipe.outputName)}
                glowColor={centerUi?.glow}
                plate={phase === 'done' && liveSucceeded > 1 ? `×${liveSucceeded}` : null}
                statusNode={
                  !unlocked ? (
                    <div className="text-center">
                      <div className="text-lg font-black text-red-400">🔒</div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-red-400">
                        {t('Cook. lv {n}', { n: recipe.minLevel })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <span className="text-lg font-bold" style={{ color: COOK_ACCENT_BRIGHT }}>
                        ✓
                      </span>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[#77777d]">{t('no fail')}</div>
                    </div>
                  )
                }
              />
            </div>

            {/* Nome + custo */}
            <div className="px-5 pb-2 text-center">
              <div className={`text-[15px] font-semibold leading-tight ${centerUi?.text ?? 'text-white'}`}>
                {localizeItemName(recipe.outputName, locale)}
              </div>
              <p className="mt-0.5 text-sm">
                <span style={{ color: GOLD }}>{t('fee {cost} 🪙', { cost: recipe.goldCost })}</span>
                <span className="text-[#77777d]"> · {t('+{n} XP', { n: recipe.xp })}</span>
                {maxCraftable > 1 && (
                  <span className="text-[#77777d]"> · {t('up to {n}×', { n: maxCraftable })}</span>
                )}
              </p>
            </div>

            {/* Descrição do prato + o que ele faz ao comer (buff por tempo real) */}
            {(outputDescription || effectLabel) && (
              <div className="border-y border-black/60 bg-[#19191c] px-5 py-2.5 text-center text-[12.5px] leading-snug text-[#c9c9ce]">
                {localizeItemDesc(recipe.outputName, outputDescription, locale)}
                {effectLabel && (
                  <div className="mt-1 font-semibold text-emerald-300">{effectLabel}</div>
                )}
              </div>
            )}

            {!unlocked && (
              <div className="px-5 pb-1 pt-3 text-center text-[12.5px] font-semibold text-red-400">
                {t('Requires Cooking level {n} for this recipe.', { n: recipe.minLevel })}
              </div>
            )}

            {/* Veredito em texto */}
            {phase !== 'idle' && (
              <div className="px-5 pb-1 pt-2">
                <div className="text-center text-sm font-semibold">
                  {(reveal.phase === 'working' || revealing) && (
                    <motion.span
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 0.7 }}
                      style={{ color: COOK_ACCENT_BRIGHT }}
                    >
                      {t('🍲 Cooking')}
                      {revealing && reveal.total > 1 ? ` ${reveal.revealed}/${reveal.total}` : '...'}
                    </motion.span>
                  )}
                  {reveal.phase === 'done' && result && (
                    <span style={{ color: GOLD_BRIGHT }}>{t('✨ READY!')}</span>
                  )}
                </div>

                {/* A fila saindo do fogão — uma linha por prato revelado */}
                {revealing && (
                  <div className="mx-auto mt-2 w-full max-w-[260px] space-y-1">
                    {revealTail.map((_, i) => (
                      <motion.div
                        key={`unit-${reveal.revealed - i}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between rounded-[3px] border border-black/50 bg-[#19191c] px-2 py-1 text-xs"
                      >
                        <span className="truncate text-[#c9c9ce]">{localizeItemName(recipe.outputName, locale)}</span>
                        <span className="font-bold text-emerald-300">✓</span>
                      </motion.div>
                    ))}
                  </div>
                )}

                {reveal.phase === 'done' && result && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-1 text-center text-sm font-bold text-emerald-300"
                  >
                    {result.message}
                    <div className="mt-0.5 text-xs font-normal" style={{ color: GOLD }}>
                      {t('+{n} Cooking XP', { n: result.xpGained })}
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

            {/* A ação vive no rodapé FIXO da casca (ver `footer`). */}
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
                  <span style={{ color: COOK_ACCENT }}>📖</span> {t('Recipe Book')}
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
                  {t(
                    "Click a dish to bring it to the stove. Recipes with full inputs light up. 🔒 = requires Cooking level. Cooking never fails; the dish's buff runs on REAL time when eaten.",
                  )}
                </p>
                <div className="space-y-4">
                  {groups.map(({ group, recipes }) => (
                    <div key={group}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a9aa0]">
                        {GROUP_EMOJI[group]} {t(COOKING_GROUP_LABEL[group])}
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
                                  {localizeItemName(r.outputName, locale)}
                                </span>
                                <span
                                  className={`block text-[10px] leading-tight ${
                                    !rUnlocked ? 'text-red-400' : ok ? 'text-emerald-300' : 'text-[#77777d]'
                                  }`}
                                >
                                  {!rUnlocked
                                    ? t('🔒 Cook. lv {n}', { n: r.minLevel })
                                    : ok
                                      ? t('✓ inputs complete')
                                      : t('missing inputs')}
                                </span>
                                <span className="block truncate text-[10px] leading-tight text-[#77777d]">
                                  {spec ? foodBuffSpecLabel(spec, t) : t('no fail · +{n} XP', { n: r.xp })}
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
