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
console.log(`thaumoctopus: DSH_HOME=${home}`)

if (!existsSync(profileDir)) {
  mkdirSync(profileDir, { recursive: true })
  for (const entry of ['.npmrc', 'cordis.yml', 'cordis.patch.yml', 'package.json']) {
    copyFileSync(join(sourceProfile, entry), join(profileDir, entry))
  }
  console.log(`thaumoctopus: provisioned profile at ${profileDir}`)
} else {
  // The npmrc and patch layer are repo-owned: re-sync them so layout and mount
  // changes reach an already-provisioned profile. User-owned state (bundles,
  // settings) stays.
  copyFileSync(join(sourceProfile, 'cordis.patch.yml'), join(profileDir, 'cordis.patch.yml'))
  copyFileSync(join(sourceProfile, '.npmrc'), join(profileDir, '.npmrc'))
}

// A profile installed before the hoisted layout keeps its version-pinned
// virtual store under node_modules/.pnpm. pnpm does not convert layouts in
// place: such plugins must be reinstalled (through the Workbench, so the
// private registry grants are re-issued) before updates hot-apply.
if (existsSync(join(profileDir, 'node_modules', '.pnpm'))) {
  console.log(
    'thaumoctopus: this profile still holds the isolated-layout node_modules. '
    + 'Reinstall its plugins from the Workbench catalog to enable in-place hot updates.',
  )
}

const child = spawn('pnpm', ['dsh', profileName], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: platform() === 'win32',
  env: {
    ...process.env,
    DSH_HOME: home,
    DSH_CLIENT_TITLE: product.productName,
    DSH_CLIENT_THAUMOCTOPUS_CONTROL_PLANE_URL:
      process.env.DSH_CLIENT_THAUMOCTOPUS_CONTROL_PLANE_URL ?? 'http://localhost:18080',
    DSH_CLIENT_THAUMOCTOPUS_DEFAULT_EMAIL: 'admin@example.com',
    DSH_CLIENT_THAUMOCTOPUS_DEFAULT_PASSWORD: 'local-dev-admin-password-20261103',
  },
})
child.on('exit', code => {
  process.exitCode = code ?? 1
})
