import { Locale } from './config'
import { localizeItemName } from './catalog'

// 🌐 Erros de REGRA lançados no meio de transações (`throw new Error(...)`) e
// devolvidos crus pelas rotas — "GOLD insuficiente…", "Falta X…", "Inventário
// cheio…". O texto PT é contrato: as rotas classificam 400/500 por regex nele e
// o cliente lê o "precisa de N" para oferecer a recarga (lib/buyGold). Então a
// fonte continua PT e a tradução acontece só na BORDA, na hora de responder.
//
// PT: devolve a mensagem intacta. EN: reescreve as formas conhecidas; o resto
// passa como está (nunca pior do que antes).

type Rule = { re: RegExp; en: (m: RegExpMatchArray, locale: Locale) => string }

const RULES: Rule[] = [
  {
    re: /^GOLD insuficiente na carteira do personagem: precisa de (\d+) 🪙 para a restauração\.$/,
    en: (m) => `Not enough GOLD in the character's wallet: you need ${m[1]} 🪙 for the restoration.`,
  },
  {
    re: /^GOLD insuficiente na carteira do personagem: precisa de (\d+) 🪙\.$/,
    en: (m) => `Not enough GOLD in the character's wallet: you need ${m[1]} 🪙.`,
  },
  {
    re: /^GOLD insuficiente na mão \(precisa de (\d+)\)\.$/,
    en: (m) => `Not enough GOLD on hand (you need ${m[1]}).`,
  },
  {
    re: /^GOLD insuficiente no banco \(precisa de (\d+)\)\.$/,
    en: (m) => `Not enough GOLD in the bank (you need ${m[1]}).`,
  },
  {
    re: /^Saldo do banco insuficiente \(tem (-?\d+) 🪙\)\.$/,
    en: (m) => `Not enough gold in the bank (you have ${m[1]} 🪙).`,
  },
  {
    re: /^Saldo do personagem insuficiente \(tem (-?\d+) 🪙\)\.$/,
    en: (m) => `The character does not have enough gold (has ${m[1]} 🪙).`,
  },
  {
    re: /^Falta (.+) \(tem (\d+), precisa de (\d+)\)\.$/,
    en: (m, l) => `Missing ${localizeItemName(m[1], l)} (have ${m[2]}, need ${m[3]}).`,
  },
  {
    re: /^Falta (.+) para completar o lote\.$/,
    en: (m, l) => `Missing ${localizeItemName(m[1], l)} to complete the batch.`,
  },
  {
    re: /^Inventário cheio \((\d+)\/(\d+)\)\. Libere espaço antes de continuar\.$/,
    en: (m) => `Inventory full (${m[1]}/${m[2]}). Free up space before continuing.`,
  },
  {
    re: /^Baú Geral cheio \((\d+)\/(\d+)\)\. Libere espaço antes de continuar\.$/,
    en: (m) => `Global Chest full (${m[1]}/${m[2]}). Free up space before continuing.`,
  },
  {
    re: /^Inventário cheio — libere um slot e colha de novo \(nada foi perdido\)\.$/,
    en: () => 'Inventory full — free a slot and harvest again (nothing was lost).',
  },
  {
    re: /^Inventário cheio — libere um slot e colete de novo\.$/,
    en: () => 'Inventory full — free a slot and collect again.',
  },
  {
    re: /^Stamina insuficiente \(colher custa (\d+)⚡ por canteiro\)\.$/,
    en: (m) => `Not enough stamina (harvesting costs ${m[1]}⚡ per plot).`,
  },
  {
    re: /^Stamina insuficiente \(a ação custa (\d+)\)\.$/,
    en: (m) => `Not enough stamina (this action costs ${m[1]}).`,
  },
  // 🌾 Fazenda (plant/harvest/pen-feed/well-collect)
  { re: /^Nenhum canteiro pronto para colher\.$/, en: () => 'No plot is ready to harvest.' },
  { re: /^O poço ainda não acumulou água\.$/, en: () => 'The well has not gathered any water yet.' },
  { re: /^Nada plantado aqui\.$/, en: () => 'Nothing planted here.' },
  { re: /^Os animais ainda estão no ciclo\. Volte mais tarde\.$/, en: () => 'The animals are still in their cycle. Come back later.' },
  { re: /^O cercado já está num ciclo\. Colha o couro quando terminar\.$/, en: () => 'The pen is already in a cycle. Collect the leather when it finishes.' },
  { re: /^Este canteiro já está plantado\.$/, en: () => 'This plot is already planted.' },
  {
    re: /^Você não tem (.+)\. Crafte na Bancada de Alquimia \(2 Trigo \+ 1 Água Pura\)\.$/,
    en: (m, l) => `You don't have ${localizeItemName(m[1], l)}. Craft it at the Alchemy bench (2 Wheat + 1 Pure Water).`,
  },
  {
    re: /^Você não tem (.+)\. Sementes caem coletando nos Campos de Ervas\.$/,
    en: (m, l) => `You don't have ${localizeItemName(m[1], l)}. Seeds drop while gathering in the Herb Fields.`,
  },
]

export function localizeServerError(message: string, locale: Locale): string {
  if (locale === 'pt') return message
  for (const rule of RULES) {
    const m = message.match(rule.re)
    if (m) return rule.en(m, locale)
  }
  return message
}
