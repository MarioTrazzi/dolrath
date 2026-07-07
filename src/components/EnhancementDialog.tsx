'use client';

// ⚒️ Diálogo de Aprimoramento de Itens — estilo Black Desert
// Painel chumbo com faixas (sem cards flutuantes): material → linha-circuito com a
// chance → moldura em losango ornamentada com o item. Aviso de risco em laranja,
// faixa de stats com "Chance adicionada" dos failstacks e botões em bisel.

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getLevelLabel,
  applyEnhancementToStats,
  getGearCategory,
  getBaseChance,
} from '@/lib/enhancementSystem';
import { itemStatEntries, formatStatValue } from '@/lib/itemStats';
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

// Paleta do painel (chumbo + ouro envelhecido, tirada da referência)
const GOLD = '#c9a25f';
const GOLD_BRIGHT = '#e7c682';
const WARN = '#e09a3a';

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
  // Fases da animação estilo BDO: uma luz sai da pedra, percorre o circuito e,
  // ao chegar no item, ele brilha dourado (sucesso) ou avermelha (falha)
  const [phase, setPhase] = useState<'idle' | 'charging' | 'done'>('idle');
  const [chargeId, setChargeId] = useState(0);

  // A animação de forja sempre roda: de qualquer forma esperamos o servidor
  // processar a tentativa, então o loading "esconde" essa latência e o resultado
  // parece instantâneo (sem dar a impressão de servidor lento).
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
    const minDelay = new Promise((resolve) => setTimeout(resolve, CHARGE_MS));

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
  const chanceColor =
    (info?.chance ?? 0) >= 0.7
      ? 'text-emerald-300'
      : (info?.chance ?? 0) >= 0.3
        ? 'text-amber-300'
        : 'text-red-400';
  const durabilityPct =
    info?.durability !== undefined && info?.maxDurability
      ? Math.round((info.durability / info.maxDurability) * 100)
      : null;
  const isAccessory = info?.category === 'ACCESSORY';

  // Imagem do item para a moldura (banco → asset por nome → ícone genérico).
  const headerImg = info
    ? resolveImageUrl(info.itemImage) ?? (info.itemName ? itemImagePath(info.itemName) : null)
    : null;

  // Imagem do material: pedra pelo nome do catálogo; cópia usa a arte do próprio item.
  const materialImg = info?.material
    ? info.material.kind === 'DUPLICATE'
      ? headerImg
      : itemImagePath(info.material.name)
    : null;

  // Bônus dos failstacks sobre a chance base ("Chance adicionada", como na referência).
  const addedChance =
    info && !info.maxLevel && info.category && info.targetLevel != null && info.chance != null
      ? Math.max(0, info.chance - getBaseChance(info.category, info.targetLevel))
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

  // Placa do slot: mostra o tier ATUAL do item. Só troca quando a luz chega
  // (fase 'done'): sobe no sucesso, mantém/decresce na falha.
  const plateLabel = info
    ? phase === 'done' && result
      ? result.newLevelLabel
      : getLevelLabel(info.currentLevel)
    : '';

  const nameColor =
    info && info.currentLevel >= 16
      ? 'text-orange-400'
      : info && info.currentLevel > 0
        ? 'text-cyan-300'
        : 'text-white';

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
          initial={{ scale: 0.95, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 16 }}
          className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-[4px] border border-[#46464c] bg-[#1e1e21] shadow-2xl shadow-black/80"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Barra de título (faixa em bisel, como na referência) */}
          <div className="flex shrink-0 items-center justify-between border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d] px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-wide text-[#dcdce0]">
              <span style={{ color: GOLD }}>⚒</span> Aprimoramento
            </h2>
            <button
              onClick={onClose}
              className="px-2 py-0.5 text-[#8a8a90] transition-colors hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Corpo rolável */}
          <div className="overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading && (
              <div className="py-12 text-center text-sm text-[#9a9aa0]">
                Consultando o Espírito Negro...
              </div>
            )}

            {!loading && !selectedId && (
              <div className="px-6 py-10 text-center text-sm text-[#b8b8be]">
                <div className="mb-2 text-3xl">⚒</div>
                Selecione abaixo o item que deseja aprimorar.
              </div>
            )}

            {!loading && info && (
              <>
                {/* ✦ Circuito de aprimoramento: material ── chance ──▶ ◆ item */}
                {!result?.destroyed && (
                  <div className="relative px-5 pb-3 pt-6">
                    {/* Névoa dourada atrás da moldura */}
                    <div
                      className="pointer-events-none absolute right-2 top-2 h-32 w-32"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(201,162,95,0.16) 0%, transparent 65%)',
                      }}
                    />
                    <div className="flex items-center gap-1">
                      {/* Material (à esquerda, com contagem) */}
                      {!info.maxLevel && info.material ? (
                        <div className="flex w-[74px] shrink-0 flex-col items-center gap-1.5">
                          <div
                            className={`relative h-14 w-14 rounded-[3px] border p-px shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] ${
                              info.materialAvailable
                                ? 'border-[#8a6d3b] bg-gradient-to-b from-[#26262a] to-[#101013]'
                                : 'border-[#5a2e2e] bg-gradient-to-b from-[#241a1a] to-[#100c0c]'
                            }`}
                          >
                            {materialImg ? (
                              <img
                                src={materialImg}
                                alt={info.material.name}
                                className={`h-full w-full rounded-[2px] object-cover art-bright ${
                                  info.materialAvailable ? '' : 'opacity-40 grayscale'
                                }`}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-white">
                                <ItemIcon type={(info.itemType as any) || 'SWORD'} size={22} />
                              </span>
                            )}
                            <span
                              className={`absolute -bottom-1.5 -right-1.5 rounded-[2px] border border-black/80 px-1 text-[10px] font-bold ${
                                info.materialAvailable
                                  ? 'bg-[#101012] text-[#e7c682]'
                                  : 'bg-[#1c0f0f] text-red-400'
                              }`}
                            >
                              {info.materialCount ?? (info.materialAvailable ? 1 : 0)}
                            </span>
                            {/* Pedra pulsando enquanto a luz é canalizada */}
                            {phase === 'charging' && (
                              <motion.div
                                animate={{ opacity: [0.15, 0.75, 0.15] }}
                                transition={{ duration: 0.75, repeat: Infinity }}
                                className="pointer-events-none absolute -inset-2 z-10"
                                style={{
                                  background:
                                    'radial-gradient(circle, rgba(231,198,130,0.5) 0%, transparent 70%)',
                                }}
                              />
                            )}
                          </div>
                          <span className="w-[74px] text-center text-[10px] leading-tight text-[#9a9aa0]">
                            {info.material.kind === 'DUPLICATE' ? 'Cópia do item' : info.material.name}
                          </span>
                        </div>
                      ) : (
                        <div className="w-[74px] shrink-0" />
                      )}

                      {/* Linha-circuito com nó em losango e a chance flutuando */}
                      <div className="relative min-w-0 flex-1 self-stretch">
                        {!info.maxLevel && (
                          <>
                            <div
                              className="absolute left-0 right-0 top-1/2 h-px"
                              style={{
                                background: `linear-gradient(to right, rgba(201,162,95,0.12), rgba(201,162,95,0.55), rgba(201,162,95,0.8))`,
                              }}
                            />
                            <span
                              className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border bg-[#1e1e21]"
                              style={{ borderColor: GOLD }}
                            />
                            {chancePct && (
                              <div className="absolute inset-x-0 top-1/2 -translate-y-[calc(100%+10px)] text-center">
                                <span className={`text-2xl font-bold tabular-nums ${chanceColor}`}>
                                  {chancePct}%
                                </span>
                              </div>
                            )}
                            <div className="absolute inset-x-0 top-1/2 translate-y-[10px] text-center text-[10px] uppercase tracking-[0.14em] text-[#77777d]">
                              chance
                            </div>
                            {/* 💫 Luz que sai da pedra e percorre o circuito até o item */}
                            {phase === 'charging' && (
                              <motion.span
                                key={chargeId}
                                initial={{ left: '-2%', opacity: 0 }}
                                animate={{ left: ['-2%', '98%'], opacity: [0, 1, 1] }}
                                transition={{ duration: 0.75, repeat: Infinity, ease: 'easeIn' }}
                                className="absolute top-1/2 z-10 h-2 w-2 -translate-y-1/2 rounded-full"
                                style={{
                                  background: GOLD_BRIGHT,
                                  boxShadow:
                                    '0 0 10px 4px rgba(231,198,130,0.85), 0 0 22px 8px rgba(201,162,95,0.35)',
                                }}
                              />
                            )}
                          </>
                        )}
                      </div>

                      {/* ◆ Moldura em losango com o item (elemento-assinatura) */}
                      <motion.div
                        animate={
                          phase === 'done' && result && !result.success
                            ? { x: [0, -7, 7, -5, 5, -2, 2, 0] }
                            : { x: 0 }
                        }
                        transition={{ duration: 0.5 }}
                        className="relative grid h-32 w-32 shrink-0 place-items-center"
                      >
                        {/* Moldura externa (a borda brilha quando a luz chega) */}
                        <motion.div
                          className="absolute inset-[19px] rotate-45 rounded-[3px] border bg-gradient-to-br from-[#2c2620] to-[#141210]"
                          animate={
                            phase === 'done' && result?.success
                              ? {
                                  borderColor: '#e7c682',
                                  boxShadow: [
                                    '0 0 22px rgba(201,162,95,0.28)',
                                    '0 0 48px rgba(231,198,130,0.95)',
                                    '0 0 26px rgba(201,162,95,0.5)',
                                  ],
                                }
                              : phase === 'done' && result
                                ? {
                                    borderColor: '#7a2222',
                                    boxShadow: [
                                      '0 0 22px rgba(201,162,95,0.28)',
                                      '0 0 26px rgba(120,15,15,0.6)',
                                      '0 0 16px rgba(120,15,15,0.35)',
                                    ],
                                  }
                                : {
                                    borderColor: '#8a6d3b',
                                    boxShadow: '0 0 22px rgba(201,162,95,0.28)',
                                  }
                          }
                          transition={{ duration: 0.9 }}
                        />
                        {/* Janela interna que recorta a arte */}
                        <div
                          className="absolute inset-[30px] rotate-45 overflow-hidden rounded-[2px] border bg-black"
                          style={{ borderColor: 'rgba(201,162,95,0.55)' }}
                        >
                          {headerImg ? (
                            <img
                              src={headerImg}
                              alt={info.itemName || ''}
                              className="absolute left-1/2 top-1/2 h-[142%] w-[142%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-45 object-cover art-bright"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45 text-white">
                              <ItemIcon type={(info.itemType as any) || 'SWORD'} size={30} />
                            </span>
                          )}
                        </div>
                        {/* Cravos nos 4 vértices */}
                        {[
                          'left-1/2 top-[13px] -translate-x-1/2',
                          'left-1/2 bottom-[13px] -translate-x-1/2',
                          'top-1/2 left-[13px] -translate-y-1/2',
                          'top-1/2 right-[13px] -translate-y-1/2',
                        ].map((pos) => (
                          <span
                            key={pos}
                            className={`absolute ${pos} h-[7px] w-[7px] rotate-45 border border-[#8a6d3b] bg-[#1e1e21]`}
                          />
                        ))}
                        {/* Placa do nível ATUAL no vértice inferior — só troca quando a luz chega */}
                        {plateLabel && (
                          <motion.span
                            key={plateLabel}
                            initial={{ scale: 1.7, filter: 'brightness(2.2)' }}
                            animate={{ scale: 1, filter: 'brightness(1)' }}
                            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                            className="absolute bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-[2px] border px-1.5 text-[11px] font-black"
                            style={{
                              borderColor: '#8a6d3b',
                              background: '#141210',
                              color: GOLD_BRIGHT,
                            }}
                          >
                            {plateLabel}
                          </motion.span>
                        )}
                        {/* Veredito no próprio slot: explosão dourada ou vermelho p/ dentro */}
                        <AnimatePresence>
                          {phase === 'done' && result?.success && (
                            <motion.div
                              key={`burst-${chargeId}`}
                              initial={{ opacity: 0, scale: 0.4 }}
                              animate={{ opacity: [0, 1, 0], scale: [0.4, 1.5, 2.1] }}
                              transition={{ duration: 1 }}
                              className="pointer-events-none absolute -inset-8 z-20"
                              style={{
                                background:
                                  'radial-gradient(circle, rgba(231,198,130,0.9) 0%, rgba(201,162,95,0.35) 40%, transparent 70%)',
                              }}
                            />
                          )}
                          {phase === 'done' && result && !result.success && (
                            <motion.div
                              key={`fail-${chargeId}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: [0, 1, 0.7, 0] }}
                              transition={{ duration: 1.6, times: [0, 0.25, 0.6, 1] }}
                              className="pointer-events-none absolute inset-[19px] z-20 rotate-45 rounded-[3px]"
                              style={{
                                boxShadow: 'inset 0 0 28px 12px rgba(120,12,12,0.85)',
                                background:
                                  'radial-gradient(circle, transparent 30%, rgba(90,10,10,0.45) 100%)',
                              }}
                            />
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </div>

                    {/* Nome do item + progressão de nível */}
                    <div className="mt-2 text-center">
                      <div className={`text-[15px] font-semibold leading-tight ${nameColor}`}>
                        {info.itemName || info.displayName}
                      </div>
                      {!info.maxLevel ? (
                        <div className="mt-1 text-sm font-bold">
                          <span className="text-[#8a8a90]">
                            {getLevelLabel(info.currentLevel) || 'Base'}
                          </span>
                          <span className="mx-2" style={{ color: GOLD }}>
                            ❯❯
                          </span>
                          <span style={{ color: GOLD_BRIGHT }}>{info.targetLabel}</span>
                        </div>
                      ) : (
                        <div className="mt-1 text-sm font-semibold text-orange-400">
                          🏆 Nível máximo alcançado (V)
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!info.maxLevel && !result?.destroyed && (
                  <>
                    {/* Avisos de risco (texto corrido em laranja, como na referência) */}
                    <div className="space-y-1 px-5 pb-4 text-[12.5px] leading-snug">
                      <p style={{ color: isAccessory ? '#e05252' : WARN }}>{info.risk}</p>
                      <p className="text-[#77777d]">
                        Consome 1× {info.material?.kind === 'DUPLICATE'
                          ? `cópia de ${info.material.name}`
                          : info.material?.name}{' '}
                        por tentativa.
                        {!info.materialAvailable && (
                          <span className="font-semibold text-red-400"> Você não possui o material.</span>
                        )}
                      </p>
                    </div>

                    {/* Faixa de valores: prévia de stats + failstacks + chance adicionada */}
                    <div className="border-y border-black/60 bg-[#19191c] px-5 py-3">
                      {statComparison.length > 0 && (
                        <div className="mb-1 space-y-1">
                          {statComparison.map((s) => {
                            const delta = Math.round((s.to - s.from) * 10) / 10;
                            return (
                              <div
                                key={s.key}
                                className="flex items-center justify-between gap-2 border-b border-white/5 pb-1 text-[13px] last:border-0"
                              >
                                <span className="flex items-center gap-1.5 text-[#c9c9ce]">
                                  <span className="text-[9px]" style={{ color: GOLD }}>
                                    ✦
                                  </span>
                                  {s.label}
                                </span>
                                <span className="flex items-center gap-1.5 font-semibold tabular-nums">
                                  <span className="text-[#8a8a90]">{formatStatValue(s.from)}</span>
                                  <span style={{ color: GOLD }}>→</span>
                                  <span className="text-emerald-300">{formatStatValue(s.to)}</span>
                                  {delta !== 0 && (
                                    <span
                                      className={`text-[11px] ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}
                                    >
                                      ({delta > 0 ? '+' : ''}
                                      {formatStatValue(delta)})
                                    </span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 text-[13px]">
                        <span className="text-[#c9c9ce]">Failstacks</span>
                        <span className="font-bold text-purple-300">🔥 {info.failstacks}</span>
                      </div>
                      {addedChance !== null && addedChance > 0 && (
                        <div className="mt-1.5 flex items-center justify-between border-t border-white/5 pt-1.5 text-[13px]">
                          <span className="font-semibold" style={{ color: GOLD_BRIGHT }}>
                            Chance adicionada
                          </span>
                          <span className="flex items-center gap-2 font-bold tabular-nums">
                            <span style={{ color: GOLD }}>❯❯❯</span>
                            <span style={{ color: GOLD_BRIGHT }}>
                              +{(addedChance * 100).toFixed(1)}%
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Durabilidade (não se aplica a acessórios) */}
                    {!isAccessory && durabilityPct !== null && (
                      <div className="px-5 py-3">
                        <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wide text-[#8a8a90]">
                          <span>Durabilidade</span>
                          <span className="tabular-nums">
                            {info.durability}/{info.maxDurability}
                          </span>
                        </div>
                        <div className="h-[7px] overflow-hidden rounded-[2px] border border-black/70 bg-[#101013]">
                          <div
                            className={`h-full transition-all ${
                              durabilityPct > 50
                                ? 'bg-gradient-to-r from-[#8a6d3b] to-[#c9a25f]'
                                : durabilityPct > 20
                                  ? 'bg-gradient-to-r from-amber-700 to-amber-500'
                                  : 'bg-gradient-to-r from-red-800 to-red-600'
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
                              className="rounded-[3px] border border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] px-3 py-1 text-xs font-semibold text-[#c9c9ce] transition-colors hover:border-[#8a6d3b] hover:text-white"
                            >
                              🔧 Reparar (1 cópia)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ⚒️ Veredito da forja: a animação acontece no próprio slot; aqui só o texto */}
                {phase !== 'idle' && (
                  <div className="px-5 pb-2 pt-1">
                    <div className="mb-1 text-center text-sm font-semibold">
                      {phase === 'charging' && (
                        <motion.span
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 0.7 }}
                          style={{ color: GOLD_BRIGHT }}
                        >
                          ⚒ Forjando...
                        </motion.span>
                      )}
                      {phase === 'done' && result?.success && (
                        <span style={{ color: GOLD_BRIGHT }}>✨ SUCESSO!</span>
                      )}
                      {phase === 'done' && !result?.success && (
                        <span className={result?.destroyed ? 'text-red-400' : 'text-orange-400'}>
                          {result?.destroyed ? '💔 DESTRUÍDO!' : '💥 FALHOU!'}
                        </span>
                      )}
                    </div>

                    {/* Mensagem do resultado */}
                    {phase === 'done' && result && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`text-center text-sm font-bold ${
                          result.success
                            ? 'text-emerald-300'
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
                )}

                {error && (
                  <div className="mx-4 mb-3 rounded-[3px] border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                    {error}
                  </div>
                )}

                {/* Botão principal em bisel (faixa inferior, como na referência) */}
                {!info.maxLevel && !result?.destroyed && (
                  <div className="px-4 pb-4 pt-1">
                    <button
                      onClick={handleEnhance}
                      disabled={attempting || !info.canEnhance}
                      className={`w-full rounded-[3px] border py-2.5 text-[15px] font-semibold tracking-wide transition-all ${
                        attempting
                          ? 'cursor-wait border-[#8a6d3b]/50 bg-[#241f16] text-[#c9a25f]'
                          : info.canEnhance
                            ? 'border-[#8a6d3b] bg-gradient-to-b from-[#3a3325] to-[#241f16] text-[#e7c682] shadow-[inset_0_1px_0_rgba(231,198,130,0.25),0_0_14px_rgba(201,162,95,0.2)] hover:border-[#c9a25f] hover:from-[#4a4030] hover:to-[#2c261a]'
                            : 'cursor-not-allowed border-[#3c3c41] bg-[#1a1a1d] text-[#57575c]'
                      }`}
                    >
                      {attempting ? (
                        <motion.span
                          animate={{ opacity: [1, 0.4, 1] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                        >
                          ⚒ Aprimorando...
                        </motion.span>
                      ) : (
                        '⚒ Aprimoramento'
                      )}
                    </button>
                  </div>
                )}

                {result?.destroyed && (
                  <div className="px-4 pb-4 pt-1">
                    <button
                      onClick={onClose}
                      className="w-full rounded-[3px] border border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] py-2.5 font-semibold text-[#c9c9ce] transition-colors hover:border-[#8a8a90] hover:text-white"
                    >
                      Fechar
                    </button>
                  </div>
                )}
              </>
            )}

            {!loading && !info && error && (
              <div className="mx-4 my-4 rounded-[3px] border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-300">
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
                  <div className="border-t border-black/60 bg-[#19191c] px-4 py-4 text-center text-sm text-[#8a8a90]">
                    Nenhum{filterCategory === 'WEAPON' ? 'a arma' : 'a armadura'} no inventário para esta pedra.
                  </div>
                ) : null;
              }
              return (
                <div className="border-t border-black/60 bg-[#19191c] px-4 py-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a8a90]">
                    {filterCategory
                      ? `Escolha ${filterCategory === 'WEAPON' ? 'a arma' : 'a peça'} para a pedra`
                      : 'Itens do inventário'}
                  </div>
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                    {pickable.map((it) => {
                      const img = resolveImageUrl(it.image) ?? (it.name ? itemImagePath(it.name) : null);
                      const isSel = it.id === selectedId;
                      return (
                        <button
                          key={it.id}
                          onClick={() => setSelectedId(it.id)}
                          title={`${it.name}${it.enhancementLevel > 0 ? ` ${getLevelLabel(it.enhancementLevel)}` : ''}`}
                          className={`relative aspect-square overflow-hidden rounded-[3px] border transition-all ${
                            isSel
                              ? 'border-[#c9a25f] shadow-[0_0_10px_rgba(201,162,95,0.4)]'
                              : 'border-[#3c3c41] hover:border-[#8a6d3b]'
                          }`}
                          style={{ background: 'linear-gradient(160deg, #232327, #101013)' }}
                        >
                          {img ? (
                            <img src={img} alt={it.name} className="h-full w-full object-cover art-bright" referrerPolicy="no-referrer" />
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
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
