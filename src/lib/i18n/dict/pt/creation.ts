// Criação de personagem — aparência, transformação e prévias de raça/classe.
export const CREATION_PT: Record<string, string> = {
  // Atributos
  'Strength': 'Força',
  'Agility': 'Agilidade',
  'Intelligence': 'Inteligência',
  'Defense': 'Defesa',

  // Prévia da raça
  'Race Preview': 'Prévia da Raça',
  '🌀 Transformation': '🌀 Transformação',
  '🌀 Transformation ({n} forms)': '🌀 Transformação ({n} formas)',
  '{n} turns': '{n} turnos',
  'Activated in combat by spending MP and stamina; lasts a few turns and goes on cooldown afterwards.':
    'Ativável em combate gastando MP e stamina; dura alguns turnos e entra em recarga depois.',
  'Restrictions:': 'Restrições:',
  'Racial Bonuses Applied:': 'Bônus Raciais Aplicados:',
  'Added to the class bonuses and the distributed points.':
    'Somados aos bônus de classe e aos pontos distribuídos.',
  'Select a race to see the details and racial bonuses. The final character attributes are rolled automatically further ahead.':
    'Selecione uma raça para ver os detalhes e bônus raciais. Os atributos finais do personagem serão rolados automaticamente mais adiante.',

  // Prévia da classe
  'Class Preview': 'Prévia da Classe',
  'Secondary': 'Secundário',
  'Attribute Bonuses:': 'Bônus de Atributos:',
  'Added to the racial bonuses and the points rolled at the mint.':
    'Somados aos bônus raciais e aos pontos rolados no mint.',
  'Select a class to see the details and attribute bonuses.':
    'Selecione uma classe para ver os detalhes e bônus de atributos.',

  // Resumo
  'The attributes (STR/AGI/INT/DEF) are revealed at the moment of the mint.':
    'Os atributos (STR/AGI/INT/DEF) são revelados no momento do mint.',
  'Race:': 'Raça:',
  'Transformation:': 'Transformação:',

  // Aparência
  'Character Appearance': 'Aparência do Personagem',
  'The AI generates the unique image of your NFT (included in the creation fee). Afterwards, if you want to change something, you can request adjustments paying {cost} USDC per version — or upload your own image.':
    'A IA gera a imagem única da sua NFT (inclusa na taxa de criação). Depois, se quiser mudar algo, você pode pedir ajustes pagando {cost} USDC por versão — ou fazer upload da sua própria imagem.',
  'Optional: describe the image you want. If empty, the AI generates using the lore + race/class + your attributes.':
    'Opcional: descreva a imagem que você quer. Se vazio, a IA gera usando a lore + raça/classe + seus atributos.',
  'Select a race first to generate images.': 'Selecione uma raça primeiro para gerar imagens.',
  'Your included image has already been generated. Want to change something? Use the adjustments panel below ({cost} USDC per version).':
    'Sua imagem inclusa já foi gerada. Quer mudar algo? Use o painel de ajustes abaixo ({cost} USDC por versão).',
  'Creating the unique image of your hero…': 'Criando a imagem única do seu herói…',
  'Choose the version that becomes your NFT': 'Escolha a versão que vira sua NFT',
  'Your image': 'Sua imagem',
  'Option {n}': 'Opção {n}',
  'Describe what you want to change in the selected image — the AI keeps the same character and applies only your adjustments (the cost covers generating the image and refining the prompt). The previous version stays available for':
    'Descreva o que quer mudar na imagem selecionada — a IA mantém o mesmo personagem e aplica só os seus ajustes (custo cobre a geração da imagem e o refinamento do prompt). A versão anterior continua disponível para',
  'e.g. longer white hair, hood down, scar on the left eye, background with ruins…':
    'Ex: cabelo mais longo e branco, capuz abaixado, cicatriz no olho esquerdo, fundo com ruínas…',
  'Generating new version...': 'Gerando nova versão...',
  'New version generated! Compare and pick the one you prefer.':
    'Nova versão gerada! Compare e escolha a que preferir.',

  // Transformação
  'Revealing your hero combat form…': 'Revelando a forma de combate do seu herói…',
  'Optional: what do you want to change in this form? e.g. more intense aura, keep the staff visible…':
    'Opcional: o que quer mudar nesta forma? Ex: aura mais intensa, manter o cajado visível…',
  'Failed to generate the transformation': 'Falha ao gerar a transformação',
  'Error generating transformation': 'Erro ao gerar transformação',
  'Transformation': 'Transformação',
  'This race has no combat transformation. You can move on to the confirmation.':
    'Esta raça não possui uma transformação de combate. Você pode seguir para a confirmação.',
  'Transformations': 'Transformações',
  'As a shapeshifter, you master ': 'Como metamorfo, você domina ',
  'all': 'todas',
  ' the forms. The AI uses your human image to create the art of each one — in combat (dungeon and PvP) you choose on the spot.':
    ' as formas. A IA usa sua imagem humana para criar a arte de cada uma — em combate (masmorra e PvP) você escolhe na hora.',
  'Not generated yet': 'Ainda não gerada',
  'The AI uses your image to reveal the form your hero takes in combat — the same character, in the same outfit, taken over by the energy of the transformation. The first generation is included; regenerating with adjustments costs {cost} USDC.':
    'A IA usa sua imagem para revelar a forma que seu herói assume em combate — o mesmo personagem, com o mesmo traje, tomado pela energia da transformação. A primeira geração está inclusa; regerar com ajustes custa {cost} USDC.',
  'Generating transformation...': 'Gerando transformação...',
  'Waiting for generation...': 'Aguardando geração...',
  'Primary': 'Principal',
  'Rare': 'Raro',
  'Abilities:': 'Habilidades:',
  'How the 18 points roll:': 'Como os 18 pontos rolam:',
  'Rolled automatically at the mint — each character comes out a little different.':
    'Sorteados automaticamente no mint — cada personagem sai um pouco diferente.',
  'Special Ability': 'Habilidade Especial',
  'Character Summary': 'Resumo do Personagem',
  'Your Character': 'Seu Personagem',
  'Class:': 'Classe:',
  'Fill in the previous steps to see your character summary.':
    'Preencha os passos anteriores para ver o resumo do seu personagem.',
  'Choose the character image first.': 'Escolha a imagem do personagem primeiro.',
  'Generate all missing ones': 'Gerar todas as faltantes',
  'Generating...': 'Gerando...',
  'Generate': 'Gerar',
  'Failed to generate images': 'Erro ao gerar imagens',
  'Failed to regenerate the image': 'Falha ao regerar imagem',
  'Failed to adjust the image': 'Erro ao ajustar imagem',
  'Generate with AI': 'Gerar com IA',
  'Generate Image': 'Gerar Imagem',
  'Manual Upload': 'Upload Manual',
  'Want to change something? ({cost} USDC)': 'Quer mudar algo? ({cost} USDC)',
  'Pay {cost} USDC and adjust': 'Pagar {cost} USDC e ajustar',
  ' the forms. The AI uses your human image to create the art of each one — in combat (dungeon and PvP) you choose which to take on. Generate the {n} forms to finish.':
    ' as formas. A IA usa sua imagem humana para criar a arte de cada uma — em combate (masmorra e PvP) você escolhe na hora qual assumir. Gere as {n} formas para concluir.',
  'Adjust and generate again ({cost} USDC)': 'Ajustar e gerar de novo ({cost} USDC)',
  'Pay {cost} USDC and generate': 'Pagar {cost} USDC e gerar',
  'Custom prompt (optional)': 'Prompt personalizado (opcional)',
  'Collecting and tuning the prompt for the lore of Dolrath…':
    'Coletando e ajustando o prompt para a lore de Dolrath…',
  'Finishing…': 'Finalizando…',
  'Confirming the payment…': 'Confirmando o pagamento…',
  'Applying your adjustments to the image…': 'Aplicando seus ajustes na imagem…',
  'Describe what you want to change in the selected image — the AI keeps the same character and applies only your adjustments (the cost covers generating the image and refining the prompt). The previous version stays available to compare.':
    'Descreva o que quer mudar na imagem selecionada — a IA mantém o mesmo personagem e aplica só os seus ajustes (custo cobre a geração da imagem e o refinamento do prompt). A versão anterior continua disponível para comparar.',
  'Choose your Race': 'Escolha sua Raça',
  'Each race has unique attributes and special abilities': 'Cada raça possui atributos únicos e habilidades especiais',
  'Choose your Class': 'Escolha sua Classe',
  'Each class has unique abilities and gear': 'Cada classe possui habilidades e equipamentos únicos',
  'The AI takes a few seconds — do not close this window.': 'A IA leva alguns segundos — não feche esta janela.',
  'Character attribute distribution': 'Distribuição de atributos do personagem',
}
