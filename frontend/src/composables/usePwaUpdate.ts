import { ref, onMounted } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

export function usePwaUpdate() {
  const offlineReady = ref(false)
  const needRefresh = ref(false)

  const {
    offlineReady: swOfflineReady,
    needRefresh: swNeedRefresh,
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      console.log('service worker registered:', swUrl)

      // check for updates every hour
      if (registration) {
        setInterval(() => {
          registration.update()
        }, 60 * 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.error('service worker registration failed:', error)
    },
  })

  onMounted(() => {
    offlineReady.value = swOfflineReady.value
    needRefresh.value = swNeedRefresh.value
  })

  // watch for changes
  const checkForUpdates = () => {
    offlineReady.value = swOfflineReady.value
    needRefresh.value = swNeedRefresh.value
  }

  const updateApp = async () => {
    await updateServiceWorker(true)
  }

  const dismissUpdate = () => {
    needRefresh.value = false
  }

  return {
    offlineReady: swOfflineReady,
    needRefresh: swNeedRefresh,
    updateApp,
    dismissUpdate,
    checkForUpdates,
  }
}
