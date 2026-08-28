import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('@/composables/useSiteConfig', () => ({
  useSiteConfig: () => ({
    frontPageHeroEnabled: ref(true),
    frontPageHeroTitle: ref('DurisMUD'),
    frontPageHeroSubtitle: ref('A persistent world'),
    frontPageHeroImageUrl: ref(''),
    frontPageContent: ref(''),
  }),
}))

vi.mock('vue-router', () => ({
  RouterLink: {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },
}))

import FrontPageView from '@/views/FrontPageView.vue'

describe('FrontPageView News discoverability', () => {
  it('provides a persistent News & Updates CTA beside Play Now', () => {
    const wrapper = mount(FrontPageView, {
      global: {
        stubs: {
          CarouselDisplay: true,
          TopFraggerDisplay: true,
          RecentPvPDisplay: true,
          MapPreviewDisplay: true,
        },
      },
    })

    const newsLink = wrapper.find('a[href="/news"]')
    expect(newsLink.exists()).toBe(true)
    expect(newsLink.text()).toContain('News & Updates')
  })
})
