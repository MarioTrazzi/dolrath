# 24 — API

Next.js App Router — rotas em `src/app/api/`. Autenticação **exclusivamente por carteira** (SIWE/HMAC; Google e email/senha foram removidos — commit c1da151).

## Áreas de rota

| Área | Rotas principais | Nota |
|---|---|---|
| `auth`, `wallet` | login SIWE, link de carteira | sessão exigida em tudo abaixo |
| `character` | CRUD de personagem, stats (fonte: `gameData.ts`) | prévia via `lib/characterStats.ts` |
| `dungeon/run` | `start`, `step`, `combat`, `abandon`, `heartbeat`, `active` | **servidor-autoritativo**; credita gold/XP; teto diário |
| `battle` | `rewards` | PvP; exige sessão + posse do participante |
| `bank` | `deposit`, `withdraw`, `status` | carteira do personagem ↔ banco da conta |
| `gold` | `status`, `claim-intent`, `claim-confirm`, `spend-config` | claim EIP-712; spend aponta o treasury |
| `store` | compra on-chain (NFT) e `purchase-offchain` (saldo) | preço servidor-autoritativo |
| `marketplace` | `list-intent`, `list-confirm` | lazy-mint + trava anti-duplicação (20 min) |
| `inventory`, `items`, `materials` | equipar, vender (60% catálogo), transferir, craft | cap de slots imposto no servidor |
| `nft`, `character-market` | metadata viva, mint, verificação | — |
| `ai` | juiz/narrador de combate | Anthropic/OpenAI |

## Princípios de segurança da API

1. **Nada de valor confia no cliente:** loot, preços e recompensas são decididos no servidor. As rotas históricas que confiavam no body (`add-exploration-reward`) foram desativadas com 410.
2. **Toda emissão passa por assinatura:** GOLD on-chain só existe após `claim-intent` assinado.
3. **Rotas legadas client-authoritative restantes** (não-token): `add-xp`, `update-stamina` — aceitável pois XP não é token; migração planejada.

## EM BREVE

- Rate-limiting por carteira nas rotas de economia.
- API pública read-only (leaderboards, metadata, floor price) com chave.
- Especificação OpenAPI gerada.
