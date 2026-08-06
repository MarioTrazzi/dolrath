/**
 * Teste do agendador idle (src/lib/idleClock.ts) — `npx tsx scripts/idle-clock-check.ts`.
 *
 * É o único pedaço com lógica não trivial da correção de "run congela em
 * segundo plano": o agendador precisa disparar cada callback EXATAMENTE uma vez
 * mesmo quando duas fontes (o setTimeout da página e o tique do worker) correm
 * atrás do mesmo timer. Aqui o setTimeout é congelado de propósito — é o que o
 * Chrome faz com a aba oculta — e só o flushDue() drena.
 */

// ---------- Ambiente falso (o módulo é de browser) ----------
let fakeNow = 1_000_000
const realNow = Date.now
Date.now = () => fakeNow

interface FakeTimer { id: number; at: number; fn: () => void }
const timers: FakeTimer[] = []
let timerSeq = 0
/** setTimeout ESTRANGULADO: registra e nunca dispara sozinho (aba oculta). */
const fakeSetTimeout = ((fn: () => void, ms: number) => {
  const id = ++timerSeq
  timers.push({ id, at: fakeNow + (ms || 0), fn })
  return id as unknown as ReturnType<typeof setTimeout>
}) as typeof setTimeout
const fakeClearTimeout = ((id: unknown) => {
  const i = timers.findIndex(t => (t.id as unknown) === id)
  if (i >= 0) timers.splice(i, 1)
}) as typeof clearTimeout

const g = globalThis as Record<string, unknown>
g.setTimeout = fakeSetTimeout
g.clearTimeout = fakeClearTimeout
g.document = { hidden: true, addEventListener() {}, removeEventListener() {} }
g.window = { addEventListener() {}, removeEventListener() {} }
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null
  postMessage() {}
  terminate() {}
}
g.Worker = FakeWorker

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { createIdleScheduler } from '../src/lib/idleClock'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✅ ${label}`)
  else { failures++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`) }
}

// ---------- 1) Drenagem: 200 callbacks, uma vez cada, em ordem ----------
console.log('\n1) flushDue drena tudo que venceu, uma vez cada, em ordem de vencimento')
{
  const sched = createIdleScheduler()
  const fired: number[] = []
  const counts = new Map<number, number>()
  for (let i = 0; i < 200; i++) {
    const n = i
    // Atrasos embaralhados para provar que a ordem sai por `due`, não por criação.
    sched.later(() => {
      fired.push(n)
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }, ((i * 37) % 200) + 1)
  }
  check('nada disparou antes do tempo (setTimeout congelado)', fired.length === 0, `disparou ${fired.length}`)

  fakeNow += 500
  sched.flushDue()
  check('todos os 200 correram', fired.length === 200, `correram ${fired.length}`)
  let dupes = 0
  counts.forEach(c => { if (c !== 1) dupes++ })
  check('nenhum correu duas vezes', dupes === 0, `${dupes} duplicado(s)`)

  const dueOf = (n: number) => ((n * 37) % 200) + 1
  const ordered = fired.every((n, i) => i === 0 || dueOf(fired[i - 1]) <= dueOf(n))
  check('ordem crescente de vencimento', ordered)

  sched.flushDue()
  check('flush repetido não redispara', fired.length === 200, `agora ${fired.length}`)
  sched.dispose()
}

// ---------- 2) Dupla fonte: setTimeout e flushDue no mesmo callback ----------
console.log('\n2) o mesmo callback disparado pelas duas fontes só corre uma vez')
{
  const sched = createIdleScheduler()
  let runs = 0
  sched.later(() => { runs++ }, 100)
  const pending = timers[timers.length - 1]

  fakeNow += 200
  sched.flushDue()          // o tique do worker chega primeiro
  pending.fn()              // o setTimeout da página acorda depois
  check('correu exatamente uma vez', runs === 1, `correu ${runs}x`)
  sched.dispose()
}

// ---------- 3) Cadeia A→B→C respeita os atrasos ----------
console.log('\n3) callback que reagenda não entra no mesmo flush (sem laço infinito)')
{
  const sched = createIdleScheduler()
  const seen: string[] = []
  sched.later(() => {
    seen.push('A')
    sched.later(() => {
      seen.push('B')
      sched.later(() => { seen.push('C') }, 10)
    }, 10)
  }, 10)

  fakeNow += 50
  sched.flushDue()
  check('o flush parou em A (B nasceu vencido mas não correu junto)', seen.join('') === 'A', `saiu "${seen.join('')}"`)
  fakeNow += 50
  sched.flushDue()
  check('tique seguinte roda B', seen.join('') === 'AB', `saiu "${seen.join('')}"`)
  fakeNow += 50
  sched.flushDue()
  check('e depois C', seen.join('') === 'ABC', `saiu "${seen.join('')}"`)
  sched.dispose()
}

// ---------- 4) Cancelamento ----------
console.log('\n4) cancelar impede o disparo pelas duas fontes')
{
  const sched = createIdleScheduler()
  let runs = 0
  const cancel = sched.later(() => { runs++ }, 100)
  const pending = timers[timers.length - 1]
  cancel()
  fakeNow += 200
  sched.flushDue()
  pending.fn?.()
  check('não correu', runs === 0, `correu ${runs}x`)
  sched.dispose()
}

// ---------- 5) dispose ----------
console.log('\n5) dispose cala o agendador')
{
  const sched = createIdleScheduler()
  let runs = 0
  sched.later(() => { runs++ }, 10)
  sched.dispose()
  fakeNow += 100
  sched.flushDue()
  check('pendente não corre depois do dispose', runs === 0, `correu ${runs}x`)
}

Date.now = realNow
console.log(failures === 0 ? '\n✅ agendador ok\n' : `\n❌ ${failures} falha(s)\n`)
process.exit(failures === 0 ? 0 : 1)
