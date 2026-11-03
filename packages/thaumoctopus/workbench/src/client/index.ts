/**
 * Workbench plugin, browser half: the **工作台** sidebar entry and the
 * tile-grid main panel it opens. The page is a global panel: it belongs to
 * the profile, not to a Session, and the sidebar's entry selects it.
 *
 * The grid holds no tiles of its own — `workbench.tile` contributions supply
 * the cells and `workbench.tile.body` supplies what each cell opens, so a
 * capability package adds a workbench entry by registering into those two
 * slots without touching this plugin.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the sidebar `sidebar.panellist` list the entry registers into,
// and the root `main` keyed slot the page registers into (declared by
// ui-layout with the panel id brand).
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { WorkbenchPageInjected, WorkbenchTileMetadata } from './contract/slots.ts'
import { WorkbenchIcon } from './WorkbenchIcon.tsx'
import { WorkbenchPage } from './WorkbenchPage.tsx'
import { en, zh, type WorkbenchKey } from './locales.ts'

export type {
  WorkbenchPageComponentProps, WorkbenchPageInjected, WorkbenchTileBodyOwnerProps,
  WorkbenchTileIconOwnerProps, WorkbenchTileMetadata,
} from './contract/slots.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workbench panel copy. */
    workbench: WorkbenchKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'workbench'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'workbench' as MainPanelId

/** Services required by the sidebar registration (cordis fiber inject). */
export const inject = ['slots', 'locale']

/**
 * Contribute the Workbench entry to the sidebar with the tile-grid page it
 * opens.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbench: dictionaries')
  const t = ctx.locale.bind(NS)

  // Grid cells arrive as list registrations; the page reads them as metadata
  // (id/order/label) so it can render the button, the label, and the order
  // itself, and dispatches each glyph back through the slot by id.
  const tiles = createSnapshotStore<readonly WorkbenchTileMetadata[]>([])
  const syncTiles = (): void => {
    const next = ctx.slots.entriesOfSlot('workbench.tile').map(({ options }) => {
      // The list registration requires an id; StoredEntry erases the slot kind.
      const id = options.id as string
      return { id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id }
    }).sort((a, b) => a.order - b.order)
    const previous = tiles.getSnapshot()
    if (previous.length === next.length && previous.every((tile, index) => {
      const candidate = next[index] as WorkbenchTileMetadata
      return tile.id === candidate.id && tile.order === candidate.order && tile.label === candidate.label
    })) return
    tiles.set(next)
  }
  ctx.effect(() => ctx.slots.subscribe('workbench.tile', syncTiles), 'ui-workbench: tile entries')
  // Labels are thunks, so a locale switch re-resolves them without re-registration.
  ctx.effect(() => ctx.locale.subscribe(syncTiles), 'ui-workbench: tile labels')

  // The page is a global panel: `main` is keyed by the panel id, and the
  // sidebar's row selects it through ctx.layout.selectPanel(PANEL_ID).
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    children: {
      'workbench.tile': { kind: 'list', scope: 'root' },
      'workbench.tile.body': { kind: 'keyed', scope: 'session-maybe' },
    },
    inject: (): WorkbenchPageInjected => ({ hooks: { tiles } }),
  }, WorkbenchPage))

  // The sidebar entry: order 20 places it beneath Plugins (0) and the
  // schedule/task manager (10).
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    label: () => t('panel'),
    locale: NS,
  }, WorkbenchIcon))

  syncTiles()
}
