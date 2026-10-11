import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import NewsAnnouncementModal from '../NewsAnnouncementModal.vue'
import { useNews } from '@/composables/useNews'
import { useWebSocket } from '@/composables/useWebSocket'

const { getNews } = vi.hoisted(() => ({ getNews: vi.fn() }))
vi.mock('@/services/api', () => ({ newsApi: { getNews } }))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ accountName: ref('Reader') }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('refetches an open news page on a WebSocket announcement even if its popup was dismissed', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['news'], { news: 'Old cached news' })
  getNews.mockResolvedValue({ news: 'New published news' })
  localStorage.setItem('lastSeenNewsDate_reader', '09/15/26 - 09/21/26')
  const wrapper = mount(
    {
      components: { NewsAnnouncementModal },
      setup() {
        return { news: useNews().data }
      },
      template: '<div><p data-news>{{ news?.news }}</p><NewsAnnouncementModal /></div>',
    },
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  wrappers.push(wrapper)
  expect(wrapper.get('[data-news]').text()).toBe('Old cached news')

  const socket = { onmessage: null as ((event: { data: string }) => void) | null, close: vi.fn() }
  vi.stubGlobal(
    'WebSocket',
    class {
      constructor() {
        return socket
      }
    },
  )
  const { connect, disconnect } = useWebSocket()
  connect()
  socket.onmessage!({
    data: JSON.stringify({
      type: 'NEWS_UPDATED',
      data: { date: '09/15/26 - 09/21/26', items: ['- New'] },
    }),
  })
  await flushPromises()
  expect(getNews).toHaveBeenCalledOnce()
  expect(wrapper.get('[data-news]').text()).toBe('New published news')
  expect(document.body.textContent).not.toContain('New updates have been posted!')
  disconnect()
})

it('invalidates inactive cached news so navigation fetches the new document', async () => {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['news'], { news: 'Old' })
  const wrapper = mount(NewsAnnouncementModal, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  })
  wrappers.push(wrapper)
  window.dispatchEvent(
    new CustomEvent('news-updated', { detail: { date: '9/21/26', items: ['- New'] } }),
  )
  expect(queryClient.getQueryState(['news'])?.isInvalidated).toBe(true)
})
