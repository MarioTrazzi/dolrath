import { spawn } from 'node:child_process'

class CommandError extends Error {
  constructor(message, output) {
    super(message)
    this.name = 'CommandError'
    this.output = output
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, ...(opts.env || {}) },
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

function runCapturingOutput(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: { ...process.env, ...(opts.env || {}) },
    })

    let out = ''
    let err = ''

    child.stdout.on('data', (buf) => {
      const s = buf.toString('utf8')
      out += s
      if (opts.echo) process.stdout.write(s)
    })

    child.stderr.on('data', (buf) => {
      const s = buf.toString('utf8')
      err += s
      if (opts.echo) process.stderr.write(s)
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout: out, stderr: err })
      else {
        const combined = `${out}\n${err}`.trim()
        reject(new CommandError(`${cmd} ${args.join(' ')} exited with code ${code}`, combined))
      }
    })
  })
}

async function migrateWithRetry() {
  const maxAttempts = Number(process.env.PRISMA_MIGRATE_RETRY_ATTEMPTS || 5)
  const delayMs = Number(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS || 5000)

  const isCiLike = Boolean(process.env.CI || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT)
  const echo = process.env.PRISMA_MIGRATE_ECHO
    ? process.env.PRISMA_MIGRATE_ECHO === 'true'
    : isCiLike

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runCapturingOutput('npx', ['prisma', 'migrate', 'deploy'], { echo })
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const output = err && typeof err === 'object' && 'output' in err ? String(err.output || '') : ''
      const haystack = `${message}\n${output}`

      const isRetryable =
        // Advisory lock timeout
        /P1002/i.test(haystack) ||
        /advisory lock/i.test(haystack) ||
        /Timed out trying to acquire/i.test(haystack) ||
        // Transient reachability
        /P1001/i.test(haystack) ||
        /Can't reach database server/i.test(haystack)

      if (!isRetryable || attempt === maxAttempts) {
        // On final failure, print captured output to help debugging.
        if (!echo && output) {
          console.error(output)
        }
        throw err
      }

      console.warn(
        `Prisma migrate deploy failed (retryable). Retrying ${attempt}/${maxAttempts} in ${Math.round(
          delayMs / 1000
        )}s...`
      )
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

async function main() {
  // Keep this script deterministic for CI/Vercel.
  await run('npx', ['prisma', 'generate'])
  await migrateWithRetry()
  await run('npx', ['next', 'build'])
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
