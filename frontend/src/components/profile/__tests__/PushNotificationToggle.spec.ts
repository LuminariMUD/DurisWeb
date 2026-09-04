import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const isSupported = ref(true)
const isSubscribed = ref(false)
const isInitialized = ref(true)
const isLoading = ref(false)
const isEnabled = ref(true)
const notificationError = ref<string | null>(null)
const toggle = vi.fn<() => Promise<boolean>>()
const success = vi.fn()
const showError = vi.fn()

vi.mock('@/composables/usePushNotification', () => ({
  usePushNotification: () => ({
    isSupported: computed(() => isSupported.value),
    isSubscribed: computed(() => isSubscribed.value),
    isInitialized: computed(() => isInitialized.value),
    isLoading: computed(() => isLoading.value),
    isEnabled: computed(() => isEnabled.value),
    error: computed(() => notificationError.value),
    toggle,
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success, error: showError }),
}))

import PushNotificationToggle from '../PushNotificationToggle.vue'

describe('PushNotificationToggle', () => {
  beforeEach(() => {
    isSupported.value = true
    isSubscribed.value = false
    isInitialized.value = true
    isLoading.value = false
    isEnabled.value = true
    notificationError.value = null
    toggle.mockReset()
    success.mockReset()
    showError.mockReset()
  })

  it('subscribes the current browser and confirms the enabled state', async () => {
    toggle.mockResolvedValue(true)
    const wrapper = mount(PushNotificationToggle)

    await wrapper.get('button').trigger('click')

    expect(toggle).toHaveBeenCalledOnce()
    expect(success).toHaveBeenCalledWith(
      'This browser is now subscribed to background notifications.',
      'Push notifications enabled',
    )
  })

  it('keeps the control disabled when the server is not configured', () => {
    isEnabled.value = false
    const wrapper = mount(PushNotificationToggle)

    expect(wrapper.text()).toContain('Push notifications are not configured on the server.')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('shows the subscription error when the browser update fails', async () => {
    notificationError.value = 'notification permission denied'
    toggle.mockResolvedValue(false)
    const wrapper = mount(PushNotificationToggle)

    await wrapper.get('button').trigger('click')

    expect(showError).toHaveBeenCalledWith('notification permission denied', 'Push notifications')
  })
})
