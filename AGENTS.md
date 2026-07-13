# AGENTS.md

## Cursor Cloud specific instructions

Dolrath RPG is a single game made of three co-located components:

- **Next.js 14 web app** (root: `src/`, `pages/`) — the game UI plus all REST API routes and wallet auth. Dev: `npm run dev` → http://localhost:3000.
- **WebSocket combat server** (`server/socket-server.js`) — real-time PvP/training combat on port 3001. Dev: `npm run socket:dev`. Health check: http://localhost:3001/health. Needed only to test realtime combat; the rest of the game runs without it.
- **Web3 Hardhat project** (`web3/`) — optional Solidity contracts (tokens/NFTs/marketplaces). Not required for core gameplay; on-chain reads degrade gracefully when contract-address env vars are empty. Commands: `npm run chain:compile`, `chain:test`, `chain:node`.

Run both app + socket together with `npm run dev:full` (already the recommended dev command). Standard scripts live in `package.json`.

### Environment / database (non-obvious)

- The app requires **PostgreSQL** (Prisma datasource). Upstream targets Neon, but in this VM a **local Postgres 16 cluster** is used. `.env` is gitignored and NOT committed; it is recreated by the update script if missing. It points `DATABASE_URL`/`DIRECT_URL` at `postgresql://postgres:postgres@localhost:5432/dolrath`.
- The Postgres service is **not auto-started** on boot. Start it before running the app: `sudo pg_ctlcluster 16 main start` (idempotent; ignore "already running").
- Apply schema with `npm run prisma:migrate` (prisma migrate deploy). `npm install` runs `prisma generate` via `postinstall`.
- **Seeding gotcha:** `npm run prisma:seed` runs `node prisma/seed.js` which does NOT load `.env`, so it fails with "Environment variable not found: DATABASE_URL". Run it as `node -r dotenv/config prisma/seed.js` instead (or export `DATABASE_URL` first).

### Auth / testing (non-obvious)

- Login is **wallet-only** (SIWE-style): `POST /api/auth/wallet/challenge` returns an HMAC-bound challenge (HMAC-SHA256 over `addr|nonce|issuedAt` keyed by `NEXTAUTH_SECRET`), the wallet signs it (EIP-191), then NextAuth's `/api/auth/callback/wallet` verifies and find-or-creates the user. There is no email/password provider — the legacy `create-test-user*` scripts do NOT produce a valid session.
- Login needs **no blockchain**, so it can be exercised headlessly with an `ethers.Wallet` (challenge → `signMessage` → callback with the CSRF token from `/api/auth/csrf`). A first login creates the user row in the DB.
- **Character creation requires a real on-chain DOL payment on Polygon Amoy** (`POST /api/character` returns 402 without `creationTxHash`; server verifies the ERC-20 transfer). There is no offline/dev bypass, so full character-creation E2E needs funded testnet wallets + deployed contracts (env vars in `.env.example`). Without them, you can still log in, browse the UI, and hit read APIs.
- `next lint` currently reports pre-existing errors/warnings in the repo (e.g. `react/no-unescaped-entities`, `react-hooks/rules-of-hooks` false positives on non-hook `useConsumable`/`useAbility` names). These are unrelated to environment setup.
