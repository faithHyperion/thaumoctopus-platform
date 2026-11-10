/** State and actions connecting the Workbench catalog to the Control Plane and Plugin Manager. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginInstallRequestId } from '@deepseek-ai/dsh-api-remotes/client'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { CatalogItem, ControlPlaneClient, ControlPlaneUser, PluginVersionInfo } from './control-plane.ts'

export interface InstallBundleCall {
  (
    spec: string,
    options: { registry?: string; authToken?: string; saveExact?: boolean; requestId?: PluginInstallRequestId },
  ): Promise<InstallBundleResult>
}

export interface ListBundlesCall {
  (): Promise<RemoteListResult<readonly InstalledBundle[]>>
}

export interface UpdateBundleCall {
  (
    name: string,
    version: string,
    options: {
      registry?: string
      authToken?: string
      restoreAuthToken?: string
      requestId?: PluginInstallRequestId
    },
  ): Promise<RemoteUpdateResult>
}

export interface SetBundleEnabledCall {
  (name: string, enabled: boolean): Promise<RemoteChangeResult>
}

export interface RemoveBundleCall {
  (name: string): Promise<RemoteChangeResult>
}

export interface InstalledBundle {
  readonly name: string
  readonly installed: boolean
  readonly version?: string
  readonly enabled: boolean
}

export interface InstalledPluginState {
  readonly version: string
  readonly enabled: boolean
}

export interface RemoteListResult<T> {
  readonly ok: boolean
  readonly value?: T
  readonly error?: { readonly message?: string }
}

export interface RemoteChangeResult {
  readonly ok: boolean
  readonly value?: {
    readonly application?: 'applied' | 'restart-required' | 'failed' | 'cancelled' | 'overridden'
    readonly error?: { readonly code?: string; readonly diagnostic?: string }
  }
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
export type WorkbenchOperationType = 'install' | 'update' | 'enable' | 'disable' | 'uninstall'
export type WorkbenchOperationPhase = 'running' | 'applied' | 'restart-required' | 'failed'
export type WorkbenchPackageAction = 'install' | 'update' | 'installed'

export interface WorkbenchOperationState {
  readonly type: WorkbenchOperationType
  readonly phase: WorkbenchOperationPhase
}

export interface WorkbenchLogRun {
  readonly jobId: string
  readonly command: string
  readonly cwd: string
  readonly output: string
  readonly exitCode?: number | null
}

export interface WorkbenchInstallLogChunk {
  readonly requestId?: PluginInstallRequestId
  readonly jobId: string
  readonly argv: readonly string[]
  readonly cwd: string
  readonly stream: 'stdout' | 'stderr'
  readonly text: string
  readonly exitCode?: number | null
}

export interface WorkbenchCatalogState {
  readonly status: WorkbenchCatalogStatus
  readonly user: ControlPlaneUser | undefined
  readonly items: readonly CatalogItem[]
  readonly message: string | undefined
  readonly operationStates: Readonly<Record<string, WorkbenchOperationState>>
  readonly installedStates: Readonly<Record<string, InstalledPluginState>>
  readonly selectedPluginId: string | undefined
  readonly versionHistories: Readonly<Record<string, readonly PluginVersionInfo[]>>
  readonly logs: Readonly<Record<string, readonly WorkbenchLogRun[]>>
}

const INITIAL: WorkbenchCatalogState = {
  status: 'anonymous',
  user: undefined,
  items: [],
  message: undefined,
  operationStates: {},
  installedStates: {},
  selectedPluginId: undefined,
  versionHistories: {},
  logs: {},
}

export class WorkbenchCatalogController {
  private readonly store: SnapshotStore<WorkbenchCatalogState>
  private readonly activeRequests = new Map<string, string>()
  private refreshing = false

  constructor(
    private readonly client: ControlPlaneClient,
    private readonly installBundle: InstallBundleCall,
    private readonly listBundles: ListBundlesCall,
    private readonly updateBundle: UpdateBundleCall,
    private readonly setBundleEnabled: SetBundleEnabledCall,
    private readonly removeBundle: RemoveBundleCall,
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
    setEnabled: (item: CatalogItem, enabled: boolean) => Promise<void>
    uninstall: (item: CatalogItem) => Promise<void>
    select: (pluginId: string | undefined) => Promise<void>
  } {
    return {
      hooks: { catalog: this.store },
      login: (email, password) => this.login(email, password),
      logout: () => this.logout(),
      refresh: () => this.refresh(),
      install: item => this.install(item),
      update: item => this.update(item),
      setEnabled: (item, enabled) => this.setEnabled(item, enabled),
      uninstall: item => this.uninstall(item),
      select: pluginId => this.select(pluginId),
    }
  }

  appendLog(chunk: WorkbenchInstallLogChunk): void {
    if (chunk.requestId === undefined) return
    const pluginId = this.activeRequests.get(chunk.requestId)
    if (pluginId === undefined) return

    const logs = [...(this.store.getSnapshot().logs[pluginId] ?? [])]
    const index = logs.findIndex(run => run.jobId === chunk.jobId)
    const settled = chunk.exitCode === undefined ? {} : { exitCode: chunk.exitCode }
    if (index === -1) {
      logs.push({
        jobId: chunk.jobId,
        command: chunk.argv.join(' '),
        cwd: chunk.cwd,
        output: chunk.text,
        ...settled,
      })
    } else {
      const run = logs[index] as WorkbenchLogRun
      logs[index] = { ...run, output: run.output + chunk.text, ...settled }
    }
    this.patch({ logs: { ...this.store.getSnapshot().logs, [pluginId]: logs } })
  }

  private async login(email: string, password: string): Promise<void> {
    this.store.set({ ...INITIAL, status: 'loading' })
    try {
      const user = await this.client.login(email, password)
      const [items, installedStates] = await Promise.all([this.client.catalog(), this.readInstalledStates()])
      this.store.set({ ...INITIAL, status: 'ready', user, items, installedStates })
    } catch (error) {
      this.store.set({ ...INITIAL, status: 'error', message: messageOf(error) })
    }
  }

  private async logout(): Promise<void> {
    await this.client.logout()
    this.activeRequests.clear()
    this.store.set(INITIAL)
  }

  private async refresh(): Promise<void> {
    if (!this.client.hasSession() || this.refreshing) return
    this.refreshing = true
    this.patch({ status: 'loading', message: undefined })
    try {
      const user = this.client.currentUser()
      if (user === undefined) throw new Error('The Workbench session is unavailable')
      const [items, installedStates] = await Promise.all([this.client.catalog(), this.readInstalledStates()])
      this.patch({ status: 'ready', user, items, installedStates })
    } catch (error) {
      this.patch({ status: 'error', message: messageOf(error) })
    } finally {
      this.refreshing = false
    }
  }

  private async select(pluginId: string | undefined): Promise<void> {
    this.patch({ selectedPluginId: pluginId })
    if (pluginId === undefined || this.store.getSnapshot().versionHistories[pluginId] !== undefined) return
    try {
      const versions = await this.client.pluginVersions(pluginId)
      this.patch({ versionHistories: { ...this.store.getSnapshot().versionHistories, [pluginId]: versions } })
    } catch (error) {
      this.patch({ message: messageOf(error) })
    }
  }

  private async install(item: CatalogItem): Promise<void> {
    const requestId = randomUUID() as PluginInstallRequestId
    this.activeRequests.set(requestId, item.pluginId)
    this.startOperation(item.pluginId, 'install')
    this.patch({ logs: { ...this.store.getSnapshot().logs, [item.pluginId]: [] } })
    try {
      const grant = await this.client.installGrant(item.pluginId, item.version)
      const result = await this.installBundle(`${grant.packageName}@${grant.version}`, {
        registry: grant.registryUrl,
        authToken: grant.token,
        saveExact: true,
        requestId,
      })
      this.settleCallResult(item.pluginId, 'install', result)
      await this.syncInstalledStates()
    } catch (error) {
      this.failOperation(item.pluginId, 'install', error)
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  private async update(item: CatalogItem): Promise<void> {
    const installed = this.store.getSnapshot().installedStates[item.packageName]
    if (installed === undefined) throw new Error('This plugin is not installed')
    const requestId = randomUUID() as PluginInstallRequestId
    this.activeRequests.set(requestId, item.pluginId)
    this.startOperation(item.pluginId, 'update')
    this.patch({ logs: { ...this.store.getSnapshot().logs, [item.pluginId]: [] } })
    try {
      const [targetGrant, restoreGrant] = await Promise.all([
        this.client.installGrant(item.pluginId, item.version),
        this.client.installGrant(item.pluginId, installed.version),
      ])
      const answer = await this.updateBundle(item.packageName, item.version, {
        registry: targetGrant.registryUrl,
        authToken: targetGrant.token,
        restoreAuthToken: restoreGrant.token,
        requestId,
      })
      if (!answer.ok || answer.value === undefined) {
        throw new Error(answer.error?.message ?? 'The plugin update failed')
      }
      this.settleChangeResult(item.pluginId, 'update', answer.value.result)
      await this.syncInstalledStates()
      await this.select(item.pluginId)
    } catch (error) {
      this.failOperation(item.pluginId, 'update', error)
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  private async setEnabled(item: CatalogItem, enabled: boolean): Promise<void> {
    this.startOperation(item.pluginId, enabled ? 'enable' : 'disable')
    try {
      const answer = await this.setBundleEnabled(item.packageName, enabled)
      this.settleCallResult(item.pluginId, enabled ? 'enable' : 'disable', answer)
      await this.syncInstalledStates()
    } catch (error) {
      this.failOperation(item.pluginId, enabled ? 'enable' : 'disable', error)
    }
  }

  private async uninstall(item: CatalogItem): Promise<void> {
    this.startOperation(item.pluginId, 'uninstall')
    try {
      const answer = await this.removeBundle(item.packageName)
      this.settleCallResult(item.pluginId, 'uninstall', answer)
      await this.syncInstalledStates()
    } catch (error) {
      this.failOperation(item.pluginId, 'uninstall', error)
    }
  }

  private async readInstalledStates(): Promise<Readonly<Record<string, InstalledPluginState>>> {
    const answer = await this.listBundles()
    if (!answer.ok || answer.value === undefined) {
      throw new Error(answer.error?.message ?? 'Installed plugins could not be read')
    }
    const states: Record<string, InstalledPluginState> = {}
    for (const bundle of answer.value) {
      if (bundle.installed && bundle.version !== undefined) {
        states[bundle.name] = { version: bundle.version, enabled: bundle.enabled }
      }
    }
    return states
  }

  private async syncInstalledStates(): Promise<void> {
    try {
      this.patch({ installedStates: await this.readInstalledStates() })
    } catch {
      // The operation result remains visible even if the immediate bundle read fails.
    }
  }

  private startOperation(pluginId: string, type: WorkbenchOperationType): void {
    this.patch({
      operationStates: { ...this.store.getSnapshot().operationStates, [pluginId]: { type, phase: 'running' } },
      message: undefined,
    })
  }

  private settleCallResult(
    pluginId: string,
    type: WorkbenchOperationType,
    result: RemoteChangeResult | InstallBundleResult,
  ): void {
    if (!result.ok) {
      this.failOperation(pluginId, type, new Error(result.error?.message ?? 'The plugin operation failed'))
      return
    }
    this.settleChangeResult(pluginId, type, result.value)
  }

  private settleChangeResult(
    pluginId: string,
    type: WorkbenchOperationType,
    result: { application?: 'applied' | 'restart-required' | 'failed' | 'cancelled' | 'overridden'; error?: { code?: string; diagnostic?: string } } | undefined,
  ): void {
    const application = result?.application
    if (application === 'failed' || application === 'cancelled') {
      this.failOperation(pluginId, type, new Error(result?.error?.diagnostic ?? result?.error?.code ?? 'The plugin operation failed'))
      return
    }
    this.patch({
      operationStates: {
        ...this.store.getSnapshot().operationStates,
        [pluginId]: { type, phase: application === 'restart-required' ? 'restart-required' : 'applied' },
      },
    })
  }

  private failOperation(pluginId: string, type: WorkbenchOperationType, error: unknown): void {
    this.patch({
      operationStates: {
        ...this.store.getSnapshot().operationStates,
        [pluginId]: { type, phase: 'failed' },
      },
      message: messageOf(error),
    })
  }

  private patch(next: Partial<WorkbenchCatalogState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...next })
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The Workbench request failed'
}
