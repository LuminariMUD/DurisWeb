import { computed, watch, ref } from 'vue'
import { useOnline, useEventListener } from '@vueuse/core'

export function useOfflineStatus() {
  const isOnline = useOnline()
  const isOffline = computed(() => !isOnline.value)
  const wasOffline = ref(false)
  const justCameOnline = ref(false)

  // track when user comes back online
  watch(isOnline, (online, wasOnline) => {
    if (online && !wasOnline) {
      justCameOnline.value = true
      // reset after 3 seconds
      setTimeout(() => {
        justCameOnline.value = false
      }, 3000)
    }
    if (!online) {
      wasOffline.value = true
    }
  })

  // listen for online/offline events with callbacks
  const onOffline = (callback: () => void) => {
    useEventListener(window, 'offline', callback)
  }

  const onOnline = (callback: () => void) => {
    useEventListener(window, 'online', callback)
  }

  return {
    isOnline,
    isOffline,
    wasOffline,
    justCameOnline,
    onOffline,
    onOnline,
  }
}
