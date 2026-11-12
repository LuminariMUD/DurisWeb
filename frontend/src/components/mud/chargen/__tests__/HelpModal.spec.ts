import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { apiClient } from '@/services/httpClient'
import HelpModal from '../HelpModal.vue'

const originalAdapter = apiClient.defaults.adapter
const originalBaseUrl = apiClient.defaults.baseURL
const requests: InternalAxiosRequestConfig[] = []
const wrappers: Array<ReturnType<typeof mount>> = []
let responseData: unknown

beforeEach(() => {
  requests.length = 0
  responseData = { title: 'Fixture help', text: '==Overview==\nHelp text' }
  apiClient.defaults.baseURL = 'https://separate-help-api.test.invalid'
  apiClient.defaults.adapter = async (config) => {
    requests.push(config)
    return { data: responseData, status: 200, statusText: 'OK', headers: {}, config }
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => responseData })),
  )
})

afterEach(() => {
  while (wrappers.length) wrappers.pop()?.unmount()
  apiClient.defaults.adapter = originalAdapter
  apiClient.defaults.baseURL = originalBaseUrl
  vi.unstubAllGlobals()
})

async function openHelp(type: 'race' | 'class' = 'race') {
  const content = { template: '<div><slot /></div>' }
  const wrapper = mount(HelpModal, {
    props: { type, name: 'Half Elf' },
    global: {
      stubs: {
        Dialog: content,
        DialogContent: content,
        DialogDescription: content,
        DialogHeader: content,
        DialogTitle: content,
        Button: { template: '<button><slot /></button>' },
      },
    },
  })
  wrappers.push(wrapper)
  await wrapper.get('button').trigger('click')
  await flushPromises()
  return wrapper
}

describe('character creation help', () => {
  it.each(['race', 'class'] as const)(
    'uses the configured API origin for %s help',
    async (type) => {
      const wrapper = await openHelp(type)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        url: `/api/help/${type}/Half%20Elf`,
        baseURL: 'https://separate-help-api.test.invalid',
        withCredentials: true,
        timeout: 10000,
      })
      expect(wrapper.text()).toContain('Help text')
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('renders wiki-header HTML as text instead of inserting a live stylesheet', async () => {
    responseData = { title: 'Fixture help', text: '==<style>body{display:none}</style>==' }
    const wrapper = await openHelp()
    expect(wrapper.find('.help-content style').exists()).toBe(false)
    expect(wrapper.get('.help-content').text()).toContain('<style>body{display:none}</style>')
  })

  it('keeps the unavailable-help response for an HTTP not-found', async () => {
    apiClient.defaults.adapter = async (config) => {
      throw new AxiosError('Synthetic not found', 'ERR_BAD_REQUEST', config, undefined, {
        data: {},
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config,
      })
    }
    expect((await openHelp()).text()).toContain('Help not available')
  })

  it('rejects a malformed help response before rendering it', async () => {
    responseData = { title: 'Fixture help', text: 42 }
    expect((await openHelp()).text()).toContain('Help not available')
  })
})
