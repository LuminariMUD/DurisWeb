import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import PrivacyView from '../PrivacyView.vue'

vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))
vi.mock('@/composables/useSiteConfig', () => ({
  useSiteConfig: () => ({ siteTitle: ref('Fixture') }),
}))

let wrapper: ReturnType<typeof mount>
afterEach(() => wrapper?.unmount())

describe('public privacy notice', () => {
  it('is readable before login, labels unapproved details and offers the supplied contact without starting choices', () => {
    wrapper = mount(PrivacyView, {
      global: {
        stubs: {
          PrivacyControls: { template: '<div>Choice controls</div>' },
          AccountDataExport: true,
        },
      },
    })
    expect(wrapper.get('h1').text()).toBe('Privacy & choices')
    expect(wrapper.text()).toContain('Draft privacy details')
    expect(wrapper.text()).toContain(
      'retention periods and request procedures are still being reviewed',
    )
    expect(wrapper.text()).toContain('Max (Moshe)')
    expect(wrapper.get('a[href^="mailto:"]').attributes('href')).toBe('mailto:zusuk@duris.sbs')
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
      'Contact about your data',
      'Accounts and community features',
      'Security and staff records',
      'Optional visit statistics',
      'External services and copies',
      'Retention and removal requests',
    ])
    expect(wrapper.text()).toContain('Please do not email passwords')
    expect(wrapper.text()).toContain('The stored statistics do not include account names')
    expect(wrapper.find('[href="/login"]').exists()).toBe(false)
  })
})
