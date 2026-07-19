// Coleta / Mapa do Reino (KingdomMap.tsx + página /gathering).
export const GATHERING_PT: Record<string, string> = {
  'Kingdom Map': 'Mapa do Reino',
  'Kingdom of Dolrath': 'Reino de Dolrath',
  'Gathering Regions': 'Regiões de Coleta',
  'Dolrath Village': 'Vila de Dolrath',
  'Farm': 'Fazenda',
  'free': 'livre',
  'free (plural)': 'livres',
  '{n} in the field': '{n} em campo',
  'Lv.': 'Nv.',
  'MAX': 'MÁX',
  'Hero': 'Herói',
  'hero': 'herói',
  'Close': 'Fechar',
  'Cancel': 'Cancelar',

  // Nós do mapa
  'Herbs & Seeds': 'Ervas & Sementes',
  'Ore & Stone': 'Minério & Pedra',
  'Wood & Sap': 'Madeira & Seiva',
  'Fish & Seafood': 'Peixe & Frutos do Mar',
  'Meat & Leather': 'Carne & Couro',
  'Rare ingredients': 'Ingredientes raros',
  'Legendary reagents': 'Reagentes lendários',
  'Misty Marsh': 'Pântano das Brumas',
  'Volcanic Wastes': 'Ermo Vulcânico',
  'Open meadows under the sun; the scent of mint drifts on the wind — and only here do seeds sprout.':
    'Campinas abertas ao sol; o cheiro de hortelã paira no vento — e só aqui nascem sementes.',
  'Cracked slopes expose metallic veins gleaming in the half-light.':
    'Encostas rachadas expõem veios metálicos que reluzem na penumbra.',
  'Millennial trees whisper; light barely pierces the dense canopy.':
    'Árvores milenares sussurram; a luz mal atravessa a copa cerrada.',
  'Cliffs swept by salty wind; low tide draws pools full of life. Requires an equipped Fishing Rod.':
    'Falésias varridas pelo vento salgado; a maré baixa desenha poças cheias de vida. Exige uma Vara de Pesca equipada.',
  'Fresh tracks cross the forest edge — meat and leather without touching the herd. Requires an equipped Hunting Knife.':
    'Rastros frescos cruzam a orla da mata — carne e couro sem tocar no gado. Exige uma Faca de Caça equipada.',
  'Dense fog hides rare ingredients. The trail there has not been opened yet.':
    'Névoa densa esconde ingredientes raros. A trilha até lá ainda não foi aberta.',
  'Rivers of lava guard reagents of legendary potions. An expedition is still impossible.':
    'Rios de lava guardam reagentes de poções lendárias. Expedição ainda impossível.',

  // Painel da região
  '15-min tick': 'tique 15 min',
  'Region haul': 'Espólio da região',
  'Crop seeds': 'Sementes de cultivo',
  'Region locked': 'Região bloqueada',
  'There is no trail here yet — this region arrives in a future expedition.':
    'Ainda não há trilha até aqui — esta região chega numa próxima expedição.',
  '⏳ Coming soon': '⏳ Em breve',
  '🔒 Sending new heroes: Gathering Lv.{n}': '🔒 Enviar novos heróis: Coleta Nv.{n}',
  'Best hero: Lv.{n}. If someone is already gathering here, you can still stop the session below.':
    'Melhor herói: Nv.{n}. Se alguém já estiver coletando aqui, você ainda pode encerrar a sessão abaixo.',
  'Gathering Lv.{n}': 'Coleta Nv.{n}',
  '🔒 Gathering Lv.{n}': '🔒 Coleta Nv.{n}',

  // Sessão ativa
  '🎒 Inventory full — gathering paused, no stamina spent. Free up space to continue.':
    '🎒 Inventário cheio — coleta pausada, sem gastar stamina. Abra espaço para continuar.',
  '⏳ Stopping on its own at the end of this cycle ({time}) — no stamina spent on a new one.':
    '⏳ Encerrando sozinho ao fim deste ciclo ({time}) — sem gastar stamina num ciclo novo.',
  '💤 Stamina exhausted': '💤 Stamina esgotada',
  'Waiting for space…': 'Aguardando espaço…',
  'Gathering · 1 tick': 'Coletando · 1 tique',
  'Gathering · {n} ticks': 'Coletando · {n} tiques',
  'haul ready': 'espólio pronto',
  '🎒 paused': '🎒 pausado',
  'gathering': 'coletando',
  '🎒 Accumulated haul': '🎒 Espólio acumulado',
  'Nothing yet — the first tick yields within 15 min. You can close the page: gathering continues.':
    'Nada ainda — o primeiro tique rende em até 15 min. Pode fechar a página: a coleta continua.',
  '+{n} Gathering XP on collect': '+{n} XP de Coleta ao coletar',
  '⚡ {cur}/{max} stamina · a 15-min tick costs {cost} ⚡': '⚡ {cur}/{max} de stamina · tique de 15 min custa {cost} ⚡',
  'broken — no bonus (repair with a copy)': 'quebrada — sem bônus (repare com uma cópia)',
  '+{pct}% yield · durability {cur}/{max}': '+{pct}% rendimento · durabilidade {cur}/{max}',
  '🎒 Collect haul': '🎒 Coletar espólio',
  '↩️ Cancel': '↩️ Cancelar',
  '🚪 Stop': '🚪 Encerrar',
  '🚪 Stop gathering?': '🚪 Encerrar a coleta?',
  'Stop now (losing the cycle in progress) or wait for the current cycle to finish — the last haul drops on its own and the hero is freed without spending stamina on a new cycle.':
    'Encerre agora (perde o ciclo em curso) ou espere o ciclo atual terminar — o último espólio cai sozinho e o herói é liberado sem gastar stamina num ciclo novo.',
  '⏳ Wait for the last cycle ({time})': '⏳ Aguardar último ciclo ({time})',
  '🚪 Stop now': '🚪 Encerrar agora',

  // Envio de herói
  'Gathering now': 'Em coleta',
  'Send hero': 'Enviar herói',
  'No hero gathering in this field.': 'Nenhum herói coletando neste campo.',
  "No free hero — everyone is in the field or you haven't created one yet. Collect a haul to free someone up.":
    'Nenhum herói livre — todos estão em campo ou você ainda não criou um. Recolha um espólio para liberar alguém.',
  '💀 dead': '💀 morto',
  '⚡ no stamina': '⚡ sem stamina',
  'Each 15-min tick costs': 'Cada tique de 15 min custa',
  'and the hero stays busy until you stop.': 'e o herói fica ocupado até você encerrar.',
  'Send {name} to gather': 'Enviar {name} para coletar',
  'Pick a hero': 'Escolha um herói',

  // Rodapé
  '🫘 Seeds only drop in the Herb Fields — plant them at the': '🫘 Sementes só caem nos Campos de Ervas — plante-as na',
  'Rare boss resources remain exclusive to dungeons.': 'Recursos raros de chefe seguem exclusivos das masmorras.',

  // Página /gathering (container)
  '🎒 Nothing to collect yet.': '🎒 Nada para coletar ainda.',
  '🎒 Collected: {items} (+{xp} XP)': '🎒 Coletado: {items} (+{xp} XP)',
  "⚠️ {n} item(s) didn't fit in the inventory": '⚠️ {n} item(ns) não couberam no inventário',
  '⏳ Scheduled stop completed —': '⏳ Encerramento agendado concluído —',
  '⛏️ You reached Gathering Level {n}!': '⛏️ Você subiu para o Nível {n} de Coleta!',
  'Failed to perform the action': 'Erro ao executar a ação',
  '⏳ Stop scheduled — gathering finishes the current cycle and closes on its own, without spending stamina on a new one.':
    '⏳ Encerramento agendado — a coleta termina o ciclo atual e fecha sozinha, sem gastar stamina num ciclo novo.',
  '▶️ Scheduled stop cancelled — gathering continues normally.': '▶️ Encerramento agendado cancelado — a coleta continua normalmente.',
  '⚔️ {hero} set out for {field}.': '⚔️ {hero} partiu para {field}.',
  'Unrolling the kingdom map…': 'Desenrolando o mapa do reino…',
}
