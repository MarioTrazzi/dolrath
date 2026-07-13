#!/usr/bin/env node
/**
 * Pull Vercel production env vars into local `.env` so local/CI matches prod.
 *
 * Requires:
 *   export VERCEL_TOKEN=...   # https://vercel.com/account/tokens
 *
 * Optional:
 *   VERCEL_ORG_ID / VERCEL_PROJECT_ID — otherwise uses .vercel/project.json
 *   (auto-linked to mariotrazzis-projects/dolrath when missing)
 *
 * Usage:
 *   npm run env:pull
 *   node scripts/pull-vercel-env.mjs --list   # names only (no values written)
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const VERCEL_DIR = resolve(ROOT, '.vercel')
const PROJECT_JSON = resolve(VERCEL_DIR, 'project.json')

// From Vercel GitHub bot comments on this repo's PRs
const DEFAULT_PROJECT_ID = 'prj_YMDCNtO0JPuqNnqtK4T6O8QUN57j'
const DEFAULT_PROJECT_NAME = 'dolrath'
const DEFAULT_SCOPE = 'mariotrazzis-projects'

const listOnly = process.argv.includes('--list')

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
      env: { ...process.env, ...(opts.env || {}) },
      cwd: ROOT,
    })
    let out = ''
    let err = ''
    if (opts.capture) {
      child.stdout.on('data', (b) => {
        out += b.toString('utf8')
      })
      child.stderr.on('data', (b) => {
        err += b.toString('utf8')
      })
    }
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise({ stdout: out, stderr: err })
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${err || out}`))
    })
  })
}

function ensureProjectLink() {
  mkdirSync(VERCEL_DIR, { recursive: true })
  if (existsSync(PROJECT_JSON)) return
  const payload = {
    projectId: process.env.VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID,
    orgId: process.env.VERCEL_ORG_ID || undefined,
  }
  // orgId is required by newer CLI; if unknown, leave a minimal link and let CLI resolve via --scope
  const body = {
    projectId: payload.projectId,
    projectName: DEFAULT_PROJECT_NAME,
  }
  if (payload.orgId) body.orgId = payload.orgId
  writeFileSync(PROJECT_JSON, JSON.stringify(body, null, 2) + '\n')
  console.log(`Wrote ${PROJECT_JSON} (project ${body.projectId})`)
}

function requireToken() {
  const token = (process.env.VERCEL_TOKEN || '').trim()
  if (!token) {
    console.error(`
Missing VERCEL_TOKEN.

Create a token at https://vercel.com/account/tokens then:

  export VERCEL_TOKEN=...
  npm run env:pull

Production stack this aligns to:
  Web/API   → Vercel (dolrath.vercel.app)
  WebSocket → Render (https://dolrath.onrender.com)
  Database  → Supabase (DATABASE_URL + DIRECT_URL poolers)
`)
    process.exit(1)
  }
  return token
}

function summarizeEnvFile(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  const keys = []
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=/)
    if (m) keys.push(m[1])
  }
  keys.sort()
  console.log(`\nPulled ${keys.length} keys into ${path}:`)
  for (const k of keys) console.log(`  - ${k}`)

  const required = ['DATABASE_URL', 'DIRECT_URL', 'NEXTAUTH_SECRET', 'NEXT_PUBLIC_SOCKET_URL']
  const missing = required.filter((k) => !keys.includes(k))
  if (missing.length) {
    console.warn(`\nWARNING: missing required keys for prod alignment: ${missing.join(', ')}`)
  }

  const socket = text.match(/^NEXT_PUBLIC_SOCKET_URL=(.*)$/m)?.[1]?.replace(/^"|"$/g, '')
  if (socket && !socket.includes('dolrath.onrender.com')) {
    console.warn(
      `\nWARNING: NEXT_PUBLIC_SOCKET_URL is "${socket}" — production expects https://dolrath.onrender.com`
    )
  }

  const db = text.match(/^DATABASE_URL=(.*)$/m)?.[1] || ''
  if (db && !/supabase\.com|pooler\.supabase/.test(db)) {
    console.warn('\nWARNING: DATABASE_URL does not look like a Supabase pooler URL')
  }
}

async function main() {
  requireToken()
  ensureProjectLink()

  const scopeArgs = ['--scope', DEFAULT_SCOPE]
  const envArgs = ['env', 'ls', ...scopeArgs]

  console.log('Listing Vercel env vars (names + environments)...')
  try {
    await run('npx', ['vercel', ...envArgs, '--no-color'], { capture: false })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    console.error('\nIf org link fails, set VERCEL_ORG_ID from the Vercel team settings URL.')
    process.exit(1)
  }

  if (listOnly) return

  console.log('\nPulling production env into .env ...')
  await run(
    'npx',
    ['vercel', 'env', 'pull', '.env', '--environment', 'production', '--yes', ...scopeArgs, '--no-color'],
    { capture: false }
  )

  summarizeEnvFile(resolve(ROOT, '.env'))

  console.log(`
Done. Local .env now mirrors Vercel Production.
Also ensure Preview has DATABASE_URL + DIRECT_URL (same Supabase poolers), or PR deploys will fail.
Socket target should remain: NEXT_PUBLIC_SOCKET_URL=https://dolrath.onrender.com
`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
