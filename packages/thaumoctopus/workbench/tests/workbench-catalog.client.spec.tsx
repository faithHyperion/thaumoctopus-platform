// @vitest-environment jsdom
/** The Workbench catalog signs in, renders plan-filtered items, and dispatches exact installs. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, expect, it, vi } from 'vitest'
import type { CatalogItem } from '../src/client/control-plane.ts'
import type { WorkbenchCatalogState } from '../src/client/catalog-controller.ts'
import { WorkbenchCatalog } from '../src/client/WorkbenchCatalog.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const USER = { id: 1, email: 'admin@example.com', plan: 'enterprise', role: 'admin', status: 'active' }
const ITEM: CatalogItem = {
  pluginId: 'legal',
  packageName: '@thaumoctopus/plugin-legal',
  displayName: 'Legal assistant',
  description: 'Contract review and clause comparison.',
  icon: '',
  version: '1.2.0',
  channel: 'stable',
  minDsh: '>=0.2.2-alpha.2 <0.3.0',
  categories: ['legal'],
  plans: ['pro', 'enterprise'],
  state: 'available',
  releaseNotes: '',
}

function fixture(state: Partial<WorkbenchCatalogState> = {}) {
  const store = createSnapshotStore<WorkbenchCatalogState>({
    status: 'anonymous',
    user: undefined,
    items: [],
    message: undefined,
    operationStates: {},
    installedStates: {},
    selectedPluginId: undefined,
    versionHistories: {},
    logs: {},
    ...state,
  })
  const actions = {
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    setEnabled: vi.fn(async () => {}),
    uninstall: vi.fn(async () => {}),
    select: vi.fn(async () => {}),
  }
  const view = render(
    <WorkbenchCatalog
      t={makeTranslate(en)}
      useCatalog={bindSnapshotSelector(store)}
      {...actions}
    />,
  )
  return { view, store, actions }
}

it('submits Control Plane credentials', () => {
  const { view, actions } = fixture()
  fireEvent.change(view.getByLabelText(en.email), { target: { value: 'admin@example.com' } })
  fireEvent.change(view.getByLabelText(en.password), { target: { value: 'secret' } })
  fireEvent.submit(view.getByRole('button', { name: en.signIn }).closest('form')!)
  expect(actions.login).toHaveBeenCalledWith('admin@example.com', 'secret')
})

it('renders catalog items and dispatches an exact install', async () => {
  const { view, actions } = fixture({ status: 'ready', user: USER, items: [ITEM] })
  expect(view.getByText('Legal assistant')).toBeTruthy()
  expect(view.getByText('1.2.0')).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: en.install }))
  await vi.waitFor(() => { expect(actions.install).toHaveBeenCalledWith(ITEM) })
})

it('shows an installed version and dispatches an update when the catalog is newer', async () => {
  const { view, actions } = fixture({
    status: 'ready',
    user: USER,
    items: [ITEM],
    installedStates: { '@thaumoctopus/plugin-legal': { version: '1.1.0', enabled: true } },
  })
  expect(view.getByText('1.1.0')).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: en.update }))
  await vi.waitFor(() => { expect(actions.update).toHaveBeenCalledWith(ITEM) })
  expect(actions.install).not.toHaveBeenCalled()
})

it('disables the action when the installed version is current', () => {
  const { view, actions } = fixture({
    status: 'ready',
    user: USER,
    items: [ITEM],
    installedStates: { '@thaumoctopus/plugin-legal': { version: '1.2.0', enabled: true } },
  })
  const button = view.getByRole('button', { name: en.installed }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect(actions.install).not.toHaveBeenCalled()
  expect(actions.update).not.toHaveBeenCalled()
})

it('filters by search text and category', () => {
  const finance = { ...ITEM, pluginId: 'finance', displayName: 'Finance assistant', packageName: '@thaumoctopus/plugin-finance', categories: ['finance'] }
  const { view } = fixture({ status: 'ready', user: USER, items: [ITEM, finance] })
  expect(view.getByText('Legal assistant')).toBeTruthy()
  expect(view.getByText('Finance assistant')).toBeTruthy()

  fireEvent.change(view.getByPlaceholderText(en.searchPlaceholder), { target: { value: 'finance' } })
  expect(view.queryByText('Legal assistant')).toBeNull()
  expect(view.getByText('Finance assistant')).toBeTruthy()

  fireEvent.change(view.getByPlaceholderText(en.searchPlaceholder), { target: { value: '' } })
  fireEvent.change(view.getByLabelText(en.categoryLabel), { target: { value: 'legal' } })
  expect(view.getByText('Legal assistant')).toBeTruthy()
  expect(view.queryByText('Finance assistant')).toBeNull()
})

it('offers installed controls and dispatches enable, disable, and uninstall', async () => {
  const { view, actions } = fixture({
    status: 'ready',
    user: USER,
    items: [ITEM],
    installedStates: { '@thaumoctopus/plugin-legal': { version: '1.2.0', enabled: true } },
  })
  fireEvent.click(view.getByRole('button', { name: en.disable }))
  await vi.waitFor(() => { expect(actions.setEnabled).toHaveBeenCalledWith(ITEM, false) })

  fireEvent.click(view.getByRole('button', { name: en.uninstall }))
  await vi.waitFor(() => { expect(actions.uninstall).toHaveBeenCalledWith(ITEM) })
})

it('loads and shows release history and install logs', async () => {
  const { view, store, actions } = fixture({
    status: 'ready',
    user: USER,
    items: [ITEM],
    versionHistories: {
      legal: [{
        version: '1.2.0', channel: 'stable', releaseNotes: 'Fixed clause comparison.', minDsh: '>=0.2.2-alpha.2', size: 316, createdAt: '2026-11-06T02:45:07Z',
      }],
    },
    logs: {
      legal: [{ jobId: 'job-1', command: 'pnpm add @thaumoctopus/plugin-legal@1.2.0', cwd: '/profile', output: 'Done', exitCode: 0 }],
    },
  })
  fireEvent.click(view.getByRole('button', { name: en.details }))
  await vi.waitFor(() => { expect(actions.select).toHaveBeenCalledWith('legal') })
  store.set({ ...store.getSnapshot(), selectedPluginId: 'legal' })
  await vi.waitFor(() => { expect(view.getByText(en.releaseHistory)).toBeTruthy() })
  expect(view.getByText('Fixed clause comparison.')).toBeTruthy()
  expect(view.getByText('pnpm add @thaumoctopus/plugin-legal@1.2.0')).toBeTruthy()
  expect(view.getByText('Done')).toBeTruthy()
})
