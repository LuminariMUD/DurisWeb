import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import PrivacyControls from '../PrivacyControls.vue'

const state = {
  phase: ref('unknown'),
  server: ref({ choicesAvailable: true, decision: 'unknown' }),
  error: ref(''),
  busy: ref(0),
  pendingDecision: ref<string | null>(null),
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
  state.pendingDecision.value = null
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
    state.pendingDecision.value = 'accepted'
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
  it('keeps a pending refusal labelled as refusal and unavailable for a second action', () => {
    state.phase.value = 'saving'
    state.busy.value = 1
    state.pendingDecision.value = 'refused'
    state.canAccept.value = false
    state.canRefuse.value = false
    wrapper = mount(PrivacyControls)
    const refusal = wrapper.findAll('button')[1]!
    expect(refusal.text()).toBe('Refuse visit statistics')
    expect(refusal.attributes('disabled')).toBeDefined()
  })
  it('keeps the compact confirmation mounted and focuses it after its own completed choice', async () => {
    wrapper = mount(PrivacyControls, { props: { compact: true }, attachTo: document.body })
    const refusal = wrapper.findAll('button')[1]!
    refusal.element.focus()
    await refusal.trigger('click')
    state.phase.value = 'refused'
    state.server.value = { choicesAvailable: true, decision: 'refused' }
    await nextTick()
    await nextTick()
    expect(wrapper.find('section').exists()).toBe(true)
    expect(wrapper.get('[role="status"]').text()).toContain('Your refusal is saved')
    expect(document.activeElement).toBe(wrapper.get('[role="status"]').element)
    const control = wrapper.findAll('button')[0]!
    control.element.focus()
    state.phase.value = 'loading'
    await nextTick()
    state.phase.value = 'refused'
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(control.element)
  })
  it('does not move confirmation focus away from another control the user selected', async () => {
    wrapper = mount(PrivacyControls, { props: { compact: true }, attachTo: document.body })
    await wrapper.findAll('button')[1]!.trigger('click')
    const other = document.createElement('button')
    document.body.append(other)
    try {
      other.focus()
      state.phase.value = 'refused'
      state.server.value = { choicesAvailable: true, decision: 'refused' }
      await nextTick()
      await nextTick()
      expect(document.activeElement).toBe(other)
      expect(wrapper.get('[role="status"]').text()).toContain('Your refusal is saved')
    } finally {
      other.remove()
    }
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
