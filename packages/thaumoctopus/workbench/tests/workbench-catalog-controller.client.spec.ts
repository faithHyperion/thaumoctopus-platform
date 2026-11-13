/** The catalog controller reconciles Control Plane data with installed bundles. */
import { expect, it, vi } from 'vitest'
import type {
  CatalogItem, ControlPlaneClient, ControlPlaneUser, InstallGrant, PluginVersionInfo,
} from '../src/client/control-plane.ts'
import {
  WorkbenchCatalogController,
  type InstallBundleResult,
  type RemoteChangeResult,
  type RemoteUpdateResult,
  type WorkbenchRestartControls,
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

function restartControls(): WorkbenchRestartControls & {
  restartHost: ReturnType<typeof vi.fn<() => Promise<void>>>
  hostStatus: ReturnType<typeof vi.fn<() => Promise<{ state: 'running' }>>>
  reloadPage: ReturnType<typeof vi.fn<() => void>>
  waitMs: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>
} {
  return {
    restartHost: vi.fn(async () => {}),
    hostStatus: vi.fn(async () => ({ state: 'running' as const })),
    reloadPage: vi.fn(),
    waitMs: vi.fn(async () => {}),
  }
}

function memoryStorage(): Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> {
  const entries = new Map<string, string>()
  return {
    getItem: key => entries.get(key) ?? null,
    removeItem: (key) => { entries.delete(key) },
    setItem: (key, value) => { entries.set(key, value) },
  }
}

it('remembers installed versions after refresh and updates with two scoped grants', async () => {
  const client = {
    hasSession: () => true,
    currentUser: () => USER,
    catalog: vi.fn(async () => [ITEM]),
    pluginVersions: vi.fn(async (): Promise<readonly PluginVersionInfo[]> => [{
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
  const setBundleEnabled = vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } }))
  const removeBundle = vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } }))
  const controller = new WorkbenchCatalogController(
    client,
    vi.fn(async (): Promise<InstallBundleResult> => ({ ok: true, value: { application: 'applied' } })),
    listBundles,
    updateBundle,
    setBundleEnabled,
    removeBundle,
    restartControls(),
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

it('applies a restart-required update through the supervisor and reloads the page', async () => {
  const client = {
    hasSession: () => true,
    currentUser: () => USER,
    catalog: vi.fn(async () => [ITEM]),
    pluginVersions: vi.fn(async (): Promise<readonly PluginVersionInfo[]> => []),
    installGrant: vi.fn(async (_pluginId: string, version: string) => grant(version)),
  } as unknown as ControlPlaneClient
  const listBundles = vi.fn(async () => ({
    ok: true,
    value: [{ name: ITEM.packageName, installed: true, version: '1.2.0', enabled: true }],
  }))
  const updateBundle = vi.fn(async (): Promise<RemoteUpdateResult> => ({
    ok: true,
    value: { from: '1.1.0', to: '1.2.0', result: { application: 'restart-required' } },
  }))
  let polls = 0
  const controls: WorkbenchRestartControls = {
    restartHost: vi.fn(async () => {}),
    hostStatus: vi.fn(async () => {
      polls += 1
      return { state: polls >= 2 ? ('running' as const) : ('starting' as const) }
    }),
    reloadPage: vi.fn(),
    waitMs: vi.fn(async () => {}),
  }
  const controller = new WorkbenchCatalogController(
    client,
    vi.fn(async (): Promise<InstallBundleResult> => ({ ok: true, value: { application: 'applied' } })),
    listBundles,
    updateBundle,
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    controls,
  )
  const face = controller.face()

  await face.refresh()
  await face.update(ITEM)

  expect(controls.restartHost).toHaveBeenCalledTimes(1)
  expect(controls.reloadPage).toHaveBeenCalledTimes(1)
  const snapshot = face.hooks.catalog.getSnapshot()
  expect(snapshot.operationStates[ITEM.pluginId]).toEqual({ type: 'update', phase: 'reconnecting' })
  expect(snapshot.message).toBeUndefined()
})

it('keeps the confirm dialog state when the automatic restart fails and retries on confirm', async () => {
  const client = {
    hasSession: () => true,
    currentUser: () => USER,
    catalog: vi.fn(async () => [ITEM]),
    pluginVersions: vi.fn(async (): Promise<readonly PluginVersionInfo[]> => []),
    installGrant: vi.fn(async (_pluginId: string, version: string) => grant(version)),
  } as unknown as ControlPlaneClient
  const listBundles = vi.fn(async () => ({
    ok: true,
    value: [{ name: ITEM.packageName, installed: true, version: '1.2.0', enabled: true }],
  }))
  const updateBundle = vi.fn(async (): Promise<RemoteUpdateResult> => ({
    ok: true,
    value: { from: '1.1.0', to: '1.2.0', result: { application: 'restart-required' } },
  }))
  const restartHost = vi.fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('The supervisor is offline'))
    .mockResolvedValueOnce(undefined)
  const controls: WorkbenchRestartControls = {
    restartHost,
    hostStatus: vi.fn(async () => ({ state: 'running' as const })),
    reloadPage: vi.fn(),
    waitMs: vi.fn(async () => {}),
  }
  const controller = new WorkbenchCatalogController(
    client,
    vi.fn(async (): Promise<InstallBundleResult> => ({ ok: true, value: { application: 'applied' } })),
    listBundles,
    updateBundle,
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    controls,
  )
  const face = controller.face()

  await face.refresh()
  await face.update(ITEM)

  let snapshot = face.hooks.catalog.getSnapshot()
  expect(snapshot.operationStates[ITEM.pluginId]).toEqual({ type: 'update', phase: 'restart-required' })
  expect(snapshot.message).toBe('The supervisor is offline')
  expect(controls.reloadPage).not.toHaveBeenCalled()

  await face.confirmRestart(ITEM)

  expect(restartHost).toHaveBeenCalledTimes(2)
  expect(controls.reloadPage).toHaveBeenCalledTimes(1)
  snapshot = face.hooks.catalog.getSnapshot()
  expect(snapshot.operationStates[ITEM.pluginId]).toEqual({ type: 'update', phase: 'reconnecting' })
})

it('restores verification state after a reload and marks the update applied once the target version is live', async () => {
  const client = {
    hasSession: () => true,
    currentUser: () => USER,
    catalog: vi.fn(async () => [ITEM]),
    installGrant: vi.fn(async (_pluginId: string, version: string) => grant(version)),
  } as unknown as ControlPlaneClient
  const listBundles = vi.fn(async () => ({
    ok: true,
    value: [{ name: ITEM.packageName, installed: true, version: '1.2.0', enabled: true }],
  }))
  const updateBundle = vi.fn(async (): Promise<RemoteUpdateResult> => ({
    ok: true,
    value: { from: '1.1.0', to: '1.2.0', result: { application: 'restart-required' } },
  }))
  const storage = memoryStorage()
  const controls = restartControls()
  const controller = new WorkbenchCatalogController(
    client,
    vi.fn(async (): Promise<InstallBundleResult> => ({ ok: true, value: { application: 'applied' } })),
    listBundles,
    updateBundle,
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    controls,
    storage,
  )
  const face = controller.face()

  await face.refresh()
  await face.update(ITEM)

  expect(controls.reloadPage).toHaveBeenCalledTimes(1)
  const pending = JSON.parse(storage.getItem('thaumoctopus.workbench.pendingVerify')!) as {
    packageName: string
    targetVersion: string
  }
  expect(pending.packageName).toBe(ITEM.packageName)
  expect(pending.targetVersion).toBe('1.2.0')

  const remounted = new WorkbenchCatalogController(
    client,
    vi.fn(async (): Promise<InstallBundleResult> => ({ ok: true, value: { application: 'applied' } })),
    listBundles,
    updateBundle,
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    restartControls(),
    storage,
  )
  const secondFace = remounted.face()
  expect(secondFace.hooks.catalog.getSnapshot().operationStates[ITEM.pluginId]).toEqual({ type: 'update', phase: 'verifying' })

  await secondFace.refresh()

  const snapshot = secondFace.hooks.catalog.getSnapshot()
  expect(snapshot.operationStates[ITEM.pluginId]).toEqual({ type: 'update', phase: 'applied' })
  expect(snapshot.message).toBeUndefined()
  expect(storage.getItem('thaumoctopus.workbench.pendingVerify')).toBeNull()
})

it('marks the update failed when the target version does not load before the deadline', async () => {
  const client = {
    hasSession: () => true,
    currentUser: () => USER,
    catalog: vi.fn(async () => [ITEM]),
  } as unknown as ControlPlaneClient
  const listBundles = vi.fn(async () => ({
    ok: true,
    value: [{ name: ITEM.packageName, installed: true, version: '1.1.0', enabled: true }],
  }))
  const storage = memoryStorage()
  storage.setItem('thaumoctopus.workbench.pendingVerify', JSON.stringify({
    pluginId: ITEM.pluginId,
    packageName: ITEM.packageName,
    targetVersion: '1.2.0',
    type: 'update',
    startedAt: Date.now() - 200_000,
  }))
  const controller = new WorkbenchCatalogController(
    client,
    vi.fn(async (): Promise<InstallBundleResult> => ({ ok: true, value: { application: 'applied' } })),
    listBundles,
    vi.fn(async (): Promise<RemoteUpdateResult> => ({ ok: false, error: {} })),
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    restartControls(),
    storage,
  )
  const face = controller.face()
  expect(face.hooks.catalog.getSnapshot().operationStates[ITEM.pluginId]).toEqual({ type: 'update', phase: 'verifying' })

  await face.refresh()

  const snapshot = face.hooks.catalog.getSnapshot()
  expect(snapshot.operationStates[ITEM.pluginId]).toEqual({ type: 'update', phase: 'failed' })
  expect(snapshot.message).toBe('The updated version did not finish loading')
  expect(storage.getItem('thaumoctopus.workbench.pendingVerify')).toBeNull()
})

it('reports the restored version when an update fails but rolls back cleanly', async () => {
  const client = {
    hasSession: () => true,
    currentUser: () => USER,
    catalog: vi.fn(async () => [ITEM]),
    installGrant: vi.fn(async (_pluginId: string, version: string) => grant(version)),
  } as unknown as ControlPlaneClient
  const listBundles = vi.fn(async () => ({
    ok: true,
    value: [{ name: ITEM.packageName, installed: true, version: '1.1.0', enabled: true }],
  }))
  const updateBundle = vi.fn(async (): Promise<RemoteUpdateResult> => ({
    ok: true,
    value: {
      from: '1.1.0',
      to: '1.2.0',
      result: { application: 'failed', error: { code: 'install_failed' } },
      restore: { application: 'applied' },
    },
  }))
  const controller = new WorkbenchCatalogController(
    client,
    vi.fn(async (): Promise<InstallBundleResult> => ({ ok: true, value: { application: 'applied' } })),
    listBundles,
    updateBundle,
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    vi.fn(async (): Promise<RemoteChangeResult> => ({ ok: true, value: { application: 'applied' } })),
    restartControls(),
  )
  const face = controller.face()

  await face.refresh()
  await face.update(ITEM)

  const snapshot = face.hooks.catalog.getSnapshot()
  expect(snapshot.operationStates[ITEM.pluginId]).toEqual({ type: 'update', phase: 'failed' })
  expect(snapshot.message).toContain('install_failed')
  expect(snapshot.message).toContain('version 1.1.0 was restored')
})
