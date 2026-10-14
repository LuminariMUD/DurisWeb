import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const login = vi.fn<(username: string, password: string) => Promise<boolean>>()
const isLoading = ref(false)
const error = ref<string | null>(null)
const routerPush = vi.fn()
const currentRoute = ref({ query: {} as { redirect?: string } })

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ login, isLoading, error }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush, currentRoute }),
}))
vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))

import LoginView from '../LoginView.vue'

describe('login form', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    vi.resetAllMocks()
    isLoading.value = false
    error.value = null
    currentRoute.value = { query: {} }
    wrapper = mount(LoginView, { attachTo: document.body })
  })

  afterEach(() => {
    wrapper.unmount()
  })

  async function enterCredentials() {
    await wrapper.get('input[name="username"]').setValue('ExampleAccount')
    await wrapper.get('input[name="password"]').setValue('example-password')
  }

  it('associates both autofill fields and the submit button with one form', () => {
    const form = wrapper.get('form').element
    const username = wrapper.get<HTMLInputElement>('input[autocomplete="username"]')
    const password = wrapper.get<HTMLInputElement>('input[autocomplete="current-password"]')
    const submit = wrapper.get<HTMLButtonElement>('button[type="submit"]')

    expect(username.element.form).toBe(form)
    expect(password.element.form).toBe(form)
    expect(submit.element.form).toBe(form)
  })

  it('validates empty credentials without sending a request or navigating', async () => {
    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('Please enter both username and password')
    expect(login).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it.each(['button', 'form'] as const)('logs in once through %s submission', async (source) => {
    login.mockResolvedValue(true)
    await enterCredentials()

    if (source === 'button') {
      await wrapper.get('button[type="submit"]').trigger('click')
    } else {
      await wrapper.get('form').trigger('submit')
    }
    await flushPromises()

    expect(login).toHaveBeenCalledExactlyOnceWith('ExampleAccount', 'example-password')
    expect(routerPush).toHaveBeenCalledExactlyOnceWith('/forum')
  })

  it('keeps the requested destination after a successful login', async () => {
    currentRoute.value.query.redirect = '/forum?category=2'
    login.mockResolvedValue(true)
    await enterCredentials()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(routerPush).toHaveBeenCalledExactlyOnceWith('/forum?category=2')
  })

  it('ignores repeated submissions while authentication is pending', async () => {
    let finishLogin: (success: boolean) => void = () => undefined
    login.mockImplementation(() => {
      isLoading.value = true
      return new Promise<boolean>((resolve) => {
        finishLogin = resolve
      })
    })
    await enterCredentials()
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(login).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Logging in...')

    finishLogin(false)
    await flushPromises()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('shows authentication errors and allows a later successful submission', async () => {
    login.mockImplementationOnce(async () => {
      error.value = 'Invalid username or password'
      return false
    })
    await enterCredentials()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Invalid username or password')
    expect(routerPush).not.toHaveBeenCalled()

    login.mockResolvedValueOnce(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenCalledTimes(2)
    expect(routerPush).toHaveBeenCalledExactlyOnceWith('/forum')
  })

  it('returns home without submitting the filled form', async () => {
    await enterCredentials()
    await wrapper.get('button[type="button"]').trigger('click')
    await flushPromises()

    expect(routerPush).toHaveBeenCalledExactlyOnceWith('/')
    expect(login).not.toHaveBeenCalled()
  })
})
