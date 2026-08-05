# 23 — Smart Contracts

Pasta on-chain: `web3/` (Hardhat, Solidity 0.8.24, OpenZeppelin). Rede: Polygon (testnet Amoy 80002 → mainnet). Comandos: `npm run chain:compile|test|deploy:amoy`.

## Contratos

| Contrato | Tipo | Papel | Estado |
|---|---|---|---|
| `DolToken.sol` | ERC-20 + Burnable | token DOL; **supply fixo de 1B cunhado à tesouraria no construtor, sem função de mint** | v2 pronto — deploy só na **Fase 2** |
| `DolrathGold.sol` | ERC-20 + EIP-712 | GOLD; mint só via `claimWithSig` (assinatura do servidor, nonce/destinatário, deadline, `OnlyRecipient`) | v1 na Amoy — **redeploy v2 pendente** |
| `DolrathCharacters.sol` | ERC-721 | NFT de personagem, metadata viva; `setSigner` rotacionável (era immutable) | v1 na Amoy — **redeploy v2 pendente** |
| `DolrathItems.sol` | ERC-721 lazy-mint | NFT de item via voucher EIP-712 (`mintWithSig`), `setBaseURI`, `setSigner` | v1 na Amoy — **redeploy v2 pendente** |
| `DolrathItemMarket.sol` | Escrow + Pausable | itens em GOLD; taxa 4% = 2% burn real + 2% tesouraria, cap `MAX_TOTAL_FEE_BPS=1000`, `rescueERC721` | v1 na Amoy — **redeploy v2 pendente** |
| `DolrathCharacterMarket.sol` | Escrow + Pausable | personagens em DOL; taxa 5% = 2,5% burn + 2,5% tesouraria | **nunca deployado** — Fase 2 |
| `mocks/TestUSDC.sol` | ERC-20 6 casas | dublê da USDC no ensaio da Amoy; `faucet()` dá 50/12h. O script **recusa** a rede `polygon` | só ensaio |

Invariante de moeda garantida em teste: item negocia **só** em GOLD, personagem
**só** em DOL.

> **`DOL_TOKEN_ADDRESS` não guarda o DOL.** Por histórico, essa var guarda o token
> com que o jogador **paga** a criação: TestUSDC na Amoy, USDC nativa da Circle na
> mainnet — ambos de **6 decimais**. `payDol.ts` e `dolPayments.ts` leem
> `decimals()` em runtime, então nada assume 18 casas.

## Integração servidor (`src/lib/*Onchain.ts`, `*Signing.ts`, `*Verify.ts`)

- Assinaturas EIP-712 emitidas pelo servidor (claim de GOLD, voucher de mint de item/personagem).
- Verificação de transações por leitura de eventos (`verifyDolTransferTx` etc.) — o servidor nunca confia no cliente sobre pagamento.
- Fees Polygon: `gasFees.ts` clampa priority fee ≥ 30 gwei (mínimo da rede é 25).
- Envs de runtime (Vercel): endereços dos contratos, `*_SIGNER_PRIVATE_KEY`, `GOLD_TREASURY_ADDRESS`, RPC.

## Mudanças obrigatórias pré-mainnet (auditoria interna)

Feitas no código em `abe73ce` (2026-07-18) — **falta o redeploy**:

1. ✅ **DolToken v2:** supply fixo (1B ao construtor), fim do `MINTER_ROLE`, rename `"Dolrath Gold"→"Dolrath"` (colidia com o GOLD).
2. ✅ **Taxa nos marketplaces:** split burn/treasury com `setFees` e cap de 10%.
3. ✅ **Signer rotacionável** em Characters/Items — chave vazada não exige mais redeploy.
4. ✅ **Pausable + `rescueERC721`** nos dois markets (cancelar listagem segue sempre aberto).

Ainda em aberto:

5. **Royalty ERC-2981** nos NFTs (futuro-proof p/ marketplaces externos).
6. **Auditoria externa** de todos os contratos + testes de invariantes (`web3/test/`, 47 casos).
7. Revisar `DolrathGold.claimWithSig` contra replay entre chains (domain separator já cobre; conferir chainId no deploy).
8. **`DolDistributor`** (a construir): libera DOL da tesouraria por `claimWithSig`. Sem ele o prêmio da temporada é só contabilidade off-chain (`src/lib/seasonPool.ts`).

## Endereços

Não versionados — vivem nas envs da Vercel, e o `web3/.env` é o registro do
deploy (nenhum script grava `deployments/*.json`). Ao ir à mainnet, publicar
aqui a tabela de endereços verificados no Polygonscan.

### Amoy (80002) — **v2, em uso** (deploy 2026-08-05, bloco 44129357)

| Contrato | Endereço |
|---|---|
| TestUSDC (pagamento, **6 casas**) | `0xF4A612e8D0A709fA19a5e342cdd795cD5Ca01cE0` |
| DolrathGold | `0xC4f67631a8e0695FC950ab9d3aD5Fb1445A0B81f` |
| DolrathCharacters | `0x40FFE440ff826Be9cB698907D4b7f8a40DbeE974` |
| DolrathItems | `0x3FF6DD46Bd0F388Bce9cF2eC35cd152ADa9DA318` |
| DolrathItemMarket | `0x840bbB94D8d7Db7b3b24CD2086e5B7C1F81AaB83` |

Signer dos três contratos e tesouraria de taxas: `0x403E0C97…30d88` (na Amoy os
papéis são a mesma carteira; na mainnet são quatro separadas). Owner: o deployer
descartável `0x4aD5ff48…28da7` — na mainnet vai para o Safe via
`chain:transfer-ownership`. Conferido on-chain: `decimals()==6` no TestUSDC e
split 4% do market (1000 GOLD → 960 vendedor / 20 queima / 20 tesouraria).

### Amoy — v1 aposentada (deploy ~2025-12, substituída em 2026-08-05)

`DolToken` `0x996DA80c…e234` · `Gold` `0x412ACaD8…5Ac9` · `Characters`
`0xdcA0023e…47A6` · `Items` `0x4a135642…867F` · `ItemMarket` `0x1fAdEC1a…BF57`.
Os heróis cunhados nela ficaram órfãos e foram re-cunhados na v2.

> **RPC:** `rpc-amoy.polygon.technology` **saiu do ar** (o host perdeu o registro
> DNS). Usar `https://polygon-amoy-bor-rpc.publicnode.com` — é o que está nas
> envs e em `src/lib/chainConfig.ts`.
