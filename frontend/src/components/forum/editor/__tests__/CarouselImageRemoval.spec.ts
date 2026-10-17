import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { Component } from 'vue'
import CarouselNodeView from '../CarouselNodeView.vue'

const api = vi.hoisted(() => ({ clearOrphanImages: vi.fn(), getImageUploadStatus: vi.fn() }))
vi.mock('@/services/api', () => ({ forumApi: api }))
vi.mock('@tiptap/vue-3', () => ({
  NodeViewWrapper: { template: '<div><slot /></div>' },
  nodeViewProps: {
    node: { type: Object, required: true },
    updateAttributes: { type: Function, required: true },
    deleteNode: { type: Function, required: true },
  },
}))
const first = 'https://images.test.invalid/first.webp',
  second = 'https://images.test.invalid/second.webp',
  linked = 'https://images.test.invalid/already-linked.webp'
let wrapper: ReturnType<typeof mount>
const updateAttributes = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  api.getImageUploadStatus.mockResolvedValue({
    pendingImages: 5,
    pendingRemovals: 0,
    maxImages: 5,
    canUpload: false,
  })
})
afterEach(() => wrapper?.unmount())
async function render(firstSource = first) {
  wrapper = mount(CarouselNodeView as Component, {
    props: {
      node: {
        attrs: { height: 300, images: [{ src: firstSource }, { src: second }, { src: linked }] },
      },
      updateAttributes,
      deleteNode: vi.fn(),
    },
  })
  await flushPromises()
}
describe('pending image removal feedback', () => {
  it('keeps failed work retryable below quota and drops only unavailable previews', async () => {
    await render(first + '?cache=2#preview')
    api.clearOrphanImages.mockResolvedValue({
      deleted: 1,
      failed: 1,
      remaining: 1,
      unavailableImageUrls: [first, second],
    })
    api.getImageUploadStatus.mockResolvedValue({
      pendingImages: 1,
      pendingRemovals: 1,
      maxImages: 5,
      canUpload: true,
    })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(updateAttributes).toHaveBeenCalledWith({ images: [{ src: linked }] })
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Some image removals could not be confirmed',
    )
    expect(wrapper.text()).toContain('1 image awaiting removal')
    expect(wrapper.findAll('button').some((button) => button.text() === 'clear all')).toBe(true)
    expect(api.getImageUploadStatus).toHaveBeenCalledTimes(2)
  })
  it('hides completed work and clears confirmed unavailable previews', async () => {
    await render()
    api.clearOrphanImages.mockResolvedValue({
      deleted: 5,
      failed: 0,
      remaining: 0,
      unavailableImageUrls: [first, second],
    })
    api.getImageUploadStatus.mockResolvedValue({
      pendingImages: 0,
      pendingRemovals: 0,
      maxImages: 5,
      canUpload: true,
    })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'clear all')).toBe(false)
    expect(updateAttributes).toHaveBeenCalledWith({ images: [{ src: linked }] })
  })
  it('refreshes status after a failed request without pretending unknown previews were removed', async () => {
    await render()
    api.clearOrphanImages.mockRejectedValue(new Error('private-provider-sentinel'))
    api.getImageUploadStatus.mockResolvedValue({
      pendingImages: 1,
      pendingRemovals: 1,
      maxImages: 5,
      canUpload: true,
    })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Image removal could not be confirmed')
    expect(wrapper.text()).not.toContain('private-provider-sentinel')
    expect(updateAttributes).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('1 image awaiting removal')
  })
  it('removes known unavailable previews but keeps retry visible when the final count is unknown', async () => {
    await render(first + '?cache=2')
    api.clearOrphanImages.mockResolvedValue({
      deleted: 2,
      failed: 0,
      remaining: null,
      unavailableImageUrls: [first, second],
      reference: 'd3a51f53-ffcd-44b5-b4aa-86a8aa37bf15',
    })
    api.getImageUploadStatus.mockResolvedValue({
      pendingImages: 0,
      pendingRemovals: 0,
      maxImages: 5,
      canUpload: true,
    })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(updateAttributes).toHaveBeenCalledWith({ images: [{ src: linked }] })
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Some image removals could not be confirmed',
    )
    expect(wrapper.findAll('button').some((button) => button.text() === 'clear all')).toBe(true)
  })
})
