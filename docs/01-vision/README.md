# 01 — Vision

## O que é Dolrath

Dolrath é um MMORPG Web3 de fantasia sombria, jogado no navegador, onde o combate é resolvido por dados e narrado por IA, os personagens e itens podem viver on-chain como NFTs, e a economia é sustentada por dois tokens com papéis distintos: **GOLD** (utilidade, ganho jogando) e **DOL** (valor de longo prazo, escasso).

Inspiração: RPGs de mesa clássicos (dados, atributos, julgamento de ações) + estética Solo Leveling (portais, ranks, transformações).

## Os cinco pilares

1. **Gameplay First** — o jogo precisa ser divertido para quem nunca vai vender um token. Nenhuma decisão de design passa se a justificativa for apenas "gera receita". O loop central (explorar masmorra → lutar → lootear → craftar → ficar mais forte) se sustenta sozinho.

2. **Economia Circular** — praticamente todo GOLD ganho encontra um motivo para ser gasto: loja, forja, alquimia, reparo, expansão de inventário, taxas de mercado. A métrica-guia é a razão sink/faucet (meta ≥ 0,7 — ver [Analytics](../32-analytics/README.md)).

3. **DOL como ativo de longo prazo** — DOL não é recompensa de grind. Ele é concentrado em conquistas relevantes (bosses de temporada, ranking PvP, eventos), no mercado de personagens e na governança. Supply fixo com vesting (ver [Whitepaper](../21-whitepaper/WHITEPAPER-ECONOMICO.md)).

4. **Receita sustentável** — o projeto se financia por cosméticos, passes, taxas de marketplace e serviços — não pela valorização do token. Se o token cair, o estúdio continua operando (ver [Monetization](../29-monetization/README.md)).

5. **Balanceamento orientado por dados** — toda emissão e queima é monitorada; todo rebalance passa por simulador antes de ir a produção. O repositório mantém 10+ simuladores de combate/economia em `scripts/` (ver [Balancing](../30-balancing/README.md)).

## O que Dolrath NÃO é

- **Não é ponzi de play-to-earn.** O jogador que só extrai valor encontra atrito crescente (teto diário de emissão, taxas); o jogador que joga encontra profundidade.
- **Não é jogo de especulação com skin de RPG.** Web3 é infraestrutura de propriedade (seu personagem e seus itens são seus), não o motivo de jogar.
- **Não exige carteira para se divertir.** Toda a progressão funciona off-chain; a blockchain entra quando o jogador quer propriedade real ou comércio.

## Diferenciais competitivos

| Diferencial | Como se materializa |
|---|---|
| IA como juiz e narrador | Combate narrado dinamicamente (`src/lib/aiJudge.ts`), disponível 24/7 |
| NFT com metadata viva | O NFT do herói reflete XP/level em tempo real, não um snapshot morto |
| Economia auditável | Faucets servidor-autoritativos, teto diário de emissão, claim assinado EIP-712 |
| Balance científico | Simuladores raça×classe com milhares de lutas antes de cada mudança |

## Público-alvo

- **Núcleo:** jogadores de RPG/idle-RPG no navegador, 18–40, Brasil e LATAM primeiro (jogo em PT-BR), expansão EN depois.
- **Secundário:** comunidade Web3 gamer que busca projetos com gameplay real e economia desenhada com seriedade.
