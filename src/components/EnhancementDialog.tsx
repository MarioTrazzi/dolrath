'use client';

// ⚒️ Diálogo de Aprimoramento de Itens — estilo Black Desert
// Mostra chance de sucesso (com failstacks), durabilidade, material necessário
// e os riscos da tentativa (perda de durabilidade, downgrade ou destruição).

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getLevelLabel, applyEnhancementToStats, getGearCategory } from '@/lib/enhancementSystem';
import { itemStatEntries } from '@/lib/itemStats';
import ItemIcon from './ItemIcon';
import { resolveImageUrl } from '@/lib/imageUrl';
import { itemImagePath } from '@/lib/itemCatalog';

/** Item enhanceável exibido no seletor do diálogo (inventário do personagem). */
export interface EnhanceablePickerItem {
  id: string; // id da linha de inventário (CharacterInventory)
  name: string;
  type: string;
  image?: string | null;
  enhancementLevel: number;
}

export interface EnhanceInfo {
  maxLevel: boolean;
  category?: 'WEAPON' | 'ARMOR' | 'ACCESSORY';
  currentLevel: number;
  targetLevel?: number;
  targetLabel?: string;
  displayName: string;
  // Identidade do item (cabeçalho + prévia de stats)
  itemName?: string;
  itemType?: string;
  itemImage?: string | null;
  itemStats?: Record<string, any> | null;
  chance?: number;
  failstacks?: number;
  durability?: number;
  maxDurability?: number;
  material?: { kind: 'STONE' | 'DUPLICATE'; name: string };
  materialAvailable?: boolean;
  /** Quantas unidades do material o personagem possui. */
  materialCount?: number;
  enoughDurability?: boolean;
  canEnhance?: boolean;
  risk?: string;
}

export interface EnhanceResult {
  success: boolean;
  destroyed: boolean;
  downgraded: boolean;
  chance: number;
  newLevel: number;
  newLevelLabel: string;
  durability: number;
  failstacks: number;
  message: string;
}

interface EnhancementDialogProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  /** Seleção inicial (id da linha de inventário). Opcional: pode escolher no seletor. */
  inventoryId?: string;
  itemName?: string;
  /** Itens enhanceáveis do inventário, exibidos no seletor abaixo. */
  items?: EnhanceablePickerItem[];
  /** Ao abrir a partir de uma Pedra Negra: filtra o seletor pela categoria de
   *  gear que a pedra aprimora (WEAPON ou ARMOR). */
  filterCategory?: 'WEAPON' | 'ARMOR';
  // Permite injetar implementações mock (página de teste / Storybook)
  fetchInfoOverride?: () => Promise<EnhanceInfo>;
  attemptOverride?: () => Promise<EnhanceResult>;
  repairOverride?: () => Promise<{ success: boolean; durability: number; message: string }>;
  onChanged?: () => void;
}

export default function EnhancementDialog({
  open,
  onClose,
  characterId,
  inventoryId,
  itemName,
  items,
  filterCategory,
  fetchInfoOverride,
  attemptOverride,
  repairOverride,
  onChanged,
}: EnhancementDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(inventoryId || '');
  const [info, setInfo] = useState<EnhanceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempting, setAttempting] = useState(false);
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fases da animação estilo BDO: a barra carrega e, ao encher, brilha (sucesso) ou apaga (falha)
  const [phase, setPhase] = useState<'idle' | 'charging' | 'done'>('idle');
  const [chargeId, setChargeId] = useState(0);
  // Modo instantâneo: pula a animação de forja e revela o resultado de imediato.
  // Preferência lembrada entre tentativas/sessões.
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setInstant(window.localStorage.getItem('enhanceInstant') === '1');
    }
  }, []);

  const toggleInstant = () => {
    setInstant((v) => {
      const next = !v;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('enhanceInstant', next ? '1' : '0');
      }
      return next;
    });
  };

  const CHARGE_MS = 1500;

  const fetchInfo = useCallback(async () => {
    if (!selectedId) {
      setInfo(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (fetchInfoOverride) {
        setInfo(await fetchInfoOverride());
      } else {
        const res = await fetch(
          `/api/character/${characterId}/enhance-item?inventoryId=${selectedId}`
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Erro ao carregar informações');
        } else {
          setInfo(data);
        }
      }
    } catch {
      setError('Erro ao carregar informações de aprimoramento');
    }
    setLoading(false);
  }, [characterId, selectedId, fetchInfoOverride]);

  // Reseta a seleção ao (re)abrir o diálogo.
  useEffect(() => {
    if (open) setSelectedId(inventoryId || '');
  }, [open, inventoryId]);

  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setPhase('idle');
      fetchInfo();
    }
  }, [open, fetchInfo]);

  const handleEnhance = async () => {
    setAttempting(true);
    setResult(null);
    setError(null);
    // Reinicia a barra do zero e começa a carregar ⚒️
    setChargeId((c) => c + 1);
    setPhase('charging');

    // A barra leva CHARGE_MS para encher; o resultado só é revelado ao final.
    // No modo instantâneo o resultado aparece sem espera.
    const minDelay = new Promise((resolve) => setTimeout(resolve, instant ? 0 : CHARGE_MS));

    try {
      let data: EnhanceResult;
      if (attemptOverride) {
        data = await attemptOverride();
      } else {
        const res = await fetch(`/api/character/${characterId}/enhance-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventoryId: selectedId }),
        });
        const json = await res.json();
        if (!res.ok) {
          await minDelay;
          setError(json.error || 'Erro ao aprimorar');
          setPhase('idle');
          setAttempting(false);
          return;
        }
        data = json;
      }
      await minDelay;
      // Barra cheia → revela: brilho dourado (sucesso) ou apaga (falha)
      setResult(data);
      setPhase('done');
      onChanged?.();
      if (!data.destroyed) {
        // Recarregar dados para a próxima tentativa
        fetchInfo();
      }
    } catch {
      setError('Erro inesperado ao aprimorar');
      setPhase('idle');
    }
    setAttempting(false);
  };

  const handleRepair = async () => {
    setError(null);
    try {
      if (repairOverride) {
        const r = await repairOverride();
        if (!r.success) setError(r.message);
      } else {
        const res = await fetch(`/api/character/${characterId}/repair-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventoryId: selectedId }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Erro ao reparar');
          return;
        }
      }
      onChanged?.();
      fetchInfo();
    } catch {
      setError('Erro inesperado ao reparar');
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const chancePct = info?.chance !== undefined ? (info.chance * 100).toFixed(1) : null;
  const durabilityPct =
    info?.durability !== undefined && info?.maxDurability
      ? Math.round((info.durability / info.maxDurability) * 100)
      : null;
  const isAccessory = info?.category === 'ACCESSORY';

  // Imagem do item para o cabeçalho (banco → asset por nome → ícone genérico).
  const headerImg = info
    ? resolveImageUrl(info.itemImage) ?? (info.itemName ? itemImagePath(info.itemName) : null)
    : null;

  // Prévia "atual → projetado": aplica o multiplicador do nível atual e do nível
  // alvo aos stats base, para o jogador decidir com informação.
  const statComparison =
    info && info.itemStats && !info.maxLevel && info.targetLevel != null
      ? (() => {
          const cur = applyEnhancementToStats(info.itemStats, info.currentLevel);
          const next = applyEnhancementToStats(info.itemStats, info.targetLevel);
          const curEntries = itemStatEntries(cur, info.itemType);
          const nextEntries = itemStatEntries(next, info.itemType);
          const keys = Array.from(
            new Set([...curEntries, ...nextEntries].map((e) => e.key))
          );
          return keys.map((key) => {
            const c = curEntries.find((e) => e.key === key);
            const n = nextEntries.find((e) => e.key === key);
            return {
              key,
              label: (c ?? n)!.label,
              from: c?.value ?? 0,
              to: n?.value ?? 0,
            };
          });
        })()
      : [];

  // Renderiza num portal no body: o card da bancada (e outros pais) usa
  // backdrop-filter, que cria bloco de contenção para position:fixed e cortaria
  // o diálogo (quebrando a rolagem). No body ele fica sempre na frente de tudo.
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="w-full max-w-md max-h-[90vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-xl border border-amber-500/30 bg-gradient-to-b from-gray-900 to-gray-950 p-6 shadow-2xl shadow-amber-900/30"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-amber-400">⚒️ Aprimoramento</h2>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          {loading && (
            <div className="py-10 text-center text-gray-400">Consultando o Espírito Negro...</div>
          )}

          {!loading && !selectedId && (
            <div className="rounded-lg border border-white/10 bg-black/40 p-6 text-center text-gray-300">
              <div className="mb-1 text-3xl">⚒️</div>
              Selecione abaixo o item que deseja aprimorar.
            </div>
          )}

          {!loading && info && (
            <>
              {/* Item e progressão de nível (oculto se o item foi destruído) */}
              {!result?.destroyed && (
              <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-4 text-center">
                {/* Ícone pequeno + nome + nível atual */}
                <div className="mb-2 flex items-center justify-center gap-2.5">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-gradient-to-br from-[#1c232b] to-[#0d1116]">
                    {headerImg ? (
                      <img src={headerImg} alt={info.itemName || ''} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <ItemIcon type={(info.itemType as any) || 'SWORD'} size={22} />
                    )}
                    {info.currentLevel > 0 && (
                      <span className="absolute right-0.5 bottom-0 text-[10px] font-black text-[#f1d79a]" style={{ textShadow: '0 1px 2px #000' }}>
                        {getLevelLabel(info.currentLevel)}
                      </span>
                    )}
                  </span>
                  <div
                    className={`text-left text-base font-semibold leading-tight ${
                      info.currentLevel >= 16
                        ? 'text-orange-400'
                        : info.currentLevel > 0
                          ? 'text-cyan-300'
                          : 'text-white'
                    }`}
                  >
                    {info.itemName || info.displayName}
                  </div>
                </div>
                {!info.maxLevel && (
                  <div className="mt-2 flex items-center justify-center gap-3 text-2xl font-bold">
                    <span className="text-gray-400">
                      {getLevelLabel(info.currentLevel) || 'Base'}
                    </span>
                    <span className="text-amber-400">→</span>
                    <span className="text-amber-300">{info.targetLabel}</span>
                  </div>
                )}
                {info.maxLevel && (
                  <div className="mt-2 text-sm font-semibold text-orange-400">
                    🏆 Nível máximo alcançado (V)
                  </div>
                )}
              </div>
              )}

              {/* Prévia de stats: atual → projetado após o aprimoramento */}
              {!info.maxLevel && !result?.destroyed && statComparison.length > 0 && (
                <div className="mb-4 rounded-lg border border-white/10 bg-black/40 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Atributos após aprimorar
                  </div>
                  <div className="space-y-1.5">
                    {statComparison.map((s) => {
                      const delta = s.to - s.from;
                      return (
                        <div key={s.key} className="flex items-center justify-between text-sm">
                          <span className="text-gray-300">{s.label}</span>
                          <span className="flex items-center gap-2 font-semibold tabular-nums">
                            <span className="text-gray-400">{s.from}</span>
                            <span className="text-amber-400">→</span>
                            <span className="text-emerald-300">{s.to}</span>
                            {delta !== 0 && (
                              <span className={`text-xs ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ({delta > 0 ? '+' : ''}{delta})
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!info.maxLevel && !result?.destroyed && (
                <>
                  {/* Chance e failstacks */}
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-center">
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Chance de sucesso
                      </div>
                      <div
                        className={`mt-1 text-2xl font-bold ${
                          (info.chance ?? 0) >= 0.7
                            ? 'text-green-400'
                            : (info.chance ?? 0) >= 0.3
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }`}
                      >
                        {chancePct}%
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-center">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Failstacks</div>
                      <div className="mt-1 text-2xl font-bold text-purple-400">
                        🔥 {info.failstacks}
                      </div>
                    </div>
                  </div>

                  {/* Durabilidade (não se aplica a acessórios) */}
                  {!isAccessory && durabilityPct !== null && (
                    <div className="mb-4">
                      <div className="mb-1 flex justify-between text-xs text-gray-400">
                        <span>Durabilidade</span>
                        <span>
                          {info.durability}/{info.maxDurability}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className={`h-full rounded-full transition-all ${
                            durabilityPct > 50
                              ? 'bg-green-500'
                              : durabilityPct > 20
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${durabilityPct}%` }}
                        />
                      </div>
                      {!info.enoughDurability && (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-xs text-red-400">
                            Durabilidade insuficiente para tentar!
                          </span>
                          <button
                            onClick={handleRepair}
                            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
                          >
                            🔧 Reparar (1 cópia)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Material necessário */}
                  <div
                    className={`mb-4 rounded-lg border p-3 text-sm ${
                      info.materialAvailable
                        ? 'border-green-500/30 bg-green-500/10 text-green-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-semibold">Material: </span>
                        {info.material?.kind === 'DUPLICATE'
                          ? `1× cópia de ${info.material.name}`
                          : `1× ${info.material?.name}`}
                      </span>
                      {/* Quantidade disponível — diminui a cada uso (refetch pós-tentativa). */}
                      <span className="shrink-0 rounded-md bg-black/40 px-2 py-0.5 text-xs font-bold">
                        {info.materialCount ?? (info.materialAvailable ? 1 : 0)}× disponível
                      </span>
                    </div>
                  </div>

                  {/* Aviso de risco */}
                  <div
                    className={`mb-4 rounded-lg border p-3 text-sm ${
                      isAccessory
                        ? 'border-red-500/40 bg-red-950/40 text-red-300'
                        : 'border-amber-500/30 bg-amber-950/30 text-amber-200'
                    }`}
                  >
                    {info.risk}
                  </div>
                </>
              )}

              {/* ⚒️ Barra de aprimoramento estilo BDO: carrega e, ao encher, brilha ou apaga */}
              {phase !== 'idle' && (
                <div className="relative mb-4">
                  {/* Explosão de luz dourada ao ter sucesso */}
                  <AnimatePresence>
                    {phase === 'done' && result?.success && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: [0, 1, 0], scale: [0.4, 1.6, 2.2] }}
                        transition={{ duration: 1 }}
                        className="pointer-events-none absolute -inset-8 z-10"
                        style={{
                          background:
                            'radial-gradient(circle, rgba(253,224,71,0.9) 0%, rgba(245,158,11,0.35) 40%, transparent 70%)',
                        }}
                      />
                    )}
                  </AnimatePresence>

                  <div className="relative z-20">
                    <div className="mb-1 text-center text-sm font-semibold">
                      {phase === 'charging' && (
                        <motion.span
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 0.7 }}
                          className="text-amber-300"
                        >
                          ⚒️ Forjando...
                        </motion.span>
                      )}
                      {phase === 'done' && result?.success && (
                        <span className="text-yellow-300">✨ SUCESSO!</span>
                      )}
                      {phase === 'done' && !result?.success && (
                        <span className={result?.destroyed ? 'text-red-400' : 'text-orange-400'}>
                          {result?.destroyed ? '💔 DESTRUÍDO!' : '💥 FALHOU!'}
                        </span>
                      )}
                    </div>

                    {/* Trilho + preenchimento */}
                    <motion.div
                      animate={
                        phase === 'done' && !result?.success
                          ? { x: [0, -8, 8, -6, 6, -3, 3, 0] }
                          : {}
                      }
                      transition={{ duration: 0.5 }}
                      className={`relative h-7 overflow-hidden rounded-full border bg-gray-900 ${
                        phase === 'done' && result?.success
                          ? 'border-yellow-300/70 shadow-[0_0_25px_rgba(253,224,71,0.8)]'
                          : phase === 'done'
                            ? 'border-red-600/50'
                            : 'border-amber-500/40'
                      }`}
                    >
                      <motion.div
                        key={chargeId}
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: instant ? 0 : CHARGE_MS / 1000, ease: [0.45, 0, 0.55, 1] }}
                        className={`h-full ${
                          phase === 'done'
                            ? result?.success
                              ? 'bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300'
                              : 'bg-gradient-to-r from-red-800 to-red-600'
                            : 'bg-gradient-to-r from-amber-700 via-amber-500 to-amber-400'
                        }`}
                      />
                      {/* Brilho que percorre a barra enquanto carrega */}
                      {phase === 'charging' && (
                        <motion.div
                          initial={{ x: '-120%' }}
                          animate={{ x: '500%' }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                          className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                        />
                      )}
                    </motion.div>

                    {/* Mensagem do resultado */}
                    {phase === 'done' && result && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mt-2 text-center text-sm font-bold ${
                          result.success
                            ? 'text-green-300'
                            : result.destroyed
                              ? 'text-red-300'
                              : 'text-orange-300'
                        }`}
                      >
                        {result.message}
                        {!result.success && !result.destroyed && (
                          <div className="mt-0.5 text-xs font-normal text-purple-300">
                            Failstacks acumulados: 🔥 {result.failstacks}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {/* Botão de aprimorar */}
              {!info.maxLevel && !(result?.destroyed) && (
                <>
                  {/* Switch: pula a animação de forja e aplica o resultado na hora */}
                  <div className="mb-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-sm text-gray-300">
                      ⚡ Modo instantâneo
                      <span className="text-xs text-gray-500">(sem animação)</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={instant}
                      onClick={toggleInstant}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        instant ? 'bg-amber-500' : 'bg-gray-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          instant ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <button
                    onClick={handleEnhance}
                    disabled={attempting || !info.canEnhance}
                    className={`w-full rounded-lg py-3 text-lg font-bold transition-all ${
                      attempting
                        ? 'cursor-wait bg-amber-700/50 text-amber-200'
                        : info.canEnhance
                          ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-black shadow-lg shadow-amber-900/50 hover:from-amber-500 hover:to-amber-400'
                          : 'cursor-not-allowed bg-gray-800 text-gray-500'
                    }`}
                  >
                    {attempting && !instant ? (
                      <motion.span
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                      >
                        ⚒️ Aprimorando...
                      </motion.span>
                    ) : (
                      '⚒️ Aprimorar'
                    )}
                  </button>
                </>
              )}

              {result?.destroyed && (
                <button
                  onClick={onClose}
                  className="w-full rounded-lg bg-gray-800 py-3 font-bold text-gray-300 transition-colors hover:bg-gray-700"
                >
                  Fechar
                </button>
              )}
            </>
          )}

          {!loading && !info && error && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Seletor: inventário do personagem para escolher o item a aprimorar.
              Vindo de uma Pedra Negra, filtra pela categoria que a pedra aprimora. */}
          {(() => {
            const pickable = filterCategory
              ? (items || []).filter((it) => getGearCategory(it.type) === filterCategory)
              : items || [];
            if (pickable.length === 0) {
              return filterCategory ? (
                <div className="mt-5 border-t border-white/10 pt-4 text-center text-sm text-gray-400">
                  Nenhum{filterCategory === 'WEAPON' ? 'a arma' : 'a armadura'} no inventário para esta pedra.
                </div>
              ) : null;
            }
            return (
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {filterCategory
                  ? `Escolha ${filterCategory === 'WEAPON' ? 'a arma' : 'a peça'} para a pedra`
                  : 'Itens do inventário'}
              </div>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                {pickable.map((it) => {
                  const img = resolveImageUrl(it.image);
                  const isSel = it.id === selectedId;
                  return (
                    <button
                      key={it.id}
                      onClick={() => setSelectedId(it.id)}
                      title={`${it.name}${it.enhancementLevel > 0 ? ` ${getLevelLabel(it.enhancementLevel)}` : ''}`}
                      className={`relative aspect-square overflow-hidden rounded-lg border transition-all ${
                        isSel
                          ? 'border-amber-400 ring-2 ring-amber-400/60'
                          : 'border-white/15 hover:border-amber-400/60'
                      }`}
                      style={{ background: 'linear-gradient(160deg, #1c232b, #0d1116)' }}
                    >
                      {img ? (
                        <img src={img} alt={it.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-white">
                          <ItemIcon type={it.type as any} size={22} />
                        </span>
                      )}
                      {it.enhancementLevel > 0 && (
                        <span className="absolute right-0.5 bottom-0.5 text-[10px] font-black text-[#f1d79a]" style={{ textShadow: '0 1px 2px #000' }}>
                          {getLevelLabel(it.enhancementLevel)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })()}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
