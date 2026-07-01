# 09 — DOL Token

> Documento resumo. A especificação econômica completa (alocação, vesting, emissão, queima, simulações) está no [Whitepaper Econômico](../21-whitepaper/WHITEPAPER-ECONOMICO.md) e os números vivos em [Tokenomics](../22-tokenomics/README.md).

## O que é

**DOL** é o token de valor de longo prazo do ecossistema Dolrath: governança, staking, mercado de personagens e conquistas de alto significado. ERC-20 na Polygon.

## Estado atual do contrato (`web3/contracts/DolToken.sol`)

- ERC-20 + `ERC20Burnable` + `AccessControl`.
- `MINTER_ROLE` pode mintar sem teto — **adequado para a fase de desenvolvimento, inadequado para o launch**.
- ⚠️ Nota de auditoria interna: o contrato atual usa name "Dolrath Gold" com símbolo "DOL", colidindo com o token GOLD ("Dolrath Gold"/"GOLD"). **Antes da mainnet: renomear para "Dolrath" (DOL)** e migrar para supply fixo.

## Papel do DOL (desenho aprovado)

| Uso | Status |
|---|---|
| Compra/venda de personagens NFT (precificados em DOL) | código pronto, deploy pendente |
| Governança DAO (votação por stake) | EM BREVE |
| Staking com participação nas taxas do protocolo | EM BREVE |
| Recompensas de conquista (boss de temporada, topo do ranking PvP, eventos) | EM BREVE |
| Terrenos, pets premium, passes de temporada | EM BREVE |

## Princípios (do pilar "DOL como ativo de longo prazo")

1. **DOL nunca é recompensa de grind.** Grind paga GOLD. DOL paga excelência e escassez (top ranking, first-kill, eventos).
2. **Supply fixo proposto: 1.000.000.000 DOL** com vesting longo para equipe e investidores (detalhe no whitepaper).
3. **Toda distribuição de DOL a jogadores sai do bucket "Play & Achieve"** com decaimento anual — sem inflação surpresa.
4. **Queimas reais:** parte das taxas do mercado de personagens e serviços premium é queimada via `ERC20Burnable`.
