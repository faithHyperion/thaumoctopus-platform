/**
 * Workbench slot contract: the holes the tile-grid page declares. The page
 * owns the heading, the grid geometry, and which tile is open; a tile
 * registrant contributes one grid cell glyph and the body that cell opens.
 *
 * The split mirrors the shell's `sidebar.panellist` / `main` pair: a list
 * slot carries the ordered, labelled entries, and a keyed slot carries each
 * entry's content, addressed by the same id.
 */
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { CatalogItem } from '../control-plane.ts'
import type { WorkbenchCatalogState } from '../catalog-controller.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One workbench grid cell glyph. Each list id addresses the matching
     * `workbench.tile.body` entry; the page owns the button, the label, and
     * the selected state around the glyph.
     */
    'workbench.tile': { kind: 'list'; scope: 'root'; owner: WorkbenchTileIconOwnerProps }
    /**
     * The panel one tile opens, keyed by that tile's list id. The page
     * renders it in place of the grid while the tile is open.
     */
    'workbench.tile.body': { kind: 'keyed'; scope: 'session-maybe'; owner: WorkbenchTileBodyOwnerProps }
  }
}

/** Glyph presentation supplied by the grid cell. */
export interface WorkbenchTileIconOwnerProps {
  /** Requested square edge in pixels. */
  size: number
}

/** Callbacks supplied to an open tile's body. */
export interface WorkbenchTileBodyOwnerProps {
  /** Return to the tile grid. */
  onClose: () => void
}

/** Serializable metadata for one live workbench tile list registration. */
export interface WorkbenchTileMetadata {
  /** List id and matching tile-body key. */
  id: string
  /** Grid display order. */
  order: number
  /** Display label resolved at read time so it follows the active locale. */
  label: string
}

/** Registrant hooks bound for the workbench page. */
export interface WorkbenchPageInjected {
  hooks: {
    /** Live grid entries in display order. */
    tiles: HostObservable<readonly WorkbenchTileMetadata[]>
    /** Live Control Plane catalog state. */
    catalog: HostObservable<WorkbenchCatalogState>
  }
  /** Sign in to the Control Plane and load its catalog. */
  login: (email: string, password: string) => Promise<void>
  /** Revoke the current Control Plane session. */
  logout: () => Promise<void>
  /** Reload the catalog for the current session. */
  refresh: () => Promise<void>
  /** Request an install grant and ask the Plugin Manager to install the exact version. */
  install: (item: CatalogItem) => Promise<void>
  /** Request grants for the installed and target versions, then update the bundle. */
  update: (item: CatalogItem) => Promise<void>
  /** Re-run the controlled host restart after an automatic attempt failed. */
  confirmRestart: (item: CatalogItem) => Promise<void>
  /** Enable or disable an installed bundle. */
  setEnabled: (item: CatalogItem, enabled: boolean) => Promise<void>
  /** Remove an installed bundle. */
  uninstall: (item: CatalogItem) => Promise<void>
  /** Select a catalog entry and lazily load its published version history. */
  select: (pluginId: string | undefined) => Promise<void>
}

/** Complete props of the workbench page component. */
export type WorkbenchPageComponentProps = PropsLocale<'workbench'>
  & PropsRenderSlots<'workbench.tile' | 'workbench.tile.body'>
  & InjectFace<WorkbenchPageInjected>
