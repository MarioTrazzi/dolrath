// Traduções que ficaram faltando de telas já convertidas para t():
// criação (NameConfirmStep), carteira, bancada de restauração e página de item.
export const WALLET_PT: Record<string, string> = {
  // Criação — confirmação do nome + mint
  'Character Name': 'Nome do Personagem',
  'Choose an epic name for your hero': 'Escolha um nome épico para o seu herói',
  "Enter your character's name": 'Digite o nome do seu personagem',
  'Name must be at least 2 characters': 'O nome precisa ter pelo menos 2 caracteres',
  'Name must be at most 20 characters': 'O nome pode ter no máximo 20 caracteres',
  'Name must contain only letters': 'O nome só pode conter letras',
  'Race not selected': 'Raça não selecionada',
  'Class not selected': 'Classe não selecionada',
  'Incomplete character data. Go back and finish the previous steps.':
    'Dados do personagem incompletos. Volte e conclua os passos anteriores.',
  'Payment required to create the character': 'Pagamento necessário para criar o personagem',
  'Invalid mint intent (server)': 'Intenção de mint inválida (servidor)',
  'Could not identify the minted tokenId': 'Não foi possível identificar o tokenId cunhado',
  'Failed to create character: invalid server response':
    'Falha ao criar personagem: resposta inválida do servidor',
  'NFT created successfully': 'NFT criada com sucesso',
  'Create Character': 'Criar Personagem',
  'Creating (minting NFT)...': 'Criando (cunhando NFT)...',
  'The wallet connected in MetaMask is not the one linked to your account.':
    'A carteira conectada na MetaMask não é a vinculada à sua conta.',
  'Attributes revealed': 'Atributos revelados',
  'Attributes': 'Atributos',
  'STRENGTH': 'FORÇA',
  'AGILITY': 'AGILIDADE',
  'INTELLIGENCE': 'INTELIGÊNCIA',
  'DEFENSE': 'DEFESA',
  '✨ EXCEPTIONAL {stat}!': '✨ {stat} EXCEPCIONAL!',
  'Stats (from NFT)': 'Atributos (da NFT)',
  'Image (NFT)': 'Imagem (NFT)',
  'On-chain data': 'Dados on-chain',
  'The information below comes from the NFT tokenURI (on-chain).':
    'As informações abaixo vêm do tokenURI da NFT (on-chain).',
  'Click to see the transformation': 'Clique para ver a transformação',
  'See transformation': 'Ver transformação',
  'See base form': 'Ver forma base',

  // Carteira
  'Log In': 'Entrar',
  'Log in to continue': 'Faça login para continuar',
  'You need to be logged in.': 'Você precisa estar logado.',
  'Connect your wallet first': 'Conecte sua carteira primeiro',
  'Connect your wallet to claim.': 'Conecte sua carteira para reivindicar.',
  'Connect your wallet to see the balance.': 'Conecte sua carteira para ver o saldo.',
  'See your on-chain balance and claim your accumulated GOLD.':
    'Veja seu saldo on-chain e reivindique o GOLD acumulado.',
  'Claim GOLD': 'Reivindicar GOLD',
  'Claimable': 'Reivindicável',
  'GOLD claimed on-chain!': 'GOLD reivindicado on-chain!',
  'Pending claim: {n} GOLD (expires {date})': 'Claim pendente: {n} GOLD (expira {date})',
  'Refreshing…': 'Atualizando…',
  'Gold': 'Ouro',
  'Get updates': 'Receber novidades',
  'Optional. Add an email to receive Dolrath news and be able to recover your account.':
    'Opcional. Adicione um email para receber novidades de Dolrath e poder recuperar sua conta.',
  'Enter an email': 'Informe um email',
  'Registered email:': 'Email cadastrado:',
  'Email saved! You\'ll receive Dolrath news.': 'Email salvo! Você vai receber as novidades de Dolrath.',
  'Failed to save email': 'Falha ao salvar o email',
  'Save': 'Salvar',
  'Saving…': 'Salvando…',

  // Bancada de restauração
  '⚗️ Restoration': '⚗️ Restauração',
  '⚗️ Restore Health and Mana — Free': '⚗️ Restaurar Vida e Mana — Grátis',
  '⚗️ Restore Health and Mana — {cost} 🪙': '⚗️ Restaurar Vida e Mana — {cost} 🪙',
  '⚗️ You are whole': '⚗️ Você está inteiro',
  'Restored!': 'Restaurado!',
  'Reading your pulse…': 'Sentindo seu pulso…',
  'Health': 'Vida',
  'Mana': 'Mana',
  'Select a character.': 'Selecione um personagem.',
  'The price follows how much is missing and your level.':
    'O preço acompanha o quanto falta e o seu nível.',
  'Free through level {level}; after that the alchemist charges for the service.':
    'Grátis até o nível {level}; depois disso a alquimista cobra pelo serviço.',
  'Health and mana carry over between dungeon runs. The alchemist brings both back to full at once — potions are the alternative, and the only option mid-fight.':
    'Vida e mana persistem entre as runs de masmorra. A alquimista devolve as duas ao cheio de uma vez — poções são a alternativa, e a única opção no meio da luta.',

  // Venda no ferreiro
  'Sell {label} to the blacksmith for {total} gold?\nThe gold goes to the bank. The item will be destroyed (cannot be undone).':
    'Vender {label} ao ferreiro por {total} de ouro?\nO ouro vai para o banco. O item será destruído (não dá para desfazer).',
  'Sell {label} to the blacksmith for {total} gold?\nThe item will be destroyed (cannot be undone).':
    'Vender {label} ao ferreiro por {total} de ouro?\nO item será destruído (não dá para desfazer).',
  'Sell {n}x {name} to the blacksmith for {total} gold?\nThe item will be destroyed (cannot be undone).':
    'Vender {n}x {name} ao ferreiro por {total} de ouro?\nO item será destruído (não dá para desfazer).',
  'Sell {n}x {name} to the blacksmith for {total} gold?\nThe items will be destroyed (cannot be undone).':
    'Vender {n}x {name} ao ferreiro por {total} de ouro?\nOs itens serão destruídos (não dá para desfazer).',
  'The blacksmith will sell {units} {mat} and melt it on the spot for {gold} 🪙.\nDurability: {from} → {to}. Continue?':
    'O ferreiro vende {units} {mat} e funde na hora por {gold} 🪙.\nDurabilidade: {from} → {to}. Continuar?',

  // Página do item
  'Item not found': 'Item não encontrado',
  'Loading item details...': 'Carregando detalhes do item...',
  'Loading metadata...': 'Carregando metadados...',
  'Failed to load NFT metadata.': 'Falha ao carregar os metadados da NFT.',
  'No image in the metadata.': 'Sem imagem nos metadados.',
  'Back to inventory': 'Voltar ao inventário',
  'Description': 'Descrição',
  'Item Lore': 'Lore do Item',

  // Ficha
  'Gear quality': 'Qualidade do equipamento',
  'rarity x enhancement across 9 slots': 'raridade x aprimoramento nos 9 slots',
}
