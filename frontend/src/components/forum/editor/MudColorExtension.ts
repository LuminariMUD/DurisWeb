import { Mark } from '@tiptap/core'

export interface MudColorOptions {
  types: string[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mudColor: {
      /**
       * Set MUD ANSI color
       */
      setMudColor: (color: string) => ReturnType
      /**
       * Unset MUD ANSI color
       */
      unsetMudColor: () => ReturnType
    }
  }
}

/**
 * MUD ANSI Color Extension for TipTap
 *
 * Allows applying DurisMUD color codes to text selections.
 * Colors are stored as data-mud-color attributes and rendered with Tailwind classes.
 */
export const MudColor = Mark.create<MudColorOptions>({
  name: 'mudColor',

  addOptions() {
    return {
      types: ['textStyle'],
    }
  },

  addAttributes() {
    return {
      mudColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-mud-color'),
        renderHTML: (attributes) => {
          if (!attributes.mudColor) {
            return {}
          }

          return {
            'data-mud-color': attributes.mudColor,
            class: getMudColorClass(attributes.mudColor),
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mud-color]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },

  addCommands() {
    return {
      setMudColor:
        (color: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { mudColor: color })
        },
      unsetMudColor:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})

/**
 * Map MUD ANSI codes to Tailwind CSS classes
 */
function getMudColorClass(mudCode: string): string {
  const colorMap: Record<string, string> = {
    // Bold colors
    '&+R': 'text-red-500',      // Bold Red
    '&+G': 'text-green-500',    // Bold Green
    '&+B': 'text-blue-500',     // Bold Blue
    '&+Y': 'text-yellow-500',   // Bold Yellow
    '&+M': 'text-purple-500',   // Bold Magenta
    '&+C': 'text-cyan-500',     // Bold Cyan
    '&+W': 'text-white',        // Bold White
    '&+L': 'text-gray-400',     // Bold Black (Gray)

    // Normal colors
    '&+r': 'text-red-400',      // Red
    '&+g': 'text-green-400',    // Green
    '&+b': 'text-blue-400',     // Blue
    '&+y': 'text-yellow-400',   // Yellow
    '&+m': 'text-purple-400',   // Magenta
    '&+c': 'text-cyan-400',     // Cyan
    '&+w': 'text-gray-200',     // White
    '&+l': 'text-gray-500',     // Black (Gray)

    // Special
    '&n': 'text-gray-300',      // Normal (reset)
    '&N': 'text-gray-300',      // Normal (reset) - uppercase
  }

  return colorMap[mudCode] || 'text-gray-300'
}

/**
 * Get display name for MUD color code
 */
export function getMudColorName(mudCode: string): string {
  const nameMap: Record<string, string> = {
    '&+R': 'Bold Red',
    '&+G': 'Bold Green',
    '&+B': 'Bold Blue',
    '&+Y': 'Bold Yellow',
    '&+M': 'Bold Magenta',
    '&+C': 'Bold Cyan',
    '&+W': 'Bold White',
    '&+L': 'Bold Gray',
    '&+r': 'Red',
    '&+g': 'Green',
    '&+b': 'Blue',
    '&+y': 'Yellow',
    '&+m': 'Magenta',
    '&+c': 'Cyan',
    '&+w': 'White',
    '&+l': 'Gray',
    '&n': 'Normal',
    '&N': 'Normal',
  }

  return nameMap[mudCode] || mudCode
}

/**
 * Available MUD color codes for the toolbar
 */
export const MUD_COLORS = [
  { code: '&+R', name: 'Bold Red', class: 'text-red-500' },
  { code: '&+G', name: 'Bold Green', class: 'text-green-500' },
  { code: '&+B', name: 'Bold Blue', class: 'text-blue-500' },
  { code: '&+Y', name: 'Bold Yellow', class: 'text-yellow-500' },
  { code: '&+M', name: 'Bold Magenta', class: 'text-purple-500' },
  { code: '&+C', name: 'Bold Cyan', class: 'text-cyan-500' },
  { code: '&+W', name: 'Bold White', class: 'text-white' },
  { code: '&+L', name: 'Bold Gray', class: 'text-gray-400' },
  { code: '&+r', name: 'Red', class: 'text-red-400' },
  { code: '&+g', name: 'Green', class: 'text-green-400' },
  { code: '&+b', name: 'Blue', class: 'text-blue-400' },
  { code: '&+y', name: 'Yellow', class: 'text-yellow-400' },
  { code: '&+m', name: 'Magenta', class: 'text-purple-400' },
  { code: '&+c', name: 'Cyan', class: 'text-cyan-400' },
  { code: '&+w', name: 'White', class: 'text-gray-200' },
  { code: '&+l', name: 'Gray', class: 'text-gray-500' },
  { code: '&n', name: 'Normal', class: 'text-gray-300' },
]
