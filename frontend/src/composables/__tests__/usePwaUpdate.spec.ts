import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { usePwaUpdate } from '../usePwaUpdate'

vi.mock('virtual:pwa-register/vue', () => ({ useRegisterSW: vi.fn() }))

const registration = {
  offlineReady: ref(false),
  needRefresh: ref(false),
  updateServiceWorker: vi.fn(async () => {}),
}
let state: ReturnType<typeof usePwaUpdate>
let wrapper: ReturnType<typeof mount>

beforeEach(() => {
  vi.clearAllMocks()
  registration.offlineReady.value = false
  registration.needRefresh.value = false
  vi.mocked(useRegisterSW).mockReturnValue(registration)
  wrapper = mount(
    defineComponent({
      setup() {
        state = usePwaUpdate()
        return () => h('p', state.needRefresh.value ? 'Update available' : 'Current version')
      },
    }),
  )
})
afterEach(() => wrapper.unmount())

describe('service-worker update controls', () => {
  it('shows updates discovered after mounting and dismisses the displayed registration state', async () => {
    registration.needRefresh.value = true
    await nextTick()
    expect(wrapper.text()).toBe('Update available')
    state.dismissUpdate()
    await nextTick()
    expect(wrapper.text()).toBe('Current version')
    expect(registration.needRefresh.value).toBe(false)
  })

  it('activates the waiting update through the registration helper', async () => {
    await state.updateApp()
    expect(registration.updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('keeps offline readiness reactive after installation finishes', async () => {
    registration.offlineReady.value = true
    await nextTick()
    expect(state.offlineReady.value).toBe(true)
  })
})
