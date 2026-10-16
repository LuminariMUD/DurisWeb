import { beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(() => {
  route.path = '/'
  vi.clearAllMocks()
})

describe('BottomNavbar discoverability', () => {
  it('exposes privacy choices to an anonymous visitor through More', async () => {
    route.path = '/privacy'
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
    const privacy = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Privacy & choices')
    expect(privacy?.attributes('aria-current')).toBe('page')
    await privacy?.trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/privacy')
    wrapper.unmount()
  })
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

  it('opens the Project Site from the More menu in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
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

    const projectSiteButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Project Site')
    expect(projectSiteButton).toBeDefined()
    await projectSiteButton?.trigger('click')

    expect(openSpy).toHaveBeenCalledWith(
      'https://luminarimud.github.io/Duris/',
      '_blank',
      'noopener,noreferrer',
    )
    expect(router.push).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('opens Mudlet GUI beside Guide as an internal destination and preserves Play', async () => {
    route.path = '/mudlet-gui'
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
    const buttons = wrapper.findAll('button')
    const guideIndex = buttons.findIndex((button) => button.text() === 'Guide')
    const mudletButton = buttons[guideIndex + 1]
    expect(mudletButton?.text()).toBe('Mudlet GUI')
    expect(mudletButton?.attributes('aria-current')).toBe('page')
    await mudletButton?.trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/mudlet-gui')
    const play = buttons.find((button) => button.text() === 'Play')
    expect(play).toBeDefined()
    await play?.trigger('click')
    expect(router.push).toHaveBeenLastCalledWith('/play')
    wrapper.unmount()
  })
})
