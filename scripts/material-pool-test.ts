// 🌐⚒️ Banco de teste do POOL DE INSUMOS (src/lib/materialPool.ts).
//
// As quatro bancadas passaram a consumir da mochila do herói E do Baú Geral.
// As regras que isso criou não dão pra conferir por typecheck — ordem de
// consumo, transbordo da saída, cap do baú — e exercitá-las no jogo exige um
// banco com o inventário no estado certo. Aqui um `tx` FALSO em memória cobre
// os dez casos em ~1s, sem Prisma e sem DB.
//
//   npm run test:material-pool
import {
  loadMaterialPool, poolCount, poolCountFromGlobal, consumeFromPool,
  depositCraftOutput, freeGlobalChestSlots,
} from '@/lib/materialPool'

type Row = { id: string; itemId: string; quantity: number; enhancementLevel?: number; item: any }

function makeTx(opts: {
  char: Row[]; global: Row[]; inventorySlots: number; globalSlots: number
}) {
  const char = [...opts.char]
  const glob = [...opts.global]
  let seq = 0
  const match = (rows: Row[], w: any) =>
    rows.filter((r) => {
      if (w.quantity?.gt !== undefined && !(r.quantity > w.quantity.gt)) return false
      if (w.itemId && r.itemId !== w.itemId) return false
      if (w.enhancementLevel !== undefined && (r.enhancementLevel ?? 0) !== w.enhancementLevel) return false
      if (w.item?.name?.in && !w.item.name.in.includes(r.item.name)) return false
      if (w.item?.type && r.item.type !== w.item.type) return false
      return true
    })
  // updateMany/deleteMany do take atômico (inventoryMutations.takeFrom*):
  // decremento condicionado a `quantity >= n` e limpeza da linha que zerou.
  const condDec = (rows: Row[]) => async ({ where, data }: any) => {
    const r = rows.find((x) => x.id === where.id)
    if (!r || (where.quantity?.gte !== undefined && r.quantity < where.quantity.gte)) return { count: 0 }
    r.quantity -= data.quantity.decrement
    return { count: 1 }
  }
  const delZero = (rows: Row[]) => async ({ where }: any) => {
    const i = rows.findIndex((x) => x.id === where.id && x.quantity <= 0)
    if (i >= 0) rows.splice(i, 1)
    return { count: i >= 0 ? 1 : 0 }
  }
  return {
    _char: char, _glob: glob,
    characterInventory: {
      findMany: async ({ where }: any) => match(char, where),
      findFirst: async ({ where }: any) => match(char, where)[0] ?? null,
      count: async () => char.length,
      update: async ({ where, data }: any) => {
        const r = char.find((x) => x.id === where.id)!
        if (data.quantity?.decrement) r.quantity -= data.quantity.decrement
        if (data.quantity?.increment) r.quantity += data.quantity.increment
      },
      delete: async ({ where }: any) => { char.splice(char.findIndex((x) => x.id === where.id), 1) },
      updateMany: condDec(char),
      deleteMany: delZero(char),
      create: async ({ data }: any) => {
        const r = { id: `c${++seq}`, itemId: data.itemId, quantity: data.quantity, enhancementLevel: 0, item: { name: data.itemId, type: 'CONSUMABLE' } }
        char.push(r); return r
      },
    },
    userInventory: {
      findMany: async ({ where }: any) => match(glob, where),
      findUnique: async ({ where }: any) =>
        glob.find((r) => r.itemId === where.userId_itemId.itemId) ?? null,
      count: async () => glob.length,
      update: async ({ where, data }: any) => {
        const r = glob.find((x) => x.id === where.id)!
        if (data.quantity?.decrement) r.quantity -= data.quantity.decrement
      },
      delete: async ({ where }: any) => { glob.splice(glob.findIndex((x) => x.id === where.id), 1) },
      updateMany: condDec(glob),
      deleteMany: delZero(glob),
      upsert: async ({ where, create, update }: any) => {
        const r = glob.find((x) => x.itemId === where.userId_itemId.itemId)
        if (r) r.quantity += update.quantity.increment
        else glob.push({ id: `g${++seq}`, itemId: create.itemId, quantity: create.quantity, item: { name: create.itemId, type: 'CONSUMABLE' } })
      },
    },
    character: { findUnique: async () => ({ inventorySlots: opts.inventorySlots }) },
    user: { findUnique: async () => ({ globalInventorySlots: opts.globalSlots }) },
  } as any
}

const item = (name: string) => ({ name, type: 'CONSUMABLE', stats: { kind: 'material' } })
let pass = 0, fail = 0
const ok = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label} ${extra}`) }
}

async function main() {
  // ---- 1. Pool soma as duas origens ----
  console.log('\n1. Pool soma mochila + baú')
  let tx = makeTx({
    char: [{ id: 'c1', itemId: 'i1', quantity: 3, enhancementLevel: 0, item: item('Ferro') }],
    global: [{ id: 'g1', itemId: 'i1', quantity: 10, item: item('Ferro') }],
    inventorySlots: 25, globalSlots: 50,
  })
  let pool = await loadMaterialPool(tx, { characterId: 'ch', userId: 'u', names: ['Ferro'] })
  ok('total = 13', poolCount(pool, 'Ferro') === 13, `deu ${poolCount(pool, 'Ferro')}`)
  ok('do baú = 10', poolCountFromGlobal(pool, 'Ferro') === 10)
  ok('mochila vem primeiro na fila', pool.get('Ferro')![0].source === 'character')

  // ---- 2. Consumo esvazia a mochila ANTES do baú ----
  console.log('\n2. Consumo: mochila antes do baú')
  await consumeFromPool(tx, pool, [{ name: 'Ferro', quantity: 5 }])
  ok('linha da mochila apagada (tinha 3, gastou 3)', tx._char.length === 0)
  ok('baú caiu de 10 para 8', tx._glob[0].quantity === 8, `deu ${tx._glob[0].quantity}`)

  // ---- 3. Insumo 100% do baú ----
  console.log('\n3. Insumo só existe no baú')
  tx = makeTx({
    char: [], global: [{ id: 'g1', itemId: 'i1', quantity: 4, item: item('Erva') }],
    inventorySlots: 25, globalSlots: 50,
  })
  pool = await loadMaterialPool(tx, { characterId: 'ch', userId: 'u', names: ['Erva'] })
  ok('enxerga as 4 do baú', poolCount(pool, 'Erva') === 4)
  await consumeFromPool(tx, pool, [{ name: 'Erva', quantity: 4 }])
  ok('baú zerou e a linha SUMIU (nada de fantasma)', tx._glob.length === 0)

  // ---- 4. accept() peneira (caso da Alquimia) ----
  console.log('\n4. accept() peneira o que não é insumo')
  tx = makeTx({
    char: [{ id: 'c1', itemId: 'i1', quantity: 5, enhancementLevel: 0, item: { name: 'Poção', type: 'CONSUMABLE', stats: { kind: 'potion' } } }],
    global: [{ id: 'g1', itemId: 'i2', quantity: 7, item: item('Poção') }],
    inventorySlots: 25, globalSlots: 50,
  })
  pool = await loadMaterialPool(tx, {
    characterId: 'ch', userId: 'u', names: ['Poção'],
    accept: (it: any) => it.stats?.kind === 'material',
  })
  ok('só a linha material passou (7, não 12)', poolCount(pool, 'Poção') === 7, `deu ${poolCount(pool, 'Poção')}`)

  // ---- 5. Saída: mochila com espaço ----
  console.log('\n5. Saída vai pra mochila quando cabe')
  tx = makeTx({ char: [], global: [], inventorySlots: 25, globalSlots: 50 })
  let dest = await depositCraftOutput(tx, { characterId: 'ch', userId: 'u', itemId: 'out', quantity: 3, isEquipment: false })
  ok("destino = 'character'", dest === 'character')
  ok('1 linha empilhada com 3', tx._char.length === 1 && tx._char[0].quantity === 3)

  // ---- 6. Saída transborda pro baú com a mochila lotada ----
  console.log('\n6. Mochila lotada → transborda pro Baú Geral')
  const lotada = Array.from({ length: 25 }, (_, i) => ({
    id: `c${i}`, itemId: `x${i}`, quantity: 1, enhancementLevel: 0, item: item(`X${i}`),
  }))
  tx = makeTx({ char: lotada, global: [], inventorySlots: 25, globalSlots: 50 })
  dest = await depositCraftOutput(tx, { characterId: 'ch', userId: 'u', itemId: 'out', quantity: 2, isEquipment: false })
  ok("destino = 'global'", dest === 'global', `deu ${dest}`)
  ok('mochila intocada (25)', tx._char.length === 25)
  ok('baú recebeu 2', tx._glob.length === 1 && tx._glob[0].quantity === 2)

  // ---- 7. Pilha existente na mochila não gasta slot, mesmo lotada ----
  console.log('\n7. Pilha já existente na mochila lotada ainda recebe')
  const comPilha = [...lotada]
  comPilha[0] = { id: 'c0', itemId: 'out', quantity: 1, enhancementLevel: 0, item: item('Out') }
  tx = makeTx({ char: comPilha, global: [], inventorySlots: 25, globalSlots: 50 })
  dest = await depositCraftOutput(tx, { characterId: 'ch', userId: 'u', itemId: 'out', quantity: 4, isEquipment: false })
  ok("destino = 'character' (empilhou)", dest === 'character', `deu ${dest}`)
  ok('pilha foi de 1 para 5', tx._char[0].quantity === 5, `deu ${tx._char[0].quantity}`)

  // ---- 8. Equipamento: 1 linha por peça ----
  console.log('\n8. Equipamento ocupa 1 slot por peça')
  tx = makeTx({ char: [], global: [], inventorySlots: 25, globalSlots: 50 })
  dest = await depositCraftOutput(tx, { characterId: 'ch', userId: 'u', itemId: 'sword', quantity: 3, isEquipment: true })
  ok("destino = 'character'", dest === 'character')
  ok('3 linhas separadas de quantity 1', tx._char.length === 3 && tx._char.every((r: any) => r.quantity === 1))

  // ---- 9. Equipamento sem espaço vai pro baú como pilha ----
  console.log('\n9. Equipamento sem espaço → baú')
  tx = makeTx({ char: lotada.map((r) => ({ ...r })), global: [], inventorySlots: 25, globalSlots: 50 })
  dest = await depositCraftOutput(tx, { characterId: 'ch', userId: 'u', itemId: 'sword', quantity: 2, isEquipment: true })
  ok("destino = 'global'", dest === 'global', `deu ${dest}`)
  ok('baú tem 1 linha com 2', tx._glob.length === 1 && tx._glob[0].quantity === 2)

  // ---- 10. Os DOIS cheios → erro claro, nada some ----
  console.log('\n10. Mochila e baú cheios → erro')
  const bauCheio = Array.from({ length: 50 }, (_, i) => ({
    id: `g${i}`, itemId: `y${i}`, quantity: 1, item: item(`Y${i}`),
  }))
  tx = makeTx({ char: lotada.map((r) => ({ ...r })), global: bauCheio, inventorySlots: 25, globalSlots: 50 })
  const room = await freeGlobalChestSlots(tx, 'u')
  ok('baú reporta 0 livres de 50', room.free === 0 && room.limit === 50)
  let threw = ''
  try {
    await depositCraftOutput(tx, { characterId: 'ch', userId: 'u', itemId: 'out', quantity: 1, isEquipment: false })
  } catch (e: any) { threw = e.message }
  ok('estourou com mensagem de validação', /Baú Geral cheio/.test(threw), `msg: "${threw}"`)

  // ---- 11. Duas bancadas com o MESMO pool lido (corrida) ----
  // O pool é lido antes da escrita. Antes, a segunda bancada decrementava às
  // cegas: a pilha ia a negativo e o lote saía em dobro. Agora o take é
  // condicional e quem chega depois estoura com "Falta …".
  console.log('\n11. Duas bancadas, mesmo pool velho → a segunda falha')
  tx = makeTx({
    char: [{ id: 'c1', itemId: 'i1', quantity: 3, enhancementLevel: 0, item: item('Ferro') }],
    global: [], inventorySlots: 25, globalSlots: 50,
  })
  const poolA = await loadMaterialPool(tx, { characterId: 'ch', userId: 'u', names: ['Ferro'] })
  const poolB = await loadMaterialPool(tx, { characterId: 'ch', userId: 'u', names: ['Ferro'] })
  await consumeFromPool(tx, poolA, [{ name: 'Ferro', quantity: 3 }])
  let raceErr = ''
  try { await consumeFromPool(tx, poolB, [{ name: 'Ferro', quantity: 3 }]) } catch (e: any) { raceErr = e.message }
  ok('segunda bancada recusada', /Falta Ferro/.test(raceErr), `msg: "${raceErr}"`)
  ok('pilha não foi a negativo (linha apagada)', tx._char.length === 0, JSON.stringify(tx._char))

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passaram, ${fail} falharam`)
  process.exit(fail === 0 ? 0 : 1)
}
main()
