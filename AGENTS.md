# AGENTS.md

## Deploy policy (Dolrath)

- **Ship on `main` only.** Push to `origin/main` → Vercel **Production** (`https://dolrath.vercel.app`).
- **No Preview deploys** for day-to-day work. Preview breaks crypto wallet login (SIWE + Vercel SSO on `*.vercel.app`).
- Vercel Ignored Build Step: only builds when `VERCEL_ENV=production`. `vercel.json` also disables git auto-deploy for non-`main` branches.

## Stack (short)

- Next.js app on **Vercel** (this repo root).
- WebSocket combat on **Render** (`NEXT_PUBLIC_SOCKET_URL=https://dolrath.onrender.com`).
- DB: Supabase via Prisma (`DATABASE_URL` + `DIRECT_URL` on Production).
