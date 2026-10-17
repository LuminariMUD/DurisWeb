import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import AccountDataExport from '../AccountDataExport.vue'

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))
const account = ref<string | null>('Alice')
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ accountName: account }) }))
vi.mock('@/services/accountExport', () => ({ requestAccountExport: requestMock }))
let wrapper: ReturnType<typeof mount>
const createUrl = vi.fn(() => 'blob:synthetic-export')
const revokeUrl = vi.fn()
function render() {
  return mount(AccountDataExport, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
      },
    },
  })
}
beforeEach(() => {
  account.value = 'Alice'
  requestMock.mockReset().mockResolvedValue(new Blob(['{}'], { type: 'application/json' }))
  createUrl.mockClear()
  revokeUrl.mockClear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('account data download control', () => {
  it('explains limited coverage and offers sign-in without asking anonymous visitors for passwords', () => {
    account.value = null
    wrapper = render()
    expect(wrapper.get('a').attributes('href')).toBe('/login')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).toContain('partial copy')
    expect(requestMock).not.toHaveBeenCalled()
  })
  it('clears the password and downloads only after the verified response', async () => {
    wrapper = render()
    await wrapper.get('input').setValue('synthetic-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(requestMock).toHaveBeenCalledWith('synthetic-password', 'Alice', expect.any(AbortSignal))
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    expect(createUrl).toHaveBeenCalledOnce()
    expect(wrapper.get('[role="status"]').text()).toContain('download has started')
    vi.runOnlyPendingTimers()
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-export')
  })
  it('discards a pending result on account change and prevents duplicate submissions', async () => {
    let complete!: (blob: Blob) => void
    requestMock.mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          complete = resolve
        }),
    )
    wrapper = render()
    await wrapper.get('input').setValue('synthetic-password')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(requestMock).toHaveBeenCalledOnce()
    const signal = requestMock.mock.calls[0]![2] as AbortSignal
    account.value = 'Bob'
    await flushPromises()
    expect(signal.aborted).toBe(true)
    complete(new Blob(['private Alice data']))
    await flushPromises()
    expect(createUrl).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('download has started')
  })
  it('shows a failure without claiming a successful download and keeps the password cleared', async () => {
    requestMock.mockRejectedValue(new Error('Your sign-in or password could not be verified.'))
    wrapper = render()
    await wrapper.get('input').setValue('synthetic-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('could not be verified')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    expect(createUrl).not.toHaveBeenCalled()
  })
})
