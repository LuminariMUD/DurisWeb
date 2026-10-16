import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import PrivacyControls from '../PrivacyControls.vue'

const state = {
  phase: ref('unknown'),
  server: ref({ choicesAvailable: true, decision: 'unknown' }),
  error: ref(''),
  busy: ref(0),
  storageReadable: ref(true),
  synchronizationReady: ref(true),
  canAccept: ref(true),
  canRefuse: ref(true),
  choose: vi.fn(),
  refresh: vi.fn(),
}
vi.mock('@/services/privacy', () => ({ usePrivacyChoices: () => state }))
vi.mock('vue-router', () => ({
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
}))
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  state.phase.value = 'unknown'
  state.server.value = { choicesAvailable: true, decision: 'unknown' }
  state.error.value = ''
  state.busy.value = 0
  state.canAccept.value = true
  state.canRefuse.value = true
  state.storageReadable.value = true
  state.synchronizationReady.value = true
  vi.clearAllMocks()
})
afterEach(() => wrapper?.unmount())

describe('accessible privacy controls', () => {
  it('offers equally styled explicit choices without a preselected grant', async () => {
    wrapper = mount(PrivacyControls)
    const buttons = wrapper.findAll('button')
    expect(buttons[0].text()).toBe('Allow visit statistics')
    expect(buttons[1].text()).toBe('Refuse visit statistics')
    expect(buttons[0].classes()).toEqual(buttons[1].classes())
    await buttons[1].trigger('click')
    expect(state.choose).toHaveBeenCalledWith('refused')
    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite')
  })
  it('allows withdrawal while acceptance is still in flight', async () => {
    state.phase.value = 'saving'
    state.busy.value = 1
    state.canAccept.value = false
    wrapper = mount(PrivacyControls)
    const buttons = wrapper.findAll('button')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[1].text()).toBe('Withdraw permission')
    expect(buttons[1].attributes('disabled')).toBeUndefined()
    await buttons[1].trigger('click')
    expect(state.choose).toHaveBeenCalledWith('withdrawn')
  })
  it('shows unsaved errors and keeps the full-page controls reachable after refusal', () => {
    state.phase.value = 'unsaved'
    state.error.value = 'Your choice could not be saved.'
    wrapper = mount(PrivacyControls)
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be saved')
  })
  it('hides the compact prompt after a confirmed refusal, while the privacy page retains controls', () => {
    state.phase.value = 'refused'
    state.server.value = { choicesAvailable: true, decision: 'refused' }
    wrapper = mount(PrivacyControls, { props: { compact: true } })
    expect(wrapper.find('section').exists()).toBe(false)
    wrapper.unmount()
    wrapper = mount(PrivacyControls)
    expect(wrapper.find('section').exists()).toBe(true)
  })
})
