import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useMudStore } from '@/stores/mudStore'
import { buildMudCloseDiagnostic } from '@/utils/mudCloseDiagnostics'
import MudReconnectDialog from '../MudReconnectDialog.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/composables/useMudConnection', () => ({
  useMudConnection: () => ({ connect: vi.fn() }),
}))
vi.mock('@/components/ui/alert-dialog', () => {
  const pass = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  })
  return {
    AlertDialog: pass,
    AlertDialogAction: pass,
    AlertDialogCancel: pass,
    AlertDialogContent: pass,
    AlertDialogDescription: pass,
    AlertDialogFooter: pass,
    AlertDialogHeader: pass,
    AlertDialogTitle: pass,
  }
})

const abrupt = () =>
  buildMudCloseDiagnostic({
    code: 1006,
    reason: '',
    wasClean: false,
    state: 'in_game',
    now: Date.parse('2026-11-12T18:10:07Z'),
    openedAt: null,
    lastSentAt: null,
    lastReceivedAt: null,
    hiddenSince: null,
    online: true,
  })

describe('MudReconnectDialog', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('explains an abrupt close and copies the bounded summary', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const store = useMudStore()
    store.setCloseDiagnostic(abrupt())
    const wrapper = mount(MudReconnectDialog)

    expect(wrapper.text()).toContain('The cause is unknown')
    const summary = wrapper.get('[data-testid="close-diagnostic"]').text()
    expect(summary).toContain('code=1006 clean=false category=abnormal')

    await wrapper.get('button[type="button"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(summary)
    expect(wrapper.text()).toContain('Copied')
    vi.unstubAllGlobals()
  })

  it('keeps a server refusal as the main message', () => {
    const store = useMudStore()
    store.setConnectionState('disconnected', 'Reconnect at 18:00 UTC.')
    store.setCloseDiagnostic(abrupt())
    const wrapper = mount(MudReconnectDialog)

    expect(wrapper.text()).toContain('Reconnect at 18:00 UTC.')
    expect(wrapper.text()).not.toContain('The cause is unknown')
  })

  it('shows the generic message without a recorded close and clears on reset', () => {
    const store = useMudStore()
    store.setCloseDiagnostic(abrupt())
    store.reset()
    const wrapper = mount(MudReconnectDialog)

    expect(wrapper.text()).toContain('You have been disconnected from the server.')
    expect(wrapper.find('[data-testid="close-diagnostic"]').exists()).toBe(false)
  })
})
