import { ref, onUnmounted } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import 'xterm/css/xterm.css'
import { frontendConfiguration } from '@/config/environment'

// Terminal state
const terminal = ref<Terminal | null>(null)
const fitAddon = ref<FitAddon | null>(null)
const isConnected = ref(false)
const sessionId = ref<number | null>(null)
const error = ref<string | null>(null)
const ws = ref<WebSocket | null>(null)

// Get terminal token from backend API
async function getTerminalToken(): Promise<string | null> {
  try {
    const apiUrl = frontendConfiguration.apiUrl
    const response = await fetch(`${apiUrl}/api/auth/terminal-token`, {
      credentials: 'include', // Include cookies for auth
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.token || null
  } catch {
    return null
  }
}

export function useTerminal() {
  let resizeObserver: ResizeObserver | null = null

  /**
   * Initialize xterm.js terminal in a container element
   */
  function initTerminal(container: HTMLElement): void {
    // Clean up existing ResizeObserver before creating new one
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }

    if (terminal.value) {
      terminal.value.dispose()
    }

    // Create terminal with MUD-appropriate settings
    terminal.value = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, Monaco, monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#00ff00',
        cursorAccent: '#1a1a1a',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,
      convertEol: true,
      allowProposedApi: true,
    })

    // Add addons
    fitAddon.value = new FitAddon()
    terminal.value.loadAddon(fitAddon.value)

    const webLinksAddon = new WebLinksAddon()
    terminal.value.loadAddon(webLinksAddon)

    // Open terminal in container
    terminal.value.open(container)
    fitAddon.value.fit()

    // Handle terminal input
    terminal.value.onData((data: string) => {
      if (ws.value && ws.value.readyState === WebSocket.OPEN) {
        ws.value.send(
          JSON.stringify({
            type: 'TERMINAL_INPUT',
            data,
          }),
        )
      }
    })

    // Handle resize
    resizeObserver = new ResizeObserver(() => {
      if (fitAddon.value && terminal.value) {
        fitAddon.value.fit()
        // Send resize to server
        if (ws.value && ws.value.readyState === WebSocket.OPEN) {
          ws.value.send(
            JSON.stringify({
              type: 'TERMINAL_RESIZE',
              cols: terminal.value.cols,
              rows: terminal.value.rows,
            }),
          )
        }
      }
    })
    resizeObserver.observe(container)
  }

  /**
   * Connect to terminal WebSocket
   */
  async function connect(): Promise<void> {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      return
    }

    error.value = null

    const token = await getTerminalToken()
    if (!token) {
      error.value = 'Not authenticated. Please log in.'
      return
    }

    const wsUrl = frontendConfiguration.websocketUrl

    try {
      ws.value = new WebSocket(wsUrl)

      ws.value.onopen = () => {
        // Send connect request with token and terminal size
        ws.value?.send(
          JSON.stringify({
            type: 'TERMINAL_CONNECT',
            token,
            cols: terminal.value?.cols || 80,
            rows: terminal.value?.rows || 24,
          }),
        )
      }

      ws.value.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          switch (message.type) {
            case 'TERMINAL_CONNECTED':
              isConnected.value = true
              sessionId.value = message.sessionId
              error.value = null
              terminal.value?.focus()
              break

            case 'TERMINAL_OUTPUT':
              terminal.value?.write(message.data)
              break

            case 'TERMINAL_ERROR':
              error.value = message.message
              isConnected.value = false
              break

            case 'TERMINAL_CLOSED':
              isConnected.value = false
              sessionId.value = null
              terminal.value?.write('\r\n\x1b[33m[Session ended]\x1b[0m\r\n')
              break
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err)
        }
      }

      ws.value.onerror = () => {
        error.value = 'WebSocket connection error'
        isConnected.value = false
      }

      ws.value.onclose = () => {
        isConnected.value = false
        // Don't auto-reconnect for terminal - let user explicitly reconnect
      }
    } catch (err) {
      error.value = 'Failed to connect to terminal'
      console.error('Terminal connection error:', err)
    }
  }

  /**
   * Disconnect from terminal
   */
  function disconnect(): void {
    if (ws.value) {
      if (ws.value.readyState === WebSocket.OPEN) {
        ws.value.send(
          JSON.stringify({
            type: 'TERMINAL_DISCONNECT',
          }),
        )
      }
      ws.value.close()
      ws.value = null
    }
    isConnected.value = false
    sessionId.value = null
  }

  /**
   * Fit terminal to container
   */
  function fit(): void {
    if (fitAddon.value) {
      fitAddon.value.fit()
    }
  }

  /**
   * Focus terminal
   */
  function focus(): void {
    terminal.value?.focus()
  }

  /**
   * Clear terminal
   */
  function clear(): void {
    terminal.value?.clear()
  }

  /**
   * Cleanup on unmount
   */
  function cleanup(): void {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    disconnect()
    if (terminal.value) {
      try {
        terminal.value.dispose()
      } catch {
        // Ignore errors when disposing (addon may not be loaded)
      }
      terminal.value = null
    }
    fitAddon.value = null
  }

  // Auto-cleanup on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    terminal,
    isConnected,
    sessionId,
    error,
    initTerminal,
    connect,
    disconnect,
    fit,
    focus,
    clear,
    cleanup,
  }
}
