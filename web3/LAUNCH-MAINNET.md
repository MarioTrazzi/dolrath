# Runbook — Lançamento Mainnet (Polygon 137)

Guia executável do deploy dos contratos v2 na Polygon mainnet e da virada do app.
Faça o **ensaio completo na Amoy primeiro** (troque `:polygon` por `:amoy` em todos
os comandos) e só então repita na mainnet.

Contexto e decisões: `~/.claude/plans/gostaria-de-iniciar-os-concurrent-codd.md`.

---

## 0. Pré-requisitos (uma vez)

- [ ] **Safe multisig** criado na Polygon (https://safe.global) → guarde o endereço em `OWNER_SAFE_ADDRESS`. Será dono da tesouraria e dos contratos.
- [ ] **4 papéis de chave separados** (NUNCA reutilizar a tesouraria como signer):
  - `DOL_TREASURY_ADDRESS` = Safe (recebe 1B DOL)
  - deployer = carteira descartável com ~5 POL (`DEPLOYER_PRIVATE_KEY`)
  - `GOLD_SIGNER_ADDRESS` / `NFT_SIGNER_ADDRESS` / `ITEM_NFT_SIGNER_ADDRESS` = hot wallets do servidor (sem fundos além de dust)
- [ ] POL no deployer para o gas dos deploys (~2-5 POL cobre folgado).
- [ ] `web3/.env` preenchido:
  ```
  POLYGON_MAINNET_RPC_URL="https://polygon-rpc.com/"   # ou RPC dedicado (Alchemy/Infura)
  DEPLOYER_PRIVATE_KEY="0x..."
  DOL_TREASURY_ADDRESS="0xSAFE..."
  OWNER_SAFE_ADDRESS="0xSAFE..."
  GOLD_SIGNER_ADDRESS="0x..."
  NFT_SIGNER_ADDRESS="0x..."
  ITEM_NFT_SIGNER_ADDRESS="0x..."
  DOL_FEE_TREASURY_ADDRESS="0xSAFE..."   # taxa dos markets → tesouraria
  GOLD_TREASURY_ADDRESS="0xSAFE..."      # recebe GOLD das compras da loja
  ITEM_NFT_BASE_URI="https://dolrath.vercel.app/api/nft/item/metadata/"
  ```

## 1. Testes verdes antes de tudo

```
npm run chain:test
```
Deve passar 40+ testes (DolToken, Gold, Characters, Items, ambos os markets, pause/rescue, invariante de moeda).

## 2. Deploy na ordem de dependências

Cada passo imprime o endereço — **copie para o `web3/.env`** antes do próximo (os seguintes leem os anteriores).

```
npm run chain:deploy:polygon                 # DolToken → mint de 1B ao DOL_TREASURY_ADDRESS
#   → DOL_TOKEN_ADDRESS=0x...

npm run chain:deploy:gold:polygon            # DolrathGold (claim EIP-712)
#   → GOLD_CONTRACT_ADDRESS=0x...

npm run chain:deploy:characters:polygon      # DolrathCharacters (NFT herói)
#   → CHARACTER_NFT_CONTRACT_ADDRESS=0x...

npm run chain:deploy:items:polygon           # DolrathItems (NFT item, já com baseURI se setado)
#   → ITEM_NFT_CONTRACT_ADDRESS=0x...

npm run chain:baseuri:polygon                # garante o baseURI no contrato de itens
npm run chain:deploy:market:polygon          # DolrathItemMarket (paga em GOLD, fee 4%)
#   → ITEM_MARKET_CONTRACT_ADDRESS=0x...

npm run chain:deploy:character-market:polygon  # DolrathCharacterMarket (paga em DOL, fee 5%)
#   → CHARACTER_MARKET_CONTRACT_ADDRESS=0x...
```

## 3. Transferir ownership para o Safe

Com todos os endereços no `web3/.env` e `OWNER_SAFE_ADDRESS` setado:

```
npm run chain:transfer-ownership:polygon
```
Transfere Gold, Characters, Items e os 2 markets para o Safe. Confira cada `owner()` no Polygonscan.
(DolToken não tem owner — supply fixo, nada a controlar.)

## 4. Verificar no Polygonscan

O plugin `hardhat-verify` conflita com as deps atuais; use **flatten + UI** (não precisa instalar nada):

```
cd web3
npx hardhat flatten contracts/DolToken.sol > /tmp/DolToken.flat.sol
# repita para cada contrato
```
No Polygonscan: contrato → *Verify & Publish* → Solidity (Single file) → compiler `0.8.24`,
otimizador **ON, 200 runs**, cole o flatten, informe os args do construtor (ABI-encoded).
Args por contrato: DOL=(treasury); Gold=(signer); Characters=(signer); Items=(signer, baseURI);
ItemMarket=(gold, itemsNft, feeTreasury); CharacterMarket=(dol, characterNft, feeTreasury).

> Alternativa: `npm i -D @nomicfoundation/hardhat-verify --legacy-peer-deps`, adicionar `etherscan` ao config e usar `hardhat verify`. Fica a critério — o flatten resolve sem mexer nas deps.

## 5. Envs de produção na Vercel

No painel do projeto "dolrath" (Production):

- [ ] `NEXT_PUBLIC_CHAIN_ID=137` e **todos** os `*_CHAIN_ID=137` (GOLD/CHARACTER_NFT/ITEM_NFT/ITEM_MARKET/CHARACTER_MARKET)
- [ ] RPCs mainnet (`POLYGON_MAINNET_RPC_URL` + os `*_RPC_URL` se usar RPC dedicado)
- [ ] Todos os `*_CONTRACT_ADDRESS` e `NEXT_PUBLIC_*` com os endereços mainnet
- [ ] `DOL_TREASURY_ADDRESS` / `NEXT_PUBLIC_DOL_TREASURY_ADDRESS` / `GOLD_TREASURY_ADDRESS` = Safe
- [ ] Chaves signer novas: `GOLD_SIGNER_PRIVATE_KEY`, `NFT_SIGNER_PRIVATE_KEY`, `ITEM_NFT_SIGNER_PRIVATE_KEY`
- [ ] `BATTLE_REWARDS_SECRET` setado (sem ele o PvP não credita — fail-closed)
- [ ] Opcional: `NEXT_PUBLIC_DISCORD_URL`, `NEXT_PUBLIC_TWITTER_URL`, `NEXT_PUBLIC_GITHUB_URL`
- [ ] Redeploy (push no main já dispara; ou "Redeploy" no painel)

> As migrações Prisma (`PvpMatch` novas colunas, `WaitlistEntry`) rodam no build da Vercel (`prisma migrate deploy`). Confirme no log do build que aplicaram no Supabase.

## 6. Smoke test em produção (carteira real, valores mínimos)

- [ ] Login por carteira na Polygon mainnet
- [ ] Claim de um GOLD pequeno → confirma na carteira (precisa de POL para gas)
- [ ] Mint de 1 item na loja (paga GOLD) → NFT aparece com metadata
- [ ] Criar personagem (paga DOL) → NFT de herói cunhado
- [ ] Listar um item e comprar de outra conta (GOLD) → item troca de dono, taxa queima
- [ ] Listar um personagem e comprar (DOL) → herói troca de dono, taxa queima
- [ ] `pause()` / `unpause()` de um market pelo Safe (teste do kill switch)

## 7. Pós-deploy

- [ ] `/doc`: tirar o rótulo "deploy pendente" das taxas (agora estão live) e publicar os endereços mainnet
- [ ] `docs/23-smart-contracts`: registrar endereços + tx de deploy
- [ ] Re-rodar `npm run sim:economy` conferindo o NET com dados reais antes de abrir ao público
- [ ] Monitorar erros nas rotas `/api/gold/*`, `/api/store/*`, `/api/battle/rewards` (ver §8)

## 8. Observabilidade (recomendado, não bloqueante)

Sentry precisa de conta + DSN reais (não dá pra provisionar por código):
1. Criar projeto em sentry.io → copiar o DSN
2. `npm i @sentry/nextjs` → `npx @sentry/wizard@latest -i nextjs`
3. `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` nas envs da Vercel
4. `@vercel/analytics` já é grátis no plano — habilitar no painel

## Rollback / incidente

- **Suspender trocas**: `pause()` nos markets pelo Safe (cancelamento de listing continua liberado — ninguém fica com NFT preso).
- **Chave de signer vazada**: `setSigner(nova)` pelo Safe em Gold/Characters/Items (sem redeploy).
- **App**: reverter o deploy no painel da Vercel (Instant Rollback).
