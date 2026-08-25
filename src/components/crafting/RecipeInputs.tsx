'use client';

import { useState } from 'react';
import { itemImagePath } from '@/lib/itemCatalog';
import { processingItemEmoji as craftItemEmoji } from '@/lib/processing';
import { whatItemIsMadeOf, CRAFT_BENCH_LABEL, type CraftBench } from '@/lib/craftProduces';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { localizeItemName } from '@/lib/i18n/catalog';

/** Ícone minúsculo de insumo: a arte do item, com o emoji do catálogo de reserva. */
function InputIcon({ name, size = 14 }: { name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span style={{ fontSize: size }} className="leading-none">{craftItemEmoji(name)}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={itemImagePath(name)}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[2px] object-cover art-bright"
      referrerPolicy="no-referrer"
    />
  );
}

/**
 * Insumos de UMA receita, em fichas compactas (ícone + nome + quantidade).
 *
 * A receita é informação de CATÁLOGO: aparece mesmo sem o material na mochila —
 * é justamente sem ter que o jogador precisa saber o que caçar. Quando `have`
 * é passado (dentro das bancadas), a ficha mostra "tenho/preciso" e pinta de
 * vermelho o que falta; sem `have` (cards de item pela interface afora) mostra
 * só "×N".
 */
export function RecipeInputChips({
  inputs,
  have,
  size = 'sm',
}: {
  inputs: { name: string; quantity: number }[];
  have?: (name: string) => number;
  size?: 'sm' | 'xs';
}) {
  const { locale } = useI18n();
  const text = size === 'xs' ? 'text-[9px]' : 'text-[10px]';
  const icon = size === 'xs' ? 12 : 14;
  return (
    <span className="flex flex-wrap gap-1">
      {inputs.map((i) => {
        const owned = have?.(i.name);
        const enough = owned === undefined || owned >= i.quantity;
        return (
          <span
            key={i.name}
            title={localizeItemName(i.name, locale)}
            className={`flex min-w-0 items-center gap-1 rounded-[2px] border border-[#3c3c41] bg-black/40 px-1 py-0.5 ${text} text-white/70`}
          >
            <InputIcon name={i.name} size={icon} />
            <span className="max-w-[76px] truncate">{localizeItemName(i.name, locale)}</span>
            <span className={`font-bold tabular-nums ${enough ? 'text-emerald-300' : 'text-red-300'}`}>
              {owned === undefined ? `×${i.quantity}` : `${owned}/${i.quantity}`}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Bloco "Feito com" dos cards de item (ItemTooltip, CraftItemThumb): todas as
 * receitas que produzem o item, com a bancada que as executa. Some quando o
 * item não sai de bancada nenhuma (espólio puro / item de loja).
 */
export function MadeWithBlock({ name, className = '' }: { name: string; className?: string }) {
  const { t } = useI18n();
  const sources = whatItemIsMadeOf(name);
  if (sources.length === 0) return null;
  return (
    <div className={className}>
      {sources.map((src, idx) => (
        <div key={`${src.bench}-${idx}`} className={idx > 0 ? 'mt-1.5' : undefined}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
            {t('Made with')} · {t(CRAFT_BENCH_LABEL[src.bench as CraftBench])}
            {src.minLevel > 1 ? ` · ${t('lv {n}', { n: src.minLevel })}` : ''}
          </p>
          <RecipeInputChips inputs={src.inputs} />
        </div>
      ))}
    </div>
  );
}
