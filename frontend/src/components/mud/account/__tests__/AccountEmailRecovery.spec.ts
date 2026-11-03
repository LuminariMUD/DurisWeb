import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useMudStore } from '@/stores/mudStore'

const { changeEmail, confirmEmail, requestReset, completeReset } = vi.hoisted(() => ({
  changeEmail: vi.fn(),
  confirmEmail: vi.fn(),
  requestReset: vi.fn(),
  completeReset: vi.fn(),
}))
vi.mock('@/composables/useMudConnection', () => ({
  useMudConnection: () => ({ changeEmail, confirmEmail, requestReset, completeReset }),
}))
import ChangeEmailForm from '../ChangeEmailForm.vue'
import RecoverPasswordForm from '../RecoverPasswordForm.vue'

describe('account inbox and recovery forms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps email pending through delays and failures until the server confirms it', async () => {
    vi.useFakeTimers()
    const store = useMudStore()
    const wrapper = mount(ChangeEmailForm)
    await wrapper.get('#new-email').setValue('replacement@example.test')
    await wrapper.findAll('form')[0]!.trigger('submit')
    expect(changeEmail).toHaveBeenCalledWith('replacement@example.test')
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.text()).not.toContain('Email verified and saved.')
    store.emailVerificationState = 'requested'
    store.accountError = 'Email could not be saved; retry with the same code'
    await nextTick()
    expect(wrapper.text()).toContain('Email could not be saved')
    await wrapper.get('#email-code').setValue('inbox-code')
    await wrapper.findAll('form')[1]!.trigger('submit')
    expect(confirmEmail).toHaveBeenCalledWith('inbox-code')
    expect(wrapper.get<HTMLInputElement>('#email-code').element.value).toBe('')
    store.emailVerificationState = 'verified'
    await nextTick()
    expect(wrapper.text()).toContain('Email verified and saved.')
    wrapper.unmount()
  })

  it('requires matching passwords, clears submitted secrets, and waits for durable completion', async () => {
    const store = useMudStore()
    const wrapper = mount(RecoverPasswordForm)
    await wrapper.get('#recovery-account').setValue('Returning')
    await wrapper.findAll('form')[0]!.trigger('submit')
    expect(requestReset).toHaveBeenCalledWith('Returning')
    store.recoveryState = 'requested'
    await nextTick()
    await wrapper.get('#recovery-code').setValue('inbox-code')
    await wrapper.get('#recovery-password').setValue('new-password')
    await wrapper.get('#recovery-confirmation').setValue('different-password')
    await wrapper.findAll('form')[1]!.trigger('submit')
    expect(completeReset).not.toHaveBeenCalled()
    await wrapper.get('#recovery-confirmation').setValue('new-password')
    await wrapper.findAll('form')[1]!.trigger('submit')
    expect(completeReset).toHaveBeenCalledWith('Returning', 'inbox-code', 'new-password')
    expect(wrapper.get<HTMLInputElement>('#recovery-password').element.value).toBe('')
    expect(wrapper.text()).not.toContain('Your password has been saved.')
    store.recoveryState = 'completed'
    await nextTick()
    expect(wrapper.text()).toContain('Your password has been saved.')
    wrapper.unmount()
  })
})
