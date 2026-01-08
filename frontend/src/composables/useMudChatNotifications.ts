import { ref, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useNotifications } from './useNotifications'

export interface MudNotificationSettings {
  tell: boolean
  gcc: boolean
  gsay: boolean
  petition: boolean
  wizmsg: boolean
}

const STORAGE_KEY = 'mud_notification_settings'
const DEFAULT_SETTINGS: MudNotificationSettings = {
  tell: true,
  gcc: true,
  gsay: true,
  petition: true,
  wizmsg: true,
}

// Channel display labels
const CHANNEL_LABELS: Record<string, string> = {
  tell: 'PM',
  gcc: 'Guild',
  gsay: 'Group',
  petition: 'Petition',
  wizmsg: 'Wizchat',
}

// Singleton state (shared across all instances)
const settings = ref<MudNotificationSettings>(loadSettings())
const lastSeenIds = ref<Record<string, number>>({})
let watcherInitialized = false
let settingsWatcherInitialized = false

function loadSettings(): MudNotificationSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
}

function stripAnsi(text: string): string {
  return text.replace(/&[+n][a-zA-Z]/g, '')
}

export function useMudChatNotifications() {
  const store = useMudStore()
  const { showNotification, hasPermission, requestPermission, isSupported } = useNotifications()

  // Watch settings changes and save to localStorage
  if (!settingsWatcherInitialized) {
    settingsWatcherInitialized = true
    watch(
      settings,
      () => {
        saveSettings()
      },
      { deep: true }
    )
  }

  // Initialize watcher only once
  if (!watcherInitialized) {
    watcherInitialized = true

    // Watch for new messages and show notifications
    watch(
      () => store.chatMessages,
      (messages) => {
        // Check each notification-enabled channel
        for (const [channel, enabled] of Object.entries(settings.value)) {
          if (!enabled) continue

          const channelMessages = messages[channel]
          if (!channelMessages?.length) continue

          const lastMsg = channelMessages[channelMessages.length - 1]
          if (!lastMsg) continue

          const lastSeenId = lastSeenIds.value[channel] || 0

          // Only notify if new message AND tab is not focused
          if (lastMsg.id > lastSeenId) {
            lastSeenIds.value[channel] = lastMsg.id

            if (document.hidden) {
              showMudNotification(channel, lastMsg.sender, lastMsg.text)
            }
          }
        }
      },
      { deep: true }
    )
  }

  function showMudNotification(channel: string, sender: string, text: string) {
    const label = CHANNEL_LABELS[channel] || channel
    const cleanText = stripAnsi(text)

    showNotification({
      title: `[${label}] ${sender}`,
      body: cleanText,
      tag: `mud-${channel}-${Date.now()}`,
      sound: true,
    })
  }

  function updateSetting(channel: keyof MudNotificationSettings, value: boolean) {
    settings.value[channel] = value
    saveSettings()
  }

  return {
    settings,
    updateSetting,
    hasPermission,
    requestPermission,
    isSupported,
  }
}
