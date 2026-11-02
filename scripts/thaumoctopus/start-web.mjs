#!/usr/bin/env node
// Launch the branded web app with an isolated DSH home and the default
// Thaumoctopus profile, so a developer machine's existing ~/.dsh stays
// untouched. The profile is provisioned from profiles/<name> on first run.

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const product = JSON.parse(readFileSync(join(repoRoot, 'branding', 'product.json'), 'utf8'))

const defaultHome = platform() === 'win32'
  ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), product.internalName, 'dsh-home')
  : join(homedir(), `.${product.internalName}`, 'dsh-home')

const home = process.env.DSH_HOME ?? defaultHome
const profileName = product.defaultProfile
const profileDir = join(home, 'profiles', profileName)
const sourceProfile = join(repoRoot, 'profiles', profileName)

if (!existsSync(profileDir)) {
  mkdirSync(profileDir, { recursive: true })
  for (const entry of ['cordis.yml', 'cordis.patch.yml', 'package.json']) {
    copyFileSync(join(sourceProfile, entry), join(profileDir, entry))
  }
  console.log(`thaumoctopus: provisioned profile at ${profileDir}`)
} else {
  // The patch layer is repo-owned: re-sync it so mount changes reach an
  // already-provisioned profile. User-owned state (bundles, settings) stays.
  copyFileSync(join(sourceProfile, 'cordis.patch.yml'), join(profileDir, 'cordis.patch.yml'))
}

const child = spawn('pnpm', ['dsh', profileName], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: platform() === 'win32',
  env: {
    ...process.env,
    DSH_HOME: home,
    DSH_CLIENT_TITLE: product.productName,
  },
})
child.on('exit', code => {
  process.exitCode = code ?? 1
})
