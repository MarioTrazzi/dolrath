'use client';

/**
 * 🌳 SkillTreePanel — árvore de habilidades como um ASTROLÁBIO FORJADO, presentacional
 * PURO (zero fetch; padrão KingdomMap): o container passa tree/purchased/pontos e recebe
 * onSpend(nodeId). Testável sem DB em /dev/skill-tree-mock.
 *
 * Layout por classe (ver skillTreeLayouts): mago=espiral, guerreiro=swastika,
 * ladino=seta, monge=anel. Medalhão central + 4 braços com acento próprio.
 *
 * Estados do nó: aprendido (ouro vivo + brilho) · disponível (borda ouro, anel pulsando
 * se dá pra pagar) · bloqueado (chumbo apagado).
 */
import { useMemo, useState } from 'react';
import {
  type SkillNode,
  type SkillPathInfo,
  canPurchase,
} from '@/lib/skillTree';
import {
  VB,
  CENTER,
  HUB_R,
  getLayoutForClass,
  placeSkillTree,
  outwardLabelPos,
  type SkillTreeLayoutKind,
} from '@/lib/skillTreeLayouts';

const GOLD = '#c9a25f';
const GOLD_BRIGHT = '#e7c682';
const FRAME = '#8a6d3b';
const GUNMETAL = '#46464c';
const PANEL_BG = 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))';
const TITLEBAR_BG = 'linear-gradient(180deg, #2b2b2f, #1a1a1d)';

export interface SkillTreePanelProps {
  tree: SkillNode[];
  paths: SkillPathInfo[];
  purchased: string[];
  availablePoints: number;
  onSpend: (nodeId: string) => void;
  busy?: boolean;
  /** Classe do personagem — escolhe a geometria (espiral / swastika / seta / anel). */
  classId?: string;
}

/** Quantas estrelas o nó "vale" (rank do especial). Atributos não têm. */
function starCount(node: SkillNode): number {
  if (node.effect.rank) return node.effect.rank.rank;
  if (node.cost > 1) return 3; // capstone
  if (node.kind === 'skill') return 1;
  if (node.kind === 'passive') return 2;
  return 0;
}

const KIND_LABEL: Record<SkillNode['kind'], string> = {
  stat: 'Atributo',
  skill: 'Habilidade',
  upgrade: 'Aprimoramento',
  passive: 'Passiva',
};

export default function SkillTreePanel({ tree, paths, purchased, availablePoints, onSpend, busy, classId }: SkillTreePanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const owned = useMemo(() => new Set(purchased), [purchased]);
  const layout = useMemo<SkillTreeLayoutKind>(() => getLayoutForClass(classId), [classId]);

  const placedByPath = useMemo(
    () => placeSkillTree({ tree, paths, classId, layout }),
    [tree, paths, classId, layout],
  );

  const allPlaced = useMemo(() => placedByPath.flatMap(p => p.placed), [placedByPath]);

  const selected = selectedId ? tree.find(n => n.id === selectedId) || null : null;
  const selectedCheck = selected ? canPurchase(tree, purchased, selected.id, availablePoints) : null;
  const selectedOwned = selected ? owned.has(selected.id) : false;
  const selectedPlaced = selected ? allPlaced.find(p => p.node.id === selected.id) || null : null;

  const pct = (v: number) => `${(v / VB) * 100}%`;
  const showRings = layout === 'spiral' || layout === 'ring';

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${FRAME}`, background: PANEL_BG }}>
      {/* Barra de título (mesmo padrão das janelas da ficha) */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2" style={{ background: TITLEBAR_BG, borderBottom: `1px solid ${FRAME}` }}>
        <div className="flex items-center gap-2">
          <span aria-hidden>🌳</span>
          <span className="font-bold tracking-wide text-sm sm:text-base" style={{ color: GOLD_BRIGHT }}>
            Árvore de Habilidades
          </span>
        </div>
        <div
          className="px-2.5 py-1 rounded-md text-xs sm:text-sm font-bold"
          style={{ border: `1px solid ${availablePoints > 0 ? GOLD : GUNMETAL}`, color: availablePoints > 0 ? GOLD_BRIGHT : '#9a9aa2', background: 'rgba(0,0,0,0.35)' }}
        >
          ✦ Pontos × {availablePoints}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* ✦ ASTROLÁBIO — canvas quadrado com geometria por classe */}
        <div className="flex-1 min-w-0 p-3 sm:p-4">
          <div
            className="relative mx-auto w-full aspect-square select-none"
            style={{
              maxWidth: 560,
              containerType: 'inline-size',
              background:
                'radial-gradient(circle at 50% 50%, rgba(201,162,95,0.10) 0%, rgba(201,162,95,0.03) 34%, transparent 62%)',
            }}
          >
            {/* Camada de conectores + guias de fundo */}
            <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 h-full w-full" aria-hidden>
              {showRings &&
                [0.28, 0.52, 0.76, 0.98].map((f, i) => (
                  <circle key={i} cx={CENTER} cy={CENTER} r={HUB_R + (VB / 2 - HUB_R) * f}
                    fill="none" stroke="rgba(201,162,95,0.06)" strokeWidth={1} />
                ))}
              {layout === 'swastika' && (
                <>
                  <line x1={CENTER} y1={80} x2={CENTER} y2={VB - 80} stroke="rgba(201,162,95,0.05)" strokeWidth={1} />
                  <line x1={80} y1={CENTER} x2={VB - 80} y2={CENTER} stroke="rgba(201,162,95,0.05)" strokeWidth={1} />
                </>
              )}
              {layout === 'arrow' && (
                <>
                  <line x1={CENTER} y1={CENTER} x2={CENTER} y2={70} stroke="rgba(201,162,95,0.06)" strokeWidth={1} />
                  <line x1={CENTER} y1={CENTER} x2={120} y2={120} stroke="rgba(201,162,95,0.05)" strokeWidth={1} />
                  <line x1={CENTER} y1={CENTER} x2={VB - 120} y2={120} stroke="rgba(201,162,95,0.05)" strokeWidth={1} />
                </>
              )}

              {placedByPath.map(({ path, placed }) => {
                const segs: React.ReactNode[] = [];
                if (placed[0]) {
                  const p0 = placed[0];
                  const lit = owned.has(p0.node.id);
                  segs.push(
                    <line key={`${path.id}-spoke`} x1={CENTER} y1={CENTER} x2={p0.x} y2={p0.y}
                      stroke={lit ? path.accent : 'rgba(90,90,98,0.5)'} strokeWidth={lit ? 3 : 2}
                      strokeLinecap="round" opacity={lit ? 0.85 : 0.5} />
                  );
                }
                for (let i = 1; i < placed.length; i++) {
                  const a = placed[i - 1];
                  const b = placed[i];
                  const bOwned = owned.has(b.node.id);
                  const aOwned = owned.has(a.node.id);
                  const color = bOwned || aOwned ? path.accent : '#3a3a40';
                  const op = bOwned ? 0.95 : aOwned ? 0.5 : 0.45;
                  segs.push(
                    <g key={`${path.id}-seg-${i}`}>
                      {bOwned && (
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={path.accent}
                          strokeWidth={9} strokeLinecap="round" opacity={0.18} />
                      )}
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color}
                        strokeWidth={bOwned ? 3.5 : 2.5} strokeLinecap="round" opacity={op} />
                    </g>
                  );
                }
                return <g key={path.id}>{segs}</g>;
              })}
            </svg>

            {/* Medalhão central (a "assinatura" — o núcleo de poder) */}
            <div
              className="absolute grid place-items-center rounded-full text-center"
              style={{
                left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                width: `${(HUB_R * 2 / VB) * 100}cqw`, height: `${(HUB_R * 2 / VB) * 100}cqw`,
                background: 'radial-gradient(circle at 38% 30%, #2f2a20, #17140f 70%)',
                border: `2px solid ${FRAME}`,
                boxShadow: `0 0 18px rgba(201,162,95,0.25), inset 0 0 14px rgba(0,0,0,0.8)`,
              }}
            >
              <div style={{ lineHeight: 1 }}>
                <div style={{ color: GOLD_BRIGHT, fontWeight: 900, fontSize: '7cqw' }} className="tabular-nums">
                  {availablePoints}
                </div>
                <div style={{ color: '#9a9aa2', fontSize: '2.6cqw', letterSpacing: '0.12em' }} className="uppercase">
                  pontos
                </div>
              </div>
            </div>

            {/* Rótulos de caminho — offset radial para fora do último nó */}
            {placedByPath.map(({ path, placed }) => {
              const tip = placed[placed.length - 1];
              if (!tip) return null;
              const label = outwardLabelPos(tip);
              return (
                <div
                  key={`lbl-${path.id}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold"
                  style={{
                    left: pct(label.x), top: pct(label.y),
                    fontSize: '2.7cqw', color: path.accent,
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                  }}
                >
                  <span aria-hidden className="mr-0.5">{path.icon}</span>
                  {path.label}
                </div>
              );
            })}

            {/* Nós */}
            {allPlaced.map(({ node, accent, x, y, isSpecial, isCapstone }) => {
              const isOwned = owned.has(node.id);
              const available = !isOwned && canPurchase(tree, purchased, node.id, Infinity).ok;
              const affordable = available && availablePoints >= node.cost;
              const isSelected = selectedId === node.id;

              const size = isCapstone ? 10 : isSpecial ? 8 : 6;
              const borderCol = isSelected ? GOLD_BRIGHT : isOwned ? GOLD_BRIGHT : available ? GOLD : GUNMETAL;
              const glow = isSelected
                ? `0 0 16px ${GOLD}`
                : isOwned
                  ? `0 0 12px ${accent}88`
                  : 'none';
              const fill = isOwned
                ? `radial-gradient(circle at 35% 28%, ${GOLD_BRIGHT}, ${GOLD} 52%, ${FRAME})`
                : 'radial-gradient(circle at 35% 28%, #2c2c31, #1c1c20 62%, #131316)';
              const opacity = isOwned || available ? 1 : 0.4;

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  title={node.name}
                  aria-label={node.name}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:z-20 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e7c682]"
                  style={{ left: pct(x), top: pct(y), width: `${size}cqw`, height: `${size}cqw`, zIndex: isSelected ? 20 : 10, opacity }}
                >
                  {affordable && !isSelected && (
                    <span
                      className="pointer-events-none absolute inset-0 animate-ping rounded-full motion-reduce:animate-none"
                      style={{ border: `2px solid ${GOLD}`, borderRadius: isSpecial ? '14%' : '26%' }}
                    />
                  )}

                  {isSpecial ? (
                    <span className="absolute inset-0">
                      <span
                        className="absolute inset-[12%] rotate-45"
                        style={{ borderRadius: '10%', border: `2px solid ${borderCol}`, background: fill, boxShadow: glow }}
                      />
                      {['left-1/2 top-0 -translate-x-1/2 -translate-y-1/2',
                        'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2',
                        'top-1/2 left-0 -translate-y-1/2 -translate-x-1/2',
                        'top-1/2 right-0 -translate-y-1/2 translate-x-1/2'].map(p => (
                        <span key={p} className={`absolute ${p} rotate-45`}
                          style={{ width: '16%', height: '16%', background: '#17140f', border: `1px solid ${isOwned ? GOLD : FRAME}` }} />
                      ))}
                      <span className="absolute inset-0 grid place-items-center" style={{ fontSize: isCapstone ? '4.4cqw' : '3.6cqw' }} aria-hidden>
                        {node.icon}
                      </span>
                      {node.effect.rank && (
                        <span className="absolute -right-1 -top-1 rounded-[3px] px-1 font-black"
                          style={{ fontSize: '2.4cqw', background: '#141210', border: `1px solid ${GOLD}`, color: GOLD_BRIGHT }}>
                          {node.effect.rank.rank === 3 ? 'III' : 'II'}
                        </span>
                      )}
                      {isCapstone && (
                        <span className="absolute -right-1 -top-1 rounded-full px-1 font-black"
                          style={{ fontSize: '2.4cqw', background: '#141210', border: `1px solid ${GOLD}`, color: GOLD_BRIGHT }}>
                          2✦
                        </span>
                      )}
                    </span>
                  ) : (
                    <span
                      className="absolute inset-0 grid place-items-center"
                      style={{
                        borderRadius: '24%', border: `2px solid ${borderCol}`, background: fill,
                        boxShadow: `${glow}, inset 0 0 6px rgba(0,0,0,0.7)`,
                        fontSize: '3cqw',
                      }}
                      aria-hidden
                    >
                      {node.icon}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 📜 Painel de detalhe estilo Child of Light (grudado no topo da coluna) */}
        <div className="lg:w-72 lg:shrink-0 border-t lg:border-t-0 lg:border-l p-3 sm:p-4"
          style={{ borderColor: FRAME, background: 'rgba(0,0,0,0.22)' }}>
          {selected ? (
            <div className="lg:sticky lg:top-4">
              {starCount(selected) > 0 && (
                <div className="mb-1.5 text-sm tracking-widest" style={{ color: GOLD }}>
                  {'★'.repeat(starCount(selected))}
                  <span style={{ color: '#3f3f45' }}>{'★'.repeat(3 - starCount(selected))}</span>
                </div>
              )}

              <div className="flex items-start gap-2">
                <span className="text-2xl leading-none" aria-hidden>{selected.icon}</span>
                <div className="min-w-0">
                  <div className="font-bold leading-tight" style={{ color: selectedPlaced?.accent || GOLD_BRIGHT }}>
                    {selected.name}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#9a9aa2' }}>
                    {KIND_LABEL[selected.kind]} · Tier {selected.tier}
                  </div>
                </div>
              </div>

              <p className="mt-2.5 text-xs sm:text-sm leading-relaxed" style={{ color: '#dcdce0' }}>
                {selected.desc}
              </p>

              {!selectedOwned && !selectedCheck?.ok && (
                <p className="mt-2 text-[11px]" style={{ color: '#c98a5f' }}>⚠ {selectedCheck?.reason}</p>
              )}

              <div className="pt-4">
                {selectedOwned ? (
                  <div className="w-full rounded-lg py-2.5 text-center text-sm font-bold"
                    style={{ border: `1px solid ${GOLD}`, color: GOLD_BRIGHT, background: 'rgba(201,162,95,0.08)' }}>
                    ✓ Aprendido
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !selectedCheck?.ok}
                    onClick={() => onSpend(selected.id)}
                    className="w-full rounded-lg py-2.5 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                    style={{
                      background: selectedCheck?.ok ? `linear-gradient(180deg, ${GOLD_BRIGHT}, ${GOLD})` : '#2c2c31',
                      color: selectedCheck?.ok ? '#1b1b1f' : '#9a9aa2',
                      border: `1px solid ${selectedCheck?.ok ? FRAME : GUNMETAL}`,
                    }}
                  >
                    {busy ? 'Aprendendo…' : `Aprender · ${selected.cost} pt${selected.cost > 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-center">
              <span className="text-3xl opacity-60" aria-hidden>🌀</span>
              <p className="mt-2 text-xs sm:text-sm" style={{ color: '#9a9aa2' }}>
                Toque num nó do astrolábio para ver o detalhe.
              </p>
              <p className="mt-1 text-[11px]" style={{ color: '#77777d' }}>
                Os anéis pulsando estão prontos para aprender.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
