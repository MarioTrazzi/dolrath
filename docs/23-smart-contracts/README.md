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

### Amoy (80002) — **v1, a ser substituída pelo deploy v2**

| Contrato | Endereço |
|---|---|
| DolToken v1 (pagamento, 18 casas) | `0x996DA80c38Ae95a66015093393b206076596e234` |
| DolrathGold | `0x412ACaD8dDFB49F0295E62Abc7A288B2A54D5Ac9` |
| DolrathCharacters | `0xdcA0023eD63aa4c97C6ab8d3E973e062171147A6` |
| DolrathItems | `0x4a135642D05d2C42C6170eFad7Ac62FDF817867F` |
| DolrathItemMarket | `0x1fAdEC1a8169bd743C6001d578bDdE82eD1FBF57` |

No ensaio v2 o pagamento passa a ser o **TestUSDC (6 casas)** e todos os
endereços acima mudam. Roteiro: `web3/REHEARSAL-AMOY.md`.
