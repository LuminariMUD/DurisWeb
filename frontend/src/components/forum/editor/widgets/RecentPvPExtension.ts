import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import RecentPvPNodeView from './RecentPvPNodeView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    recentPvP: {
      insertRecentPvP: () => ReturnType
    }
  }
}

export const RecentPvP = Node.create({
  name: 'recentPvP',

  group: 'block',

  atom: true,

  draggable: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="recent-pvp"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'recent-pvp',
        class: 'widget widget-recent-pvp',
      }),
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(RecentPvPNodeView)
  },

  addCommands() {
    return {
      insertRecentPvP:
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
