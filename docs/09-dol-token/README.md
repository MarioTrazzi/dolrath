# 09 — DOL Token

> Documento resumo. A especificação econômica completa (alocação, vesting, emissão, queima, simulações) está no [Whitepaper Econômico](../21-whitepaper/WHITEPAPER-ECONOMICO.md) e os números vivos em [Tokenomics](../22-tokenomics/README.md).

## O que é

**DOL** é o token de valor de longo prazo do ecossistema Dolrath: temporada ranqueada, mercado de personagens, governança, staking e conquistas de alto significado. ERC-20 na Polygon.

**DOL não é pareado ao dólar.** Não é stablecoin, não tem lastro, não é resgatável e o estúdio não recompra. Quem paga em dólar é o jogador comprando o herói (2 USDC), e esse dólar nunca encosta na pool de premiação — ver [19-seasons](../19-seasons/README.md).

## Estado atual do contrato (`web3/contracts/DolToken.sol`)

- ERC-20 + `ERC20Burnable`. **Sem `AccessControl`, sem `MINTER_ROLE`, sem owner.**
- **Supply fixo: 1.000.000.000 DOL**, cunhados uma única vez no construtor para `DOL_TREASURY_ADDRESS`. Não existe função de mint — o supply só encolhe, por queima.
- Name `Dolrath`, símbolo `DOL` (a colisão antiga com "Dolrath Gold" foi resolvida no v2).

## Papel do DOL (desenho aprovado)

| Uso | Status |
|---|---|
| Inscrição e premiação da temporada ranqueada (100 DOL/herói) | AO VIVO (pool off-chain na Fase 1) |
| Compra/venda de personagens NFT (precificados em DOL) | código pronto, deploy na Fase 2 |
| Governança DAO (votação por stake) | EM BREVE |
| Staking com participação nas taxas do protocolo | EM BREVE |
| Recompensas de conquista (boss de temporada, topo do ranking PvP, eventos) | EM BREVE |
| Terrenos, pets premium, passes de temporada | EM BREVE |

## Como o DOL chega ao jogador

Sem mint, todo DOL sai da tesouraria. Na criação de personagem o estúdio aporta 100 DOL do bucket "Play & Achieve" na pool da temporada, como a inscrição daquele herói (3 milhões de personagens de folga no bucket). O claim on-chain roda pelo `DolDistributor`, com assinatura EIP-712 — mesmo padrão do `DolrathGold`, com o jogador pagando o próprio gas.

## Princípios (do pilar "DOL como ativo de longo prazo")

1. **DOL nunca é recompensa de grind.** Grind paga GOLD. DOL paga excelência e escassez (top ranking, first-kill, eventos).
2. **Supply fixo proposto: 1.000.000.000 DOL** com vesting longo para equipe e investidores (detalhe no whitepaper).
3. **Toda distribuição de DOL a jogadores sai do bucket "Play & Achieve"** com decaimento anual — sem inflação surpresa.
4. **Queimas reais:** parte das taxas do mercado de personagens e serviços premium é queimada via `ERC20Burnable`.
