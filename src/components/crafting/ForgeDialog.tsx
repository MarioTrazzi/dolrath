'use client';

// ⚒️ Dialog de FORJA — a Bigorna.
//
// Casca chumbo+ouro de bdoTheme.tsx + aparelho próprio da profissão
// (AnvilRig de professionFx.tsx): a peça assenta numa bigorna, o martelo
// bate três vezes soltando faíscas, o metal incandesce e o VEREDITO é a
// têmpera (esfria dourado) ou a rachadura. Materiais ficam enfileirados
// numa bancada de metal riscado. A seleção é pelo livro de receitas.
// Refino de pedra não tem falha.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useBatchReveal } from '@/hooks/useBatchReveal';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { buyGoldOnChain, parseNeededGold, isInsufficientGold } from '@/lib/buyGold';
import { confirmBuyGold } from '@/lib/buyGoldPrompt';
import {
  forgeRecipesByGroup,
  forgeRecipesUsingMaterial,
  getForgeOutputCatalogItem,
  forgeMaterialEmoji,
  type ForgeRecipe,
} from '@/lib/forge';
import { type Rarity } from '@/lib/itemCatalog';
import { useT, useI18n } from '@/lib/i18n/I18nProvider';
import { localizeItemName, localizeRarityLabel } from '@/lib/i18n/catalog';
import { itemStatEntries, formatStatValue } from '@/lib/itemStats';
import {
  getCraftChance,
  getCraftMinLevel,
  isRefineRecipe,
  refineXpAndLevel,
} from '@/lib/craftingProfession';
import type { ProfessionLevelInfo } from '@/lib/professionSystem';
import { ProfessionBar } from '@/components/gathering/GatheringPanel';
import { CraftItemThumb as ItemThumb } from '@/components/store/CraftItemThumb';
import {
  BdoDialogShell,
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
import { AnvilRig, FORGE_ACCENT, FORGE_ACCENT_BRIGHT } from './professionFx';

export interface ForgeInventoryItem {
  id: string;
  quantity: number;
  item: { name: string; type: string; stats?: Record<string, any> | null };
}

export interface ForgeProfessionInfo {
  xp: number;
  levelInfo: ProfessionLevelInfo;
}

export interface ForgeCraftResult {
  attempted: number;
  succeeded: number;
  failed: number;
  chance: number;
  /**
   * Sequência por unidade, na ordem em que o servidor rolou. É o que a bigorna
   * encena um por vez. Ausente = contrato antigo (encena um bloco só).
   */
  units?: { ok: boolean }[];
  xpGained: number;
  levelInfo: ProfessionLevelInfo;
  characterGold: number | null;
  outputName: string;
  rarity: Rarity;
  message: string;
}

interface ForgeDialogProps {
  open: boolean;
  onClose: () => void;
  characterId?: string;
  characterGold?: number | null;
  /** "⚒️ Forja" no card do material: pré-seleciona uma receita que usa o insumo. */
  initialMaterialName?: string;
  // Overrides para páginas de mock/teste (sem DB)
  fetchInfoOverride?: () => Promise<ForgeProfessionInfo>;
  fetchInventoryOverride?: () => Promise<ForgeInventoryItem[]>;
  attemptOverride?: (recipeId: string, quantity: number) => Promise<ForgeCraftResult>;
  onChanged?: () => void;
}

const GROUP_LABEL: Record<ForgeRecipe['group'], string> = {
  armor: '🛡️ Armor',
  weapon: '⚔️ Weapon',
  stone: '💎 Refine',
};

export default function ForgeDialog({
  open,
  onClose,
  characterId,
  characterGold,
  initialMaterialName,
  fetchInfoOverride,
  fetchInventoryOverride,
  attemptOverride,
  onChanged,
}: ForgeDialogProps) {
  const t = useT();
  const { locale } = useI18n();
  const [inventory, setInventory] = useState<ForgeInventoryItem[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [levelInfo, setLevelInfo] = useState<ProfessionLevelInfo | null>(null);
  const [recipe, setRecipe] = useState<ForgeRecipe | null>(null);
  const [craftQty, setCraftQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [chargeId, setChargeId] = useState(0);
  const [result, setResult] = useState<ForgeCraftResult | null>(null);
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
        const res = await fetch(`/api/character/${characterId}/forge-item`);
        const data = await res.json();
        if (res.ok) setLevelInfo(data.levelInfo);
      }
    } catch {
      /* barra fica oculta; o POST segue autoritativo no servidor */
    }
  }, [characterId, fetchInfoOverride]);

  // Encenação do lote: o servidor devolve a sequência por unidade e a bigorna
  // martela UMA POR VEZ. O inventário/`onChanged` só recarregam no fim — se
  // recarregassem junto com a resposta, o insumo sumiria da tela no meio da
  // animação. [[useBatchReveal]]
  const reveal = useBatchReveal({
    maxTickMs: CHARGE_MS,
    onFinish: () => {
      fetchInventory();
      onChanged?.();
    },
  });
  const phase: CraftPhase =
    reveal.phase === 'idle' ? 'idle' : reveal.phase === 'working' ? 'charging' : 'done';

  // Reset SÓ na abertura: os callbacks mudam de identidade quando o pai
  // re-renderiza (ex.: overrides inline) e não podem reiniciar a dialog.
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

  // Materiais/pedras do inventário: nome → quantidade (a rota casa por nome
  // dentro de CONSUMABLE, então contamos igual).
  const materialCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of inventory) {
      if (inv.item.type === 'CONSUMABLE') {
        map.set(inv.item.name, (map.get(inv.item.name) ?? 0) + inv.quantity);
      }
    }
    return map;
  }, [inventory]);
  const have = useCallback((name: string) => materialCounts.get(name) ?? 0, [materialCounts]);

  const isRefine = recipe ? isRefineRecipe(recipe) : false;
  const minLevel = recipe
    ? isRefine
      ? refineXpAndLevel(recipe.rarity).minLevel
      : getCraftMinLevel(recipe.rarity)
    : null;
  const unlocked = recipe ? level >= (minLevel ?? 1) : true;
  const chance = recipe && !isRefine && unlocked ? getCraftChance(recipe.rarity, level) : null;

  const recipeMinLevel = (r: ForgeRecipe) =>
    isRefineRecipe(r) ? refineXpAndLevel(r.rarity).minLevel : getCraftMinLevel(r.rarity);
  const canCraftRecipe = useCallback(
    (r: ForgeRecipe) => r.materials.every((m) => have(m.name) >= m.quantity),
    [have],
  );

  // Teto de MATERIAL — o único que bloqueia o botão. O gold não entra: sem gold
  // o clique precisa chegar na rota p/ disparar a recarga on-chain.
  // [[dolrath-onchain-gold-not-items]]
  const maxCraftable = useMemo(() => {
    if (!recipe) return 0;
    const n = Math.min(...recipe.materials.map((m) => Math.floor(have(m.name) / m.quantity)));
    return Math.max(0, Math.min(99, n));
  }, [recipe, have]);

  const totalGoldCost = recipe ? recipe.goldCost * craftQty : 0;
  const goldShort = characterGold != null && totalGoldCost > characterGold;

  useEffect(() => {
    setCraftQty((q) => Math.min(Math.max(1, q), Math.max(1, maxCraftable)));
  }, [maxCraftable]);

  const loadRecipe = (r: ForgeRecipe) => {
    setRecipe(r);
    setResult(null);
    reveal.reset();
    setBookOpen(false);
  };

  // "⚒️ Forja" no card do material: assim que o inventário chegar, pré-seleciona
  // a receita que usa o insumo (preferindo uma craftável e desbloqueada).
  useEffect(() => {
    if (!open || pickedFromLinkRef.current || loadingInv || !initialMaterialName) return;
    const candidates = forgeRecipesUsingMaterial(initialMaterialName);
    if (candidates.length === 0) return;
    const best =
      candidates.find((r) => canCraftRecipe(r) && level >= recipeMinLevel(r)) ?? candidates[0];
    loadRecipe(best);
    pickedFromLinkRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadingInv, initialMaterialName, canCraftRecipe, level]);

  const handleForge = async () => {
    if (!recipe || busy || !unlocked || maxCraftable < 1) return;
    const qty = Math.max(1, Math.min(99, craftQty));

    setBusy(true);
    setResult(null);
    setError(null);
    setChargeId((c) => c + 1);
    reveal.begin();

    try {
      let data: ForgeCraftResult;
      if (attemptOverride) {
        data = await attemptOverride(recipe.id, qty);
      } else {
        const doForge = () =>
          fetch(`/api/character/${characterId}/forge-item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipeId: recipe.id, quantity: qty }),
          });
        let res = await doForge();
        let json = await res.json().catch(() => ({}));

        // Sem GOLD na mão → recarga on-chain (compra de GOLD, nunca do item) e
        // refaz a forja. [[dolrath-onchain-gold-not-items]]
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
          res = await doForge();
          json = await res.json().catch(() => ({}));
        }

        if (!res.ok) {
          setError(json.error || t('Failed to forge'));
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
      setError(t('Unexpected error forging'));
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

  // Durante a encenação a bigorna mostra o veredito DA UNIDADE que acabou de
  // sair; só no fim aparece o veredito do lote.
  const verdict =
    revealing && revealedUnits.length > 0
      ? revealedUnits[revealedUnits.length - 1].ok
        ? ('success' as const)
        : ('fail' as const)
      : reveal.phase === 'done' && result
        ? aggregateVerdict
        : null;

  const catalogItem = recipe ? getForgeOutputCatalogItem(recipe) : undefined;
  const centerUi = recipe ? RARITY_UI[recipe.rarity] : null;
  const statEntries = catalogItem ? itemStatEntries(catalogItem.stats, catalogItem.type) : [];

  const chancePct = chance != null ? Math.round(chance * 100) : null;

  const groups = useMemo(() => forgeRecipesByGroup(), []);

  // ⚠️ Rodapé FIXO da casca: quantidade + ação. Fora da área rolável, senão em
  // tela baixa o botão cai abaixo da dobra (scrollbar escondida, sem pista de
  // que dá pra rolar).
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
            disabled={busy || revealing}
            className="w-16 rounded-[3px] border border-[#46464c] bg-[#101013] py-1 text-center text-sm text-white"
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
          {t('🔒 Requires Forge level {n}.', { n: minLevel ?? 1 })}
        </div>
      ) : maxCraftable < 1 ? (
        <div className="mb-2 text-center text-xs font-semibold text-red-400">
          {t('Missing materials for one piece.')}
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
          onClick={handleForge}
          disabled={!unlocked || maxCraftable < 1 || (!characterId && !attemptOverride)}
          busy={busy}
          busyLabel={t('⚒ Forging...')}
        >
          {craftQty > 1 ? t('⚒ Forge ×{n}', { n: craftQty }) : t('⚒ Forge')}
        </BevelButton>
      )}
      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={() => setBookOpen(true)}
          className="text-xs font-semibold text-[#9a9aa0] transition-colors hover:text-white"
        >
          {t('📖 Forge Book — change recipe')}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <BdoDialogShell open={open} onClose={onClose} icon="⚒" title={t('Forge')} footer={footer}>
        {/* Nível da profissão (conta inteira, como a Fazenda) */}
        <div className="border-b border-black/60 bg-[#19191c] px-5 py-3">
          {levelInfo ? (
            <ProfessionBar label={t('Forge')} emoji="⚒️" info={levelInfo} />
          ) : (
            <div className="text-xs text-[#8a8a90]">{t('Lighting the forge…')}</div>
          )}
        </div>

        {!recipe ? (
          /* Sem receita: convite ao livro */
          <div className="px-6 py-10 text-center text-sm text-[#b8b8be]">
            <div className="mb-2 text-3xl" style={{ color: FORGE_ACCENT }}>
              ⚒
            </div>
            {t('Pick the piece you want to forge from the book.')}
            <div className="mt-4">
              <BevelButton onClick={() => setBookOpen(true)}>{t('📖 Forge Book')}</BevelButton>
            </div>
          </div>
        ) : (
          <>
            {/* ⚒ A bigorna: marteladas, faíscas e a peça incandescendo */}
            <div className="relative px-5 pb-1 pt-4">
              <AnvilRig
                phase={phase}
                working={reveal.phase === 'working' || revealing}
                chargeId={chargeId * 1000 + reveal.tick}
                verdict={verdict}
                materials={recipe.materials.map((m) => ({
                  name: localizeItemName(m.name, locale),
                  emoji: forgeMaterialEmoji(m.name),
                  have: have(m.name),
                  need: m.quantity * craftQty,
                }))}
                outputName={localizeItemName(recipe.outputName, locale)}
                outputEmoji="⚒️"
                glowColor={centerUi?.glow}
                plate={phase === 'done' && liveSucceeded > 1 ? `×${liveSucceeded}` : null}
                statusNode={
                  !unlocked ? (
                    <div className="text-center">
                      <div className="text-lg font-black text-red-400">🔒</div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-red-400">
                        {t('Forge lv {n}', { n: minLevel ?? 1 })}
                      </div>
                    </div>
                  ) : isRefine ? (
                    <div className="text-center">
                      <span className="text-lg font-bold text-emerald-300">✓</span>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[#77777d]">{t('no fail')}</div>
                    </div>
                  ) : chancePct != null ? (
                    <div className="text-center">
                      <span className={`text-2xl font-bold tabular-nums ${chanceColorClass(chance)}`}>
                        {chancePct}%
                      </span>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[#77777d]">{t('chance')}</div>
                    </div>
                  ) : null
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
                {maxCraftable > 1 && (
                  <span className="text-[#77777d]"> · {t('up to {n}×', { n: maxCraftable })}</span>
                )}
              </p>
            </div>

            {/* Prévia de stats da peça (faixa como a da referência) */}
            {statEntries.length > 0 && (
              <div className="border-y border-black/60 bg-[#19191c] px-5 py-2.5">
                {statEntries.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-2 border-b border-white/5 py-1 text-[13px] last:border-0"
                  >
                    <span className="flex items-center gap-1.5 text-[#c9c9ce]">
                      <span className="text-[9px]" style={{ color: GOLD }}>
                        ✦
                      </span>
                      {s.label}
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-300">
                      {formatStatValue(s.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Aviso de risco / gating */}
            {unlocked && !isRefine && (
              <div className="px-5 pb-1 pt-3 text-center text-[12.5px] leading-snug" style={{ color: WARN }}>
                {t('Failure consumes the materials and the fee — nothing is produced.')}
              </div>
            )}
            {!unlocked && (
              <div className="px-5 pb-1 pt-3 text-center text-[12.5px] font-semibold text-red-400">
                {t('Requires Forge level {n} for this recipe.', { n: minLevel ?? 1 })}
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
                      style={{ color: FORGE_ACCENT_BRIGHT }}
                    >
                      {t('⚒ Forging')}
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
                          : t('⚒️ {succeeded} of {attempted}', {
                              succeeded: result.succeeded,
                              attempted: result.attempted,
                            })}
                    </span>
                  )}
                </div>

                {/* A fila saindo da bigorna — uma linha por unidade revelada */}
                {revealing && (
                  <div className="mx-auto mt-2 w-full max-w-[260px] space-y-1">
                    {revealTail.map((u, i) => (
                      <motion.div
                        key={`unit-${reveal.revealed - i}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between rounded-[3px] border border-black/50 bg-[#19191c] px-2 py-1 text-xs"
                      >
                        <span className="truncate text-[#c9c9ce]">{localizeItemName(recipe.outputName, locale)}</span>
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
                      {t('+{n} Forge XP', { n: result.xpGained })}
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

      {/* ===== 📖 LIVRO DA FORJA (portal próprio, acima da dialog) ===== */}
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
                  <span style={{ color: FORGE_ACCENT }}>📖</span> {t('Forge Book')}
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
                    'Click a recipe to bring it to the anvil. Recipes with full materials light up. 🔒 = requires Forge level. Stone refining never fails.',
                  )}
                </p>
                <div className="space-y-4">
                  {groups.map(({ group, recipes }) => (
                    <div key={group}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a9aa0]">
                        {t(GROUP_LABEL[group])}
                      </label>
                      <div
                        className="grid"
                        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}
                      >
                        {recipes.map((r) => {
                          const ui = RARITY_UI[r.rarity];
                          const rMin = recipeMinLevel(r);
                          const rUnlocked = level >= rMin;
                          const ok = rUnlocked && canCraftRecipe(r);
                          const rChance = isRefineRecipe(r)
                            ? null
                            : Math.round(getCraftChance(r.rarity, level) * 100);
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
                                <ItemThumb name={r.outputName} emoji="⚒️" className="text-2xl" />
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
                                    ? t('🔒 Forge lv {n}', { n: rMin })
                                    : ok
                                      ? t('✓ materials complete')
                                      : t('missing materials')}
                                </span>
                                <span className="block text-[10px] leading-tight text-[#77777d]">
                                  {isRefineRecipe(r)
                                    ? t('no fail')
                                    : rUnlocked
                                      ? t('{n}% chance', { n: rChance ?? 0 })
                                      : ''}
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
