import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import MapPreviewNodeView from './MapPreviewNodeView.vue'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mapPreview: {
      insertMapPreview: () => ReturnType
    }
  }
}

export const MapPreview = Node.create({
  name: 'mapPreview',

  group: 'block',

  atom: true,

  draggable: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="map-preview"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'map-preview',
        class: 'widget widget-map-preview',
      }),
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(MapPreviewNodeView)
  },

  addCommands() {
    return {
      insertMapPreview:
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
