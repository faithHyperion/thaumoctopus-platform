#!/usr/bin/env node
// Thaumoctopus dev loop: the repository's client-artifact watchers (tsc,
// tsdown, vite) beside the branded profile server, so plugin slot and shell
// edits appear in the browser without a manual rebuild. First use needs one
// prior `pnpm run build`; afterwards the default skips that stage, and
// `--full-build` restores it.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { platform } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const product = JSON.parse(readFileSync(join(repoRoot, 'branding', 'product.json'), 'utf8'))

const fullBuild = process.argv.includes('--full-build')
const env = {
  ...process.env,
  DSH_CLIENT_TITLE: product.productName,
  // Keep the local sign-in defaults when the client-artifact watchers rebuild
  // the Workbench bundle. Production builds omit these values.
  DSH_CLIENT_THAUMOCTOPUS_DEFAULT_EMAIL: 'admin@example.com',
  DSH_CLIENT_THAUMOCTOPUS_DEFAULT_PASSWORD: 'local-dev-admin-password-20261103',
}

const devArgs = ['--import', 'tsx/esm', 'scripts/dev-web.ts', '--no-serve']
if (!fullBuild) devArgs.push('--skip-build')

const watchers = spawn(process.execPath, devArgs, { cwd: repoRoot, env, stdio: 'inherit' })
const server = spawn(process.execPath, [join('scripts', 'thaumoctopus', 'start-web.mjs')], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
})

let stopping = false
function stop(fromExit) {
  if (stopping) return
  stopping = true
  for (const child of [watchers, server]) {
    if (child !== fromExit && child.exitCode === null && child.signalCode === null) child.kill()
  }
}

for (const child of [watchers, server]) {
  child.on('exit', (code, signal) => {
    stop(child)
    if (!stopping || code !== 0) process.exitCode = code ?? (signal === undefined ? 1 : 130)
    process.exit(process.exitCode ?? 1)
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stop()
  })
}
