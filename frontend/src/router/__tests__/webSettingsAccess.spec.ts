import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const isAuthenticated = ref(true)
const isOverlord = ref(false)
const permissions = ref({ immortalLevel: 0 })
const hasPermission = vi.fn()
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ isAuthenticated, isOverlord, permissions, hasPermission, loadUser: vi.fn() }),
}))
vi.mock('@/services/api', () => ({ profileApi: {}, wikiApi: {} }))
const { default: router } = await import('../index')
// Exercise the real navigation guards without mounting unrelated route views.
for (const route of router.getRoutes()) {
  if (route.components) route.components.default = { template: '<div />' }
}

beforeEach(async () => {
  await router.push('/')
  isAuthenticated.value = true
  isOverlord.value = false
  permissions.value.immortalLevel = 0
  hasPermission.mockReset().mockImplementation((key) => key === 'manage_front_page')
})

describe('Web Settings navigation authorization', () => {
  it.each([0, 57, 60])('admits a delegated manager at immortal level %s', async (level) => {
    permissions.value.immortalLevel = level
    await router.push('/admin/web-settings')
    expect(router.currentRoute.value.name).toBe('admin-web-settings')
  })

  it('rejects a signed-in user without the permission', async () => {
    permissions.value.immortalLevel = 60
    hasPermission.mockReturnValue(false)
    await router.push('/admin/web-settings')
    expect(router.currentRoute.value.name).toBe('forbidden')
  })

  it('sends an anonymous visitor to login', async () => {
    isAuthenticated.value = false
    await router.push('/admin/web-settings')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/admin/web-settings')
  })

  it('retains the restrictions on unrelated admin routes', async () => {
    await router.push('/admin/users')
    expect(router.currentRoute.value.name).toBe('forbidden')
  })
})
