import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import TopFraggerNodeView from './TopFraggerNodeView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    topFragger: {
      insertTopFragger: () => ReturnType
    }
  }
}

export const TopFragger = Node.create({
  name: 'topFragger',

  group: 'block',

  atom: true,

  draggable: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="top-fragger"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'top-fragger',
        class: 'widget widget-top-fragger',
      }),
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(TopFraggerNodeView)
  },

  addCommands() {
    return {
      insertTopFragger:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
            })
            .run()
        },
    }
  },
})
