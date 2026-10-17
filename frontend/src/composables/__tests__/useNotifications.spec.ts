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
  it('enables notifications on the first explicit permission grant when storage is blocked', async () => {
    const delivered = vi.fn()
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'default'
        static requestPermission = permission
        constructor(title: string, options: NotificationOptions) {
          delivered(title, options)
        }
      },
    )
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    const state = setupNotifications()
    expect(state.isEnabled.value).toBe(false)
    await expect(state.requestPermission()).resolves.toBe('granted')
    expect(state.isEnabled.value).toBe(true)
    expect(
      state.showNotification({ title: 'First grant', body: 'Delivered', sound: false }),
    ).not.toBeNull()
    expect(delivered).toHaveBeenCalledOnce()
  })

  it.each(['denied', 'default'] as const)(
    'does not enable an unreadable preference after a %s result',
    async (result) => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError')
      })
      permission.mockResolvedValueOnce(result)
      const state = setupNotifications()
      await expect(state.requestPermission()).resolves.toBe(result)
      expect(state.hasPermission.value).toBe(false)
      expect(state.isEnabled.value).toBe(false)
    },
  )

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
