import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { Editor } from '@tiptap/core'
import NewsAdminView from '../NewsAdminView.vue'
import { htmlToAnsi, stripAnsiCodes } from '@/utils/ansiParser'

const { get, put, post, show } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  show: vi.fn(),
}))
vi.mock('@/services/api', () => ({ apiClient: { get, put, post }, forumApi: {} }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ show }) }))

const sample =
  '&+R09/15/26 - 09/21/26&n - Title\n\n&+Y-&n Build <forge|loom> <direction> & more\n  &+Cwrapped text&n\n\n\n'
const wrappers: ReturnType<typeof mount>[] = []
function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['news'], { news: 'old' })
  const wrapper = mount(NewsAdminView, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return { wrapper, queryClient }
}
function editorFrom(wrapper: ReturnType<typeof mount>): Editor {
  return (wrapper.get('.tiptap').element as HTMLElement & { editor: Editor }).editor
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
})
beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue({ data: { news: sample } })
  put.mockResolvedValue({ data: { news: sample } })
})

describe('news editor save', () => {
  it('loads real TipTap and saves an unchanged document byte for byte', async () => {
    const { wrapper, queryClient } = render()
    await flushPromises()
    expect(wrapper.get('.tiptap').text()).toContain('<forge|loom> <direction> & more')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(put).toHaveBeenCalledWith('/api/content/news', { content: sample })
    expect(queryClient.getQueryState(['news'])?.isInvalidated).toBe(true)
    expect(post).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('only when it is configured and enabled')
  })

  it('edits a document larger than 50,000 characters without losing text, indentation or colors', async () => {
    const news = sample + `&+W- Existing item&n\n  ${'Details <item> & more '.repeat(2500)}\n`
    get.mockResolvedValue({ data: { news } })
    const { wrapper } = render()
    await flushPromises()
    const editor = editorFrom(wrapper)
    expect(editor).toBeDefined()
    expect(stripAnsiCodes(htmlToAnsi(editor.getHTML()))).toBe(stripAnsiCodes(news))
    editor.commands.insertContentAt(1, 'Edited: ')
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    const saved: string = put.mock.calls[0]![1].content
    expect(saved.length).toBeGreaterThan(50_000)
    expect(stripAnsiCodes(saved)).toBe('Edited: ' + stripAnsiCodes(news))
    expect(saved).toContain('&+Cwrapped text&n')
    expect(saved).toContain('&+W- Existing item&n')
    expect(saved).toContain('<forge|loom> <direction> & more')
  })

  it('preserves indentation and blank lines when editing raw ANSI', async () => {
    const { wrapper } = render()
    await flushPromises()
    await wrapper.get('button[title="View Raw ANSI (Database Format)"]').trigger('click')
    const edited = sample.replace('wrapped text', 'edited wrapped text')
    await wrapper.get('textarea').setValue(edited)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(put).toHaveBeenCalledWith('/api/content/news', { content: edited })
  })

  it('shows server validation errors without offering an announcement', async () => {
    put.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: 'Content exceeds maximum length of 250000 characters' } },
    })
    const { wrapper } = render()
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Content exceeds maximum length of 250000 characters',
        type: 'error',
      }),
    )
    expect(post).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Announce Update?')
  })

  it('prevents replacing news after loading fails', async () => {
    get.mockRejectedValue(new Error('Load failed'))
    const { wrapper } = render()
    await flushPromises()
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(editorFrom(wrapper).isEditable).toBe(false)
    expect(put).not.toHaveBeenCalled()
  })
})
