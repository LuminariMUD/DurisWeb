import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { Core, CytoscapeOptions } from 'cytoscape'
import cytoscape from 'cytoscape'
import WikiZoneMap from '../WikiZoneMap.vue'
import type { WikiMapRoom } from '@/utils/wikiZoneMapLayout'

vi.mock('cytoscape', async () => {
  const actual = await vi.importActual<{ default: typeof cytoscape }>('cytoscape')
  return {
    default: vi.fn((options: CytoscapeOptions) =>
      actual.default({
        ...options,
        container: undefined,
        headless: true,
        styleEnabled: true,
      }),
    ),
  }
})

const rooms: WikiMapRoom[] = [
  { vnum: 1, name: 'Entrance', sectorType: 0, exits: { up: 2 } },
  { vnum: 2, name: 'Balcony', sectorType: 1, exits: { down: 1, east: 3 } },
  { vnum: 3, name: 'Landing', sectorType: 0, exits: {} },
]
let wrapper: VueWrapper | undefined
let cy: Core
let width = 800
let height = 600
let notifyResize: () => void
const disconnect = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  width = 800
  height = 600
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => height,
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notifyResize = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

async function render() {
  wrapper = mount(WikiZoneMap, { props: { rooms, selectedRoomVnum: 1 } })
  await flushPromises()
  cy = vi.mocked(cytoscape).mock.results.at(-1)!.value
  vi.spyOn(cy, 'width').mockImplementation(() => width)
  vi.spyOn(cy, 'height').mockImplementation(() => height)
  return wrapper
}

async function resize() {
  notifyResize()
  await new Promise((resolve) => window.setTimeout(resolve, 25))
  await flushPromises()
}

describe('zone map interactions', () => {
  it('renders exact exit arrows and identifies vertical connections and selection', async () => {
    const view = await render()
    expect(cy.nodes().length).toBe(3)
    expect(cy.getElementById('edge-1-2').style('source-arrow-shape')).toBe('triangle')
    expect(cy.getElementById('edge-1-2').style('target-arrow-shape')).toBe('triangle')
    expect(cy.getElementById('edge-1-2').style('line-style')).toBe('dashed')
    expect(cy.getElementById('edge-2-3').style('source-arrow-shape')).toBe('none')
    expect(cy.getElementById('edge-2-3').style('target-arrow-shape')).toBe('triangle')
    expect(cy.getElementById('1').hasClass('highlighted')).toBe(true)
    expect(view.find('[aria-label="Find selected room #1"]').text()).toContain('Entrance')
    cy.getElementById('2').emit('tap')
    expect(view.emitted('select-room')).toEqual([[2]])
  })

  it('changes selection and its connections without replacing the user camera', async () => {
    const view = await render()
    cy.viewport({ zoom: 0.7, pan: { x: 31, y: 47 } })
    const camera = { zoom: cy.zoom(), pan: { ...cy.pan() } }
    await view.setProps({ selectedRoomVnum: 3 })
    expect(cy.nodes('.highlighted').map((node) => node.id())).toEqual(['3'])
    expect(cy.edges('.highlighted').map((edge) => edge.id())).toEqual(['edge-2-3'])
    expect({ zoom: cy.zoom(), pan: cy.pan() }).toEqual(camera)
    await view.find('[aria-label="Find selected room #3"]').trigger('click')
    expect(cy.zoom()).toBeGreaterThanOrEqual(1)
    expect(cy.getElementById('3').renderedPosition()).toEqual({ x: width / 2, y: height / 2 })
  })

  it('resizes the renderer while preserving a custom camera and restores it after fullscreen', async () => {
    const view = await render()
    cy.viewport({ zoom: 0.6, pan: { x: 77, y: 88 } })
    const resizeSpy = vi.spyOn(cy, 'resize')
    width = 450
    await resize()
    expect(resizeSpy).toHaveBeenCalled()
    expect(cy.zoom()).toBe(0.6)
    expect(cy.pan()).toEqual({ x: 77, y: 88 })
    await view.find('[aria-label="Fullscreen"]').trigger('click')
    expect(view.find('[aria-label="Exit Fullscreen"]').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(view.find('[aria-label="Fullscreen"]').exists()).toBe(true)
    expect(cy.zoom()).toBe(0.6)
    expect(cy.pan()).toEqual({ x: 77, y: 88 })
  })

  it('refits fitted views after resizing and repacks only on explicit Auto-Layout', async () => {
    const view = await render()
    const fit = vi.spyOn(cy, 'fit')
    const before = cy.nodes().map((node) => ({ id: node.id(), position: { ...node.position() } }))
    width = 400
    await resize()
    expect(fit).toHaveBeenCalled()
    expect(cy.nodes().map((node) => ({ id: node.id(), position: node.position() }))).toEqual(before)
    cy.zoom(0.5)
    await view.find('[aria-label="Fit to View"]').trigger('click')
    const afterFit = fit.mock.calls.length
    await resize()
    expect(fit.mock.calls.length).toBeGreaterThan(afterFit)
    await view.find('[aria-label="Auto-Layout"]').trigger('click')
    expect(cy.nodes().length).toBe(3)
    expect(cy.nodes('.highlighted').map((node) => node.id())).toEqual(['1'])
  })

  it('waits for hidden panels, replaces graph data, and releases its observer and renderer', async () => {
    width = 0
    height = 0
    wrapper = mount(WikiZoneMap, { props: { rooms, selectedRoomVnum: 1 } })
    expect(cytoscape).not.toHaveBeenCalled()
    width = 400
    height = 500
    await resize()
    cy = vi.mocked(cytoscape).mock.results.at(-1)!.value
    const destroy = vi.spyOn(cy, 'destroy')
    await wrapper.setProps({
      rooms: [{ vnum: 4, name: 'New zone', sectorType: 0 }],
      selectedRoomVnum: 4,
    })
    await flushPromises()
    expect(destroy).toHaveBeenCalledOnce()
    const replacement: Core = vi.mocked(cytoscape).mock.results.at(-1)!.value
    expect(replacement.nodes().map((node) => node.id())).toEqual(['4'])
    const destroyReplacement = vi.spyOn(replacement, 'destroy')
    wrapper.unmount()
    wrapper = undefined
    expect(disconnect).toHaveBeenCalledOnce()
    expect(destroyReplacement).toHaveBeenCalledOnce()
  })
})
