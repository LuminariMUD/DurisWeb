import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const install = vi.fn()
const dismiss = vi.fn()
const isAvailable = ref(true)

vi.mock('@/composables/useInstallPrompt', () => ({
  useInstallPrompt: () => ({
    canInstall: ref(true),
    install,
    dismiss,
  }),
}))

vi.mock('@/composables/useSiteConfig', () => ({
  useSiteConfig: () => ({ siteTitle: ref('Example MUD'), isAvailable }),
}))

import InstallBanner from '../InstallBanner.vue'

describe('InstallBanner responsive safety', () => {
  beforeEach(() => {
    isAvailable.value = true
  })

  it('keeps the prompt above mobile navigation with touch-sized controls', () => {
    const wrapper = mount(InstallBanner)
    const banner = wrapper.find('[data-testid="install-banner"]')
    const installButton = wrapper.find('button[type="button"]')
    const dismissButton = wrapper.find('button[aria-label="Dismiss install prompt"]')

    expect(banner.exists()).toBe(true)
    expect(banner.classes()).toContain('install-banner')
    expect(banner.attributes('role')).toBe('region')
    expect(banner.attributes('aria-label')).toBe('Install Example MUD app')
    expect(installButton.classes()).toContain('min-h-11')
    expect(dismissButton.exists()).toBe(true)
    expect(dismissButton.classes()).toContain('min-h-11')
    expect(dismissButton.classes()).toContain('min-w-11')
  })

  it('stays hidden while site configuration is unavailable', () => {
    isAvailable.value = false

    const wrapper = mount(InstallBanner)

    expect(wrapper.find('[data-testid="install-banner"]').exists()).toBe(false)
  })
})
