# AGENTS.md

## Cursor Cloud specific instructions

Dolrath RPG is a single game made of three co-located components:

- **Next.js 14 web app** (root: `src/`, `pages/`) — the game UI plus all REST API routes and wallet auth. Dev: `npm run dev` → http://localhost:3000. **Production: Vercel** (`https://dolrath.vercel.app`).
- **WebSocket combat server** (`server/socket-server.js`) — real-time PvP/training combat on port 3001. Dev: `npm run socket:dev`. Health check: http://localhost:3001/health. **Production: Render** (`https://dolrath.onrender.com`). Needed only to test realtime combat; the rest of the game runs without it.
- **Web3 Hardhat project** (`web3/`) — optional Solidity contracts (tokens/NFTs/marketplaces). Not required for core gameplay; on-chain reads degrade gracefully when contract-address env vars are empty. Commands: `npm run chain:compile`, `chain:test`, `chain:node`.

Run both app + socket together with `npm run dev:full`.

### Environment / database (non-obvious)

- **Production DB is Supabase** (not Neon). Prisma needs both:
  - `DATABASE_URL` — Supavisor transaction pooler (`*.pooler.supabase.com:6543?...pgbouncer=true`)
  - `DIRECT_URL` — Supavisor session pooler (`*.pooler.supabase.com:5432`) for `prisma migrate deploy`. Do **not** use the `db.*` host (IPv6-only; breaks Vercel builds).
- Pull production secrets when you have a token: `export VERCEL_TOKEN=... && npm run env:pull` (writes gitignored `.env`). List names only: `npm run env:list`.
- `NEXT_PUBLIC_SOCKET_URL` must be `https://dolrath.onrender.com` (also set in `vercel.json`).
- Preview deploys need the same `DATABASE_URL` + `DIRECT_URL` as Production; otherwise Vercel Preview builds fail at prisma generate/migrate.
- In this VM a **local Postgres 16** may be used instead. Start it with `sudo pg_ctlcluster 16 main start`. Local `.env` can point both URLs at `postgresql://postgres:postgres@localhost:5432/dolrath`.
- Apply schema with `npm run prisma:migrate`. `npm install` runs `prisma generate` via `postinstall` (`scripts/prisma-generate.mjs` supplies placeholders when secrets are absent).
- **Seeding gotcha:** `npm run prisma:seed` runs `node prisma/seed.js` which does NOT load `.env`. Use `node -r dotenv/config prisma/seed.js` (or export `DATABASE_URL` first).

### Auth / testing (non-obvious)

- Login is **wallet-only** (SIWE-style): `POST /api/auth/wallet/challenge` → wallet signs → NextAuth `/api/auth/callback/wallet`. No email/password provider.
- Character creation requires a real on-chain DOL payment on Polygon Amoy (`POST /api/character` returns 402 without `creationTxHash`).
- `next lint` reports pre-existing errors/warnings unrelated to environment setup.
