'use client';

// ⚗️ Dialog de ALQUIMIA — Triângulo de Transmutação no estilo BDO.
//
// Redesenho da antiga AlchemyBench como dialog (mesma linguagem visual da
// EnhancementDialog, via primitivos de bdoTheme.tsx): 3 slots em losango nos
// vértices do triângulo + slot maior no centro. Ao transmutar, a luz percorre
// as arestas do triângulo, converge dos vértices ao centro e o VEREDITO
// acontece no slot central — explosão dourada (sucesso), vermelho + shake
// (falha), dourado com placar no lote misto. A chance de sucesso vem do nível
// de Alquimia da CONTA (craftingProfession.ts; o servidor recalcula tudo).

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useBatchReveal } from '@/hooks/useBatchReveal';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { buyGoldOnChain, parseNeededGold, isInsufficientGold } from '@/lib/buyGold';
import { confirmBuyGold } from '@/lib/buyGoldPrompt';
import {
  findRecipeByIngredients,
  recipesByRarity,
  expandRecipe,
  type PotionRecipe,
} from '@/lib/alchemy';
import {
  getIngredientByName,
  getForgeMaterialByName,
  getProcessedByName,
  isIngredientItem,
  isMaterialItem,
  isProcessedItem,
  type Rarity,
} from '@/lib/itemCatalog';
import { recipesUsingIngredient } from '@/lib/alchemy';
import { getCraftChance, getCraftMinLevel } from '@/lib/craftingProfession';
import type { ProfessionLevelInfo } from '@/lib/professionSystem';
import { ProfessionBar } from '@/components/gathering/GatheringPanel';
import { CraftItemThumb as ItemThumb } from '@/components/store/CraftItemThumb';
import { useT, useI18n } from '@/lib/i18n/I18nProvider';
import { localizeItemName, localizeRarityLabel } from '@/lib/i18n/catalog';
import {
  BdoDialogShell,
  DiamondSlot,
  BevelButton,
  RARITY_UI,
  GOLD,
  GOLD_BRIGHT,
  WARN,
  BORDER_GOLD,
  CHARGE_MS,
  chanceColorClass,
  type CraftPhase,
} from './bdoTheme';

export interface AlchemyInventoryItem {
  id: string;
  quantity: number;
  item: { name: string; type: string; stats?: Record<string, any> | null };
}

/** Payload do GET /craft-potion (nível da conta). */
export interface AlchemyProfessionInfo {
  xp: number;
  levelInfo: ProfessionLevelInfo;
}

/** Payload do POST /craft-potion (uma tentativa/lote). */
export interface AlchemyCraftResult {
  attempted: number;
  succeeded: number;
  failed: number;
  chance: number;
  /**
   * Sequência por unidade, na ordem em que o servidor rolou. É o que o
   * caldeirão encena um por vez. Ausente = contrato antigo (um bloco só).
   */
  units?: { ok: boolean }[];
  xpGained: number;
  levelInfo: ProfessionLevelInfo;
  characterGold: number | null;
  outputName: string;
  rarity: Rarity;
  message: string;
}

interface AlchemyDialogProps {
  open: boolean;
  onClose: () => void;
  characterId?: string;
  characterGold?: number | null;
  /** Deep-link "⚗️ Usar na Alquimia" (/alchemist?place=<nome>): pré-coloca o ingrediente. */
  initialPlaceName?: string;
  // Overrides para páginas de mock/teste (sem DB)
  fetchInfoOverride?: () => Promise<AlchemyProfessionInfo>;
  fetchInventoryOverride?: () => Promise<AlchemyInventoryItem[]>;
  attemptOverride?: (recipeId: string, quantity: number) => Promise<AlchemyCraftResult>;
  onChanged?: () => void;
}

// Geometria do triângulo dentro da caixa 320×290 (px).
const BOX_W = 320;
const BOX_H = 290;
const SLOT = 72;
const CENTER_SLOT = 104;
const POS = {
  top: { x: 160, y: 54 },
  left: { x: 58, y: 232 },
  right: { x: 262, y: 232 },
  center: { x: 160, y: 168 },
};
const SLOT_KEYS = ['top', 'left', 'right'] as const;

// Timeline da canalização: a luz percorre as ARESTAS (trace) e então três
// cometas convergem dos vértices ao CENTRO. CHARGE_MS cobre as duas etapas.
const TRACE_MS = 800;
const CONVERGE_MS = CHARGE_MS - TRACE_MS;

export default function AlchemyDialog({
  open,
  onClose,
  characterId,
  characterGold,
  initialPlaceName,
  fetchInfoOverride,
  fetchInventoryOverride,
  attemptOverride,
  onChanged,
}: AlchemyDialogProps) {
  const t = useT();
  const { locale } = useI18n();
  const [inventory, setInventory] = useState<AlchemyInventoryItem[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [levelInfo, setLevelInfo] = useState<ProfessionLevelInfo | null>(null);
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);
  const [craftQty, setCraftQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [chargeId, setChargeId] = useState(0);
  const [result, setResult] = useState<AlchemyCraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [hover, setHover] = useState<{ id: string; top: number; left: number } | null>(null);
  const placedFromLinkRef = useRef(false);

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
        const res = await fetch(`/api/character/${characterId}/craft-potion`);
        const data = await res.json();
        if (res.ok) setLevelInfo(data.levelInfo);
      }
    } catch {
      /* barra fica oculta; o POST segue autoritativo no servidor */
    }
  }, [characterId, fetchInfoOverride]);

  // Encenação do lote: o servidor devolve a sequência por unidade e o
  // triângulo transmuta UMA POR VEZ. Os ingredientes só saem do triângulo (e o
  // inventário só recarrega) no FIM — senão o círculo esvazia no meio da
  // animação. [[useBatchReveal]]
  // O triângulo só se esvazia quando o servidor REALMENTE consumiu o lote —
  // um erro (gold recusado, 400) tem de devolver os ingredientes no lugar.
  const committedRef = useRef(false);
  const reveal = useBatchReveal({
    maxTickMs: CHARGE_MS,
    onFinish: () => {
      if (committedRef.current) setSlots([null, null, null]);
      fetchInventory();
      onChanged?.();
    },
  });
  const phase: CraftPhase =
    reveal.phase === 'idle' ? 'idle' : reveal.phase === 'working' ? 'charging' : 'done';

  // (Re)abrir: estado limpo + dados frescos. Reset SÓ na abertura — os
  // callbacks mudam de identidade quando o pai re-renderiza (ex.: overrides
  // inline) e não podem reiniciar a dialog no meio do uso.
  useEffect(() => {
    if (!open) return;
    setSlots([null, null, null]);
    setResult(null);
    setError(null);
    reveal.reset();
    setCraftQty(1);
    placedFromLinkRef.current = false;
    fetchInfo();
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Ingredientes do inventário: nome → quantidade total (insumos das bancadas;
  // materiais de forja e PROCESSADOS — extratos da destilaria — valem quando
  // alguma receita de poção os usa).
  const ingredientCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      const usable =
        isIngredientItem(inv.item) ||
        ((isMaterialItem(inv.item) || isProcessedItem(inv.item)) &&
          recipesUsingIngredient(inv.item.name).length > 0);
      if (usable) map.set(inv.item.name, (map.get(inv.item.name) ?? 0) + inv.quantity);
    }
    return map;
  }, [inventory]);

  const placedCount = (name: string) => slots.filter((s) => s === name).length;
  const available = (name: string) => (ingredientCounts.get(name) ??  0) - placedCount(name);
  const have = useCallback((name: string) => ingredientCounts.get(name) ?? 0, [ingredientCounts]);

  const palette = useMemo(() => {
    const order: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    return Array.from(ingredientCounts.keys())
      .map((name) => ({
        name,
        info: getIngredientByName(name) ?? getForgeMaterialByName(name) ?? getProcessedByName(name),
        total: ingredientCounts.get(name) ?? 0,
      }))
      .filter((p) => p.info)
      .sort((a, b) => {
        const ra = order.indexOf(a.info!.rarity);
        const rb = order.indexOf(b.info!.rarity);
        return ra - rb || a.name.localeCompare(b.name);
      });
  }, [ingredientCounts]);

  const filled = slots.filter((s): s is string => s != null);
  const matchedRecipe = filled.length === 3 ? findRecipeByIngredients(filled) : undefined;

  const minLevel = matchedRecipe ? getCraftMinLevel(matchedRecipe.rarity) : null;
  const unlocked = matchedRecipe ? level >= (minLevel ?? 1) : true;
  const chance = matchedRecipe && unlocked ? getCraftChance(matchedRecipe.rarity, level) : null;

  const canCraftRecipe = useCallback(
    (r: PotionRecipe) => r.ingredients.every((i) => have(i.name) >= i.quantity),
    [have],
  );

  // Teto de INGREDIENTE — o único que bloqueia o botão. O gold não entra: sem
  // gold o clique precisa chegar na rota p/ disparar a recarga on-chain.
  // [[dolrath-onchain-gold-not-items]]
  const maxCraftable = useMemo(() => {
    if (!matchedRecipe) return 0;
    const n = Math.min(...matchedRecipe.ingredients.map((i) => Math.floor(have(i.name) / i.quantity)));
    return Math.max(0, Math.min(99, n));
  }, [matchedRecipe, have]);

  const totalGoldCost = matchedRecipe ? matchedRecipe.goldCost * craftQty : 0;
  const goldShort = characterGold != null && totalGoldCost > characterGold;

  useEffect(() => {
    setCraftQty((q) => Math.min(Math.max(1, q), Math.max(1, maxCraftable)));
  }, [maxCraftable]);

  // Mexer no triângulo descarta o veredito anterior. Devolve `false` quando a
  // interação está BLOQUEADA — durante a canalização/encenação o triângulo é
  // do lote em curso, não do próximo.
  const revealBusyRef = useRef(false);
  revealBusyRef.current = reveal.phase === 'working' || reveal.phase === 'revealing';
  const clearVerdict = (): boolean => {
    if (revealBusyRef.current) return false;
    setResult((prev) => (prev ? null : prev));
    if (reveal.phase !== 'idle') reveal.reset();
    return true;
  };

  const placeIngredient = useCallback(
    (name: string) => {
      if (available(name) <= 0) return;
      const idx = slots.findIndex((s) => s == null);
      if (idx === -1) return;
      if (!clearVerdict()) return;
      setSlots((prev) => prev.map((s, i) => (i === idx ? name : s)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, ingredientCounts],
  );

  const removeSlot = (idx: number) => {
    if (busy) return;
    if (!clearVerdict()) return;
    setSlots((prev) => prev.map((s, i) => (i === idx ? null : s)));
  };

  const loadRecipe = (r: PotionRecipe) => {
    if (!canCraftRecipe(r) || level < getCraftMinLevel(r.rarity)) return;
    if (!clearVerdict()) return;
    setSlots(expandRecipe(r));
    setRecipesOpen(false);
    setHover(null);
  };

  // Deep-link: coloca o insumo vindo do inventário assim que ele aparecer
  // (ingrediente cru OU extrato processado que entra em alguma poção).
  useEffect(() => {
    if (!open || placedFromLinkRef.current || loadingInv || !initialPlaceName) return;
    const known =
      getIngredientByName(initialPlaceName) ||
      (getProcessedByName(initialPlaceName) && recipesUsingIngredient(initialPlaceName).length > 0);
    if (known && (ingredientCounts.get(initialPlaceName) ?? 0) > 0) {
      placeIngredient(initialPlaceName);
      placedFromLinkRef.current = true;
    }
  }, [open, loadingInv, initialPlaceName, ingredientCounts, placeIngredient]);

  const handleTransmute = async () => {
    if (!matchedRecipe || busy || !unlocked || maxCraftable < 1) return;
    const recipe = matchedRecipe;
    const qty = Math.max(1, Math.min(99, craftQty));

    setBusy(true);
    setResult(null);
    setError(null);
    setChargeId((c) => c + 1);
    // A canalização esconde a latência do servidor; depois dela o lote é
    // revelado UMA POÇÃO POR VEZ.
    committedRef.current = false;
    reveal.begin();

    try {
      let data: AlchemyCraftResult;
      if (attemptOverride) {
        data = await attemptOverride(recipe.id, qty);
      } else {
        const doCraft = () =>
          fetch(`/api/character/${characterId}/craft-potion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipeId: recipe.id, quantity: qty }),
          });
        let res = await doCraft();
        let json = await res.json().catch(() => ({}));

        // Sem GOLD na mão → oferece recarga on-chain (compra de GOLD, nunca da
        // poção) e refaz a transmutação. [[dolrath-onchain-gold-not-items]]
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
          res = await doCraft();
          json = await res.json().catch(() => ({}));
        }

        if (!res.ok) {
          setError(json.error || t('Failed to transmute'));
          reveal.reset();
          setBusy(false);
          return;
        }
        data = json;
      }

      committedRef.current = true;
      setResult(data);
      if (data.levelInfo) setLevelInfo(data.levelInfo);
      // Uma unidade por vez: sem a sequência (contrato antigo) encena 1 bloco.
      reveal.start(data.units?.length ?? 1);
    } catch {
      setError(t('Unexpected error while transmuting'));
      reveal.reset();
    }
    setBusy(false);
  };

  // Encenação unidade a unidade: o que já foi REVELADO na tela. O agregado do
  // `result` continua sendo a verdade do que o banco creditou.
  const revealing = reveal.phase === 'revealing';
  const revealedUnits = result?.units ? result.units.slice(0, reveal.revealed) : [];
  const liveSucceeded = revealing
    ? revealedUnits.filter((u) => u.ok).length
    : (result?.succeeded ?? 0);
  /** Últimas reveladas, mais nova em cima (lote grande não vira lista infinita). */
  const revealTail = revealedUnits.slice(-6).reverse();

  const aggregateVerdict =
    result && result.failed === 0
      ? ('success' as const)
      : result && result.succeeded === 0
        ? ('fail' as const)
        : ('mixed' as const);

  // O que o slot central mostra e com que veredito. Durante a encenação o
  // centro mostra o veredito DA POÇÃO que acabou de sair.
  const verdict =
    revealing && revealedUnits.length > 0
      ? revealedUnits[revealedUnits.length - 1].ok
        ? ('success' as const)
        : ('fail' as const)
      : reveal.phase === 'done' && result
        ? aggregateVerdict
        : null;
  const centerName = result?.outputName ?? matchedRecipe?.outputName ?? null;
  const centerRarity: Rarity = result?.rarity ?? matchedRecipe?.rarity ?? 'COMMON';
  const centerUi = RARITY_UI[centerRarity];
  const centerActive = !!centerName;

  const recipeGroups = useMemo(() => recipesByRarity(), []);
  const allRecipes = useMemo(() => recipeGroups.flatMap((g) => g.recipes), [recipeGroups]);
  const hoverRecipe = hover ? (allRecipes.find((r) => r.id === hover.id) ?? null) : null;

  const chancePct = chance != null ? Math.round(chance * 100) : null;

  const edgePoints = `${POS.top.x},${POS.top.y} ${POS.left.x},${POS.left.y} ${POS.right.x},${POS.right.y}`;

  // ⚠️ Rodapé FIXO da casca: quantidade + ação. Fora da área rolável, senão em
  // tela baixa o botão cai abaixo da dobra (scrollbar escondida, sem pista).
  const footer = (
    <div className="px-4 pb-4 pt-3">
      {matchedRecipe && unlocked && maxCraftable > 1 && (
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
      {matchedRecipe && (
        unlocked && maxCraftable >= 1 && goldShort ? (
          <div className="mb-2 text-center text-xs font-semibold" style={{ color: GOLD_BRIGHT }}>
            {t('Batch fee: {cost} 🪙 — no GOLD in the wallet, we will top it up.', { cost: totalGoldCost })}
          </div>
        ) : unlocked && maxCraftable >= 1 ? (
          <div className="mb-2 text-center text-xs text-[#8a8a90]">
            {t('Batch fee:')} <span style={{ color: GOLD }}>{totalGoldCost} 🪙</span>
          </div>
        ) : null
      )}
      {revealing ? (
        /* Encenação em curso: quem faz grind não pode ficar refém da animação. */
        <BevelButton onClick={reveal.skip}>
          {t('⏩ Skip ({revealed}/{total})', { revealed: reveal.revealed, total: reveal.total })}
        </BevelButton>
      ) : (
        <BevelButton
          onClick={handleTransmute}
          disabled={!matchedRecipe || !unlocked || maxCraftable < 1 || (!characterId && !attemptOverride)}
          busy={busy}
          busyLabel={t('⚗ Transmuting...')}
        >
          {craftQty > 1 ? t('⚗ Transmute ×{n}', { n: craftQty }) : t('⚗ Transmute')}
        </BevelButton>
      )}
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRecipesOpen(true)}
          className="text-xs font-semibold text-[#9a9aa0] transition-colors hover:text-white"
        >
          {t('📖 Recipe Book')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!clearVerdict()) return;
            setSlots([null, null, null]);
          }}
          disabled={busy || revealing || (filled.length === 0 && !result)}
          className="text-xs font-semibold text-[#9a9aa0] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t('Clear')}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <BdoDialogShell open={open} onClose={onClose} icon="⚗" title={t('Alchemy')} footer={footer}>
        {/* Nível da profissão (conta inteira, como a Fazenda) */}
        <div className="border-b border-black/60 bg-[#19191c] px-5 py-3">
          {levelInfo ? (
            <ProfessionBar label={t('Alchemy')} emoji="⚗️" info={levelInfo} />
          ) : (
            <div className="text-xs text-[#8a8a90]">{t('Consulting the cauldron…')}</div>
          )}
        </div>

        {/* ✦ Triângulo de Transmutação */}
        <div className="relative px-5 pb-1 pt-4">
          {/* Névoa dourada atrás do centro */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2"
            style={{ background: 'radial-gradient(circle, rgba(201,162,95,0.14) 0%, transparent 65%)' }}
          />
          <div className="relative mx-auto" style={{ width: BOX_W, height: BOX_H }}>
            <svg className="pointer-events-none absolute inset-0" width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`}>
              {/* Arestas do triângulo (linha-circuito dourada) */}
              <polygon
                points={edgePoints}
                fill="none"
                stroke={matchedRecipe ? 'rgba(201,162,95,0.8)' : 'rgba(201,162,95,0.25)'}
                strokeWidth={1.5}
                strokeDasharray={matchedRecipe ? undefined : '5 6'}
                style={matchedRecipe ? { filter: 'drop-shadow(0 0 6px rgba(201,162,95,0.5))' } : undefined}
              />
              {/* Trilhas vértice → centro (acendem quando a receita casa) */}
              {SLOT_KEYS.map((k) => (
                <line
                  key={k}
                  x1={POS[k].x}
                  y1={POS[k].y}
                  x2={POS.center.x}
                  y2={POS.center.y}
                  stroke={matchedRecipe ? 'rgba(201,162,95,0.45)' : 'rgba(201,162,95,0.12)'}
                  strokeWidth={1}
                />
              ))}
              {/* Luz-cometa que percorre as ARESTAS (1ª etapa da canalização) */}
              {phase === 'charging' && (
                <polygon
                  key={`trace-${chargeId}`}
                  points={edgePoints}
                  pathLength={100}
                  fill="none"
                  stroke={GOLD_BRIGHT}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeDasharray="14 86"
                  className="alchemy-bdo-trace"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(231,198,130,0.85))' }}
                />
              )}
            </svg>

            {/* Nós em losango no meio das trilhas vértice → centro */}
            {SLOT_KEYS.map((k) => (
              <span
                key={`node-${k}`}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border bg-[#1e1e21]"
                style={{
                  left: (POS[k].x + POS.center.x) / 2,
                  top: (POS[k].y + POS.center.y) / 2,
                  borderColor: matchedRecipe ? GOLD : '#3c3c41',
                }}
              />
            ))}

            {/* 💫 Cometas que convergem dos vértices ao centro (2ª etapa) */}
            {phase === 'charging' &&
              SLOT_KEYS.map((k, i) => (
                <motion.span
                  key={`comet-${chargeId}-${k}`}
                  initial={{ left: POS[k].x, top: POS[k].y, opacity: 0 }}
                  animate={{
                    left: [POS[k].x, POS.center.x],
                    top: [POS[k].y, POS.center.y],
                    opacity: [0, 1, 0.9],
                  }}
                  transition={{
                    delay: TRACE_MS / 1000 + i * 0.09,
                    duration: (CONVERGE_MS - 300) / 1000,
                    ease: 'easeIn',
                  }}
                  className="absolute z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    background: GOLD_BRIGHT,
                    boxShadow: '0 0 10px 4px rgba(231,198,130,0.85), 0 0 22px 8px rgba(201,162,95,0.35)',
                  }}
                />
              ))}

            {/* Chance no canto (como o número flutuante da referência) */}
            <div className="absolute left-0 top-1" style={{ width: 92 }}>
              {matchedRecipe && !unlocked ? (
                <div className="text-center">
                  <div className="text-lg font-black text-red-400">🔒</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-red-400">
                    {t('Alchemy lv {n}', { n: minLevel ?? 1 })}
                  </div>
                </div>
              ) : chancePct != null ? (
                <div className="text-center">
                  <span className={`text-2xl font-bold tabular-nums ${chanceColorClass(chance)}`}>
                    {chancePct}%
                  </span>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#77777d]">{t('chance')}</div>
                </div>
              ) : null}
            </div>

            {/* Vértices (slots de ingrediente) */}
            {SLOT_KEYS.map((k, idx) => {
              const name = slots[idx];
              const info = name ? (getIngredientByName(name) ?? getForgeMaterialByName(name)) : undefined;
              return (
                <div
                  key={k}
                  className="absolute"
                  style={{ left: POS[k].x - SLOT / 2, top: POS[k].y - SLOT / 2 }}
                >
                  <DiamondSlot
                    size={SLOT}
                    active={!!name}
                    dashed={!name}
                    charging={phase === 'charging' && !!name}
                    glowColor={info ? RARITY_UI[info.rarity].glow : undefined}
                    onClick={() => removeSlot(idx)}
                    title={
                      name
                        ? t('{name} (click to remove)', { name: localizeItemName(name, locale) })
                        : t('Empty vertex')
                    }
                  >
                    {name ? (
                      <span className="block h-[62%] w-[62%] overflow-hidden">
                        <ItemThumb name={name} emoji={info?.emoji ?? '•'} className="text-2xl" />
                      </span>
                    ) : (
                      <span className="text-xl text-white/25">＋</span>
                    )}
                  </DiamondSlot>
                </div>
              );
            })}

            {/* ◆ Slot central — o veredito acontece AQUI */}
            <div
              className="absolute"
              style={{ left: POS.center.x - CENTER_SLOT / 2, top: POS.center.y - CENTER_SLOT / 2 }}
            >
              <DiamondSlot
                size={CENTER_SLOT}
                active={centerActive}
                dashed={!centerActive}
                verdict={verdict}
                verdictKey={chargeId * 1000 + reveal.tick}
                glowColor={centerActive ? centerUi.glow : undefined}
                title={centerName ? localizeItemName(centerName, locale) : t('Combination still incomplete')}
                plate={phase === 'done' && liveSucceeded > 1 ? `×${liveSucceeded}` : null}
              >
                {phase === 'charging' ? (
                  <span className="animate-ping text-2xl text-white/40">✦</span>
                ) : centerName ? (
                  <span
                    className={`block h-[64%] w-[64%] overflow-hidden ${
                      phase === 'done' && verdict !== 'fail' ? 'alchemy-bdo-pop' : ''
                    }`}
                    style={{
                      opacity: phase === 'done' ? 1 : 0.45,
                      filter:
                        phase === 'done' && verdict === 'fail'
                          ? 'grayscale(1) brightness(0.5)'
                          : undefined,
                      transition: 'filter 1s ease',
                    }}
                  >
                    <ItemThumb name={centerName} emoji="🧪" className="text-3xl" />
                  </span>
                ) : (
                  <span className="text-2xl text-white/20">?</span>
                )}
              </DiamondSlot>
            </div>
          </div>
          <style>{`
            @keyframes alchemy-bdo-trace {
              from { stroke-dashoffset: 0; }
              to { stroke-dashoffset: -200; }
            }
            .alchemy-bdo-trace { animation: alchemy-bdo-trace ${TRACE_MS * 2}ms linear both; }
            @keyframes alchemy-bdo-pop {
              0% { opacity: 0; transform: scale(0.2); filter: brightness(2.4); }
              55% { opacity: 1; transform: scale(1.14); filter: brightness(1.6); }
              100% { opacity: 1; transform: scale(1); filter: brightness(1); }
            }
            .alchemy-bdo-pop { animation: alchemy-bdo-pop 0.6s cubic-bezier(.2,.9,.3,1.3) both; }
            @media (prefers-reduced-motion: reduce) {
              .alchemy-bdo-trace, .alchemy-bdo-pop { animation: none; }
            }
          `}</style>
        </div>

        {/* Status da combinação + custo */}
        <div className="px-5 pb-2 text-center">
          {filled.length < 3 && !result ? (
            <p className="text-sm text-[#8a8a90]">
              {t('Vertices filled:')} <span className="font-semibold text-white">{filled.length}/3</span>
            </p>
          ) : matchedRecipe ? (
            <p className="text-sm">
              <span className={`font-bold ${RARITY_UI[matchedRecipe.rarity].text}`}>
                {localizeItemName(matchedRecipe.outputName, locale)}
              </span>{' '}
              <span style={{ color: GOLD }}>
                · {t('fee {cost} 🪙', { cost: matchedRecipe.goldCost })}
              </span>
              {maxCraftable > 1 && (
                <span className="text-[#77777d]"> · {t('up to {n}×', { n: maxCraftable })}</span>
              )}
            </p>
          ) : filled.length === 3 ? (
            <p className="text-sm text-red-300">{t('Unknown combination — check the recipe book.')}</p>
          ) : null}
        </div>

        {/* Aviso de risco (obrigatório: a falha agora consome tudo) */}
        {matchedRecipe && unlocked && (
          <div className="px-5 pb-3 text-center text-[12.5px] leading-snug" style={{ color: WARN }}>
            {t('Failure consumes the ingredients and the fee — nothing is produced.')}
          </div>
        )}
        {matchedRecipe && !unlocked && (
          <div className="px-5 pb-3 text-center text-[12.5px] font-semibold text-red-400">
            {t('Requires Alchemy level {n} for this recipe.', { n: minLevel ?? 1 })}
          </div>
        )}

        {/* Veredito em texto */}
        {phase !== 'idle' && (
          <div className="px-5 pb-2">
            <div className="text-center text-sm font-semibold">
              {(reveal.phase === 'working' || revealing) && (
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 0.7 }}
                  style={{ color: GOLD_BRIGHT }}
                >
                  {t('⚗ Transmuting')}
                  {revealing && reveal.total > 1 ? ` ${reveal.revealed}/${reveal.total}` : '...'}
                </motion.span>
              )}
              {reveal.phase === 'done' && result && (
                <span
                  style={verdict !== 'fail' ? { color: GOLD_BRIGHT } : undefined}
                  className={verdict === 'fail' ? 'text-red-400' : undefined}
                >
                  {verdict === 'success'
                    ? t('✨ SUCCESS!')
                    : verdict === 'fail'
                      ? t('💥 FAILED!')
                      : t('⚗️ {succeeded} of {attempted}', {
                          succeeded: result.succeeded,
                          attempted: result.attempted,
                        })}
                </span>
              )}
            </div>

            {/* A fila saindo do caldeirão — uma linha por poção revelada */}
            {revealing && (
              <div className="mx-auto mt-2 w-full max-w-[260px] space-y-1">
                {revealTail.map((u, i) => (
                  <motion.div
                    key={`unit-${reveal.revealed - i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between rounded-[3px] border border-black/50 bg-[#19191c] px-2 py-1 text-xs"
                  >
                    <span className="truncate text-[#c9c9ce]">{localizeItemName(centerName ?? '', locale)}</span>
                    <span className={`font-bold ${u.ok ? 'text-emerald-300' : 'text-red-400'}`}>
                      {u.ok ? '✓' : '✗'}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}

            {reveal.phase === 'done' && result && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-1 text-center text-sm font-bold ${verdict === 'fail' ? 'text-red-300' : 'text-emerald-300'}`}
              >
                {result.message}
                <div className="mt-0.5 text-xs font-normal" style={{ color: GOLD }}>
                  {t('+{n} Alchemy XP', { n: result.xpGained })}
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

        {/* Paleta de ingredientes (clique para colocar num vértice) */}
        <div className="border-t border-black/60 bg-[#19191c] px-4 py-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a90]">
            {t('Your ingredients — click to add')}
          </div>
          {loadingInv && inventory.length === 0 ? (
            <div className="py-3 text-center text-sm text-[#8a8a90]">{t('Loading ingredients…')}</div>
          ) : palette.length === 0 ? (
            <div className="py-3 text-center text-sm text-[#8a8a90]">
              {t('🎒 No ingredients. Explore dungeons to collect loot.')}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
              {palette.map(({ name, info }) => {
                const left = available(name);
                const ui = RARITY_UI[info!.rarity];
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => placeIngredient(name)}
                    disabled={busy || left <= 0}
                    title={t('{name} — {n} available', { name: localizeItemName(name, locale), n: left })}
                    className="relative aspect-square overflow-hidden rounded-[3px] border transition-all hover:border-[#8a6d3b] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      borderColor: '#3c3c41',
                      background: 'linear-gradient(160deg, #232327, #101013)',
                      boxShadow: `inset 0 0 8px rgba(0,0,0,0.6), 0 0 6px ${ui.glow.replace('0.6', '0.15')}`,
                    }}
                  >
                    <ItemThumb name={name} emoji={info!.emoji} />
                    <span
                      className="absolute bottom-0.5 right-0.5 text-[10px] font-black text-white"
                      style={{ textShadow: '0 1px 2px #000' }}
                    >
                      {left}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </BdoDialogShell>

      {/* ===== 📖 LIVRO DE RECEITAS (portal próprio, acima da dialog) ===== */}
      {recipesOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
              onClick={() => {
                setRecipesOpen(false);
                setHover(null);
              }}
            >
              <div
                className="relative max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-[4px] border border-[#46464c] bg-[#1e1e21] p-0 shadow-2xl shadow-black/80 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 flex items-center justify-between border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d] px-4 py-2.5">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-wide text-[#dcdce0]">
                    <span style={{ color: GOLD }}>📖</span> {t('Alchemy Recipes')}
                  </h3>
                  <button
                    onClick={() => {
                      setRecipesOpen(false);
                      setHover(null);
                    }}
                    className="px-2 py-0.5 text-[#8a8a90] transition-colors hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-4">
                  <p className="mb-4 text-xs text-[#8a8a90]">
                    {t(
                      'Hover to see the ingredients (missing ones in red). Ready recipes light up — click to build the triangle. 🔒 = requires an Alchemy level.',
                    )}
                  </p>
                  <div className="space-y-4">
                    {recipeGroups.map(({ rarity, recipes }) => {
                      const rMin = getCraftMinLevel(rarity);
                      const rUnlocked = level >= rMin;
                      const rChance = rUnlocked ? Math.round(getCraftChance(rarity, level) * 100) : null;
                      return (
                        <div key={rarity}>
                          <div className="mb-2 flex items-center gap-2">
                            <label className={`block text-xs font-semibold ${RARITY_UI[rarity].text}`}>
                              {localizeRarityLabel(RARITY_UI[rarity].label, locale)}s
                            </label>
                            {rUnlocked ? (
                              <span className={`text-[10px] font-bold tabular-nums ${chanceColorClass((rChance ?? 0) / 100)}`}>
                                {t('{n}% chance', { n: rChance ?? 0 })}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-red-400">
                                {t('🔒 Requires Alchemy lv {n}', { n: rMin })}
                              </span>
                            )}
                          </div>
                          <div
                            className="grid"
                            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}
                          >
                            {recipes.map((r) => {
                              const ui = RARITY_UI[r.rarity];
                              const ok = rUnlocked && canCraftRecipe(r);
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
                                  className={`flex items-center gap-2 rounded-[3px] border p-2 text-left transition-all ${
                                    ok ? 'cursor-pointer hover:border-[#c9a25f]' : 'cursor-not-allowed opacity-45'
                                  }`}
                                  style={{
                                    borderColor: ok ? BORDER_GOLD : '#3c3c41',
                                    background: 'linear-gradient(160deg, #232327, #101013)',
                                    boxShadow: ok ? `0 0 10px ${ui.glow.replace('0.6', '0.25')}` : undefined,
                                  }}
                                >
                                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[3px]">
                                    <ItemThumb name={r.outputName} emoji="🧪" className="text-2xl" />
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
                                        ? t('🔒 lv {n}', { n: rMin })
                                        : ok
                                          ? t('✓ ready')
                                          : t('missing ingredients')}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Popover de disponibilidade (hover sobre uma receita) */}
            {hover && hoverRecipe && (
              <div
                className="pointer-events-none fixed z-[70] w-[224px] rounded-[3px] border border-[#8a6d3b] bg-[#141215]/95 p-3 shadow-2xl"
                style={{
                  top: Math.min(hover.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220),
                  left: hover.left,
                }}
              >
                <p className={`text-xs font-black ${RARITY_UI[hoverRecipe.rarity].text}`}>
                  {localizeItemName(hoverRecipe.outputName, locale)}
                </p>
                <div className="mt-2 space-y-1">
                  {hoverRecipe.ingredients.map((ing) => {
                    const enough = have(ing.name) >= ing.quantity;
                    const info = getIngredientByName(ing.name) ?? getForgeMaterialByName(ing.name);
                    return (
                      <div key={ing.name} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="grid h-5 w-5 place-items-center overflow-hidden rounded">
                            <ItemThumb name={ing.name} emoji={info?.emoji ?? '•'} className="text-sm" />
                          </span>
                          <span className="truncate text-[11px] text-white/75">{localizeItemName(ing.name, locale)}</span>
                        </span>
                        <span className={`shrink-0 text-[11px] font-bold ${enough ? 'text-emerald-300' : 'text-red-300'}`}>
                          {have(ing.name)}/{ing.quantity}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px]" style={{ color: GOLD }}>
                  {t('fee {cost} 🪙', { cost: hoverRecipe.goldCost })}
                </p>
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
