/** State and actions connecting the Workbench catalog to the Control Plane and Plugin Manager. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { CatalogItem, ControlPlaneClient, ControlPlaneUser } from './control-plane.ts'

export interface InstallBundleCall {
  (spec: string, options: { registry?: string; authToken?: string; saveExact?: boolean }): Promise<InstallBundleResult>
}

export interface ListBundlesCall {
  (): Promise<RemoteListResult<readonly InstalledBundle[]>>
}

export interface UpdateBundleCall {
  (
    name: string,
    version: string,
    options: { registry?: string; authToken?: string; restoreAuthToken?: string },
  ): Promise<RemoteUpdateResult>
}

export interface InstalledBundle {
  readonly name: string
  readonly installed: boolean
  readonly version?: string
}

export interface RemoteListResult<T> {
  readonly ok: boolean
  readonly value?: T
  readonly error?: { readonly message?: string }
}

export interface RemoteUpdateResult {
  readonly ok: boolean
  readonly value?: {
    readonly from: string
    readonly to: string
    readonly result: {
      readonly application?: 'applied' | 'restart-required' | 'failed' | 'cancelled' | 'overridden'
      readonly error?: { readonly code?: string; readonly diagnostic?: string }
    }
    readonly restore?: {
      readonly application?: 'applied' | 'restart-required' | 'failed' | 'cancelled' | 'overridden'
    }
  }
  readonly error?: { readonly message?: string }
}

export type InstallBundleResult =
  | {
    readonly ok: true
    readonly value: {
      readonly application?: 'applied' | 'restart-required' | 'failed' | 'cancelled' | 'overridden'
      readonly error?: { readonly code?: string; readonly diagnostic?: string }
      readonly warnings?: readonly string[]
    }
  }
  | { readonly ok: false; readonly error: { readonly message?: string } }

export type WorkbenchCatalogStatus = 'anonymous' | 'loading' | 'ready' | 'error'
export type WorkbenchInstallStatus = 'installing' | 'applied' | 'restart-required' | 'failed'
export type WorkbenchPackageAction = 'install' | 'update' | 'installed'

export interface WorkbenchCatalogState {
  readonly status: WorkbenchCatalogStatus
  readonly user: ControlPlaneUser | undefined
  readonly items: readonly CatalogItem[]
  readonly message: string | undefined
  readonly installStates: Readonly<Record<string, WorkbenchInstallStatus>>
  readonly installedVersions: Readonly<Record<string, string>>
}

const INITIAL: WorkbenchCatalogState = {
  status: 'anonymous', user: undefined, items: [], message: undefined, installStates: {}, installedVersions: {},
}

export class WorkbenchCatalogController {
  private readonly store: SnapshotStore<WorkbenchCatalogState>
  private refreshing = false

  constructor(
    private readonly client: ControlPlaneClient,
    private readonly installBundle: InstallBundleCall,
    private readonly listBundles: ListBundlesCall,
    private readonly updateBundle: UpdateBundleCall,
  ) {
    this.store = createSnapshotStore<WorkbenchCatalogState>({
      ...INITIAL,
      user: client.currentUser(),
      status: client.hasSession() ? 'loading' : 'anonymous',
    })
  }

  face(): {
    hooks: { catalog: HostObservable<WorkbenchCatalogState> }
    login: (email: string, password: string) => Promise<void>
    logout: () => Promise<void>
    refresh: () => Promise<void>
    install: (item: CatalogItem) => Promise<void>
    update: (item: CatalogItem) => Promise<void>
  } {
    return {
      hooks: { catalog: this.store },
      login: (email, password) => this.login(email, password),
      logout: () => this.logout(),
      refresh: () => this.refresh(),
      install: item => this.install(item),
      update: item => this.update(item),
    }
  }

  private async login(email: string, password: string): Promise<void> {
    this.store.set({ ...INITIAL, status: 'loading' })
    try {
      const user = await this.client.login(email, password)
      const [items, installedVersions] = await Promise.all([this.client.catalog(), this.readInstalledVersions()])
      this.store.set({ ...INITIAL, status: 'ready', user, items, installedVersions })
    } catch (error) {
      this.store.set({ ...INITIAL, status: 'error', message: messageOf(error) })
    }
  }

  private async logout(): Promise<void> {
    await this.client.logout()
    this.store.set(INITIAL)
  }

  private async refresh(): Promise<void> {
    if (!this.client.hasSession() || this.refreshing) return
    this.refreshing = true
    this.patch({ status: 'loading', message: undefined })
    try {
      const user = this.client.currentUser()
      if (user === undefined) throw new Error('The Workbench session is unavailable')
      const [items, installedVersions] = await Promise.all([this.client.catalog(), this.readInstalledVersions()])
      this.store.set({ ...INITIAL, status: 'ready', user, items, installedVersions })
    } catch (error) {
      this.patch({ status: 'error', message: messageOf(error) })
    } finally {
      this.refreshing = false
    }
  }

  private async install(item: CatalogItem): Promise<void> {
    this.patch({
      installStates: { ...this.store.getSnapshot().installStates, [item.pluginId]: 'installing' },
      message: undefined,
    })
    try {
      const grant = await this.client.installGrant(item.pluginId, item.version)
      const result = await this.installBundle(`${grant.packageName}@${grant.version}`, {
        registry: grant.registryUrl,
        authToken: grant.token,
        saveExact: true,
      })
      if (!result.ok) throw new Error(result.error.message ?? 'The plugin installation failed')
      const application = result.value.application
      if (application === 'failed' || application === 'cancelled') {
        const error = result.value.error
        throw new Error(error?.diagnostic ?? error?.code ?? 'The plugin installation failed')
      }
      const status = application === 'restart-required' ? 'restart-required' : 'applied'
      this.patch({
        installStates: { ...this.store.getSnapshot().installStates, [item.pluginId]: status },
      })
      await this.syncInstalledVersions()
    } catch (error) {
      this.patch({
        installStates: { ...this.store.getSnapshot().installStates, [item.pluginId]: 'failed' },
        message: messageOf(error),
      })
    }
  }

  private async update(item: CatalogItem): Promise<void> {
    const installedVersion = this.store.getSnapshot().installedVersions[item.packageName]
    if (installedVersion === undefined) throw new Error('This plugin is not installed')
    this.patch({
      installStates: { ...this.store.getSnapshot().installStates, [item.pluginId]: 'installing' },
      message: undefined,
    })
    try {
      const [targetGrant, restoreGrant] = await Promise.all([
        this.client.installGrant(item.pluginId, item.version),
        this.client.installGrant(item.pluginId, installedVersion),
      ])
      const answer = await this.updateBundle(item.packageName, item.version, {
        registry: targetGrant.registryUrl,
        authToken: targetGrant.token,
        restoreAuthToken: restoreGrant.token,
      })
      if (!answer.ok || answer.value === undefined) {
        throw new Error(answer.error?.message ?? 'The plugin update failed')
      }
      const application = answer.value.result.application
      if (application === 'failed' || application === 'cancelled') {
        const error = answer.value.result.error
        throw new Error(error?.diagnostic ?? error?.code ?? 'The plugin update failed')
      }
      const status = application === 'restart-required' ? 'restart-required' : 'applied'
      this.patch({
        installStates: { ...this.store.getSnapshot().installStates, [item.pluginId]: status },
      })
      await this.syncInstalledVersions()
    } catch (error) {
      this.patch({
        installStates: { ...this.store.getSnapshot().installStates, [item.pluginId]: 'failed' },
        message: messageOf(error),
      })
    }
  }

  private async readInstalledVersions(): Promise<Readonly<Record<string, string>>> {
    const answer = await this.listBundles()
    if (!answer.ok || answer.value === undefined) {
      throw new Error(answer.error?.message ?? 'Installed plugins could not be read')
    }
    const versions: Record<string, string> = {}
    for (const bundle of answer.value) {
      if (bundle.installed && bundle.version !== undefined) versions[bundle.name] = bundle.version
    }
    return versions
  }

  private async syncInstalledVersions(): Promise<void> {
    try {
      this.patch({ installedVersions: await this.readInstalledVersions() })
    } catch {
      // The installation result remains visible even if the immediate bundle read fails.
    }
  }

  private patch(next: Partial<WorkbenchCatalogState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...next })
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The Workbench request failed'
}
