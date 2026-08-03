'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { FREE_RESTORE_MAX_LEVEL } from '@/lib/restoreCost';
import { buyGoldOnChain, isInsufficientGold, parseNeededGold } from '@/lib/buyGold';
import { confirmBuyGold } from '@/lib/buyGoldPrompt';

/**
 * ⚗️ Bancada de Restauração da Alquimista.
 *
 * HP e MP sobrevivem à run (o /finish salva a fração com que o herói saiu), e
 * esta é a única forma de voltar ao cheio de uma vez. Gratuita até o nível 6 —
 * no early game a run rende pouco ouro e cobrar criaria um beco sem saída.
 *
 * O preço vem SEMPRE do servidor (GET da rota). Aqui só exibimos.
 */

interface RestoreState {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  cost: number;
  free: boolean;
  alreadyFull: boolean;
  freeUntilLevel: number;
}

function PoolBar({
  icon,
  label,
  value,
  max,
  gradient,
}: {
  icon: string;
  label: string;
  value: number;
  max: number;
  gradient: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-semibold text-[#ece7da]">
          {icon} {label}
        </span>
        <span className="text-[#8a8a90] tabular-nums">
          {Math.round(value)} / {Math.round(max)}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[#101013] border border-[#3c3c41] overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function RestorationBench({
  characterId,
  refreshSignal,
  onChanged,
}: {
  characterId?: string;
  /** Muda quando algo externo mexeu no personagem (compra, reparo). */
  refreshSignal?: number;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<RestoreState | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchState = useCallback(async () => {
    if (!characterId) {
      setState(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/character/${characterId}/restore`, { cache: 'no-store' });
      if (!res.ok) {
        setState(null);
        return;
      }
      setState(await res.json());
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    fetchState();
  }, [fetchState, refreshSignal]);

  const handleRestore = async () => {
    if (!characterId || restoring) return;
    setRestoring(true);
    try {
      // Sem ouro na mão → oferece a recarga on-chain do que falta e refaz,
      // mesmo fluxo da loja e das bancadas de profissão.
      const attempt = async () => {
        const res = await fetch(`/api/character/${characterId}/restore`, { method: 'POST' });
        const data = await res.json().catch(() => null);
        return { res, data };
      };

      let { res, data } = await attempt();
      if (!res.ok && isInsufficientGold(data?.error)) {
        const needed = parseNeededGold(data?.error);
        if (needed && (await confirmBuyGold(needed))) {
          const credited = await buyGoldOnChain({ characterId, amountGold: needed });
          if (credited) ({ res, data } = await attempt());
        }
      }

      if (!res.ok) {
        toast.error(data?.error || t('Could not restore.'));
        return;
      }
      toast.success(data?.message || t('Restored!'));
      await fetchState();
      onChanged?.();
    } catch {
      toast.error(t('Connection error.'));
    } finally {
      setRestoring(false);
    }
  };

  if (!characterId) return null;

  const busy = loading && !state;
  const full = !!state?.alreadyFull;
  const free = !!state?.free;
  const freeUntil = state?.freeUntilLevel ?? FREE_RESTORE_MAX_LEVEL;

  return (
    <div
      className="relative overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60 p-5"
      style={{ background: 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))' }}
    >
      <h2 className="text-2xl font-black text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] mb-2">
        {t('⚗️ Restoration')}
      </h2>
      <p className="text-sm text-white/60 mb-4">
        {t('Health and mana carry over between dungeon runs. The alchemist brings both back to full at once — potions are the alternative, and the only option mid-fight.')}
      </p>

      {busy ? (
        <div className="text-white/50 text-sm py-6 text-center">{t('Reading your pulse…')}</div>
      ) : !state ? (
        <div className="text-white/50 text-sm py-6 text-center">{t('Select a character.')}</div>
      ) : (
        <>
          <div className="flex flex-col gap-3 mb-4">
            <PoolBar icon="❤️" label={t('Health')} value={state.hp} max={state.maxHp} gradient="from-red-600 to-rose-400" />
            <PoolBar icon="💧" label={t('Mana')} value={state.mp} max={state.maxMp} gradient="from-sky-600 to-cyan-400" />
          </div>

          <button
            type="button"
            onClick={handleRestore}
            disabled={full || restoring}
            className={`w-full py-3 rounded-[3px] font-black text-sm transition-all ${
              full
                ? 'bg-[#1a1a1d] text-[#57575c] border border-[#3c3c41] cursor-not-allowed'
                : 'text-[#100d06] bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 hover:scale-[1.01] active:scale-[0.99]'
            }`}
          >
            {restoring
              ? t('Restoring…')
              : full
                ? t('⚗️ You are whole')
                : free
                  ? t('⚗️ Restore Health and Mana — Free')
                  : t('⚗️ Restore Health and Mana — {cost} 🪙', { cost: state.cost })}
          </button>

          <p className="text-[11px] text-white/40 mt-2 leading-snug">
            {free
              ? t('Free through level {level}; after that the alchemist charges for the service.', { level: freeUntil })
              : t('The price follows how much is missing and your level.')}
          </p>
        </>
      )}
    </div>
  );
}
