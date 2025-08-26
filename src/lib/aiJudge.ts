import { Character, CombatAction, DiceType, ActionType } from '@/types/game';

export interface AIPrompt {
  type: 'combat' | 'dungeon' | 'narrative';
  context: string;
  playerAction?: string;
  systemContext?: string;
}

export interface AIResponse {
  narrative: string;
  outcome: 'success' | 'failure' | 'continue';
  additionalData?: any;
}

export class AIJudge {
  private static instance: AIJudge;
  private apiKey: string | undefined;

  private constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  public static getInstance(): AIJudge {
    if (!AIJudge.instance) {
      AIJudge.instance = new AIJudge();
    }
    return AIJudge.instance;
  }

  public generateCombatNarrative(
    action: CombatAction,
    attacker: Character,
    target?: Character
  ): string {
    const prompt = this.generateDetailedCombatPrompt(action, attacker, target);
    return this.generateFallbackResponse(prompt);
  }

  public generateDiceComment(diceRoll: {
    diceType: DiceType;
    roll: number;
    modifier: number;
    total: number;
    isCritical: boolean;
    description: string;
  }): string {
    const { description, isCritical, total } = diceRoll;
    if (isCritical) {
      return `🎲 CRÍTICO! ${description} - Um golpe decisivo!`;
    }
    if (total <= 2) {
      return `🎲 FALHA! ${description} - Que azar!`;
    }
    if (total >= 18) {
      return `🎲 SUCESSO! ${description} - Excelente jogada!`;
    }
    return `🎲 Rolagem: ${description}`;
  }

  public analyzeAndAdvise(player: Character, enemy: Character): string {
    const playerHealthPercentage = (player.hp / player.maxHp) * 100;
    const enemyHealthPercentage = (enemy.hp / enemy.maxHp) * 100;

    if (playerHealthPercentage < 30) {
      return 'Sua vida está baixa! Considere usar uma ação de defesa ou um item de cura para se recuperar.';
    }
    if (enemyHealthPercentage < 20) {
      return 'O inimigo está enfraquecido! Um ataque poderoso agora pode ser o golpe final.';
    }
    if (player.mp && player.mp > 0 && enemy.attributes.intelligence < player.attributes.intelligence) {
      return 'A resistência mágica do inimigo parece baixa. Usar uma magia pode ser muito eficaz.';
    }
    if (player.stamina && player.stamina < 20) {
        return 'Sua estamina está baixa. Evite ações que consumam muita energia.'
    }
    return 'Analise os pontos fracos do inimigo e ataque com precisão. A vitória está ao seu alcance!';
  }
  
  private generateDetailedCombatPrompt(
    action: CombatAction,
    attacker: Character,
    target?: Character
  ): string {
    const actionDescription = this.getActionDescription(action.actionType, attacker.name, target?.name);
    const damageInfo = action.damage ? ` causando ${action.damage} de dano` : '';
    const healingInfo = action.healing ? ` curando ${action.healing} de vida` : '';
    const criticalInfo = action.diceRoll?.isCritical ? ' Um golpe CRÍTICO!' : '';
    const missInfo = action.diceRoll?.total === 1 ? ' mas erra feio!' : '';

    return `Você é o narrador de um RPG épico.\n\n    CONTEXTO DA BATALHA:\n    - Atacante: ${attacker.name} (Raça: ${attacker.race.name}, Classe: ${attacker.class.name})\n    - Alvo: ${target ? `${target.name} (Raça: ${target.race.name}, Classe: ${target.class.name})` : 'N/A'}\n    - Ação: ${action.actionType}\n    - Detalhes da Ação: ${actionDescription}${damageInfo}${healingInfo}${criticalInfo}${missInfo}\n    - HP do Atacante: ${attacker.hp}/${attacker.maxHp}\n    - HP do Alvo: ${target ? `${target.hp}/${target.maxHp}` : 'N/A'}\n\n    TAREFA:\n    Narre este momento de combate de forma épica e cinematográfica, incluindo:\n    - Descrição da ação executada com detalhes vívidos.\n    - Impacto visual e sonoro da ação.\n    - Reação do alvo (se houver).\n    - Atmosfera de tensão e dinamismo.\n\n    ESTILO:\n    - Épico e dramático.\n    - Máximo 3 frases.\n    - Focado na ação e impacto visual.\n    - Inspire emoção e imersão.\n\n    EXEMPLO:\n    "Arkantos ergue sua espada, a lâmina cintilando com energia arcana, e desfere um golpe devastador contra o Orc Guerreiro! O impacto ressoa como um trovão, fazendo o monstro cambalear para trás, com uma nova ferida profunda em sua armadura."`;
  }

  private getActionDescription(actionType: ActionType, attackerName: string, targetName?: string): string {
    switch (actionType) {
      case ActionType.ATTACK:
        return `${attackerName} avança com ferocidade e desfere um ataque poderoso${targetName ? ` contra ${targetName}` : ''}`;
      case ActionType.DEFEND:
        return `${attackerName} ergue sua guarda, preparando-se para mitigar o próximo ataque`;
      case ActionType.DODGE:
        return `${attackerName} se move com agilidade, tentando esquivar-se de qualquer investida`;
      case ActionType.COUNTER_ATTACK:
        return `${attackerName} aguarda o momento certo e contra-ataca com precisão${targetName ? ` o ataque de ${targetName}` : ''}`;
      case ActionType.MAGIC:
        return `${attackerName} conjura uma magia poderosa, liberando energia arcana${targetName ? ` em direção a ${targetName}` : ''}`;
      case ActionType.ITEM:
        return `${attackerName} utiliza um item estratégico`;
      case ActionType.TRANSFORM:
        return `${attackerName} invoca seu poder interior e se transforma`;
      default:
        return `${attackerName} realiza uma ação inesperada`;
    }
  }

  public async judgeCombat(attacker: string, target: string, action: string, diceResult: number, damage: number, context: string): Promise<string> {
    const prompt = this.generateCombatPrompt(attacker, target, action, diceResult, damage, context);
    return this.generateResponse(prompt);
  }

  public async generateDungeonNarrative(dungeonName: string, dungeonType: string, biome: string, floor: number, playerAction: string, eventType: string, playerName: string, result?: any): Promise<string> {
      const prompt = this.generateDungeonPrompt(dungeonName, dungeonType, biome, floor, playerAction, eventType, playerName, result);
      return this.generateResponse(prompt);
  }

  public async generateExplorationResult(biome: string, floor: number, playerName: string, action: string, success: boolean, rewards?: any): Promise<string> {
      if (success) {
          return `${playerName} explora o(a) ${biome} no andar ${floor} e encontra ${rewards || 'algo interessante'}.`;
      }
      return `${playerName} explora o(a) ${biome} no andar ${floor}, mas não encontra nada de especial.`;
  }

  public async generateMiningResult(biome: string, floor: number, playerName: string, diceRoll: number, materialsFound: any[]): Promise<string> {
      if (materialsFound.length > 0) {
          return `${playerName} minera com sucesso no(a) ${biome} e coleta ${materialsFound.map(m => m.name).join(', ')}.`;
      }
      return `${playerName} tenta minerar, mas não encontra nenhum material valioso.`;
  }

  private generateCombatPrompt(
    attacker: string,
    target: string,
    action: string,
    diceResult: number,
    damage: number,
    context: string
  ): string {
    return `Você é o narrador de um RPG épico inspirado em Solo Leveling.\n\n    CONTEXTO DA BATALHA:\n    - Atacante: ${attacker}\n    - Alvo: ${target}\n    - Ação: ${action}\n    - Resultado do dado: ${diceResult}\n    - Dano causado: ${damage}\n    - Contexto adicional: ${context}\n\n    TAREFA:\n    Narre este momento de combate de forma épica e cinematográfica, incluindo:\n    - Descrição da ação executada\n    - Impacto visual e sonoro\n    - Reação do alvo\n    - Atmosphere de tensão\n\n    ESTILO:\n    - Épico e dramático\n    - Máximo 3 frases\n    - Focado na ação e impacto visual\n    - Inspire emoção e imersão\n\n    EXEMPLO:\n    "Gorak ergue sua espada e desfere um golpe devastador! A lâmina corta o ar com um assobio mortal, encontrando seu alvo em uma explosão de faíscas. O inimigo recua, sangue escorrendo pela ferida, os olhos agora cheios de respeito e medo."`;
  }

  private generateDungeonPrompt(
    dungeonName: string,
    dungeonType: string,
    biome: string,
    floor: number,
    playerAction: string,
    eventType: string,
    playerName: string,
    result?: any
  ): string {
    return `Você é o Dungeon Master de "${dungeonName}", um RPG inspirado em Solo Leveling.\n\n    CONTEXTO:\n    - Dungeon: ${dungeonName}\n    - Tipo: ${dungeonType}\n    - Bioma: ${biome}\n    - Andar: ${floor}\n    - Jogador: ${playerName}\n    - Ação do jogador: ${playerAction}\n    - Tipo de evento: ${eventType}\n    - Resultado: ${result ? JSON.stringify(result) : 'N/A'}\n\n    TAREFA:\n    Narre o resultado desta ação de forma imersiva e envolvente:\n    - Descreva o ambiente ao redor\n    - Relate o que acontece como resultado da ação\n    - Mantenha a tensão e mistério\n    - Sugira sutilmente próximas possibilidades\n\n    ESTILO:\n    - Atmosférico e imersivo\n    - Máximo 3 frases\n    - Focado na experiência sensorial\n    - Mantenha o jogador engajado\n\n    EXEMPLO:\n    "Você caminha pelas Cavernas de Cristal, onde cristais azulados pulsam com energia mágica. Suas pegadas ecoam no silêncio, quando de repente, você ouve um som estranho vindo de uma passagem lateral. O ar fica mais denso, e você sente que algo importante está por vir..."`;
  }

  private async generateResponse(prompt: string): Promise<string> {
    if (!this.apiKey) {
      return this.generateFallbackResponse(prompt);
    }
    
    try {
      // This is where you would implement the actual call to OpenAI
      // For now, we're using a fallback
      return this.generateFallbackResponse(prompt);
    } catch (error) {
      console.error('Erro ao gerar resposta da IA:', error);
      return this.generateFallbackResponse(prompt);
    }
  }

  private generateFallbackResponse(prompt: string): string {
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes('combate') || promptLower.includes('ataque')) {
      const combatResponses = [
        'O golpe ressoa pelo ar com força devastadora, encontrando seu alvo em uma explosão de energia!',
        'A lâmina corta o ar com precisão mortal, causando um dano significativo ao inimigo.',
        'O ataque conecta com um som ensurdecedor, fazendo o oponente recuar com dor.',
        'Uma rajada de poder se liberta no momento do impacto, iluminando o campo de batalha.',
        'O guerreiro executa seu movimento com perfeição, deixando uma marca duradoura no adversário.'
      ];
      return combatResponses[Math.floor(Math.random() * combatResponses.length)];
    }
    
    if (promptLower.includes('mineração') || promptLower.includes('minerar')) {
      const miningResponses = [
        'Suas ferramentas encontram uma veia rica de material, e cristais brilhantes se revelam na rocha.',
        'O som metálico ecoa enquanto você extrai cuidadosamente os recursos valiosos da parede.',
        'A rocha se despedaça revelando tesouros escondidos, recompensando sua persistência.',
        'Você golpeia a superfície e faísca voam, indicando a presença de materiais preciosos.',
        'Com técnica apurada, você consegue extrair materiais de qualidade superior.'
      ];
      return miningResponses[Math.floor(Math.random() * miningResponses.length)];
    }
    
    if (promptLower.includes('exploração') || promptLower.includes('explorar')) {
      const explorationResponses = [
        'Você avança cautelosamente, seus sentidos alertas para qualquer perigo ou oportunidade.',
        'O ambiente ao redor pulsa com energia misteriosa, sugerindo segredos ainda não revelados.',
        'Seus passos ecoam no silêncio, enquanto você se aprofunda nos mistérios deste lugar.',
        'A atmosfera se torna mais intensa à medida que você explora territórios desconhecidos.',
        'Cada passo revela novos detalhes sobre este local enigmático e suas possibilidades.'
      ];
      return explorationResponses[Math.floor(Math.random() * explorationResponses.length)];
    }
    
    return 'A aventura continua, e novos desafios aguardam à frente. Prepare-se para o que está por vir!';
  }
}

export const aiJudge = AIJudge.getInstance();