'use client'

// Mini árvore de habilidades da Jornada: a MESMA geometria por classe do
// astrolábio real (skillTreeLayouts/placeSkillTree — mago=espiral,
// guerreiro=espada, ladino=flecha, monge=mandala), desenhada em SVG puro
// que se ajusta à caixa do slide. Sem interação: é vitrine, não a página.

import React, { useMemo } from 'react'
import { getSkillTree, getSkillPaths } from '@/lib/skillTree'
import { HUB_R, getLayoutForClass, getLayoutDims, placeSkillTree } from '@/lib/skillTreeLayouts'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { localizePathLabel, localizeFormPathLabel } from '@/lib/i18n/combatNames'

const GOLD = '#c9a25f'
const GOLD_BRIGHT = '#e7c682'
const FRAME = '#8a6d3b'

/** Quantos nós de cada caminho aparecem "aprendidos" (dão vida à silhueta). */
const LIT_PER_PATH = 3

function displayPathLabel(label: string, locale: 'en' | 'pt'): string {
  const viaForm = localizeFormPathLabel(label, locale)
  if (viaForm !== label) return viaForm
  return localizePathLabel(label, locale)
}

export default function MiniSkillTree({ classId, form }: { classId: string; form: string }) {
  const { locale } = useI18n()
  const layout = getLayoutForClass(classId)
  const dims = getLayoutDims(layout)
  const placedByPath = useMemo(() => {
    const tree = getSkillTree(classId, form)
    const paths = getSkillPaths(classId, form)
    return placeSkillTree({ tree, paths, classId, layout })
  }, [classId, form, layout])

  return (
    <svg
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {placedByPath.map(({ path, placed, spokeFrom, label }) => {
        const spoke = spokeFrom === null ? null : (spokeFrom ?? dims.hub)
        return (
          <g key={path.id}>
            {placed[0] && spoke && (
              <line
                x1={spoke.x} y1={spoke.y} x2={placed[0].x} y2={placed[0].y}
                stroke={path.accent} strokeWidth={3} strokeLinecap="round" opacity={0.7}
              />
            )}
            {placed.slice(1).map((b, i) => {
              const a = placed[i]
              const lit = i < LIT_PER_PATH - 1
              return (
                <line
                  key={`seg-${b.node.id}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={lit ? path.accent : '#3a3a40'}
                  strokeWidth={lit ? 3.5 : 2.5} strokeLinecap="round"
                  opacity={lit ? 0.9 : 0.5}
                />
              )
            })}
            {placed.map((p, i) => {
              const lit = i < LIT_PER_PATH
              const r = p.isCapstone ? 22 : p.isSpecial ? 18 : 13
              const fill = lit
                ? GOLD
                : p.isSpecial ? '#232328' : '#1c1c20'
              const stroke = lit ? p.accent : '#46464c'
              return (
                <g key={p.node.id} opacity={lit ? 1 : 0.75}>
                  {p.isSpecial ? (
                    <rect
                      x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} rx={4}
                      transform={`rotate(45 ${p.x} ${p.y})`}
                      fill={fill} stroke={stroke} strokeWidth={2.5}
                    />
                  ) : (
                    <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={stroke} strokeWidth={2.5} />
                  )}
                  <text
                    x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                    fontSize={p.isCapstone ? 20 : p.isSpecial ? 17 : 13}
                  >
                    {p.node.icon}
                  </text>
                </g>
              )
            })}
            <text
              x={label.x} y={label.y} textAnchor="middle"
              fontSize={19} fontWeight={700} fill={path.accent}
            >
              {path.icon} {displayPathLabel(path.label, locale)}
            </text>
          </g>
        )
      })}

      {/* Medalhão do hub por cima dos spokes */}
      <circle cx={dims.hub.x} cy={dims.hub.y} r={HUB_R} fill="#17140f" stroke={FRAME} strokeWidth={3} />
      <text
        x={dims.hub.x} y={dims.hub.y} textAnchor="middle" dominantBaseline="central"
        fontSize={30} fill={GOLD_BRIGHT}
      >
        ✦
      </text>
    </svg>
  )
}
