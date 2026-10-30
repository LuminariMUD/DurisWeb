import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useMudStore } from '../../stores/mudStore.js'
import { usePlayMap, type PlayMapContext } from '../usePlayMap.js'
import { parseRoomInfo } from '../../utils/playMap.js'
import MudMap from '../../components/mud/MudMap.vue'

const { sendGameCommand } = vi.hoisted(() => ({ sendGameCommand: vi.fn(() => true) }))
vi.mock('../useMudConnection.js', () => ({ useMudConnection: () => ({ sendGameCommand }) }))
vi.mock('../useAuth.js', () => ({ useAuth: () => ({ accountName: ref(null) }) }))
const pending: Array<{
  url: string
  resolve: (response: unknown) => void
  reject: (error: Error) => void
  signal: AbortSignal
}> = []
let wrapper: VueWrapper | null = null
let context: PlayMapContext
const room = (id: number, zone = 1) =>
  parseRoomInfo({ num: id, zone, name: `Room ${id}`, exits: { e: id + 1 } })!
const graph = (first: number) => ({
  nodes: [first, first + 1, first + 2].map((id) => ({ id, name: `Room ${id}`, sectorType: 0 })),
  edges: [
    { from: first, to: first + 1, direction: 'east' },
    { from: first + 1, to: first + 2, direction: 'up' },
  ],
})
function start(render = false) {
  wrapper = mount(
    defineComponent({
      setup() {
        context = usePlayMap()
        return () => (render ? h(MudMap) : h('div'))
      },
    }),
  )
  return useMudStore()
}
async function respond(index: number, body: unknown, status = 200) {
  pending[index]!.resolve({ ok: status === 200, status, json: async () => body })
  await flushPromises()
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(360)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240)
  setActivePinia(createPinia())
  pending.length = 0
  vi.clearAllMocks()
  vi.stubGlobal('BroadcastChannel', undefined)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, options: { signal: AbortSignal }) =>
        new Promise((resolve, reject) =>
          pending.push({ url, resolve, reject, signal: options.signal }),
        ),
    ),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('one map controller per play session', () => {
  it('keeps quest cache on reconnect but separates its display and cache by character', () => {
    const store = start()
    store.setAccount('CacheFixture', [])
    store.setCharacter({
      name: 'First',
      level: 1,
      class: 'Warrior',
      race: 'Human',
      alignment: 'good',
      guild: '',
      title: '',
    })
    store.setQuestMap('first map', 1)
    store.retireMap()
    expect(store.questMap).toBeNull()
    expect(store.loadCachedQuestMap(1)).toBe(true)
    store.setCharacter({
      name: 'Second',
      level: 1,
      class: 'Warrior',
      race: 'Human',
      alignment: 'good',
      guild: '',
      title: '',
    })
    expect(store.questMap).toBeNull()
    expect(store.loadCachedQuestMap(1)).toBe(false)
    store.setRoom(room(10))
    store.openReturnDialog('rent')
    expect(store.room).toBeNull()
    expect(store.visitedRooms.size).toBe(0)
  })
  it('rejects late success and failure across A/B/A, wilderness and logout', async () => {
    const store = start()
    store.setRoom(room(10, 1))
    store.setRoom(room(20, 2))
    expect(pending).toHaveLength(2)
    expect(pending[0]!.signal.aborted).toBe(true)
    await respond(1, graph(20))
    await respond(0, graph(10))
    expect(context.snapshot.value.graph?.nodes[0]?.id).toBe(20)
    store.setRoom(room(10, 1))
    const wild = parseRoomInfo({ num: 0, zone: 600, name: 'Sea', exits: { n: true } })!
    store.setWildernessMap('&+B~')
    store.setRoom(wild)
    pending[2]!.reject(new Error('late failure'))
    await flushPromises()
    expect(context.snapshot.value.graph).toBeNull()
    expect(context.snapshot.value.error).toBeNull()
    expect(context.snapshot.value.wildernessMap).toBe('&+B~')
    store.setRoom(room(10))
    store.clearAccount()
    await respond(3, graph(10))
    expect(context.snapshot.value.room).toBeNull()
    expect(context.snapshot.value.graph).toBeNull()
    expect(store.wildernessMap).toBeNull()
  })
  it('times out and refuses malformed or access-denied maps; reload retries without showing stale data', async () => {
    vi.useFakeTimers()
    const store = start()
    store.setRoom(room(10))
    await vi.advanceTimersByTimeAsync(15001)
    expect(pending[0]!.signal.aborted).toBe(true)
    pending[0]!.reject(new Error('abort'))
    await flushPromises()
    expect(context.snapshot.value.error).toContain('timed out')
    context.action('reload')
    await respond(1, { nodes: [true], edges: [] })
    expect(context.snapshot.value.error).toContain('Invalid')
    context.action('reload')
    await respond(2, {}, 401)
    expect(context.snapshot.value.error).toContain('login')
    expect(context.snapshot.value.graph).toBeNull()
    context.action('reload')
    await respond(3, graph(10))
    expect(context.snapshot.value.error).toBeNull()
  })
  it('pause freezes accepted position and map; resume catches up and refetches', async () => {
    const store = start()
    store.setRoom(room(10))
    await respond(0, graph(10))
    context.action('pause')
    store.setRoom(room(11))
    expect(context.snapshot.value.room?.vnum).toBe(10)
    context.action('resume')
    await respond(1, graph(10))
    expect(context.snapshot.value.room?.vnum).toBe(11)
  })
  it('rechecks website access on focus while paused without accepting live position updates', async () => {
    const store = start()
    store.setRoom(room(10))
    await respond(0, graph(10))
    context.action('pause')
    store.setRoom(room(11))
    window.dispatchEvent(new Event('focus'))
    expect(pending).toHaveLength(2)
    expect(context.snapshot.value.graph).toBeNull()
    await respond(1, {}, 401)
    expect(context.snapshot.value.paused).toBe(true)
    expect(context.snapshot.value.room?.vnum).toBe(10)
    expect(context.snapshot.value.error).toContain('login')
    window.dispatchEvent(new Event('focus'))
    await respond(2, graph(10))
    expect(context.snapshot.value.graph?.nodes[0]?.id).toBe(10)
    expect(context.snapshot.value.room?.vnum).toBe(10)
    expect(context.snapshot.value.paused).toBe(true)
  })
  it('keeps keyboard inspection separate from opt-in pointer walking', async () => {
    const store = start(true)
    store.setConnectionState('in_game')
    store.setRoom(room(10))
    await respond(0, graph(10))
    context.preferences.value.clickToWalk = true
    const target = wrapper!.get('[aria-label="Inspect #11 Room 11"]')
    await target.trigger('keydown', { key: 'Enter' })
    await target.trigger('keydown', { key: ' ' })
    expect(context.preferences.value.selectedId).toBe(11)
    expect(sendGameCommand).not.toHaveBeenCalled()
    await target.trigger('click')
    expect(sendGameCommand).toHaveBeenCalledWith('east', 'map')
  })
  it('survives renderer changes, gates combat/copyover and sends movements from one owner', async () => {
    const store = start(true)
    store.setConnectionState('in_game')
    store.setRoom(room(10))
    await respond(0, graph(10))
    context.action('walk', 11)
    context.action('walk', 12)
    expect(sendGameCommand.mock.calls).toEqual([['east', 'map']])
    store.updateVitals({ fighting: 'orc' })
    await flushPromises()
    store.setRoom(room(11))
    await flushPromises()
    expect(sendGameCommand).toHaveBeenCalledTimes(1)
    store.setCopyoverInProgress(true)
    await nextTick()
    expect(context.snapshot.value.room).toBeNull()
  })
  it('renders inspection without movement, switches levels, and preserves zoom for wilderness in standalone mode', async () => {
    const store = start(true)
    store.setConnectionState('in_game')
    store.setRoom(room(10))
    await respond(0, graph(10))
    expect(wrapper!.findAll('[role="button"]')).toHaveLength(2)
    await wrapper!.get('[aria-label="Inspect #11 Room 11"]').trigger('click')
    expect(sendGameCommand).not.toHaveBeenCalled()
    expect(wrapper!.text()).toContain('Inspect room: #11')
    store.setRoom(room(12))
    await nextTick()
    expect(wrapper!.findAll('[role="button"]')).toHaveLength(1)
    const snapshot = {
      ...context.snapshot.value,
      wildernessMap: '&=bB &+g.',
      room: parseRoomInfo({ num: 0, zone: 600, name: 'Wild', exits: { n: true } }),
    }
    const standalone = mount(MudMap, { props: { standalone: true, snapshot } })
    const before = standalone.get('pre').attributes('style')
    await standalone.get('[aria-label="Zoom in"]').trigger('click')
    expect(standalone.get('pre').attributes('style')).not.toBe(before)
    standalone.unmount()
  })
})
