import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useNotifications } from '../useNotifications'

vi.mock('@/composables/useSiteConfig', () => ({
  useSiteConfig: () => ({ siteTitle: ref('Fixture') }),
}))
const wrappers: ReturnType<typeof mount>[] = []
const permission = vi.fn(async (): Promise<NotificationPermission> => 'granted')

function setupNotifications() {
  let state!: ReturnType<typeof useNotifications>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          state = useNotifications()
          return () => h('div')
        },
      }),
    ),
  )
  return state
}

beforeEach(() => {
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: permission })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  permission.mockClear()
  localStorage.clear()
})

describe('notification preferences with blocked browser storage', () => {
  it('initializes safely and disables notifications when the saved preference is unreadable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    const state = setupNotifications()
    expect(state.isSupported.value).toBe(true)
    expect(state.isEnabled.value).toBe(false)
    expect(state.showNotification({ title: 'Fixture', body: 'Fixture', sound: false })).toBeNull()
    expect(state.wasPermissionRequested()).toBe(false)
  })

  it('keeps an explicit toggle in memory if saving fails', () => {
    localStorage.setItem('notifications_enabled', 'false')
    const state = setupNotifications()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'QuotaExceededError')
    })
    expect(state.toggleNotifications()).toBe(true)
    expect(state.isEnabled.value).toBe(true)
    expect(localStorage.getItem('notifications_enabled')).toBe('false')
  })

  it('reports the actual browser permission even when recording the prompt fails', async () => {
    const state = setupNotifications()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    await expect(state.requestPermission()).resolves.toBe('granted')
    expect(state.hasPermission.value).toBe(true)
    expect(permission).toHaveBeenCalledOnce()
  })

  it('preserves readable and writable preferences', async () => {
    localStorage.setItem('notifications_enabled', 'false')
    const state = setupNotifications()
    expect(state.isEnabled.value).toBe(false)
    expect(state.toggleNotifications()).toBe(true)
    expect(localStorage.getItem('notifications_enabled')).toBe('true')
    await state.requestPermission()
    expect(state.wasPermissionRequested()).toBe(true)
  })
})
