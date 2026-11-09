#!/usr/bin/env node
// Build the Thaumoctopus web client with local sign-in defaults baked in.

import { spawn } from 'node:child_process'
import { platform } from 'node:os'

const buildWorkbench = () => spawn('pnpm', ['--filter', '@thaumoctopus/workbench', 'exec', 'tsdown'], {
  stdio: 'inherit',
  shell: platform() === 'win32',
  env: {
    ...process.env,
    DSH_CLIENT_THAUMOCTOPUS_DEFAULT_EMAIL: 'admin@example.com',
    DSH_CLIENT_THAUMOCTOPUS_DEFAULT_PASSWORD: 'local-dev-admin-password-20261103',
  },
})

const buildWeb = () => spawn('pnpm', ['run', 'build:web'], {
  stdio: 'inherit',
  shell: platform() === 'win32',
  env: {
    ...process.env,
    DSH_CLIENT_THAUMOCTOPUS_DEFAULT_EMAIL: 'admin@example.com',
    DSH_CLIENT_THAUMOCTOPUS_DEFAULT_PASSWORD: 'local-dev-admin-password-20261103',
  },
})

const workbench = buildWorkbench()
workbench.on('exit', code => {
  if (code !== 0) {
    process.exitCode = code ?? 1
    return
  }
  const web = buildWeb()
  web.on('exit', webCode => {
    process.exitCode = webCode ?? 1
  })
})
