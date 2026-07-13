/**
 * Runs `prisma generate` with placeholder DATABASE_URL / DIRECT_URL when
 * missing, so `npm install` / postinstall works without secrets.
 * Real URLs are still required for migrate / runtime.
 */
import { spawn } from 'node:child_process'

const PLACEHOLDER = 'postgresql://prisma:prisma@127.0.0.1:5432/prisma'

const env = { ...process.env }
if (!(env.DATABASE_URL || '').trim()) {
  env.DATABASE_URL = PLACEHOLDER
}
if (!(env.DIRECT_URL || '').trim()) {
  env.DIRECT_URL = env.DATABASE_URL
}

const child = spawn('npx', ['prisma', 'generate'], {
  stdio: 'inherit',
  shell: false,
  env,
})

child.on('error', (err) => {
  console.error(err)
  process.exit(1)
})

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
