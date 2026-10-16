import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ChangelogBanner from '../ChangelogBanner.vue'

const accountName = ref('Fixture')
const unreadData = ref({ count: 3 })
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: ref(true), accountName }),
}))
vi.mock('@/services/api', () => ({ changelogApi: {} }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@tanstack/vue-query', () => ({
  useQuery: () => ({ data: unreadData }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  accountName.value = 'Fixture'
  unreadData.value = { count: 3 }
})
function renderBanner() {
  const wrapper = mount(ChangelogBanner)
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('changelog dismissal when storage is unavailable', () => {
  it('renders unread updates even if the stored dismissal cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    const wrapper = renderBanner()
    expect(wrapper.text()).toContain('3 new updates available')
  })

  it('dismisses for the current page even if saving is denied', async () => {
    const wrapper = renderBanner()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'QuotaExceededError')
    })
    await wrapper.get('button:last-child').trigger('click')
    await nextTick()
    expect(wrapper.text()).toBe('')
  })

  it('preserves an ordinary saved dismissal', () => {
    localStorage.setItem('changelog_banner_dismissed_fixture', String(Date.now()))
    expect(renderBanner().text()).toBe('')
  })

  it('does not carry a dismissal to another account when its preference cannot be read', async () => {
    localStorage.setItem('changelog_banner_dismissed_fixture', String(Date.now()))
    const wrapper = renderBanner()
    expect(wrapper.text()).toBe('')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    accountName.value = 'Second'
    await nextTick()
    expect(wrapper.text()).toContain('3 new updates available')
  })

  it('shows new updates even if clearing a saved dismissal is denied', async () => {
    localStorage.setItem('changelog_banner_dismissed_fixture', String(Date.now()))
    const wrapper = renderBanner()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    unreadData.value = { count: 4 }
    await nextTick()
    expect(wrapper.text()).toContain('4 new updates available')
  })
})
