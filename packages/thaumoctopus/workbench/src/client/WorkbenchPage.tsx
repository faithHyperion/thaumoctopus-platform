/**
 * The Workbench tile-grid page: the main-column panel the sidebar's
 * Workbench entry selects. Pure presentation — the grid is whatever
 * `workbench.tile` registrations exist, and the page owns only the heading,
 * the grid geometry, and which tile is currently open.
 *
 * Opening a tile swaps the grid for that tile's `workbench.tile.body`, and
 * the bar above it carries the tile label as the way back.
 */
import { useEffect, useState } from 'react'
import { IconChevronLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchPageComponentProps } from './contract/slots.ts'
import css from './WorkbenchPage.module.css'

/** Square edge requested of every tile glyph. */
const TILE_GLYPH_SIZE = 24

/**
 * Render the workbench page: the tile grid, or one open tile's body.
 * @param props - composed slot props (the locale, render and hooks shares).
 * @returns the page element tree.
 */
export function WorkbenchPage({ renderSlot, useTiles, t }: WorkbenchPageComponentProps) {
  const tiles = useTiles(snapshot => snapshot)
  const [openId, setOpenId] = useState<string | undefined>(undefined)
  const open = openId === undefined ? undefined : tiles.find(tile => tile.id === openId)
  const close = (): void => { setOpenId(undefined) }
  // A tile can disappear while it is open (its plugin unloads); drop back to
  // the grid rather than rendering an empty body.
  useEffect(() => {
    if (openId !== undefined && !tiles.some(tile => tile.id === openId)) setOpenId(undefined)
  }, [tiles, openId])

  if (open !== undefined) {
    return (
      <div className={css.page}>
        <div className={css.tileBar}>
          <button type="button" className={css.back} onClick={close}>
            <IconChevronLeftOutlineRegular className={css.backGlyph} size={14} />
            <span className={css.backLabel}>{open.label}</span>
          </button>
        </div>
        <div className={css.tileBody} data-workbench-tile={open.id}>
          {renderSlot('workbench.tile.body', { onClose: close }, { entryKey: open.id })}
        </div>
      </div>
    )
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1 className={css.title}>{t('panel')}</h1>
        <p className={css.intro}>{t('intro')}</p>
      </header>
      {tiles.length === 0
        ? <p className={css.empty}>{t('empty')}</p>
        : (
          <div className={css.grid}>
            {tiles.map(tile => (
              <button
                key={tile.id}
                type="button"
                className={css.tile}
                aria-label={tile.label}
                onClick={() => { setOpenId(tile.id) }}
              >
                <span className={css.tileIcon} aria-hidden="true">
                  {renderSlot('workbench.tile', { size: TILE_GLYPH_SIZE }, { only: tile.id })}
                </span>
                <span className={css.tileTitle}>{tile.label}</span>
              </button>
            ))}
          </div>
        )}
    </div>
  )
}
