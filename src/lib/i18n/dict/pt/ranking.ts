// Ranking / Temporada — placar da arena, inscrição paga e prêmio em DOL.
export const RANKING_PT: Record<string, string> = {
  Arena: 'Arena',
  'PvP Ranking': 'Ranking PvP',
  'Every enrolled hero puts {n} DOL into the pot. At season end the Top 20 splits it — the prize is the entries themselves, not loose emission.':
    'Cada herói inscrito põe {n} DOL no pote. No fim da temporada o Top 20 divide — o prêmio são as próprias inscrições, não emissão solta.',
  'Failed to load ranking': 'Erro ao carregar o ranking',
  'Loading season…': 'Carregando temporada…',

  // Inscrição
  'Season entry': 'Inscrição da temporada',
  'All your heroes are enrolled in {season}.': 'Todos os seus heróis estão inscritos na {season}.',
  'This season, creating a hero already enrolls it. Paid entries open next season, priced in DOL.':
    'Nesta temporada, criar um herói já o inscreve. A inscrição avulsa abre na próxima, cobrada em DOL.',
  'Enroll a hero in {season} for {n} DOL. It goes 100% into the pot.':
    'Inscreva um herói na {season} por {n} DOL. Vai 100% para o pote.',
  'Enroll for {n} DOL': 'Inscrever por {n} DOL',
  'Processing payment...': 'Processando pagamento...',
  'Hero enrolled! Your ranked matches now score.':
    'Herói inscrito! Suas lutas ranqueadas já pontuam.',
  'Failed to enroll': 'Erro ao inscrever',
  'Entry is per hero, prize is per account: only your best hero can win. Heroes without entry still fight for gold and XP — they just do not score.':
    'A inscrição é por herói, o prêmio é por conta: só o seu melhor herói pode ganhar. Herói sem inscrição continua lutando por ouro e XP — só não pontua.',

  // Cards de estado
  Active: 'Ativa',
  'Off-season': 'Entressafra',
  '{n}d left': 'faltam {n}d',
  'DOL Pot': 'Pote em DOL',
  '{n} heroes enrolled': '{n} heróis inscritos',
  seeded: 'de aporte',
  'Your position': 'Sua posição',
  '{n} pts': '{n} pts',
  'Not enrolled — not eligible for DOL': 'Sem inscrição — fora da premiação',
  '{n} more matches to be eligible': 'faltam {n} lutas para ser elegível',
  'Eligible for the prize': 'Elegível ao prêmio',
  'Play a ranked match': 'Dispute uma luta ranqueada',
  'Season closed — payouts are being processed. The world stays open: dungeons, gathering, crafting and the arena all keep running (gold and XP included). Only the scoreboard is paused until the next season starts.':
    'Temporada encerrada — os pagamentos estão sendo processados. O mundo segue aberto: masmorras, coleta, produção e a arena continuam rodando (com ouro e XP). Só o placar fica parado até a próxima temporada começar.',

  // Tabela
  Leaderboard: 'Classificação',
  'Go to Arena': 'Ir para a Arena',
  Hero: 'Herói',
  Pts: 'Pts',
  'Lv.': 'Nv.',
  'No ranked matches this season yet.': 'Nenhuma luta ranqueada nesta temporada ainda.',

  // Prêmio
  'Prize split · Top 20': 'Divisão do prêmio · Top 20',
  'Show 11-20': 'Mostrar 11-20',
  'Hide 11-20': 'Ocultar 11-20',
  "Only enrolled heroes with at least {n} ranked matches are eligible, one prize per account (your best hero). Unfilled places roll into the tournament vault. Payouts are snapshotted at season end and sent to the account's linked wallet.":
    'Só heróis inscritos com pelo menos {n} lutas ranqueadas são elegíveis, um prêmio por conta (o seu melhor herói). Posições vazias vão para o cofre de torneios. Os prêmios são congelados no fim da temporada e enviados para a carteira vinculada à conta.',
  'A new season never wipes anything: level, gear, enhancement, gold, professions and inventory all carry over. Only the scoreboard resets.':
    'Temporada nova não apaga nada: nível, equipamento, aprimoramento, ouro, profissões e inventário continuam. Só o placar zera.',

  // Arena / lobby
  'This hero is not enrolled in {season} — the fight pays gold and XP, but does not score.':
    'Este herói não está inscrito na {season} — a luta paga ouro e XP, mas não pontua.',
  'Enroll in the season': 'Inscrever na temporada',
}
