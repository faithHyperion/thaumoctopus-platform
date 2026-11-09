/** The workbench plugin contributes the main panel, the sidebar entry, and live tile metadata. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { WorkbenchPageInjected, WorkbenchTileMetadata } from '../src/client/contract/slots.ts'
import { WorkbenchPage } from '../src/client/WorkbenchPage.tsx'
import { WorkbenchIcon } from '../src/client/WorkbenchIcon.tsx'
import { apply as applyHost } from '../src/index.ts'
import { apply, PANEL_ID } from '../src/client/index.ts'

async function fixture() {
  const ctx = new Context()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const pluginManager = {
    installBundle: vi.fn(async () => ({ ok: true, value: { application: 'applied' } })),
    listBundles: vi.fn(async () => ({ ok: true, value: [] })),
    updateBundle: vi.fn(async () => ({ ok: true, value: { from: '1.0.0', to: '1.1.0', result: { application: 'applied' } } })),
  }
  ctx.provide('remote', { pluginManager })
  ctx.provide('remote.pluginManager', pluginManager)
  await ctx.plugin(SlotRegistry)
  ctx.slots.register({ name: 'root', children: {
    'main': { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return ctx
}

function pageFace(value: Record<string, unknown>): asserts value is Record<string, unknown> & WorkbenchPageInjected {
  expect(typeof value.hooks).toBe('object')
}

it('registers the panel and sidebar entry, and projects live ordered tile metadata', async () => {
  const ctx = await fixture()
  try {
    applyHost()
    apply(ctx)
    const main = ctx.slots.entries('main')[0]!
    expect(main.options.key).toBe(PANEL_ID)
    expect(main.component).toBe(WorkbenchPage)
    expect(main.children).toMatchObject({
      'workbench.tile': { kind: 'list', scope: 'root' },
      'workbench.tile.body': { kind: 'keyed', scope: 'session-maybe' },
    })
    const sidebar = ctx.slots.entries('sidebar.panellist')[0]!
    expect(sidebar.options.id).toBe(PANEL_ID)
    expect(sidebar.options.order).toBe(20)
    expect(sidebar.component).toBe(WorkbenchIcon)
    expect(['Workbench', '工作台']).toContain((sidebar.options.label as () => string)())
    const face = main.inject!()
    pageFace(face)
    const tiles = face.hooks.tiles
    expect(tiles.getSnapshot()).toEqual([])

    let label = 'First'
    ctx.slots.register({ name: 'workbench.tile', id: 'second', order: 2, label: 'Second' }, () => null)
    ctx.slots.register({ name: 'workbench.tile', id: 'first', order: 1, label: () => label }, () => null)
    ctx.slots.register({ name: 'workbench.tile', id: 'bare' }, () => null)
    await vi.waitFor(() => { expect(tiles.getSnapshot()).toEqual([
      { id: 'bare', order: 0, label: 'bare' },
      { id: 'first', order: 1, label: 'First' },
      { id: 'second', order: 2, label: 'Second' },
    ] satisfies WorkbenchTileMetadata[]) })

    // A catalog change re-resolves thunked labels without re-registration.
    label = 'Première'
    ctx.locale.register('probe' as never, { en: { greeting: 'hello' }, zh: { greeting: '你好' } })
    await vi.waitFor(() => { expect(tiles.getSnapshot()).toEqual([
      { id: 'bare', order: 0, label: 'bare' },
      { id: 'first', order: 1, label: 'Première' },
      { id: 'second', order: 2, label: 'Second' },
    ] satisfies WorkbenchTileMetadata[]) })

    // An unrelated refresh with identical metadata keeps the snapshot reference.
    const stable = tiles.getSnapshot()
    ctx.locale.register('probe2' as never, { en: { farewell: 'bye' }, zh: { farewell: '再见' } })
    await Promise.resolve()
    expect(tiles.getSnapshot()).toBe(stable)
  } finally { await ctx.fiber.dispose() }
})
