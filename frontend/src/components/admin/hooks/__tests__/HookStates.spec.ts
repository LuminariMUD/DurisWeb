import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DualStateLamp from '../DualStateLamp.vue'
import HookRow from '../HookRow.vue'
import HookToggle from '../HookToggle.vue'
import TransportPanel from '../TransportPanel.vue'
import { Switch } from '@/components/ui/switch'
import { hook, transport } from './fixtures'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('dual hook state rendering', () => {
  it.each([
    ['enabled', 'on', 'ON'],
    ['disabled', 'mismatch', 'MISMATCH'],
    ['unknown', 'unknown', 'UNKNOWN'],
    ['unavailable', 'unavailable', 'UNAVAILABLE'],
    ['not_gated', 'on', 'N/A'],
  ] as const)('renders %s with explicit non-colour text', (mudState, effective, label) => {
    const wrapper = mount(DualStateLamp, { props: { hook: hook({ mudState, effective }) } })
    expect(wrapper.text()).toContain(label)
    expect(wrapper.attributes('aria-label')).toContain(`effective ${effective}`)
    expect(wrapper.find('.hook-hazard').exists()).toBe(effective === 'mismatch')
  })

  it('renders the recovery terminal without a switch', () => {
    const wrapper = mount(HookToggle, {
      props: { hook: hook({ id: 'terminal', alwaysOn: true, mudState: 'not_gated' }) },
    })
    expect(wrapper.text()).toContain('ALWAYS ON')
    expect(wrapper.find('[role="switch"]').exists()).toBe(false)
  })

  it('disables immediately without confirmation and exposes pending state', async () => {
    const wrapper = mount(HookToggle, { props: { hook: hook(), pending: false } })
    wrapper.findComponent(Switch).vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('reconcile')).toEqual([[false]])
    await wrapper.setProps({ pending: true })
    expect(wrapper.text()).toContain('PENDING')
    expect(wrapper.find('[role="switch"]').attributes('data-disabled')).toBeDefined()
  })

  it('asks for confirmation before enabling into a known MUD-off state', async () => {
    const wrapper = mount(HookToggle, {
      attachTo: document.body,
      props: { hook: hook({ webEnabled: false, mudState: 'disabled', effective: 'off', active: false }) },
    })
    wrapper.findComponent(Switch).vm.$emit('update:modelValue', true)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('reconcile')).toBeUndefined()
    expect(document.body.textContent).toContain('Enable both ends?')
    wrapper.unmount()
  })

  it('keeps row errors inline and responsive card/list classes present', () => {
    const wrapper = mount(HookRow, { props: { hook: hook(), error: 'MUD did not confirm' } })
    expect(wrapper.text()).toContain('MUD did not confirm')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.classes()).toContain('md:border')
    expect(wrapper.classes()).toContain('lg:grid-cols-[minmax(15rem,1.4fr)_minmax(17rem,1fr)_10rem_1.5rem]')
    expect(wrapper.get('button[aria-label="Open details for auction_new"]')).toBeTruthy()
  })
})

describe('transport posture', () => {
  it('shows nominal sanitized metadata', () => {
    const wrapper = mount(TransportPanel, { props: { transport } })
    expect(wrapper.text()).toContain('mud.example.test')
    expect(wrapper.text()).toContain('AUTHENTICATED')
    expect(wrapper.text()).toContain('31 days')
    expect(wrapper.text()).not.toMatch(/token|secret-value/i)
  })

  it('keeps a plaintext non-loopback refusal in a persistent alert', () => {
    const wrapper = mount(TransportPanel, {
      props: { transport: { ...transport, scheme: 'ws', blocked: true, authenticated: false, reason: 'Plaintext ws:// is refused for a non-loopback MUD host.' } },
    })
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/plaintext.*refused/i)
  })
})
