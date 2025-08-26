# Dolrath RPG - Sistema de Combate Tokenizado

🎲 **RPG com IA como Juiz Automático + Tokenização da Economia**

Sistema de combate baseado em chat com IA inteligente que julga e narra combates automaticamente. Inspirado no sistema original "Dolrath" com elementos de Solo Leveling.

## 🚀 Funcionalidades Principais

### ✅ Implementado na Fase 1

- **Sistema de Combate por Turnos**
  - Iniciativa baseada em D20
  - Ações declaradas entre colchetes: `[ataque]`, `[defender]`, `[esquivar]`
  - Dados diferenciados por arma (D6-D12)
  - Modificadores baseados em atributos
  - Críticos 19-20 com dano multiplicado

- **IA Juiz Automático**
  - Cálculo automático de modificadores
  - Rolagem instantânea de dados
  - Narrativa dinâmica baseada em raça/classe
  - Análise estratégica e dicas em tempo real
  - Disponível 24/7 sem necessidade de juiz humano

- **Chat de Batalha**
  - Interface de chat em tempo real
  - Reconhecimento de ações entre colchetes
  - Botões de ação rápida
  - Histórico completo de combate
  - Indicadores visuais de turno

- **Sistema de Personagens**
  - **Raças**: Humanos, Draconianos, Metamorfos
  - **Classes**: Guerreiro, Ladino, Mago, Monge
  - Sistema de atributos (FOR, AGI, INT, CON, SAB, CAR)
  - Equipamentos com durabilidade e bônus

### 🔄 Próximas Fases

- **Fase 2**: Sistema de XP, Templos de Treinamento, Transformações
- **Fase 3**: Dungeons Procedurais, Materiais, Tokenização
- **Fase 4**: Guildas, PvP Ranqueado, Eventos Especiais

## 🎮 Como Jogar

### Criando Personagem
1. Acesse `/character` para criar seu personagem
2. Escolha raça, classe, nível e equipamentos
3. Visualize atributos e poder de combate

### Combate
1. Acesse `/combat` para iniciar um combate
2. Digite ações entre colchetes no chat:
   - `[ataque]` - Ataque básico
   - `[defender]` - Posição defensiva
   - `[esquivar]` - Preparar esquiva
   - `[contra-ataque]` - Ataque arriscado com mais dano
3. A IA narrará os resultados automaticamente
4. Use botões de ação rápida para conveniência

### Exemplo de Combate
```
Jogador: [ataque]
IA: Gorak o Destemido desfere um golpe preciso brandindo sua arma com maestria contra Drako Flamejante!
    💥 Dano: 8 ❤️ HP: 142/150
    🎲 7 + 4 = 11 🎯
```

## 🛠️ Tecnologias

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Icons**: Lucide React
- **Animations**: Framer Motion

## 🏗️ Arquitetura

```
src/
├── app/                 # Pages (Next.js 14 App Router)
│   ├── page.tsx        # Homepage
│   ├── combat/         # Arena de combate
│   └── character/      # Criador de personagens
├── components/         # Componentes reutilizáveis
│   ├── CombatChat.tsx  # Chat de batalha
│   └── CharacterStatus.tsx # Status do personagem
├── lib/                # Lógica de negócio
│   ├── combatSystem.ts # Sistema de combate
│   ├── aiJudge.ts      # IA juiz automático
│   ├── characterFactory.ts # Factory de personagens
│   └── gameData.ts     # Dados do jogo
└── types/              # Tipos TypeScript
    ├── game.ts         # Tipos principais
    └── dice.ts         # Sistema de dados
```

## 🎯 Mecânicas Implementadas

### Sistema de Combate
- **Iniciativa**: D20 + modificador de agilidade
- **Ataque**: Dado da arma + modificador de força vs defesa do oponente
- **Defesa**: D20 + modificador de agilidade
- **Críticos**: 19-20 no D20 = dano x2 + narrativa especial
- **Contra-ataque**: -2 no ataque, +50% dano se acertar

### Modificadores
- **Cálculo**: `(Atributo ÷ 100) × 10`
- **Exemplo**: 400 de força = +4 no dado

### Dados por Arma
- **Punhos**: D6
- **Adaga**: D6
- **Arco**: D8
- **Cajado**: D8
- **Espada**: D10
- **Maça**: D10
- **Espada Dracônica**: D12

## 🔮 Visão Futura - Sistema Tokenizado

### Ativos Principais
- **Personagens**: NFTs únicos com atributos
- **Armas Lendárias**: NFTs com stats específicos
- **Materiais**: Tokens fungíveis para reparo/upgrade
- **Conquistas**: NFTs de marcos especiais

### Economia Sustentável
- **Burn Natural**: Reparos custam % do valor da arma
- **Utilidade Real**: Tokens necessários para progressão
- **Balanceamento**: Economia autoequilibrada via uso

## 🚀 Instalação e Execução

```bash
# Instalar dependências
npm install

# Executar em desenvolvimento
npm run dev

# Acessar aplicação
http://localhost:3000
```

## 📝 Comandos de Combate

| Comando | Ação | Efeito |
|---------|------|--------|
| `[ataque]` | Ataque básico | Dado da arma + força |
| `[defender]` | Posição defensiva | Bônus de defesa |
| `[esquivar]` | Preparar esquiva | Bônus de esquiva |
| `[contra-ataque]` | Ataque arriscado | -2 atacar, +50% dano |

## 🎨 Temas Visuais

- **Cores Principais**: Roxo (#8B5CF6), Ciano (#06B6D4), Âmbar (#F59E0B)
- **Dark Mode**: Tema escuro com gradientes
- **Animações**: Dados, golpes críticos, level up
- **Responsive**: Adaptável a todos os dispositivos

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto é open source e está disponível sob a licença MIT.

---

**Dolrath RPG** - Onde a tradição dos RPGs clássicos encontra a inovação da IA e blockchain! 🎲⚔️ 