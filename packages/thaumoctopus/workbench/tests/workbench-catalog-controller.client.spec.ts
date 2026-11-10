/** The catalog controller reconciles Control Plane data with installed bundles. */
import { expect, it, vi } from 'vitest'
import type {
  CatalogItem, ControlPlaneClient, ControlPlaneUser, InstallGrant, PluginVersionInfo,
} from '../src/client/control-plane.ts'
import {
  WorkbenchCatalogController, type InstallBundleResult, type RemoteUpdateResult,
} from '../src/client/catalog-controller.ts'

const USER: ControlPlaneUser = {
  id: 1, email: 'admin@example.com', plan: 'enterprise', role: 'admin', status: 'active',
}

const ITEM: CatalogItem = {
  pluginId: 'legal',
  packageName: '@thaumoctopus/plugin-legal',
  displayName: 'Legal assistant',
  description: 'Contract review.',
  icon: '',
  version: '1.2.0',
  channel: 'stable',
  minDsh: '>=0.2.2-alpha.2 <0.3.0',
  categories: ['legal'],
  plans: ['enterprise'],
  state: 'available',
  releaseNotes: '',
}

function grant(version: string): InstallGrant {
  return {
    pluginId: 'legal',
    packageName: '@thaumoctopus/plugin-legal',
    version,
    registryUrl: 'http://localhost:18080/registry/',
    token: `grant-token-${version}`,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    expiresIn: 600,
  }
}

it('remembers installed versions after refresh and updates with two scoped grants', async () => {
  const client = {
    hasSession: () => true,
    currentUser: () => USER,
    catalog: vi.fn(async () => [ITEM]),
    pluginVersions: vi.fn(async (): readonly PluginVersionInfo[] => [{
      version: '1.2.0', channel: 'stable', releaseNotes: 'Installed', minDsh: '>=0.2.2-alpha.2', size: 316, createdAt: '2026-11-06T02:45:07Z',
    }]),
    installGrant: vi.fn(async (_pluginId: string, version: string) => grant(version)),
  } as unknown as ControlPlaneClient
  let installedVersion = '1.1.0'
  const listBundles = vi.fn(async () => ({
    ok: true,
    value: [{ name: ITEM.packageName, installed: true, version: installedVersion, enabled: true }],
  }))
  const updateBundle = vi.fn(async (): Promise<RemoteUpdateResult> => ({
    ok: true,
    value: { from: '1.1.0', to: '1.2.0', result: { application: 'applied' } },
  }))
  const setBundleEnabled = vi.fn(async () => ({ ok: true, value: { application: 'applied' } }))
  const removeBundle = vi.fn(async () => ({ ok: true, value: { application: 'applied' } }))
  const controller = new WorkbenchCatalogController(
    client,
    vi.fn(async (): Promise<InstallBundleResult> => ({ ok: true, value: { application: 'applied' } })),
    listBundles,
    updateBundle,
    setBundleEnabled,
    removeBundle,
  )
  const face = controller.face()

  await face.refresh()
  expect(face.hooks.catalog.getSnapshot().installedStates).toEqual({
    '@thaumoctopus/plugin-legal': { version: '1.1.0', enabled: true },
  })

  installedVersion = '1.2.0'
  await face.update(ITEM)
  await vi.waitFor(() => {
    expect(face.hooks.catalog.getSnapshot().installedStates[ITEM.packageName]?.version).toBe('1.2.0')
  })
  expect(client.installGrant).toHaveBeenNthCalledWith(1, 'legal', '1.2.0')
  expect(client.installGrant).toHaveBeenNthCalledWith(2, 'legal', '1.1.0')
  expect(updateBundle).toHaveBeenCalledWith('@thaumoctopus/plugin-legal', '1.2.0', {
    registry: 'http://localhost:18080/registry/',
    authToken: 'grant-token-1.2.0',
    restoreAuthToken: 'grant-token-1.1.0',
    requestId: expect.any(String),
  })
})
