/**
 * Relatório mínimo da frota (esqueleto do watcher).
 * Lê JSONL de eventos + opcionalmente registry.
 *
 * Usage: node scripts/bot-fleet-report.js [path/to/bot-fleet-events.jsonl]
 */
const fs = require('fs')
const path = require('path')

const LOG_PATH = process.argv[2] || path.join(__dirname, 'bot-fleet-events.jsonl')
const REGISTRY_PATH = path.join(__dirname, 'bot-fleet-registry.json')

function main() {
  if (!fs.existsSync(LOG_PATH)) {
    console.log(`Sem log ainda: ${LOG_PATH}`)
    console.log('Rode o runner e volte. Watcher detalhado (dashboard/surplus) fica para o próximo plano.')
    return
  }

  const lines = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean)
  const events = lines.map((l) => {
    try {
      return JSON.parse(l)
    } catch {
      return null
    }
  }).filter(Boolean)

  const byType = {}
  const craftOk = []
  const craftFail = []
  const pvp = { wins: 0, losses: 0, ends: 0 }
  const byChar = {}

  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1
    if (!byChar[e.characterId]) byChar[e.characterId] = { events: 0, craftOk: 0, pvpWins: 0, pvpLosses: 0 }
    if (e.characterId) byChar[e.characterId].events++

    if (e.type === 'craft_potion') {
      if (e.ok) {
        craftOk.push(e)
        if (e.characterId) byChar[e.characterId].craftOk++
      } else craftFail.push(e)
    }
    if (e.type === 'pvp_end') {
      pvp.ends++
      if (e.won) {
        pvp.wins++
        if (e.characterId) byChar[e.characterId].pvpWins++
      } else {
        pvp.losses++
        if (e.characterId) byChar[e.characterId].pvpLosses++
      }
    }
  }

  let names = {}
  if (fs.existsSync(REGISTRY_PATH)) {
    const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
    for (const b of reg.bots || []) names[b.characterId] = b.name
  }

  console.log('=== Bot fleet report (mínimo) ===')
  console.log(`Events: ${events.length}`)
  console.log('By type:', byType)
  console.log('PvP ends:', pvp)
  console.log(`Craft ok/fail: ${craftOk.length}/${craftFail.length}`)
  console.log('\nPer character:')
  for (const [id, s] of Object.entries(byChar)) {
    console.log(`  ${names[id] || id}: events=${s.events} craftOk=${s.craftOk} pvp W/L=${s.pvpWins}/${s.pvpLosses}`)
  }
  console.log('\n(Watcher detalhado: surplus de drops, STA/h, XP/h — próximo plano)')
}

main()
