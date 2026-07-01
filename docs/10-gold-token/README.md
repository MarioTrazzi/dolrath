# 10 — GOLD Token

## O que é

**GOLD** é a moeda de utilidade de Dolrath: ganha jogando, gasta em tudo. Existe em três camadas, e essa arquitetura em camadas é a principal defesa anti-inflação do projeto.

## As três camadas

| Camada | Onde vive | Como entra | Como sai |
|---|---|---|---|
| **Carteira do personagem** | `Character.gold` (off-chain) | masmorra, PvP, venda de itens | loja off-chain, taxa da alquimia, forja |
| **Banco da conta** | `User.goldBalance` (off-chain) | depósito da carteira (`/api/bank/deposit`) | saque, claim on-chain |
| **On-chain** | `DolrathGold.sol` (ERC-20 Polygon) | `claimWithSig` (EIP-712, assinatura do servidor, nonce por destinatário) | compras on-chain → treasury; marketplace P2P |

**Por que em camadas:** todo GOLD off-chain é emissão *potencial* do token. Quanto mais sinks atacam o saldo **antes** do claim, menor a pressão inflacionária on-chain. Por isso a loja aceita saldo off-chain (`purchase-offchain`) e o jogo empurra o gasto para antes do saque.

## Controles de emissão (AO VIVO)

1. **Servidor-autoritativo:** o loot/gold da masmorra é rolado e creditado pelo servidor (`src/lib/dungeonRunServer.ts`, model `DungeonRun`); a antiga rota `add-exploration-reward` que confiava no cliente foi desativada (410).
2. **Teto diário por usuário:** `creditCappedGoldTx` soma o `goldEarned` das runs do dia UTC e clampa a `DUNGEON_DAILY_GOLD_CAP` (env, default **20.000/dia**). Multi-personagem não multiplica o faucet além do teto.
3. **Stamina:** gate natural de sessões de farm por personagem.
4. **Claim assinado:** só o servidor autoriza mint (`ClaimRequest` EIP-712 com deadline e nonce; `OnlyRecipient`).

## Números do faucet (medidos por simulação)

- Floresta nv10: **~4.900 GOLD/dia/personagem**; Ruínas nv50: **~10.900/dia** (boss domina — tierFactor até 3,4).
- PvP: 15 base/vitória, 8/empate, 5/derrota, ×1,08^nível, bônus 1,2–1,5 (vitória perfeita, first-win-of-day).
- Detalhe completo por fonte: [EDD](../07-economy/GAME-ECONOMY-DESIGN.md).

## Para onde vai o GOLD gasto on-chain

Compras on-chain transferem para `GOLD_TREASURY_ADDRESS` (tesouro do jogo) — **hoje nada é queimado on-chain**. Proposta do whitepaper: taxa de marketplace 4% com split 2% burn / 2% treasury, e queima programática de parte do treasury (ver [Whitepaper §Queimas](../21-whitepaper/WHITEPAPER-ECONOMICO.md)).

## Riscos conhecidos e mitigação

| Risco | Mitigação |
|---|---|
| Combate da masmorra confia no win/lose do cliente (teto = monstro rolado pelo servidor) | teto diário neutraliza economicamente; seeded-replay no servidor é TODO de design |
| Emissão por usuário > demanda por sinks | monitorar sink/faucet ratio (meta ≥0,7) e ajustar cap/preços por LiveOps |
| GOLD on-chain sem sink de queima | proposta de taxa de marketplace + serviços que queimam |
