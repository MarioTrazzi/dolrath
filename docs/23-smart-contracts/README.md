# 23 — Smart Contracts

Pasta on-chain: `web3/` (Hardhat, Solidity 0.8.24, OpenZeppelin). Rede: Polygon (testnet Amoy 80002 → mainnet). Comandos: `npm run chain:compile|test|deploy:amoy`.

## Contratos

| Contrato | Tipo | Papel | Estado |
|---|---|---|---|
| `DolToken.sol` | ERC-20 + Burnable + AccessControl | token DOL; `MINTER_ROLE` minta | deployado (dev) — **v2 antes da mainnet** |
| `DolrathGold.sol` | ERC-20 + EIP-712 | GOLD; mint só via `claimWithSig` (assinatura do servidor, nonce/destinatário, deadline, `OnlyRecipient`) | AO VIVO |
| `DolrathCharacters.sol` | ERC-721 | NFT de personagem, metadata viva | AO VIVO |
| `DolrathItems.sol` | ERC-721 lazy-mint | NFT de item via voucher EIP-712 (`mintWithSig`) | AO VIVO |
| `DolrathItemMarket.sol` | Escrow | listagem/venda de itens em GOLD | AO VIVO |
| `DolrathCharacterMarket.sol` | Escrow | listagem/venda de personagens em DOL | **deploy pendente** |

## Integração servidor (`src/lib/*Onchain.ts`, `*Signing.ts`, `*Verify.ts`)

- Assinaturas EIP-712 emitidas pelo servidor (claim de GOLD, voucher de mint de item/personagem).
- Verificação de transações por leitura de eventos (`verifyDolTransferTx` etc.) — o servidor nunca confia no cliente sobre pagamento.
- Fees Polygon: `gasFees.ts` clampa priority fee ≥ 30 gwei (mínimo da rede é 25).
- Envs de runtime (Vercel): endereços dos contratos, `*_SIGNER_PRIVATE_KEY`, `GOLD_TREASURY_ADDRESS`, RPC.

## Mudanças obrigatórias pré-mainnet (auditoria interna)

1. **DolToken v2:** supply fixo (1B), fim do `MINTER_ROLE` aberto, rename `"Dolrath Gold"→"Dolrath"` (hoje colide com o GOLD), vesting/lockups on-chain (ver whitepaper).
2. **Taxa nos marketplaces:** `feeBps` + split burn/treasury (hoje 100% vai ao vendedor — zero sink).
3. **Royalty ERC-2981** nos NFTs (futuro-proof p/ marketplaces externos).
4. **Auditoria externa** de todos os contratos + testes de invariantes (`web3/test/`).
5. Revisar `DolrathGold.claimWithSig` contra replay entre chains (domain separator já cobre; conferir chainId no deploy).

## Endereços

Mantidos fora do repositório (envs da Vercel). Ao ir à mainnet, publicar tabela de endereços verificados aqui e no site.
