import Image from '@tiptap/extension-image'
import { mergeAttributes, type CommandProps } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ResizableImage from './ResizableImage.vue'

export type ImageAlignment = 'left' | 'center' | 'right'

interface ImageOptions {
  src: string
  alt?: string
  title?: string
  alignment?: ImageAlignment
  rounded?: boolean
  width?: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    forumImage: {
      setImageAlignment: (alignment: ImageAlignment) => ReturnType
      toggleImageRounded: () => ReturnType
      setImageWidth: (width: number | null) => ReturnType
    }
  }
}

export const ForumImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const width = element.getAttribute('width') || element.style.width
          return width ? parseInt(width, 10) : null
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.width) return {}
          return {
            width: attributes.width,
            style: `width: ${attributes.width}px; height: auto;`,
          }
        },
      },
      alignment: {
        default: 'center',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-alignment') || 'center',
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-alignment': attributes.alignment || 'center',
        }),
      },
      rounded: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-rounded') === 'true',
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.rounded) return {}
          return { 'data-rounded': 'true' }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addNodeView() {
    return VueNodeViewRenderer(ResizableImage)
  },

  addCommands() {
    return {
      setImage:
        (options: ImageOptions) =>
        ({ commands }: CommandProps) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          })
        },
      setImageAlignment:
        (alignment: ImageAlignment) =>
        ({ commands }: CommandProps) => {
          return commands.updateAttributes('image', { alignment })
        },
      toggleImageRounded:
        () =>
        ({ editor, commands }: CommandProps) => {
          const currentRounded = editor.getAttributes('image').rounded || false
          return commands.updateAttributes('image', { rounded: !currentRounded })
        },
      setImageWidth:
        (width: number | null) =>
        ({ commands }: CommandProps) => {
          return commands.updateAttributes('image', { width })
        },
    }
  },
})
