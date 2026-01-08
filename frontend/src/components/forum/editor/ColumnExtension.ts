import { Node, mergeAttributes } from '@tiptap/core'

export interface ColumnsOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      insertColumns: (count: number) => ReturnType
      deleteColumns: () => ReturnType
    }
    column: {
      setColumnBackground: (color: string | null) => ReturnType
    }
  }
}

// Container node for columns
export const Columns = Node.create<ColumnsOptions>({
  name: 'columns',

  group: 'block',

  content: 'column+',

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: element => parseInt(element.getAttribute('data-columns') || '2', 10),
        renderHTML: attributes => ({
          'data-columns': attributes.columns,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[class="columns"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: 'columns' }), 0]
  },

  addCommands() {
    return {
      insertColumns: (count: number) => ({ chain }) => {
        // Create column content - each column starts with an empty paragraph
        const columnContent = Array(count).fill(null).map(() => ({
          type: 'column',
          content: [{ type: 'paragraph' }],
        }))

        return chain()
          .insertContent({
            type: this.name,
            attrs: { columns: count },
            content: columnContent,
          })
          .run()
      },

      deleteColumns: () => ({ commands, state }) => {
        const { selection } = state
        const { $from } = selection

        // Find the columns node
        for (let depth = $from.depth; depth >= 0; depth--) {
          const node = $from.node(depth)
          if (node.type.name === 'columns') {
            const pos = $from.before(depth)
            return commands.deleteRange({
              from: pos,
              to: pos + node.nodeSize,
            })
          }
        }

        return false
      },
    }
  },
})

// Individual column node
export const Column = Node.create({
  name: 'column',

  group: 'column',

  content: 'block+',

  defining: true,

  addAttributes() {
    return {
      backgroundColor: {
        default: null,
        parseHTML: element => element.getAttribute('data-bg-color'),
        renderHTML: attributes => {
          if (!attributes.backgroundColor) return {}
          return {
            'data-bg-color': attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[class="column"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'column' }), 0]
  },

  addCommands() {
    return {
      setColumnBackground: (color: string | null) => ({ state, chain }) => {
        const { selection } = state
        const { $from } = selection

        // Find the column node
        for (let depth = $from.depth; depth >= 0; depth--) {
          const node = $from.node(depth)
          if (node.type.name === 'column') {
            const pos = $from.before(depth)
            return chain()
              .updateAttributes('column', { backgroundColor: color })
              .setNodeSelection(pos)
              .run()
          }
        }

        return false
      },
    }
  },
})
