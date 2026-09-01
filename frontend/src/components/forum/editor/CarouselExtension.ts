import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import CarouselNodeView from './CarouselNodeView.vue'

export interface CarouselAttributes {
  images: Array<{ src: string; alt?: string }>
  height: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    carousel: {
      insertCarousel: () => ReturnType
    }
  }
}

export const Carousel = Node.create({
  name: 'carousel',

  group: 'block',

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      images: {
        default: [],
        parseHTML: (element: HTMLElement) => {
          const imagesAttr = element.getAttribute('data-images')
          if (imagesAttr) {
            try {
              return JSON.parse(imagesAttr)
            } catch {
              return []
            }
          }
          // fallback: parse child img elements
          const imgs = element.querySelectorAll('img')
          return Array.from(imgs).map((img) => ({
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
          }))
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const images = attributes.images as Array<{ src: string; alt?: string }>
          return {
            'data-images': JSON.stringify(images),
          }
        },
      },
      height: {
        default: 300,
        parseHTML: (element: HTMLElement) => {
          return parseInt(element.getAttribute('data-height') || '300', 10)
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          return {
            'data-height': String(attributes.height),
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="carousel"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const images = HTMLAttributes['data-images'] ? JSON.parse(HTMLAttributes['data-images']) : []

    // render as div with child images for display
    const imgElements = images.map((img: { src: string; alt?: string }) => [
      'img',
      { src: img.src, alt: img.alt || '', class: 'carousel-image' },
    ])

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'carousel',
        class: 'carousel',
      }),
      ...imgElements,
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(CarouselNodeView)
  },

  addCommands() {
    return {
      insertCarousel:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: { images: [] },
            })
            .run()
        },
    }
  },
})
