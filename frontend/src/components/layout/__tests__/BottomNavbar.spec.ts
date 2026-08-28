import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const route = { path: '/' }
const router = { push: vi.fn() }

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => router,
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: ref(false),
    accountName: ref(null),
  }),
}))

const passthrough = {
  template: '<div><slot /></div>',
}

import BottomNavbar from '../BottomNavbar.vue'

describe('BottomNavbar News discoverability', () => {
  it('exposes News & Updates in the More menu with named navigation', () => {
    const wrapper = mount(BottomNavbar, {
      global: {
        stubs: {
          Sheet: passthrough,
          SheetContent: passthrough,
          SheetHeader: passthrough,
          SheetTitle: passthrough,
          SheetTrigger: passthrough,
        },
      },
    })

    expect(wrapper.text()).toContain('News & Updates')
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Primary navigation')
  })
})
