#!/usr/bin/env node
// Supervisor for the Thaumoctopus web host: owns the host child process and
// exposes a loopback-only control API the Workbench uses for controlled
// restarts after plugin updates. Run it instead of start-web.mjs whenever the
// update-after-restart flow should be available.

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { platform } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const product = JSON.parse(readFileSync(join(repoRoot, 'branding', 'product.json'), 'utf8'))

const supervisorPort = Number(process.env.THAUMOCTOPUS_SUPERVISOR_PORT ?? 18099)
const webPort = Number(process.env.THAUMOCTOPUS_WEB_PORT ?? 3080)
const stopGraceMs = 10_000
const startTimeoutMs = 90_000
const probeIntervalMs = 500

let child
let state = 'stopped'
let restarting = false
let restarts = 0
let lastError

function spawnHost() {
  state = 'starting'
  child = spawn(process.execPath, [join('scripts', 'thaumoctopus', 'start-web.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  })
  child.on('exit', (code, signal) => {
    child = undefined
    if (state !== 'stopping') {
      state = 'stopped'
      lastError = `Host exited unexpectedly (code=${String(code)} signal=${String(signal)})`
    }
  })
}

async function probeWeb() {
  try {
    const response = await fetch(`http://127.0.0.1:${webPort}/`)
    return response.status < 600
  } catch {
    return false
  }
}

async function waitForWeb() {
  const deadline = Date.now() + startTimeoutMs
  while (Date.now() < deadline) {
    if (child === undefined) return false
    if (await probeWeb()) return true
    await new Promise(resolve => setTimeout(resolve, probeIntervalMs))
  }
  return false
}

async function stopHost() {
  if (child === undefined) return
  state = 'stopping'
  const current = child
  const exited = new Promise(resolve => current.once('exit', resolve))
  if (platform() === 'win32') {
    // The launcher spawns pnpm through a shell, so the whole tree must go.
    spawn('taskkill', ['/pid', String(current.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    current.kill('SIGTERM')
  }
  const timer = setTimeout(() => {
    if (current.exitCode === null && current.signalCode === null) current.kill('SIGKILL')
  }, stopGraceMs)
  await exited
  clearTimeout(timer)
  child = undefined
}

async function restartHost() {
  if (restarting) throw new Error('A restart is already in progress')
  restarting = true
  try {
    await stopHost()
    restarts += 1
    lastError = undefined
    spawnHost()
    if (!(await waitForWeb())) {
      state = 'stopped'
      lastError = 'Host did not become ready before the restart deadline'
      throw new Error(lastError)
    }
    state = 'running'
  } finally {
    restarting = false
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

const server = createServer((request, response) => {
  void handle(request, response).catch(error => {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
  })
})

async function handle(request, response) {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${supervisorPort}`)
  if (request.method === 'GET' && url.pathname === '/healthz') {
    sendJson(response, 200, { ok: true })
    return
  }
  if (request.method === 'GET' && url.pathname === '/host') {
    sendJson(response, 200, {
      state,
      pid: child?.pid,
      restarts,
      lastError,
      profile: product.defaultProfile,
    })
    return
  }
  if (request.method === 'POST' && url.pathname === '/restart') {
    if (restarting) {
      sendJson(response, 409, { error: 'A restart is already in progress' })
      return
    }
    void restartHost().catch(error => {
      lastError = error instanceof Error ? error.message : String(error)
      state = 'stopped'
    })
    sendJson(response, 202, { ok: true })
    return
  }
  sendJson(response, 404, { error: 'Not found' })
}

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  server.close()
  await stopHost()
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void shutdown()
  })
}

server.listen(supervisorPort, '127.0.0.1', () => {
  console.log(`thaumoctopus: supervisor listening on http://127.0.0.1:${supervisorPort}`)
  spawnHost()
  void waitForWeb().then(ready => {
    if (ready) {
      state = 'running'
    } else if (child !== undefined) {
      state = 'stopped'
      lastError = 'Host did not become ready on startup'
    }
  })
})
