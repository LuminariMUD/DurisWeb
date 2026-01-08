import { ref, onMounted, onUnmounted } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa_install_dismissed_at'
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds

export function useInstallPrompt() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
  const canInstall = ref(false)
  const isInstalled = ref(false)

  // check if app is already installed
  const checkInstalled = () => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      isInstalled.value = true
      return true
    }
    // ios safari check
    if ((navigator as any).standalone === true) {
      isInstalled.value = true
      return true
    }
    return false
  }

  // check if banner was dismissed recently
  const wasDismissedRecently = () => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (!dismissedAt) return false

    const dismissedTime = parseInt(dismissedAt, 10)
    const now = Date.now()

    // if 7 days have passed, clear the dismissal
    if (now - dismissedTime > DISMISS_DURATION) {
      localStorage.removeItem(DISMISS_KEY)
      return false
    }

    return true
  }

  // handle the beforeinstallprompt event
  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent

    // only show if not installed and not recently dismissed
    if (!checkInstalled() && !wasDismissedRecently()) {
      canInstall.value = true
    }
  }

  // handle app installed event
  const handleAppInstalled = () => {
    isInstalled.value = true
    canInstall.value = false
    deferredPrompt.value = null
    localStorage.removeItem(DISMISS_KEY)
  }

  // install the app
  const install = async () => {
    if (!deferredPrompt.value) return false

    await deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice

    if (outcome === 'accepted') {
      isInstalled.value = true
      canInstall.value = false
    }

    deferredPrompt.value = null
    return outcome === 'accepted'
  }

  // dismiss the banner (for 7 days)
  const dismiss = () => {
    canInstall.value = false
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
  }

  onMounted(() => {
    checkInstalled()

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
  })

  return {
    canInstall,
    isInstalled,
    install,
    dismiss,
  }
}
