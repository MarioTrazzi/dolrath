# Backlog de Prompts — Black Dolrath

Organização das anotações soltas em prompts detalhados, prontos para serem usados como tarefas de desenvolvimento (ex.: para o Claude Code). Agrupados por categoria e ordenados por prioridade sugerida dentro de cada grupo.

---

## 1. Bugs críticos (masmorra e combate)

### 1.1 Run da masmorra não finaliza corretamente após derrotar o boss
**Contexto:** ao derrotar o boss, se o herói ainda tiver stamina, uma nova run deveria começar automaticamente. Em vez disso, o sistema retorna erro dizendo que o personagem "já está em uso".

**Hipótese:** o combate contra o boss não está sendo finalizado/encerrado corretamente no backend antes de tentar iniciar a próxima run, deixando o personagem com um estado de "em combate" travado.

**Tarefa:** investigar o fluxo de finalização de combate contra boss (encerramento da sessão de combate, liberação do lock do personagem) e corrigir para que, ao derrotar o boss:
1. o combate seja marcado como finalizado e o lock do personagem seja liberado antes de iniciar a próxima run;
2. se ainda houver stamina, a próxima run comece automaticamente sem erro de "personagem já em uso".

**Critério de aceite:** derrotar o boss múltiplas vezes seguidas (com stamina suficiente) encadeia novas runs sem erro.

### 1.2 Drop de item raro não é exibido na tela de vitória contra o boss
**Contexto:** quando o boss dropa um item raro, isso não fica visualmente destacado para o jogador.

**Tarefa:** ao derrotar o boss e receber um item raro, o ícone do item conquistado deve aparecer "brilhando" (efeito de destaque/glow) na própria tela de resultado do combate, chamando atenção do jogador para a recompensa rara.

**Critério de aceite:** drop de item raro do boss exibe ícone com efeito de brilho na tela de resultado do combate.

### 1.3 Tier 2 da masmorra não é liberado ao vencer o boss
**Contexto:** vencer o boss de uma masmorra deveria desbloquear o tier 2 dela.

**Tarefa:** garantir que, ao finalizar o combate com o boss derrotado, o sistema marque o tier 2 daquela masmorra como desbloqueado para o personagem/conta.

**Critério de aceite:** após vencer o boss pela primeira vez, o tier 2 aparece disponível para seleção na masmorra correspondente.

> Observação: os itens 1.1, 1.2 e 1.3 provavelmente compartilham a mesma causa raiz (finalização incompleta do combate contra o boss) e podem ser corrigidos juntos.

### 1.4 Validar se o herói está em coleta antes de entrar na masmorra
**Contexto:** hoje é possível clicar no botão de entrar na masmorra mesmo com o herói ocupado em uma atividade de coleta, e a validação só acontece depois, já dentro da run.

**Tarefa:** mover a validação de "herói disponível" (não está em coleta, não está em outra run, etc.) para o momento do clique no botão de entrar na masmorra, antes de criar a run. Se o herói estiver em coleta, bloquear a ação e exibir mensagem clara ao jogador.

**Critério de aceite:** tentar entrar na masmorra com o herói em coleta é bloqueado imediatamente no clique, sem chegar a criar/abrir a run.

### 1.5 Animação de golpe não aparece quando o oponente está sob veneno ou sangramento
**Contexto:** quando o oponente tem o efeito de veneno ou sangramento ativo, a animação do golpe desferido nele deixa de ser exibida.

**Tarefa:** investigar conflito entre a camada de animação de dano-sobre-tempo (veneno/sangramento) e a camada de animação de golpe direto, e corrigir para que ambas coexistam — o golpe deve sempre animar normalmente, independente de status ativos no alvo.

**Critério de aceite:** golpes desferidos em oponentes envenenados ou sangrando exibem a animação normalmente, junto com os efeitos visuais do status.

### 1.6 Vender item vende todos os itens do stack em vez da quantidade desejada
**Contexto:** quando o jogador tem mais de uma unidade de um item vendável, ao vender 1 o sistema vende o stack inteiro.

**Tarefa:** corrigir a lógica de venda para respeitar a quantidade informada, e adicionar na interface a opção de escolher entre "vender tudo" ou "vender quantidade específica" (com campo numérico/seletor de quantidade).

**Critério de aceite:** vender 1 unidade de um stack de 5 deixa 4 no inventário; a UI oferece claramente as opções "vender tudo" e "vender quantidade".

---

## 2. Balanceamento

### 2.1 Reduzir durabilidade para baratear itens na venda
**Contexto:** durabilidade alta mantém o valor de venda dos itens mais alto do que deveria.

**Tarefa:** ajustar a fórmula/valores de durabilidade dos itens (ou o peso da durabilidade no cálculo do preço de venda) para reduzir o valor de venda. Definir se o ajuste será por categoria de item, raridade, ou global — e documentar os novos valores em `docs/30-balancing` ou `docs/07-economy`.

**Critério de aceite:** itens com a nova durabilidade geram um preço de venda menor que o atual, dentro da faixa definida no balanceamento.

### 2.2 Reduzir a raridade de drop do Pó da Fênix e do Tônico de Berserker
**Contexto:** esses dois itens estão dropando com frequência maior do que o pretendido.

**Tarefa:** revisar as tabelas de drop (masmorras/coleta) e reduzir a taxa de drop do Pó da Fênix e do Tônico de Berserker para um patamar mais raro. Definir os novos percentuais e registrar em `docs/30-balancing`.

**Critério de aceite:** taxas de drop atualizadas nas tabelas correspondentes; frequência observada em testes cai de forma perceptível.

---

## 3. Novas features

### 3.1 Modo PvP definitivo — Arena (1x1 e 2x2)
**Contexto:** este é o core loop final do jogo — o jogador evolui o personagem para ficar competitivo na arena PvP.

**Tarefa:** especificar e implementar o modo PvP de arena com duas modalidades iniciais: 1x1 e 2x2. Escopo a detalhar (recomenda-se quebrar em subtarefas antes de começar a implementação):
- matchmaking (por elo/poder de combate?);
- estrutura de partida (turnos, tempo limite, regras de vitória);
- sistema de ranqueamento/temporada;
- recompensas de vitória/derrota;
- diferenças de balanceamento entre 1x1 e 2x2 (ex.: sinergias de dupla).

**Critério de aceite:** definição mínima é um documento de design em `docs/17-pvp` cobrindo os pontos acima antes de partir para implementação; depois, entrega funcional do fluxo completo de uma partida 1x1 e de uma 2x2.

### 3.2 Poço de coleta (nova fonte de farm)
**Contexto:** hoje existe um sistema de coleta; o poço deve reaproveitar essa mecânica com identidade visual e drops próprios.

**Tarefa:** implementar o poço como uma nova atividade de coleta, reaproveitando o sistema já existente de coleta (mesmo fluxo de energia/gasto), com:
- animação própria de balde puxando água (a definir/produzir arte);
- consumo de energia igual ao das outras coletas;
- chance (muito rara) de encontrar pedra de aprimoramento;
- **sem** chance de dropar estilhaço (diferencial em relação às outras fontes de coleta).

**Critério de aceite:** poço aparece como opção de coleta, consome energia corretamente, e a tabela de drop contém apenas pedra de aprimoramento (raridade muito baixa) — sem estilhaço.

### 3.3 Reparo de acessórios no ferreiro
**Contexto:** hoje só armas exibem a opção de aprimorar/reparar no ferreiro; armaduras não exibem essa opção, e acessórios não têm reparo.

**Tarefa:**
1. corrigir a exibição da opção de aprimorar/reparar para também aparecer em armaduras (hoje só aparece em armas);
2. implementar reparo de acessórios, consumindo um novo item chamado "pó de joia";
3. adicionar o "pó de joia" como item obtenível na mineração;
4. reparo de acessórios também deve custar dinheiro (gold), além do pó de joia.

**Critério de aceite:** armaduras exibem a opção de aprimorar no ferreiro; acessórios podem ser reparados consumindo pó de joia + gold; pó de joia é obtido via mineração.

### 3.4 Revisão do sistema de morte e poção de revive
**Contexto:** hoje, ao morrer, o comportamento de HP/MP e o uso da poção de revive não estão como deveria ser.

**Tarefa:** implementar as seguintes regras:
1. a poção de revive só pode ser usada **fora de combate**;
2. se o personagem morrer dentro de uma masmorra, ele fica impedido de continuar e precisa comprar/usar uma poção de revive para reviver antes de começar uma nova run;
3. ao iniciar uma nova run, o personagem **não** deve mais ter HP/MP resetados automaticamente — ele mantém o HP e MP com que terminou a run anterior;
4. a única forma de recuperar HP/MP entre runs passa a ser o uso de poções disponíveis no inventário.

**Critério de aceite:** morrer em combate impede ações até reviver com poção (fora de combate); nova run começa com o HP/MP remanescentes do personagem, não resetados; poções de HP/MP no inventário continuam funcionando normalmente para recuperação manual.

### 3.5 Mais um golpe transformado
**Contexto:** sistema de golpes especiais em estado de transformação já existe.

**Tarefa:** projetar e adicionar um novo golpe transformado (nome, dano/efeito, custo — mana/stamina/cooldown, animação). Definir os parâmetros antes de implementar e documentar junto aos golpes transformados já existentes (ver `TRANSFORMATION_SYSTEM_DEMO.js` e docs de combate em `docs/05-combat`).

**Critério de aceite:** novo golpe transformado disponível e balanceado em relação aos golpes existentes, com animação própria.

---

## 4. Arte / Visual

### 4.1 Gerar imagens para novos itens de coleta e farm
**Contexto:** itens novos de coleta e farm foram adicionados sem imagem.

**Tarefa:** para cada item novo sem imagem, localizar o prompt usado para gerar a imagem de um item já existente com finalidade equivalente (mesma categoria/uso) e gerar a nova imagem seguindo o mesmo estilo/prompt, apenas adaptando as características específicas do novo item.

**Critério de aceite:** todos os itens novos de coleta/farm têm imagem final, visualmente consistente com os itens já existentes da mesma categoria.

---

## 5. UI / UX

### 5.1 Dashboard — cards com layout fixo estilo mobile
**Contexto:** os cards da dashboard mudam de organização conforme a responsividade (ex.: o card de inventário às vezes aparece numa linha, às vezes noutra), o que atrapalha a previsibilidade.

**Tarefa:** redesenhar o grid da dashboard para que:
1. cada card já nasça no tamanho pensado para mobile;
2. ao expandir para telas maiores, os cards apenas se repetem em mais linhas/colunas (mantendo o mesmo tamanho individual), em vez de mudar de layout;
3. a posição de cada card (ex.: inventário, outros painéis) seja estática — sempre no mesmo lugar do grid, independente da largura de tela.

**Critério de aceite:** testar em pelo menos 3 larguras de tela (mobile, tablet, desktop) e confirmar que cada card mantém tamanho e posição relativa, variando apenas quantas colunas/linhas cabem.

### 5.2 Navbar — nomes e menu
**Contexto:** o nome "Gold" quebrou o layout do menu (ficou em 2 linhas), o que expôs a necessidade de dar mais espaço aos rótulos do menu.

**Tarefa:**
1. trocar "Dolrath" por "Black Dolrath" na navbar;
2. trocar o item de menu "Personagem" por "Ficha do Personagem";
3. ajustar a largura/espaçamento dos itens do menu para acomodar rótulos maiores sem quebrar linha (incluindo o caso do "Gold" que já estava quebrando).

**Critério de aceite:** navbar exibe "Black Dolrath" e "Ficha do Personagem"; nenhum rótulo do menu quebra em 2 linhas nas larguras de tela suportadas.

### 5.3 Tiers da masmorra como abas no card
**Contexto:** hoje a seleção de tier da masmorra não deixa claro visualmente que são variações do mesmo conteúdo.

**Tarefa:** redesenhar a exibição dos tiers para aparecerem como abas no topo do card da masmorra, usando a mesma borda/estilo visual do card. Ao clicar na aba do tier 2, o conteúdo do card deve trocar para refletir o tier 2, com a imagem de fundo numa versão mais escura (para reforçar a maior dificuldade).

**Critério de aceite:** card da masmorra exibe abas de tier no topo com borda consistente ao card; clicar na aba de tier 2 troca a imagem para uma versão mais escura e atualiza as informações exibidas.

---

## Resumo por área (para priorização)

- **Bugs críticos:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
- **Balanceamento:** 2.1, 2.2
- **Novas features:** 3.1 (PvP, maior escopo), 3.2, 3.3, 3.4, 3.5
- **Arte:** 4.1
- **UI/UX:** 5.1, 5.2, 5.3
