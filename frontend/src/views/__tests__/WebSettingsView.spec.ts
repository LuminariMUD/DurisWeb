import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscordDeliveryStatus } from '@/types'

const api = vi.hoisted(() => ({
  getWebSettings: vi.fn(),
  getDiscordDeliveryStatus: vi.fn(),
  retryFailedDiscordDeliveries: vi.fn(),
  updateWebSetting: vi.fn(),
  testDiscordBot: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const isOverlord = ref(true)
const isGreaterGod = ref(true)
const hasPermission = vi.fn(() => false)
const routerPush = vi.fn()
vi.mock('@/services/api', () => ({ adminApi: api }))
vi.mock('@/composables/useToast', () => ({ useToast: () => toast }))
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ isOverlord, isGreaterGod, hasPermission }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))
import WebSettingsView from '../admin/WebSettingsView.vue'

let wrapper: VueWrapper
const status = (): DiscordDeliveryStatus => ({
  configured: true,
  enabled: false,
  activated: true,
  channelId: '123456789012345678',
  blockedReason: 'forbidden',
  nextAttemptAt: '2026-10-16T14:00:00Z',
  pending: 2,
  failed: 1,
  uncertain: 1,
  lastAutomaticSuccess: { eventId: 7, at: '2026-10-16T12:00:00Z' },
  outstanding: [
    {
      eventId: 8,
      status: 'failed',
      attempts: 2,
      ambiguous: true,
      errorCode: 'forbidden',
      nextAttemptAt: '2026-10-16T14:00:00Z',
    },
  ],
  otherDestinations: [{ channelId: '987654321012345678', outstanding: 3 }],
})
beforeEach(() => {
  vi.resetAllMocks()
  isOverlord.value = true
  isGreaterGod.value = true
  hasPermission.mockReturnValue(false)
  api.getWebSettings.mockResolvedValue([
    { setting_key: 'discord_webhook_enabled', setting_value: 'false' },
  ])
  api.getDiscordDeliveryStatus.mockResolvedValue(status())
  api.retryFailedDiscordDeliveries.mockResolvedValue(undefined)
  api.testDiscordBot.mockResolvedValue({ success: true })
})
afterEach(() => wrapper?.unmount())

async function openSettings() {
  wrapper = mount(WebSettingsView, {
    attachTo: document.body,
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
  await flushPromises()
}
function button(label: string) {
  const found = wrapper.findAll('button').find((node) => node.text() === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

describe('Discord delivery controls in Web Settings', () => {
  it('shows paused/blocked state, actionable errors, canonical battle links and retained channel work', async () => {
    await openSettings()
    const panel = wrapper.get('section[aria-label="Discord delivery status"]')
    expect(panel.text()).toContain('Automatic posting paused')
    expect(panel.get('[role="alert"]').text()).toContain('Check the bot channel permissions')
    expect(panel.findAll('dd').map((node) => node.text())).toEqual(['2', '1', '1'])
    expect(panel.get('a[href="/pvp/7"]').text()).toBe('battle #7')
    expect(panel.get('a[href="/pvp/8"]').text()).toBe('Battle #8')
    expect(panel.text()).toContain('Retrying can create a duplicate')
    expect(panel.text()).toContain('987654321012345678 retains 3 outstanding deliveries')
    expect(api.retryFailedDiscordDeliveries).not.toHaveBeenCalled()
  })

  it('prevents duplicate retry submissions and refreshes status without enabling paused posting', async () => {
    let finish!: () => void
    api.retryFailedDiscordDeliveries.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    await openSettings()
    await button('Retry failed deliveries').trigger('click')
    expect(button('Queuing...').attributes('disabled')).toBeDefined()
    await button('Queuing...').trigger('click')
    expect(api.retryFailedDiscordDeliveries).toHaveBeenCalledTimes(1)
    api.getDiscordDeliveryStatus.mockResolvedValue({
      ...status(),
      failed: 0,
      blockedReason: null,
      pending: 3,
    })
    finish()
    await flushPromises()
    expect(api.getDiscordDeliveryStatus).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Automatic posting paused')
    expect(wrapper.text()).not.toContain('Retry failed deliveries')
    expect(document.activeElement).toBe(button('Refresh status').element)
    expect(api.updateWebSetting).not.toHaveBeenCalled()
  })

  it('shows unavailable status explicitly and recovers through Refresh', async () => {
    api.getDiscordDeliveryStatus.mockRejectedValueOnce(new Error('offline'))
    await openSettings()
    const panel = wrapper.get('section[aria-label="Discord delivery status"]')
    expect(panel.get('[role="alert"]').text()).toContain('Delivery status is unavailable')
    expect(panel.text()).not.toContain('No outstanding deliveries')
    await button('Refresh status').trigger('click')
    await flushPromises()
    expect(panel.text()).toContain('Automatic posting paused')
    expect(panel.text()).not.toContain('Delivery status is unavailable')
  })

  it('restores the saved toggle when a busy worker rejects the change', async () => {
    api.updateWebSetting.mockRejectedValueOnce(new Error('busy'))
    await openSettings()
    const toggle = wrapper.get('#discord_webhook_enabled')
    expect(toggle.attributes('aria-checked')).toBe('false')
    await toggle.trigger('click')
    await flushPromises()
    expect(api.updateWebSetting).toHaveBeenCalledWith('discord_webhook_enabled', 'true')
    expect(toggle.attributes('aria-checked')).toBe('false')
    expect(toast.error).toHaveBeenCalled()
  })

  it('retains the separate explicit test-message action', async () => {
    await openSettings()
    await button('Send test message').trigger('click')
    await flushPromises()
    expect(api.testDiscordBot).toHaveBeenCalledTimes(1)
    expect(api.retryFailedDiscordDeliveries).not.toHaveBeenCalled()
  })

  it('does not load delivery data for a user who cannot manage the front page', async () => {
    isOverlord.value = false
    await openSettings()
    expect(routerPush).toHaveBeenCalledWith('/forum')
    expect(api.getDiscordDeliveryStatus).not.toHaveBeenCalled()
    expect(api.getWebSettings).not.toHaveBeenCalled()
  })

  it('does not offer forbidden dashboard navigation to a delegated manager', async () => {
    isOverlord.value = false
    isGreaterGod.value = false
    hasPermission.mockReturnValue(true)
    await openSettings()
    expect(wrapper.text()).not.toContain('Back to Dashboard')
    expect(api.getDiscordDeliveryStatus).toHaveBeenCalledOnce()
  })

  it('explains pending discovery instead of claiming there is no outstanding work', async () => {
    api.getDiscordDeliveryStatus.mockResolvedValue({
      ...status(),
      pending: 105,
      failed: 0,
      outstanding: [],
    })
    await openSettings()
    const panel = wrapper.get('section[aria-label="Discord delivery status"]')
    expect(panel.text()).toContain(
      'Pending battles will appear here after the next delivery check.',
    )
    expect(panel.text()).not.toContain('No outstanding deliveries.')
  })

  it('shows the recovery deadline for an interrupted sending attempt', async () => {
    const fixture = status()
    api.getDiscordDeliveryStatus.mockResolvedValue({
      ...fixture,
      outstanding: [
        { ...fixture.outstanding[0], status: 'sending', nextAttemptAt: '2026-10-16T14:01:00Z' },
      ],
    })
    await openSettings()
    const panel = wrapper.get('section[aria-label="Discord delivery status"]')
    expect(panel.text()).toContain('Attempt recovery no earlier than')
    expect(panel.text()).toContain(new Date('2026-10-16T14:01:00Z').toLocaleString())
  })
})
