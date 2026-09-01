import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const { loginMock, registerMock, storeCredentialsMock, getCredentialsMock, mudStore } = vi.hoisted(
  () => ({
    loginMock: vi.fn().mockResolvedValue(true),
    registerMock: vi.fn().mockResolvedValue(true),
    storeCredentialsMock: vi.fn(),
    getCredentialsMock: vi.fn(() => null),
    mudStore: {
      connectionState: 'connected',
      connectionError: null,
      isAuthenticated: false,
      autoLoginInProgress: false,
      showReconnectDialog: false,
      setAutoLoginInProgress: vi.fn(),
      setConnectionState: vi.fn(),
    },
  }),
)

vi.mock('@/composables/useMudConnection', () => ({
  useMudConnection: () => ({
    login: loginMock,
    register: registerMock,
  }),
}))

vi.mock('@/stores/mudStore', () => ({
  useMudStore: () => mudStore,
}))

vi.mock('@/composables/useAuth', async () => {
  const { ref } = await import('vue')
  return {
    useAuth: () => ({
      accountName: ref(null),
      isAuthenticated: ref(false),
      storeMudCredentials: storeCredentialsMock,
      getMudCredentials: getCredentialsMock,
      clearMudCredentials: vi.fn(),
    }),
  }
})

import MudLoginPanel from '../MudLoginPanel.vue'

const passthrough = {
  template: '<div><slot /></div>',
}

const buttonStub = {
  inheritAttrs: false,
  template: '<button v-bind="$attrs"><slot /></button>',
}

const inputStub = {
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  template:
    '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

const globalStubs = {
  Button: buttonStub,
  Input: inputStub,
  Label: passthrough,
  Card: passthrough,
  CardContent: passthrough,
  CardDescription: passthrough,
  CardHeader: passthrough,
  CardTitle: passthrough,
  Tabs: passthrough,
  TabsContent: passthrough,
  TabsList: passthrough,
  TabsTrigger: passthrough,
  Alert: passthrough,
  AlertDescription: passthrough,
  Loader2: passthrough,
  AlertCircle: passthrough,
}

describe('MudLoginPanel credential lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCredentialsMock.mockReturnValue(null)
    mudStore.connectionState = 'connected'
    mudStore.connectionError = null
    mudStore.isAuthenticated = false
    mudStore.autoLoginInProgress = false
    mudStore.showReconnectDialog = false
  })

  it('does not store manual login credentials before server authentication succeeds', async () => {
    const wrapper = mount(MudLoginPanel, { global: { stubs: globalStubs } })

    await wrapper.find('#login-account').setValue('Cwial')
    await wrapper.find('#login-password').setValue('temporary-password')
    await wrapper.find('form').trigger('submit')

    expect(loginMock).toHaveBeenCalledWith('Cwial', 'temporary-password')
    expect(storeCredentialsMock).not.toHaveBeenCalled()
  })

  it('does not store registration credentials before server authentication succeeds', async () => {
    const wrapper = mount(MudLoginPanel, { global: { stubs: globalStubs } })

    await wrapper.find('#register-account').setValue('NewAccount')
    await wrapper.find('#register-password').setValue('new-password')
    await wrapper.find('#register-confirm').setValue('new-password')
    await wrapper.find('#register-email').setValue('new@example.invalid')
    await wrapper.findAll('form')[1]!.trigger('submit')

    expect(registerMock).toHaveBeenCalledWith('NewAccount', 'new-password', 'new@example.invalid')
    expect(storeCredentialsMock).not.toHaveBeenCalled()
  })
})
