import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MudActivityLog from '../MudActivityLog.vue'
import { useMudStore } from '../../../stores/mudStore.js'
import { outputPresentationLines } from '../../../utils/outputPresentation.js'
import fixtures from './fixtures/output-presentation-v1.json'

vi.mock('@/composables/useMudChatNotifications', () => ({ useMudChatNotifications: vi.fn() }))
vi.mock('@/composables/useFontSettings', () => ({ useFontSettings: vi.fn() }))

it('keeps links in live and split history, dispatches once, and safely renders invalid fallback', async () => {
  setActivePinia(createPinia())
  const store = useMudStore()
  const packet = fixtures[0]!
  const snapshot = outputPresentationLines(packet.presentation, packet.data!)![1]!
  store.addLogEntry('info', packet.data!.split('\r\n')[1]!, undefined, snapshot, true)
  store.addLogEntry(
    'info',
    'literal &name=two &lt;literal&gt; &copy=two &amp; &n &+R <script>text</script>',
    undefined,
    { version: 2 },
    true,
  )
  const wrapper = mount(MudActivityLog, {
    props: { showControls: false },
    global: {
      stubs: {
        AliasManager: true,
        TriggerManager: true,
        TimerManager: true,
        SettingsDialog: true,
        GroupManager: true,
        ActionHotbar: true,
        ResizablePanelGroup: { template: '<div><slot /></div>' },
        ResizablePanel: { template: '<div><slot /></div>' },
        ResizableHandle: true,
      },
    },
  })
  const literalText =
    'literal &name=two &lt;literal&gt; &copy=two &amp; &n &+R <script>text</script>'
  expect(wrapper.text()).toContain(literalText)
  expect(wrapper.find('script').exists()).toBe(false)
  await wrapper.get('button[title="help weather"]').trigger('click')
  expect(wrapper.emitted('command')).toEqual([['help weather']])
  await wrapper.get('.overflow-y-auto').trigger('wheel', { deltaY: -100 })
  await flushPromises()
  expect(wrapper.findAll('button[title="help weather"]')).toHaveLength(2)
  expect(wrapper.findAll('a[target="_blank"]')).toHaveLength(2)
  expect(wrapper.text().split(literalText)).toHaveLength(3)
  await wrapper.findAll('button[title="help weather"]')[0]!.trigger('click')
  expect(wrapper.emitted('command')).toHaveLength(2)
  wrapper.unmount()
})
