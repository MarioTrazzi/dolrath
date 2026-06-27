#!/usr/bin/env node
// Atalho: roda o teste TS (dungeon-full-run-test.ts) via ts-node sem precisar
// lembrar das flags. Uso: node scripts/run-dungeon-test.js [dungeon]
//   DUNGEON=caverna CLASS=mage LEVEL=10 node scripts/run-dungeon-test.js
const { spawnSync } = require('child_process')
const path = require('path')
const tsNode = path.join(__dirname, '..', 'node_modules', '.bin', 'ts-node')
const r = spawnSync(tsNode, [
  '--transpile-only',
  '--compiler-options', '{"module":"commonjs","moduleResolution":"node","target":"es2019"}',
  path.join(__dirname, 'dungeon-full-run-test.ts'),
  ...process.argv.slice(2),
], { stdio: 'inherit' })
process.exit(r.status ?? 0)
