import { ref, computed, onMounted } from 'vue'
import { apiClient } from '@/services/api'

const PUSH_ENABLED_KEY = 'push_notifications_enabled'

// shared state across all instances
const vapidPublicKey = ref<string | null>(null)
const isSupported = ref(false)
const isSubscribed = ref(false)
const isInitialized = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

export function usePushNotification() {
  // check if push notifications are supported
  const checkSupport = () => {
    isSupported.value = 'serviceWorker' in navigator && 'PushManager' in window
    return isSupported.value
  }

  // fetch vapid public key from server
  const fetchVapidKey = async () => {
    try {
      const response = await apiClient.get('/push/vapid-public-key')
      if (response.data.enabled && response.data.publicKey) {
        vapidPublicKey.value = response.data.publicKey
        return true
      }
      return false
    } catch (err) {
      console.warn('[PushNotification] failed to fetch vapid key:', err)
      return false
    }
  }

  // check if currently subscribed
  const checkSubscription = async () => {
    if (!isSupported.value) return false

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      isSubscribed.value = !!subscription
      return isSubscribed.value
    } catch (err) {
      console.error('[PushNotification] failed to check subscription:', err)
      return false
    }
  }

  // subscribe to push notifications
  const subscribe = async () => {
    if (!isSupported.value || !vapidPublicKey.value) {
      error.value = 'push notifications not supported'
      return false
    }

    isLoading.value = true
    error.value = null

    try {
      const registration = await navigator.serviceWorker.ready

      // request notification permission if needed
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        error.value = 'notification permission denied'
        return false
      }

      // subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey.value) as BufferSource,
      })

      // send subscription to server
      await apiClient.post('/push/subscribe', {
        subscription: subscription.toJSON(),
      })

      isSubscribed.value = true
      localStorage.setItem(PUSH_ENABLED_KEY, 'true')
      return true
    } catch (err: any) {
      console.error('[PushNotification] failed to subscribe:', err)
      error.value = err.message || 'failed to subscribe'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // unsubscribe from push notifications
  const unsubscribe = async () => {
    if (!isSupported.value) return false

    isLoading.value = true
    error.value = null

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        // unsubscribe from server
        await apiClient.post('/push/unsubscribe', {
          endpoint: subscription.endpoint,
        })

        // unsubscribe from push manager
        await subscription.unsubscribe()
      }

      isSubscribed.value = false
      localStorage.removeItem(PUSH_ENABLED_KEY)
      return true
    } catch (err: any) {
      console.error('[PushNotification] failed to unsubscribe:', err)
      error.value = err.message || 'failed to unsubscribe'
      return false
    } finally {
      isLoading.value = false
    }
  }

  // toggle subscription
  const toggle = async () => {
    if (isSubscribed.value) {
      return unsubscribe()
    } else {
      return subscribe()
    }
  }

  // initialize
  const initialize = async () => {
    isInitialized.value = false
    error.value = null

    try {
      checkSupport()

      if (!isSupported.value) return

      await fetchVapidKey()
      await checkSubscription()
    } finally {
      isInitialized.value = true
    }
  }

  // convert base64 to Uint8Array for VAPID key
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  // auto-initialize on mount
  onMounted(() => {
    initialize()
  })

  return {
    isSupported: computed(() => isSupported.value),
    isSubscribed: computed(() => isSubscribed.value),
    isInitialized: computed(() => isInitialized.value),
    isLoading: computed(() => isLoading.value),
    isEnabled: computed(() => vapidPublicKey.value !== null),
    error: computed(() => error.value),
    subscribe,
    unsubscribe,
    toggle,
    initialize,
  }
}
