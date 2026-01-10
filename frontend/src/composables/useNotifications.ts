import { ref, onMounted } from 'vue'
import { stripAnsiCodes } from '@/utils/ansiParser'

export interface NotificationOptions {
  title: string
  body: string
  icon?: string
  tag?: string
  data?: any
  sound?: boolean
}

const hasPermission = ref(false)
const permissionState = ref<NotificationPermission>('default')
const isSupported = ref(false)
const isEnabled = ref(true) // User preference to show/hide notifications

export function useNotifications() {
  // Check if browser supports notifications
  const checkSupport = () => {
    isSupported.value = 'Notification' in window
    if (isSupported.value) {
      permissionState.value = Notification.permission
      hasPermission.value = Notification.permission === 'granted'

      // Load user preference from localStorage
      const savedPreference = localStorage.getItem('notifications_enabled')
      isEnabled.value = savedPreference !== 'false' // Default to true
    }
  }

  // Toggle notifications on/off
  const toggleNotifications = () => {
    isEnabled.value = !isEnabled.value
    localStorage.setItem('notifications_enabled', String(isEnabled.value))
    return isEnabled.value
  }

  // Request notification permission
  const requestPermission = async (): Promise<NotificationPermission> => {
    if (!isSupported.value) {
      return 'denied'
    }

    if (permissionState.value === 'granted') {
      return 'granted'
    }

    try {
      const permission = await Notification.requestPermission()
      permissionState.value = permission
      hasPermission.value = permission === 'granted'

      // Store permission preference
      localStorage.setItem('notification_permission_requested', 'true')

      return permission
    } catch {
      return 'denied'
    }
  }

  // Show browser notification
  const showNotification = (options: NotificationOptions) => {
    if (!isSupported.value || !hasPermission.value || !isEnabled.value) {
      return null
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        data: options.data,
      })

      // Play sound if requested
      if (options.sound !== false) {
        playNotificationSound()
      }

      // Handle notification click
      notification.onclick = (event) => {
        event.preventDefault()
        window.focus()

        // Navigate to battle detail if data contains eventId
        if (options.data?.eventId) {
          window.location.href = `/pvp/battle/${options.data.eventId}`
        }

        notification.close()
      }

      return notification
    } catch {
      return null
    }
  }

  // Play notification sound
  const playNotificationSound = () => {
    try {
      // Try to load custom sound file first
      const audio = new Audio('/sounds/notification.mp3')
      audio.volume = 0.5 // Set to 50% volume
      audio.play().catch(() => {
        // If file doesn't exist or autoplay is blocked, use Web Audio API beep
        playBeepSound()
      })
    } catch {
      // Fallback to Web Audio API beep
      playBeepSound()
    }
  }

  // Generate beep sound using Web Audio API (fallback)
  const playBeepSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return

      const audioContext = new AudioContextClass()

      // Check if context is suspended (requires user gesture)
      if (audioContext.state === 'suspended') {
        audioContext.close()
        return
      }

      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      gainNode.gain.value = 0.2

      oscillator.start()

      setTimeout(() => {
        oscillator.frequency.value = 600
      }, 100)

      oscillator.stop(audioContext.currentTime + 0.25)
    } catch {
      // Silently ignore audio errors
    }
  }

  // Show PvP event notification
  const showPvPNotification = (event: {
    id: number
    killers: string
    victims: string
    room_name: string
  }) => {
    // Strip ANSI codes for notification body (browser notifications don't support HTML)
    const killers = stripAnsiCodes(event.killers || 'Unknown')
    const victims = stripAnsiCodes(event.victims || 'Unknown')
    const location = stripAnsiCodes(event.room_name || 'Unknown location')

    const body = `${killers} vs ${victims}\nat ${location}`

    return showNotification({
      title: '⚔️ New PvP Battle!',
      body,
      tag: `pvp-${event.id}`, // Prevent duplicate notifications
      data: { eventId: event.id },
      sound: true,
    })
  }

  // Show incident notification (crash, reboot, shutdown, etc.)
  const showCrashNotification = (incident: {
    id: number
    incident_type: string
    severity?: string
    exit_code?: number | null
    shutdown_reason?: string | null
    crash_function?: string | null
    crash_file?: string | null
    crash_line?: number | null
    initiated_by?: string | null
    started_at: string
  }) => {
    // Simple user-friendly messages (don't expose internal details)
    let title = 'NewDuris MUD Status Update'
    let body = ''

    if (incident.incident_type === 'recovery') {
      title = 'NewDuris MUD is Back UP!'
    } else if (incident.incident_type === 'copyover') {
      title = 'NewDuris MUD is Updated!'
      // Show initiated by and reason for planned shutdowns
      const initiatedBy = incident.initiated_by || 'System'
      const reason = incident.shutdown_reason || ''
      body = reason ? `Initiated by ${initiatedBy}: ${reason}` : `Initiated by ${initiatedBy}`
    } else if (incident.incident_type === 'reboot') {
      title = 'NewDuris MUD is Rebooting!'
      // Show initiated by and reason for planned shutdowns
      const initiatedBy = incident.initiated_by || 'System'
      const reason = incident.shutdown_reason || ''
      body = reason ? `Initiated by ${initiatedBy}: ${reason}` : `Initiated by ${initiatedBy}`
    } else if (incident.incident_type === 'shutdown') {
      title = 'NewDuris MUD is DOWN'
      // Show initiated by and reason for planned shutdowns
      const initiatedBy = incident.initiated_by || 'System'
      const reason = incident.shutdown_reason || ''
      body = reason ? `Initiated by ${initiatedBy}: ${reason}` : `Initiated by ${initiatedBy}`
    } else if (incident.incident_type === 'crash' || incident.incident_type === 'hung') {
      title = 'NewDuris MUD is DOWN'
      // No details for crashes/hangs
    }

    return showNotification({
      title,
      body,
      tag: `incident-${incident.id}`,
      data: { incidentId: incident.id },
      sound: true,
    })
  }

  // Check if permission was previously requested
  const wasPermissionRequested = () => {
    return localStorage.getItem('notification_permission_requested') === 'true'
  }

  // Initialize on mount
  onMounted(() => {
    checkSupport()
  })

  return {
    isSupported,
    hasPermission,
    permissionState,
    isEnabled,
    requestPermission,
    toggleNotifications,
    showNotification,
    showPvPNotification,
    showCrashNotification,
    wasPermissionRequested,
  }
}
