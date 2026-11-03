// @vitest-environment jsdom
/** The workbench page renders the tile grid, opens one tile, and falls back safely. */
import type { ComponentProps, ReactNode } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WorkbenchPage } from '../src/client/WorkbenchPage.tsx'
import type { WorkbenchPageComponentProps } from '../src/client/contract/slots.ts'
import { WorkbenchIcon } from '../src/client/WorkbenchIcon.tsx'
import { en } from '../src/client/locales.ts'
import type { WorkbenchTileBodyOwnerProps, WorkbenchTileMetadata } from '../src/client/contract/slots.ts'

afterEach(() => {
  cleanup()
  calls.length = 0
})

/** Recorded dispatches of both tile slots for call assertions. */
const calls: { name: string; owner: object; options: object }[] = []

/** Typed render stub: glyphs carry the filtered id, bodies carry the close action. */
function renderSlot(name: string, owner: unknown, options: unknown): ReactNode {
  calls.push({ name, owner: owner as object, options: options as object })
  if (name === 'workbench.tile') {
    return <svg data-glyph={(options as { only?: string }).only} />
  }
  return (
    <button type="button" onClick={(owner as WorkbenchTileBodyOwnerProps).onClose}>
      {(options as { entryKey?: string }).entryKey}
    </button>
  )
}

function fixture(tiles: readonly WorkbenchTileMetadata[] = []) {
  const store = createSnapshotStore(tiles)
  const props = {
    t: makeTranslate(en),
    useTiles: bindSnapshotSelector(store),
    renderSlot: renderSlot as WorkbenchPageComponentProps['renderSlot'],
  } as WorkbenchPageComponentProps
  return { props, store }
}

const FIRST: WorkbenchTileMetadata = { id: 'a', order: 1, label: 'First' }
const SECOND: WorkbenchTileMetadata = { id: 'b', order: 2, label: 'Second' }

it('shows the empty hint when no tile is registered', () => {
  const b = fixture()
  const view = render(<WorkbenchPage {...b.props} />)
  expect(view.getByText(en.empty)).toBeTruthy()
  expect(view.getByRole('heading', { name: en.panel })).toBeTruthy()
  expect(calls).toHaveLength(0)
})

it('renders tiles in store order and opens one tile with a way back', () => {
  const b = fixture([FIRST, SECOND])
  const view = render(<WorkbenchPage {...b.props} />)
  const buttons = view.getAllByRole('button')
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['First', 'Second'])
  expect(calls).toContainEqual({ name: 'workbench.tile', owner: { size: 24 }, options: { only: 'a' } })
  fireEvent.click(view.getByRole('button', { name: 'First' }))
  expect(view.container.querySelector('[data-workbench-tile="a"]')).toBeTruthy()
  const bodyCall = calls.find(call => call.name === 'workbench.tile.body')
  expect(bodyCall?.options).toEqual({ entryKey: 'a' })
  expect(typeof (bodyCall?.owner as { onClose: unknown }).onClose).toBe('function')
  fireEvent.click(view.getByRole('button', { name: 'First' }))
  expect(view.container.querySelector('[data-workbench-tile="a"]')).toBeNull()
  expect(view.getByRole('button', { name: 'Second' })).toBeTruthy()
})

it('drops back to the grid when the open tile unloads', () => {
  const b = fixture([FIRST, SECOND])
  const view = render(<WorkbenchPage {...b.props} />)
  fireEvent.click(view.getByRole('button', { name: 'First' }))
  expect(view.getByText('a')).toBeTruthy()
  act(() => { b.store.set([SECOND]) })
  expect(view.queryByText('a')).toBeNull()
  expect(view.getByRole('button', { name: 'Second' })).toBeTruthy()
})

it('renders the sidebar glyph', () => {
  const view = render(<WorkbenchIcon {...({ size: 20 } as ComponentProps<typeof WorkbenchIcon>)} />)
  expect(view.container.querySelector('svg')).toBeTruthy()
})
