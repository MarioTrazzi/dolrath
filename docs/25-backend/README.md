# 25 — Backend

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime web + API | Next.js 14 (App Router) na **Vercel** (projeto "dolrath"; push no `main` = deploy automático) |
| Tempo real (PvP) | Socket.IO standalone (`server/socket-server.js`) no **Render** (`https://dolrath.onrender.com`) |
| Banco | PostgreSQL **Supabase** (Supavisor): `DATABASE_URL` = transaction pooler, `DIRECT_URL` = session pooler (migrações) |
| ORM | Prisma 6 (`prisma/schema.prisma`) |
| Blockchain | ethers v6 + Hardhat (`web3/`) |
| IA | Anthropic + OpenAI (juiz de combate, geração de imagens gpt-image-1) |
| Mídia | Cloudinary (arte de itens/monstros/personagens) |

## Modelos de dados centrais

`User` (conta, `goldBalance` = banco), `Character` (herói, `gold` = carteira), `CharacterInventory`/`CharacterEquipment` (itens jogáveis), `UserInventory` (compras da loja), `Item`/`ItemNft` (catálogo e espelho on-chain, com `enhancementLevel`/`mintSource`/`listingLockedAt`), `DungeonRun` (estado servidor-autoritativo da run), `CharacterHistory`, `Account`/`Session` (auth).

## Decisões de arquitetura que importam

1. **Servidor é dono da economia.** Rolagens, loot, preços e recompensas nascem no servidor; o cliente é apresentação (ver [API](../24-api/README.md)).
2. **Off-chain primeiro, on-chain por escolha.** O jogo roda inteiro no Postgres; blockchain entra por assinatura quando o jogador quer propriedade/comércio.
3. **Idempotência nas pontes:** claims usam nonce por destinatário; mints usam voucher com trava de inventário; confirmações leem eventos da chain, nunca o body do cliente.
4. **Simulação como teste:** mudanças de balance/economia validadas por scripts em `scripts/` antes de produção (ver [Balancing](../30-balancing/README.md)).

## Ambientes

- **Produção:** Vercel (web) + Render (WebSocket) + Supabase (Postgres) + Polygon. Envs no painel da Vercel — `DATABASE_URL`, `DIRECT_URL` e `NEXT_PUBLIC_SOCKET_URL=https://dolrath.onrender.com` precisam existir em **Production e Preview** (Preview sem as URLs do Supabase quebra o build). Puxe com `npm run env:pull` (requer `VERCEL_TOKEN`).
- **Dev local:** copie `.env.example` → `.env` (ou `npm run env:pull`) e preencha as duas URLs do pooler; `npm run dev` + `npm run socket:dev`.

## EM BREVE

- Fila de jobs (claims em lote, snapshots de métricas).
- Cache/replicação de leitura para leaderboards.
- Indexador de eventos on-chain (histórico de preços do marketplace).
