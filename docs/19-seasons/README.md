# 19 — Seasons

> **Status: AO VIVO** — temporada PvP com pool lastreada, inscrição paga e
> premiação para o top 20. Código: `src/lib/pvpRanking.ts`, `src/lib/seasonPool.ts`,
> `src/lib/seasonPayout.ts`, `src/app/api/cron/season`, página `/ranking`.

## O princípio

**Duas moedas, sem contato entre si.** O dólar sustenta o estúdio; a temporada é
disputada em DOL. Nenhum USDC entra na pool e nenhum prêmio é pago em dólar —
isso tira o estúdio da posição de custodiar dinheiro de jogador com distribuição
manual e discricionária.

| Entrada | Valor | Destino |
|---|---|---|
| Criação de personagem | 2 USDC | **100% receita** do estúdio (NFT, imagem por IA, infra) |
| Inscrição do herói na temporada | 100 DOL (`SEASON_ENTRY_DOL`) | **100% pool** |

Quem paga a inscrição muda com a temporada, o valor não: na criação o estúdio
aporta os 100 DOL do bucket "Play & Achieve" e o herói já nasce inscrito; da
temporada 2 em diante, quem quiser disputar paga 100 DOL do próprio bolso — do
que ganhou na arena ou comprou no mercado de personagens. É a inscrição
recorrente que faz o sistema girar sozinho: a pool se renova com a base
existente, sem depender de personagem novo nem de emissão nova do bucket. Uma
temporada sem nenhum jogador novo continua premiando (`npm run sim:season`,
cenário 3).

**A aritmética do enunciado:** 100 heróis inscritos = pool de 10.000 DOL; o
campeão leva 19% (1.900 DOL) e o 20º leva 1% — exatamente os 100 DOL da
inscrição. O ponto de equilíbrio do 20º é sempre 100 inscritos, qualquer que
seja o valor de `SEASON_ENTRY_DOL`, porque os dois lados usam a mesma constante.

> **Prêmio em DOL só vale o que o DOL compra.** O único consumidor de DOL é o
> mercado de personagens (`DolrathCharacterMarket`, que só aceita DOL). Ele
> precisa estar de pé **antes do primeiro pagamento** — não no dia do
> lançamento, mas dentro dos 120 dias da temporada 1.

### Faseamento do lançamento

Na **Fase 1** o DOL ainda não circula on-chain: a pool é contabilidade em
`PvpSeason.fundedDol` e a inscrição avulsa fica fechada
(`SEASON_ENTRY_ENABLED=false`) — todo herói criado já entra inscrito. A **Fase
2** liga o `DolToken`, o `DolDistributor` (claim EIP-712, mesmo padrão do
`DolrathGold`) e o mercado de personagens, e só então a inscrição avulsa abre.

**Inscrição é por personagem, prêmio é por conta.** Inscrever cinco heróis custa
cinco e ainda rende no máximo um prêmio (`getPayoutBoard` colapsa por `userId`
mantendo o de maior pontuação). Multi-boxing vira doação para a pool, não
estratégia de varrer o top.

Herói sem inscrição continua lutando na arena e ganhando ouro e XP — só não
pontua no ranking (`resolveRankingSkip` → `not_enrolled`).

## Duração

O ciclo é longo de propósito. Marco de encerramento: **arma + armadura
principais em TET, resto do set em +15** — ~90-100 dias de jogo dedicado pelos
números de `docs/balance-report-launch.md` (set de 6 peças a +15 = 27 dias; TET
numa peça ≈ 1.010 concentradas ≈ 30-35 dias).

- **Temporada 1: 120 dias** — todo mundo começa do zero, a curva inicial é mais lenta.
- **Seguintes: 90 dias** (`PVP_SEASON_DAYS`).
- **Entressafra: 7 dias** (`PVP_OFFSEASON_DAYS`) — status `offseason`.

Nota honesta: **set COMPLETO em TET é ~180-210 dias** para o dedicado. Ancorar a
temporada nisso deixaria a pool parada meio ano sem pagar nada. Se o marco de
set completo for mesmo o desejado, o caminho é mexer no drop de concentrada
(alavanca listada no relatório de balance), não esticar a temporada.

Os **torneios** dão o ritmo curto dentro da temporada longa.

## Temporada NÃO é wipe

O herói é NFT e nada é apagado. A virada:

- **Zera**: só o placar (`PvpRating` novo por temporada; a anterior fica congelada e consultável).
- **Não toca**: nível, XP, gear, aprimoramento, inventário, ouro, profissões, fazenda, masmorras, mercado.

Na entressafra o mundo roda normal e a arena continua pagando ouro e XP — só o
placar fica parado. É a janela em que o top 20 é pago sem corrida com partidas
novas, em que roda o torneio de encerramento, e em que abrem as inscrições da
temporada seguinte (criada com `startsAt` no futuro justamente para receber o
dinheiro de quem entra no jogo durante a janela).

**Cortesia de virada**: personagem criado nos últimos `SEASON_ENTRY_GRACE_DAYS`
(14) de uma temporada entra de graça na seguinte — quem cria o herói a três dias
do fim não paga inscrição por três dias de ranqueada.

## Premiação — top 20

Percentuais fixos da pool distribuível, soma exata 1.0 (`PVP_SEASON_DOL_SPLIT`).
Valores abaixo para a pool de 100 inscritos (10.000 DOL):

| # | % | DOL | | # | % | DOL |
|---|---|---|---|---|---|---|
| 1 | 19,0 | **1.900** | | 11 | 3,1 | 310 |
| 2 | 13,5 | 1.350 | | 12 | 2,8 | 280 |
| 3 | 10,0 | 1.000 | | 13 | 2,5 | 250 |
| 4 | 8,0 | 800 | | 14 | 2,2 | 220 |
| 5 | 6,7 | 670 | | 15 | 2,0 | 200 |
| 6 | 6,0 | 600 | | 16 | 1,8 | 180 |
| 7 | 5,2 | 520 | | 17 | 1,6 | 160 |
| 8 | 4,5 | 450 | | 18 | 1,4 | 140 |
| 9 | 4,0 | 400 | | 19 | 1,2 | 120 |
| 10 | 3,5 | 350 | | 20 | 1,0 | **100** |

O 20º recupera exatamente a inscrição; o campeão leva 19×. Sendo percentual,
escala sozinha: 500 inscritos → campeão 9.500 DOL, 20º 500 DOL.

**Elegibilidade**: inscrito + humano (`isBot: false`) + pelo menos
`PVP_PAYOUT_MIN_MATCHES` (10) lutas ranqueadas na temporada + um prêmio por conta.

**Sobra não é redistribuída.** Com menos de 20 elegíveis, as posições vazias vão
para o **cofre de torneios** (`PrizeVault`), que atravessa temporadas. É o que
preserva a promessa "o 20º recupera a inscrição" independente do tamanho da base
— e numa base pequena (quando mais sobra) converte o excedente em eventos
menores e mais frequentes. O corte fixo `TOURNAMENT_CUT_PCT` é **0 no
lançamento**: a temporada 1 leva a pool inteira.

## Antifarm

Com DOL real na mesa, três guardas no crédito de pontos (`resolveRankingSkip` +
o bloqueio pré-existente em `api/battle/rewards`):

| Guarda | Efeito |
|---|---|
| `same_user` | dois personagens do MESMO dono: não credita nada, nem stamina |
| `not_enrolled` | luta paga ouro/XP, não pontua |
| `pair_cap` | acima de `PVP_PAIR_DAILY_POINT_CAP` (3) lutas/dia contra o MESMO oponente, 0 pontos |

O `pair_cap` cobre o buraco que o `same_user` não cobria: **duas contas
distintas** trocando vitórias em série.

## Operação

- **Cron diário** `/api/cron/season` (`vercel.json`, 03:00 UTC, `CRON_SECRET`):
  ativa vencida → entressafra + snapshot do top 20 + sobra ao cofre + agenda a
  próxima com as cortesias; entressafra vencida → `ended`.
- **Painel** `/admin/season` (`ADMIN_USER_IDS`): prêmios pendentes com carteira e
  valor, CSV para transferência em lote, marcação de pago com `txHash`, saldo do cofre.
- **O pagamento on-chain é MANUAL** — a plataforma só produz a lista do que pagar.
- **Mock sem DB**: `/dev/season-mock` (`?heroes=500`, `?state=offseason`, `?matches=4`).
- **Simulador**: `npm run sim:season`.

## Termos

Inscrição paga com premiação para o topo é competição por habilidade com stake.
`/disclaimer` e os termos dizem explicitamente: competição por habilidade,
inscrição não reembolsável, prêmio integralmente oriundo das inscrições.

## Regras econômicas

1. A pool de temporada é **redistribuição entre jogadores**, não emissão nova —
   **não** consome o bucket "Play & Achieve". Qualquer DOL adicional que o
   estúdio aporte por cima (`PVP_SEASON_POT_DOL`) sai, sim, do bucket.
2. Passe premium (futuro): preço em DOL com **50% queimado**, ou fiat.
3. Cosméticos de temporada nunca voltam iguais (escassez respeitada).

## EM BREVE

- **Torneios**: chaveamento eliminatório financiado pelo cofre (que já acumula).
- **Leaderboard PvE**: exige tracking de profundidade/tempo/abates por temporada.
  Quando existir, a pool se divide (sugestão 70/30) sem mexer no encanamento.
- **Ligas** (Bronze→Grão-Mestre) e MMR relativo ao oponente — hoje a pontuação é
  flat (+25 vitória / +5 derrota).
- **Passe de temporada** (trilha grátis + premium), loja de temporada, tema/lore
  e evento de world boss por temporada.
