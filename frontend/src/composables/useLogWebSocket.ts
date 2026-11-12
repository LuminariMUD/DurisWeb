import { ref, onUnmounted, watch, type Ref } from 'vue'
import { useWebSocket } from './useWebSocket'

export interface LogUpdateEvent {
  type: 'LOG_UPDATE'
  category: 'runtime' | 'player'
  logName: string
  newLines: string[]
}

/**
 * Composable for real-time log updates via WebSocket
 */
export function useLogWebSocket(
  category: Ref<'runtime' | 'player' | null>,
  logName: Ref<string | null>,
  enabled: Ref<boolean>,
) {
  const { socket, isConnected, sendMessage, getSubscriptionToken } = useWebSocket()
  const newLines = ref<string[]>([])
  const isSubscribed = ref(false)

  // Store cleanup function for proper unmount handling
  let messageCleanup: (() => void) | null = null

  // Subscribe to log updates; the server requires a short-lived websocket capability.
  async function subscribe() {
    const cat = category.value
    const log = logName.value
    if (!isConnected.value || !cat || !log) {
      console.warn('Cannot subscribe: not connected or missing log info')
      return
    }

    isSubscribed.value = true
    const token = await getSubscriptionToken()
    // The selection may have changed, or been unsubscribed, while the token was fetched.
    if (!isSubscribed.value || cat !== category.value || log !== logName.value) return
    if (!token) {
      isSubscribed.value = false
      return
    }

    sendMessage({ type: 'SUBSCRIBE_LOG', token, category: cat, logName: log })
    console.log(`📡 Subscribed to log: ${cat}/${log}`)
  }

  // Unsubscribe from log updates
  function unsubscribe() {
    if (!isConnected.value || !category.value || !logName.value) {
      return
    }

    sendMessage({
      type: 'UNSUBSCRIBE_LOG',
      category: category.value,
      logName: logName.value,
    })

    isSubscribed.value = false
    newLines.value = []
    console.log(`📡 Unsubscribed from log: ${category.value}/${logName.value}`)
  }

  // Listen for log updates
  watch(socket, (ws, _oldWs, onCleanup) => {
    // Clean up previous listener if any
    if (messageCleanup) {
      messageCleanup()
      messageCleanup = null
    }

    if (!ws) return

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)

        // Handle log update
        if (data.type === 'LOG_UPDATE') {
          const logUpdate = data as LogUpdateEvent

          // Only process if it's for our subscribed log
          if (logUpdate.category === category.value && logUpdate.logName === logName.value) {
            newLines.value = logUpdate.newLines
            console.log(`📰 Received ${logUpdate.newLines.length} new log lines`)
          }
        }

        // Handle subscription confirmation
        if (data.type === 'LOG_SUBSCRIBED') {
          if (data.category === category.value && data.logName === logName.value) {
            console.log(`✅ Log subscription confirmed: ${data.category}/${data.logName}`)
          }
        }

        // Handle unsubscription confirmation
        if (data.type === 'LOG_UNSUBSCRIBED') {
          if (data.category === category.value && data.logName === logName.value) {
            console.log(`✅ Log unsubscription confirmed: ${data.category}/${data.logName}`)
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }

    ws.addEventListener('message', handleMessage)

    // Store cleanup function for unmount
    messageCleanup = () => {
      ws.removeEventListener('message', handleMessage)
    }

    // Use Vue's onCleanup for watch invalidation
    onCleanup(() => {
      if (messageCleanup) {
        messageCleanup()
        messageCleanup = null
      }
    })
  })

  // Watch for changes in subscription state
  watch(
    [isConnected, category, logName, enabled],
    ([connected, cat, log, shouldSubscribe]) => {
      if (connected && cat && log && shouldSubscribe) {
        void subscribe()
      } else if (isSubscribed.value) {
        unsubscribe()
      }
    },
    { immediate: true },
  )

  // Cleanup on unmount
  onUnmounted(() => {
    if (isSubscribed.value) {
      unsubscribe()
    }
    // Clean up message listener
    if (messageCleanup) {
      messageCleanup()
      messageCleanup = null
    }
  })

  return {
    newLines,
    isSubscribed,
    subscribe,
    unsubscribe,
  }
}
