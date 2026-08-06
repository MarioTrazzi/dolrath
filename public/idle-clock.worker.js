/**
 * ⏱️ Relógio da run idle.
 *
 * `setInterval` DENTRO de um worker dedicado não sofre o "intensive throttling"
 * que o Chrome aplica aos timers da PÁGINA oculta (1 wake-up por minuto depois
 * de ~5 min em segundo plano). A página usa estes ticks só para DRENAR os seus
 * próprios timers vencidos — o `setTimeout` continua sendo o disparador
 * primário, então com a aba visível nada muda.
 *
 * Arquivo estático em /public de propósito: nada de bundler no meio (mesma URL
 * em dev e na Vercel, imune a Turbopack). Por isso é JS puro, sem imports.
 */
let id = null

self.onmessage = (e) => {
  const msg = e.data || {}
  if (msg.type === 'start') {
    if (id) clearInterval(id)
    id = setInterval(() => self.postMessage({ type: 'tick', now: Date.now() }), msg.everyMs || 250)
  } else if (msg.type === 'stop') {
    if (id) clearInterval(id)
    id = null
  }
}
