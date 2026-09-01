import { onMounted, onUnmounted } from 'vue'
import { useMudConnection } from './useMudConnection'

// Keypad and arrow key to MUD command mappings
const KEYPAD_BINDINGS: Record<string, string> = {
  // Numpad movement
  Numpad8: 'north',
  Numpad2: 'south',
  Numpad4: 'west',
  Numpad6: 'east',
  Numpad7: 'northwest',
  Numpad9: 'northeast',
  Numpad1: 'southwest',
  Numpad3: 'southeast',
  Numpad5: 'look',
  NumpadAdd: 'up',
  NumpadSubtract: 'down',
  // Arrow keys
  ArrowUp: 'north',
  ArrowDown: 'south',
  ArrowLeft: 'west',
  ArrowRight: 'east',
}

export interface KeypadBindingsOptions {
  onFocusInput?: () => void
  onScrollPageUp?: () => void
  onScrollPageDown?: () => void
  onScrollToTop?: () => void
  onScrollToBottom?: () => void
}

export function useKeypadBindings(options: KeypadBindingsOptions = {}) {
  const { sendGameCommand } = useMudConnection()

  const handleKeyDown = (event: KeyboardEvent) => {
    // Ignore if user is typing in an input or textarea
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return
    }

    // Ignore if modifier keys are pressed (let browser handle Ctrl+Arrow, etc.)
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return
    }

    // Handle NumpadEnter - focus the command input
    if (event.code === 'NumpadEnter') {
      event.preventDefault()
      options.onFocusInput?.()
      return
    }

    // Handle scroll keys
    switch (event.code) {
      case 'PageUp':
        event.preventDefault()
        options.onScrollPageUp?.()
        return
      case 'PageDown':
        event.preventDefault()
        options.onScrollPageDown?.()
        return
      case 'Home':
        event.preventDefault()
        options.onScrollToTop?.()
        return
      case 'End':
        event.preventDefault()
        options.onScrollToBottom?.()
        return
    }

    // Check if this key has a binding
    const command = KEYPAD_BINDINGS[event.code]
    if (command) {
      event.preventDefault()
      sendGameCommand(command)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}
