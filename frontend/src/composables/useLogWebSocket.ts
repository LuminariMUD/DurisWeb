import { ref, onScopeDispose, watch, type Ref } from 'vue'
import { useWebSocket } from './useWebSocket'

export const LIVE_LOG_LINE_LIMIT = 500
const LIVE_LOG_CHARACTER_LIMIT = 256 * 1024

export interface LogUpdateEvent {
  type: 'LOG_UPDATE'
  category: 'runtime' | 'player'
  logName: string
  newLines: string[]
}

/** Own one live log subscription on the shared application socket. */
export function useLogWebSocket(
  category: Ref<'runtime' | 'player' | null>,
  logName: Ref<string | null>,
  enabled: Ref<boolean>,
) {
  const { socket, isConnected, sendMessage, getSubscriptionToken } = useWebSocket()
  const newLines = ref<string[]>([])
  const isSubscribed = ref(false)
  let generation = 0
  let disposed = false
  let active: { socket: WebSocket; category: 'runtime' | 'player'; logName: string } | null = null

  function unsubscribe() {
    generation++
    const previous = active
    active = null
    isSubscribed.value = false
    newLines.value = []
    if (
      previous &&
      previous.socket === socket.value &&
      isConnected.value &&
      previous.socket.readyState === WebSocket.OPEN
    ) {
      sendMessage({
        type: 'UNSUBSCRIBE_LOG',
        category: previous.category,
        logName: previous.logName,
      })
    }
  }

  async function subscribe() {
    unsubscribe()
    const target = socket.value
    const cat = category.value
    const log = logName.value
    if (disposed || !enabled.value || !isConnected.value || !target || !cat || !log) return
    const request = generation
    const token = await getSubscriptionToken()
    if (
      disposed ||
      request !== generation ||
      target !== socket.value ||
      target.readyState !== WebSocket.OPEN ||
      !isConnected.value ||
      !enabled.value ||
      cat !== category.value ||
      log !== logName.value ||
      !token
    )
      return
    active = { socket: target, category: cat, logName: log }
    sendMessage({ type: 'SUBSCRIBE_LOG', token, category: cat, logName: log })
  }

  watch(
    socket,
    (ws, _previous, onCleanup) => {
      if (!ws) return
      const handleMessage = (event: MessageEvent) => {
        let data: unknown
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }
        if (
          !data ||
          typeof data !== 'object' ||
          !('type' in data) ||
          !('category' in data) ||
          !('logName' in data) ||
          !active ||
          active.socket !== ws ||
          ws !== socket.value ||
          !enabled.value ||
          !isConnected.value ||
          data.category !== active.category ||
          data.logName !== active.logName
        )
          return
        if (data.type === 'LOG_SUBSCRIBED') {
          isSubscribed.value = true
        } else if (data.type === 'ERROR') {
          // Keep ownership until local cancellation: an older same-log error can precede
          // the acknowledgement of a newer request on this ordered socket.
          isSubscribed.value = false
          newLines.value = []
        } else if (
          data.type === 'LOG_UPDATE' &&
          isSubscribed.value &&
          'newLines' in data &&
          Array.isArray(data.newLines) &&
          data.newLines.every((line: unknown) => typeof line === 'string')
        ) {
          const combined = [...newLines.value, ...data.newLines]
          let start = Math.max(0, combined.length - LIVE_LOG_LINE_LIMIT)
          let characters = 0
          for (let index = combined.length - 1; index >= start; index--) {
            characters += combined[index].length
            if (characters > LIVE_LOG_CHARACTER_LIMIT) {
              start = index + 1
              break
            }
          }
          newLines.value = combined.slice(start)
        }
      }
      ws.addEventListener('message', handleMessage)
      onCleanup(() => ws.removeEventListener('message', handleMessage))
    },
    { immediate: true },
  )

  watch(
    [isConnected, socket, category, logName, enabled],
    () => {
      if (isConnected.value && enabled.value && category.value && logName.value && socket.value)
        void subscribe()
      else unsubscribe()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    disposed = true
    unsubscribe()
  })

  return { newLines, isSubscribed, subscribe, unsubscribe }
}
