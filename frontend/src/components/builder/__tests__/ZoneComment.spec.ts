import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ZoneComment from '../ZoneComment.vue'

const passthrough = {
  template: '<div><slot /></div>',
}

describe('ZoneComment content safety', () => {
  it('does not render executable stored comment HTML', () => {
    const wrapper = mount(ZoneComment, {
      props: {
        comment: {
          id: 1,
          zoneId: 'zone-a',
          parentId: null,
          procRequestId: null,
          accountName: 'Cwial',
          characterName: null,
          content: 'hello',
          contentHtml:
            '<p>hello <strong>Duris</strong></p><script>alert(1)</script><img src="x" onerror="alert(2)">',
          createdAt: '2026-08-28T00:00:00.000Z',
          updatedAt: '2026-08-28T00:00:00.000Z',
        },
        canModify: false,
        replyingTo: null,
        isSubmitting: false,
      },
      global: {
        stubs: {
          Button: passthrough,
          Reply: passthrough,
          Trash2: passthrough,
          User: passthrough,
        },
      },
    })

    const content = wrapper.find('.comment-content').html()
    expect(content).not.toMatch(/<script|onerror/i)
    expect(content).toContain('<strong>Duris</strong>')
  })
})
