# Sistema de Dungeons - Dolrath RPG

## Visão Geral

O Sistema de Dungeons é um recurso completo implementado para o Dolrath RPG, um jogo inspirado em Solo Leveling que combina mecânicas nostálgicas de RPG por chat com elementos modernos de progressão e tokenização.

## Funcionalidades Implementadas

### 🏰 Tipos de Dungeon

#### Combat Dungeons
- **Foco**: Combate contra monstros
- **Mecânica**: Progressão através de andares com inimigos cada vez mais fortes
- **Recompensas**: XP, materiais de combate, equipamentos
- **Exemplo**: "Cavernas dos Goblins" (Rank E)

#### Mining Dungeons
- **Foco**: Exploração e coleta de materiais
- **Mecânica**: Mineração com teste de dados baseado em Inteligência
- **Recompensas**: Materiais para crafting, recursos raros
- **Exemplo**: "Mina de Ferro Abandonada" (Rank E)

#### Mixed Dungeons
- **Foco**: Combinação de combate e mineração
- **Mecânica**: Escolhas estratégicas entre lutar e coletar
- **Recompensas**: Balanceadas entre XP e materiais
- **Exemplo**: "Cavernas de Cristal" (Rank D)

### 📊 Sistema de Ranking

| Rank | Level | Cooldown | Descrição |
|------|-------|----------|-----------|
| **E** | 1-10  | 0min     | Dungeons básicas para iniciantes |
| **D** | 6-20  | 30min    | Primeiros desafios reais |
| **C** | 16-35 | 1h       | Materiais épicos começam a aparecer |
| **B** | 31-55 | 2h       | Dungeons desafiadoras |
| **A** | 51-75 | 4h       | Conteúdo avançado |
| **S** | 81+   | 8h       | Conteúdo end-game |

### 🎮 Mecânicas de Jogo

#### Exploração Interativa
- **Chat dinâmico**: Interface de chat para narrativa imersiva
- **IA Dungeon Master**: Geração automática de narrativas contextuais
- **Ações disponíveis**: Explorar, Minerar, Atacar, Defender, Fugir, Buscar, Descansar
- **Progressão de andares**: Avançar através dos níveis da dungeon

#### Sistema de Materiais
- **Raridades**: Common, Uncommon, Rare, Epic, Legendary
- **Tipos**: Metal, Gem, Organic, Magical, Rare Earth, Essence
- **Uso**: Crafting, reparos, melhorias, trading
- **Valor**: Conversão em tokens para economia

#### Sistema de Combate
- **Baseado em dados**: D4, D6, D8, D10, D12, D20
- **Modificadores**: Baseados nos atributos do personagem
- **Críticos**: Multiplicadores de dano especiais
- **Estratégia**: Escolha entre diferentes tipos de ação

### 🔧 Arquitetura Técnica

#### Backend
```typescript
// Principais Classes
- DungeonSystem: Gerencia instâncias e lógica principal
- MaterialSystem: Gerencia inventário e crafting
- AIJudge: Geração de narrativas com IA
- DungeonMaster: Narrativas específicas para dungeons
```

#### APIs REST
```
GET /api/dungeons - Listar dungeons disponíveis
POST /api/dungeons/:id/enter - Entrar em uma dungeon
POST /api/dungeons/instances/:id/action - Executar ação
GET /api/dungeons/instances/:id/status - Status da instância
POST /api/dungeons/instances/:id/exit - Sair da dungeon
GET /api/materials - Gerenciar materiais
POST /api/materials - Ações de crafting/trading
```

#### Frontend
```typescript
// Componentes Principais
- DungeonChat: Interface de chat para exploração
- DungeonCard: Cartão de apresentação das dungeons
- DungeonsPage: Página principal do sistema
```

### 📦 Dados Implementados

#### Dungeons Disponíveis
- **12 dungeons únicas** distribuídas entre todos os ranks
- **8 biomas diferentes**: Cave, Forest, Volcano, Crystal, Ruins, Desert, Ice, Swamp
- **Progressão balanceada** de dificuldade

#### Materiais
- **19 materiais diferentes** com raridades variadas
- **Sistema de valor** baseado em tokens
- **Usos múltiplos** para crafting e trading

#### Monstros
- **8 tipos de monstros** com diferentes dificuldades
- **Sistema de drop** baseado em probabilidade
- **Progressão de poder** adequada ao rank

### 🎯 Funcionalidades Especiais

#### IA Dungeon Master
- **Narrativas dinâmicas**: Geração automática de texto contextual
- **Eventos aleatórios**: Criação de situações variadas
- **Fallback system**: Respostas alternativas quando IA não disponível
- **Contextualização**: Baseada em bioma, andar, e histórico

#### Sistema de Cooldown
- **Prevenção de farming**: Tempo de espera entre entradas
- **Progressão equilibrada**: Cooldowns maiores para ranks superiores
- **Flexibilidade**: Ranks E sem cooldown para iniciantes

#### Economia Integrada
- **Burn mechanics**: Custos em tokens para funcionalidades premium
- **Earn mechanics**: Conversão de materiais em tokens
- **Trading system**: Compra e venda de materiais

### 🚀 Como Usar

#### 1. Acessar o Sistema
```bash
# Navegar para a página de dungeons
http://localhost:3000/dungeons
```

#### 2. Selecionar Dungeon
- Verificar requisitos de level
- Confirmar disponibilidade (cooldown)
- Clicar em "Entrar na Dungeon"

#### 3. Explorar
- Usar botões de ação disponíveis
- Acompanhar narrativa no chat
- Coletar materiais e ganhar XP
- Progredir através dos andares

#### 4. Sair
- Usar botão "Sair" a qualquer momento
- Completar todos os andares automaticamente
- Receber recompensas no inventário

### 📈 Próximos Passos

#### Funcionalidades Futuras
- [ ] **Dungeons em Grupo**: Cooperação multiplayer
- [ ] **Eventos Temporais**: Dungeons especiais limitadas
- [ ] **Sistema de Guildas**: Dungeons exclusivas para guildas
- [ ] **Leaderboards**: Rankings de desempenho
- [ ] **Achievements**: Sistema de conquistas

#### Melhorias Técnicas
- [ ] **Integração OpenAI**: IA real para narrativas
- [ ] **WebSocket**: Comunicação em tempo real
- [ ] **Persistent Storage**: Banco de dados real
- [ ] **Caching**: Otimização de performance
- [ ] **Rate Limiting**: Proteção contra spam

### 🛠️ Desenvolvimento

#### Estrutura de Arquivos
```
src/
├── app/
│   ├── api/dungeons/          # APIs REST
│   └── dungeons/page.tsx      # Página principal
├── components/
│   └── DungeonChat.tsx        # Interface de chat
├── lib/
│   ├── dungeonSystem.ts       # Lógica principal
│   ├── dungeonData.ts         # Dados estáticos
│   ├── materialSystem.ts      # Sistema de materiais
│   └── aiJudge.ts            # IA Dungeon Master
└── types/
    └── game.ts               # Tipos TypeScript
```

#### Tecnologias Utilizadas
- **Next.js 14**: Framework React com App Router
- **TypeScript**: Tipagem estática
- **Tailwind CSS**: Estilização
- **Zustand**: Gerenciamento de estado (futuro)
- **Socket.io**: Comunicação real-time (futuro)

### 🎨 Design e UX

#### Princípios de Design
- **Imersão**: Interface que simula chat de RPG clássico
- **Clareza**: Informações importantes sempre visíveis
- **Responsividade**: Funciona em desktop e mobile
- **Acessibilidade**: Cores e contrastes adequados

#### Experiência do Usuário
- **Feedback imediato**: Todas as ações têm resposta visual
- **Progressão clara**: Status sempre atualizado
- **Não bloqueante**: Permite saída a qualquer momento
- **Recompensas visíveis**: Materiais coletados são mostrados

### 🔍 Testando o Sistema

#### Fluxo de Teste Básico
1. **Inicialização**: Carregamento automático de personagem de teste
2. **Seleção**: Escolher "Mina de Ferro Abandonada" (Rank E)
3. **Exploração**: Usar ações "Explorar" e "Minerar"
4. **Progressão**: Avançar pelos 3 andares
5. **Conclusão**: Sair e verificar materiais coletados

#### Testes Avançados
- **Cooldown**: Tentar entrar novamente após sair
- **Diferentes tipos**: Testar dungeons de combate e mistas
- **Límites de level**: Verificar restrições de acesso
- **Narrativa**: Observar variações na IA

### 📊 Métricas e Analytics

#### Dados Coletados
- **Tempo de exploração**: Duração média por dungeon
- **Materiais coletados**: Quantidade e tipo por sessão
- **Taxa de conclusão**: Porcentagem de dungeons completadas
- **Morte de monstros**: Eficácia em combate
- **Uso de ações**: Preferências do jogador

#### KPIs Importantes
- **Retenção**: Jogadores que retornam às dungeons
- **Progressão**: Avanço através dos ranks
- **Economia**: Valor gerado e consumido em tokens
- **Engajamento**: Tempo médio por sessão

---

## Conclusão

O Sistema de Dungeons implementado oferece uma experiência completa e imersiva que combina elementos clássicos de RPG com mecânicas modernas. A arquitetura flexível permite expansões futuras, enquanto a experiência atual já fornece horas de entretenimento e progressão significativa.

A integração com sistemas de materiais, economia e narrativa por IA cria um ciclo de jogo envolvente que incentiva tanto a exploração quanto o desenvolvimento estratégico do personagem.

**Status**: ✅ Implementação completa e funcional
**Próxima fase**: Integração com sistema de tokens e expansão multiplayer 