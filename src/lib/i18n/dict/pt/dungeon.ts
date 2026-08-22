// Run de masmorra (DungeonRun.tsx) — narração, log de combate, HUD e telas de fim.
export const DUNGEON_PT: Record<string, string> = {
  // Transições do Mestre
  'You take a deep breath and head down the trail.': 'Você respira fundo e segue trilha adentro.',
  'The path winds between roots and shadows...': 'A vereda serpenteia entre raízes e sombras...',
  'Deeper into the dungeon, the air grows dense and cold.': 'Mais fundo na masmorra, o ar fica denso e frio.',
  'Branches creak above; you press on with blade in hand.': 'Galhos rangem acima; você avança com a lâmina à mão.',
  'The mist parts for a moment, revealing the way.': 'A névoa se abre por um instante, revelando o caminho.',

  // Dicas do rodapé
  'Do not forget to stop by the Alchemist and take some potions on the adventure.':
    'Não esqueça de passar na Alquimista e levar algumas poções para a aventura.',
  'Buy your armour at the Blacksmith and enhance it to chase bigger rewards from the dungeon bosses.':
    'Compre suas armaduras no Ferreiro e aprimore-as para buscar recompensas maiores nos bosses das masmorras.',
  'Stamina restores on its own: +2 every 15 min, after 15 min without spending.':
    'A stamina se restaura sozinha: +2 a cada 15 min, após 15 min sem gastar.',
  'The run plays itself — use the potion button to turn automatic HP/MP use between nodes on or off.':
    'A run joga sozinha — use o botão de poções para ligar ou desligar o uso automático de HP/MP entre os nós.',
  'Main rooms (⚔️) have a guaranteed monster and the best loot — the bosses guard the rare items.':
    'Salas principais (⚔️) têm monstro garantido e o melhor espólio — os bosses guardam os itens raros.',
  'With the backpack brake on, the run ends by itself when the inventory fills — no burning stamina for loot that gets lost.':
    'Com o freio da mochila ligado, a run encerra sozinha quando o inventário enche — nada de queimar stamina por espólio que se perde.',

  // Verbos de defesa
  'blocked': 'bloqueou',
  'defended': 'defendeu',
  'dodged': 'esquivou',

  // Entrada / erros
  '🎒 Backpack full — the run ends here so no more loot is lost.':
    '🎒 Mochila cheia — a run encerra aqui para não perder mais espólio.',
  'This hero is already in a dungeon in another tab.': 'Este herói já está em uma masmorra em outra aba.',
  'Could not enter the dungeon': 'Não foi possível entrar na masmorra',
  '🎒 Inventory full — items found will not be collected. Free up space and leave to farm again.':
    '🎒 Inventário cheio — itens encontrados não serão coletados. Abra espaço e saia para farmar de novo.',
  'No connection to the server': 'Sem conexão com o servidor',
  ' 🔧 (replacement)': ' 🔧 (reposição)',
  '🚫 Inventory full — {label} was lost!': '🚫 Inventário cheio — {label} foi perdido!',
  '🎒 Inventory full! Some items were not collected.': '🎒 Inventário cheio! Alguns itens não foram coletados.',
  'Paid restoration: {gold} 🪙': 'Restauração paga: {gold} 🪙',
  'Failed to advance': 'Falha ao avançar',

  // Nós e narração
  '⛲ You find a reviving spring — HP and MP restored!':
    '⛲ Você encontra uma fonte revitalizadora — HP e MP restaurados!',
  'Luck smiles: you rummage around and find something valuable.':
    'A sorte sorri: você vasculha e encontra algo valioso.',
  'Among leaves and stones, you gather what you can.': 'Entre folhas e pedras, você recolhe o que dá.',
  '👑 You reach the lair of {name}...': '👑 Você chegou ao covil de {name}...',
  'The trail ends ahead. You feel an ancient gaze fixed on you...':
    'A trilha termina adiante. Você sente um olhar antigo cravado em você...',

  // Combate
  '⚔️ Combat against {n} enemies has begun! (focus: {emoji} {name})':
    '⚔️ Combate contra {n} inimigos começou! (foco: {emoji} {name})',
  '⚔️ Combat against {emoji} {name} has begun!': '⚔️ Combate contra {emoji} {name} começou!',
  '🎯 You focus {emoji} {name}.': '🎯 Você foca {emoji} {name}.',
  'You have already transformed in this fight!': 'Você já se transformou nesta luta!',
  '✨ You took on the {name}!': '✨ Você assumiu a {name}!',
  '☠️ You take {n} continuous damage ({labels})': '☠️ Você sofre {n} de dano contínuo ({labels})',
  'You go first! · Luck {n}': 'Você começa! · Sorte {n}',
  '{name} goes first! · Luck {n}': '{name} começa! · Sorte {n}',
  'The Special can only be used while transformed!': 'O Especial só pode ser usado transformado!',
  'Learn the Class Attack on the skill tree!': 'Aprenda o Ataque de Classe na árvore de habilidades!',
  'Learn the Stunning Blow on the skill tree!': 'Aprenda o Golpe Atordoante na árvore de habilidades!',
  'Learn the form buff on the skill tree!': 'Aprenda o buff da forma na árvore de habilidades!',
  '💨 d{sides}={roll} — {name} {verb}! (evasion {pct}%)': '💨 d{sides}={roll} — {name} {verb}! (evasão {pct}%)',
  '💥 d{sides}={roll} CRITICAL! {dmg} damage to {name}': '💥 d{sides}={roll} CRÍTICO! {dmg} de dano em {name}',
  '{icon} d{sides}={roll} → {dmg} damage to {name}': '{icon} d{sides}={roll} → {dmg} de dano em {name}',
  '{label} (d{die}={roll}): {dmg} damage{crit} to {name}': '{label} (d{die}={roll}): {dmg} de dano{crit} em {name}',
  ' CRITICAL': ' CRÍTICO',
  '☠️ {name} takes {n} continuous damage': '☠️ {name} sofre {n} de dano contínuo',
  '🚫 {name} is immobilised and loses the turn!': '🚫 {name} está imobilizado e perde o turno!',
  '🌿 You are held by the roots and lose the turn!': '🌿 Você está preso pelas raízes e perde o turno!',
  'Saved: acts on its own if you fall in combat': 'Guardada: age sozinha se você cair em combate',
  'Resource is already full': 'Recurso já está cheio',
  'You are not poisoned': 'Você não está envenenado',
  'You are not bleeding': 'Você não está sangrando',
  '✨ TOTAL DODGE! You avoided the blow from {name} (max roll)':
    '✨ ESQUIVA TOTAL! Você evitou o golpe de {name} (rolagem máxima)',
  '💨 You {verb} the blow from {name}! (0 damage)': '💨 Você {verb} o golpe de {name}! (0 de dano)',
  '🛡️ You blocked the blow from {name}! Took {dmg} (reinforced armour)':
    '🛡️ Você bloqueou o golpe de {name}! Sofreu {dmg} (armadura reforçada)',
  '🩸 {name} dealt {dmg} damage to you': '🩸 {name} causou {dmg} de dano em você',
  '{name}! You are back in the fight with {hp} HP': '{name}! Você volta à luta com {hp} HP',
  '☠️ {name} poisoned you! You lose {dmg} HP per turn until you use an Antidote.':
    '☠️ {name} te envenenou! Perde {dmg} HP por turno até usar um Antídoto.',
  '🩸 {name} opened a cut! You are bleeding until you use a Linen Bandage.':
    '🩸 {name} abriu um corte! Você está sangrando até usar uma Bandagem de Linho.',
  '💫 {name} stunned you! You lose the next turn.': '💫 {name} te atordoou! Você perde o próximo turno.',
  'Equipment': 'Equipamento',
  '💔 {name} BROKE! No bonus until repaired at the blacksmith.':
    '💔 {name} QUEBROU! Sem bônus até reparar no ferreiro.',
  '⚠️ {name} is almost broken ({cur}/{max}).': '⚠️ {name} está quase quebrando ({cur}/{max}).',
  'Level {n}! HP and MP restored': 'Nível {n}! HP e MP restaurados',
  '🎉 You LEVELED UP! HP and MP fully restored.': '🎉 Você SUBIU DE NÍVEL! HP e MP restaurados por completo.',
  '🏆 You defeated {emoji} {name}! +{gold} 💰 +{xp} XP': '🏆 Você derrotou {emoji} {name}! +{gold} 💰 +{xp} XP',

  // Alquimista / fim da run
  'The Alchemist could not restore you — farming stopped.':
    'A Alquimista não pôde restaurar você — farm encerrado.',
  '⚗️ The Alchemist restored your health and mana — free up to level {n}.':
    '⚗️ A Alquimista restaurou sua vida e mana — cortesia até o nível {n}.',
  'No connection to the Alchemist — farming stopped.': 'Sem conexão com a Alquimista — farm encerrado.',
  '⚡ {n} stamina refunded — the node was never played.':
    '⚡ {n} de stamina devolvida — o nó não chegou a ser jogado.',
  '💰 Daily gold cap reached: the run yielded {gold} 💰 (out of {optimistic}).':
    '💰 Teto diário de ouro atingido: a run rendeu {gold} 💰 (de {optimistic}).',
  '🚫 Inventory full — {name} was lost!': '🚫 Inventário cheio — {name} foi perdido!',
  '{n} item(s) lost: inventory full.': '{n} item(ns) perdido(s): inventário cheio.',
  'Could not finish the run — the loot will be credited on your next entry.':
    'Não deu para encerrar a run — o espólio será creditado na próxima entrada.',
  '🏃 You retreat safely, keeping what you won.': '🏃 Você recua em segurança, levando o que conquistou.',
  'Safe retreat — XP and loot from the kills preserved.':
    'Recuo seguro — XP e espólio dos abates preservados.',
  'The run ends after this fight — no stamina spent on a new node.':
    'A run encerra ao fim desta luta — sem gastar stamina num nó novo.',

  // HUD
  '🎒 The backpack filled up — the run stopped here and auto farm was turned off. Free up space (or buy slots) before coming back.':
    '🎒 A mochila encheu — a run parou aqui e o farm automático foi desligado. Libere espaço (ou compre slots) antes de voltar.',
  '🤖 Auto farm: ON': '🤖 Farm automático: LIGADO',
  '🤖 Auto farm: OFF': '🤖 Farm automático: DESLIGADO',
  'Redoes the run on its own. Restoration is free up to level {n}.':
    'Refaz a run sozinho. A restauração é gratuita até o nível {n}.',
  'You redo the run by hand, with the health and mana you have left.':
    'Você refaz a run na mão, com a vida e a mana que sobraram.',
  '⚗️ The Alchemist will charge ~{cost} 🪙 for you to start the next run whole.':
    '⚗️ A Alquimista vai cobrar ~{cost} 🪙 para você entrar inteiro na próxima run.',
  '⏳ Saving the loot on the server...': '⏳ Salvando o espólio no servidor...',
  '😮‍💨 Not enough stamina for the next step — it comes back +2 every 15 idle min.':
    'Stamina insuficiente para o próximo passo — ela volta +2 a cada 15 min ocioso.',
  'Hero in use': 'Herói em uso',
  'LEVELED UP!': 'SUBIU DE NÍVEL!',
  'Level {n}': 'Nível {n}',
  'XP progress to the next level': 'Progresso de XP para o próximo nível',
  'XP progress to the next level (+{n} this run)': 'Progresso de XP para o próximo nível (+{n} nesta run)',
  'Abandon the battle and leave (keeps rewards)': 'Abandonar a batalha e sair (mantém recompensas)',
  'Leave the dungeon (keeps rewards)': 'Sair da masmorra (mantém recompensas)',
  '🎒 Backpack full — ending without spending stamina on a new node':
    '🎒 Mochila cheia — encerrando sem gastar stamina num nó novo',
  '⏳ Ending after this fight — no stamina spent on a new node':
    '⏳ Encerrando ao fim desta luta — sem gastar stamina num nó novo',
  '🧪 Consumables': '🧪 Consumíveis',
  'No restoring consumable in the inventory.': 'Nenhum consumível restaurador no inventário.',
  'The run is paused. Everything you have earned is saved — stamina restores on its own (+2 every 15 idle min).':
    'A run está pausada. Tudo que você já ganhou está salvo — a stamina se restaura sozinha (+2 a cada 15 min ocioso).',
  '⚡ The step in progress was already charged — since you will not play that node, the stamina comes back when you leave.':
    '⚡ O passo em curso já foi cobrado — como você não vai jogar esse nó, a stamina volta ao sair.',
  'Loot collected': 'Espólio coletado',
  'Loot collected ({n})': 'Espólio coletado ({n})',
  'Preparing the next run...': 'Preparando a próxima run...',
  'Saving the run loot...': 'Salvando o espólio da run...',
  'Crediting gold, XP and items to your hero.': 'Creditando ouro, XP e itens no seu herói.',
  'Taking longer than usual — do not close the tab, nothing was lost.':
    'Está demorando mais que o normal — não feche a aba, nada foi perdido.',
  'Automatic potions ON — click to turn off': 'Poções automáticas ON — clique para desligar',
  'Automatic potions OFF — click to turn on': 'Poções automáticas OFF — clique para ligar',
  'The run continues even with a full backpack (the loot is lost) — click to turn the brake on':
    'A run segue mesmo de mochila cheia (o espólio se perde) — clique para ligar o freio',
  'Use consumable (HP/MP)': 'Usar consumível (HP/MP)',
  '⏩ Advance now': '⏩ Avançar agora',
  'd{n} • free': 'd{n} • grátis',
  'free': 'grátis',
  'Free attack — costs no MP.': 'Ataque livre — não gasta MP.',
  'Transformation already used in this fight (1× per fight)':
    'Transformação já usada nesta luta (1× por luta)',
  '{n} forms available': '{n} formas disponíveis',
  'Retreat safely — you keep the XP and the loot from the enemies already defeated.':
    'Recuar em segurança — você mantém o XP e o espólio dos inimigos já derrotados.',
  'Turn off the combat pilot — pick target and attack by hand':
    'Desligar o piloto do combate — escolha alvo e ataque na mão',
  'Turn on the combat pilot — plays the turns for you':
    'Ligar o piloto do combate — joga os turnos por você',
  '🏆 Victory! Collecting rewards...': '🏆 Vitória! Coletando recompensas...',
  '💀 Defeated...': '💀 Derrotado...',
  '⚔️ Resolving action...': '⚔️ Resolvendo ação...',

  // Fim da run
  'Expedition complete!': 'Expedição concluída!',
  '⚔️ Victories': '⚔️ Vitórias',
  '🎉 You leveled up!': '🎉 Você subiu de nível!',
  'There are attribute points waiting to be distributed.':
    'Há pontos de atributo esperando para serem distribuídos.',
  'You have fallen...': 'Você caiu...',
  'All the XP, gold and items earned are kept. But you leave here wounded:':
    'Todo o XP, ouro e itens ganhos ficam guardados. Mas você sai daqui ferido:',
  ' the Alchemist restores health and mana for a handful of gold — or use your potions.':
    ' a Alquimista restaura vida e mana por um punhado de ouro — ou use suas poções.',
  ' the Alchemist restores health and mana for free up to level {n}.':
    ' a Alquimista restaura vida e mana de graça até o nível {n}.',
  ' Stamina restores on its own (+2 every 15 min, after 15 min without spending).':
    ' A stamina se restaura sozinha (+2 a cada 15 min, após 15 min sem gastar).',
  '👑 {name} RESISTS the stun! (rolled {roll})': '👑 {name} RESISTE ao atordoamento! (rolou {roll})',
  '🌟 {name} was IMMOBILISED! (rolled {roll})': '🌟 {name} foi IMOBILIZADO! (rolou {roll})',
  '{name} uses {move}!': '{name} usa {move}!',
  '{name} unleashes a {move}!': '{name} desfere um {move}!',
  '↩️ Counter-attack! {dmg} damage to {name}': '↩️ Contra-ataque! {dmg} de dano em {name}',
  '{name} fell! {n} remaining.': '{name} caiu! Restam {n}.',
  '👑 {name} conquered!': '👑 {name} conquistada!',
  'Transformation ended': 'A transformação acabou',
  '↩️ Your transformation ended.': '↩️ Sua transformação acabou.',
}
