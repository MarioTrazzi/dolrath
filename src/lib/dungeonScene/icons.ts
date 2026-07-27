// ============================================================
// Ícones dos nós — SVG desenhado direto no canvas via Path2D.
//
// Path2D aceita a sintaxe de `d` do SVG, então o ícone é só uma string: sem
// carregar arquivo, sem rede, e a cor é escolhida na hora (o mesmo ícone serve
// aceso e apagado). São PLACEHOLDERS para testar a leitura do mapa — quando a
// arte real chegar, troca-se a string (ou o sprite) sem mexer no resto.
//
// Convenção: todos os paths desenham num viewBox 24×24.
// ============================================================

import type { NodeFlavor } from './nodeContents'

interface IconDef {
  /** Silhueta principal (pintada com a cor do nó). */
  body: string
  /** Detalhe pintado por cima em tom escuro (olhos, fechadura...). */
  detail?: string
  color: string
}

export const NODE_ICONS: Record<NodeFlavor, IconDef> = {
  monster: {
    body: 'M12 21c-4.6 0-8.3-3.3-8.3-7.4 0-2 .9-3.9 2.4-5.3L4.6 3.4l4.6 3A9.6 9.6 0 0 1 12 6c1 0 2 .1 2.8.4l4.6-3-1.5 4.9c1.5 1.4 2.4 3.3 2.4 5.3 0 4.1-3.7 7.4-8.3 7.4z',
    detail:
      'M9 12.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM15 12.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM8.6 17h6.8l-1.7 1.7h-3.4z',
    color: '#e2554a',
  },
  boss: {
    body: 'M12 2.5c-4.8 0-8.6 3.6-8.6 8.1 0 2.7 1.4 5.1 3.6 6.6v3.3c0 .6.4 1 1 1h8c.6 0 1-.4 1-1v-3.3c2.2-1.5 3.6-3.9 3.6-6.6 0-4.5-3.8-8.1-8.6-8.1z',
    detail:
      'M8.6 9.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM15.4 9.2a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM10.6 15.5h2.8l-.7 2.3h-1.4z',
    color: '#f3a712',
  },
  chest: {
    body: 'M3.5 10.5h17V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19zM3.5 10.5V8A3.5 3.5 0 0 1 7 4.5h10A3.5 3.5 0 0 1 20.5 8v2.5z',
    detail: 'M10.6 9h2.8v4.6h-2.8z',
    color: '#f0c14b',
  },
  rubble: {
    body: 'M3 20l4.2-6.4L11.4 20zM10.8 20l3.4-5.2L17.6 20zM6.6 13.2l2.6-4 2.6 4zM15.4 13.6l2.2-3.4 2.2 3.4z',
    color: '#b8a888',
  },
  herb: {
    body: 'M11.3 21h1.4v-8.4h-1.4zM12.6 12.4c-.2-3.2 1.6-5.6 5-6.4.3 3.4-1.6 6-5 6.4zM11.4 14.2c-3.4-.4-5.3-3-5-6.4 3.4.8 5.2 3.2 5 6.4z',
    color: '#7ad17a',
  },
  fountain: {
    body: 'M4 17.6h16L18.6 21H5.4zM7.8 16.6a4.2 4.2 0 0 1 8.4 0zM11.3 3h1.4v9.4h-1.4z',
    detail: 'M8.4 6.2h2.2v1.3H8.4zM13.4 6.2h2.2v1.3h-2.2z',
    color: '#6fc8e0',
  },
}

/** Rótulo curto (bancada e, depois, o card do encontro). */
export const FLAVOR_LABEL: Record<NodeFlavor, string> = {
  monster: 'Monstros',
  boss: 'Chefe',
  chest: 'Baú',
  rubble: 'Entulho',
  herb: 'Moita de ervas',
  fountain: 'Fonte',
}

// Path2D só existe no browser — cria sob demanda e guarda.
const PATH_CACHE = new Map<string, Path2D>()

function pathOf(d: string): Path2D {
  let p = PATH_CACHE.get(d)
  if (!p) {
    p = new Path2D(d)
    PATH_CACHE.set(d, p)
  }
  return p
}

/** Desenha o ícone centrado em (cx, cy) com `size` px de altura. */
export function drawNodeIcon(
  ctx: CanvasRenderingContext2D,
  flavor: NodeFlavor,
  cx: number,
  cy: number,
  size: number,
  opts: { color?: string; alpha?: number } = {},
) {
  const def = NODE_ICONS[flavor]
  if (!def) return
  const s = size / 24
  ctx.save()
  ctx.globalAlpha = opts.alpha ?? 1
  ctx.translate(cx - size / 2, cy - size / 2)
  ctx.scale(s, s)
  ctx.fillStyle = opts.color ?? def.color
  ctx.fill(pathOf(def.body))
  if (def.detail) {
    ctx.fillStyle = 'rgba(8,10,8,0.72)'
    ctx.fill(pathOf(def.detail))
  }
  ctx.restore()
}

export function nodeIconColor(flavor: NodeFlavor) {
  return NODE_ICONS[flavor]?.color ?? '#ffffff'
}
