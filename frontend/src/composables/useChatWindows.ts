import { ref, computed } from 'vue'
import type { ChatWindowState, ChatWindowType } from '@/types/chat'
import { CHANNEL_KEYS } from '@/types/chat'

// global state (shared across components)
const openWindows = ref<ChatWindowState[]>([])

// configuration
const MAX_WINDOWS = 3
const WINDOW_WIDTH = 280
const WINDOW_GAP = 4
const BASE_OFFSET = 8

export function useChatWindows() {
  // =========================================================================
  // window management
  // =========================================================================

  /**
   * get window key for comparison (handles channel windows)
   */
  function getWindowKey(playerName: string, windowType: ChatWindowType): string {
    if (windowType === 'group') return CHANNEL_KEYS.group
    if (windowType === 'guild') return CHANNEL_KEYS.guild
    return playerName.toLowerCase()
  }

  /**
   * open or focus a chat window for a player or channel
   */
  function openWindow(playerName: string, windowType: ChatWindowType = 'player', minimized = false): void {
    const windowKey = getWindowKey(playerName, windowType)
    const existingIndex = openWindows.value.findIndex(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )

    if (existingIndex !== -1) {
      // window exists - bring to front (rightmost) and expand if minimized
      const window = openWindows.value[existingIndex]!
      openWindows.value.splice(existingIndex, 1)
      openWindows.value.unshift({
        id: window.id,
        playerName: window.playerName,
        windowType: window.windowType,
        isMinimized: minimized,
        unreadCount: minimized ? window.unreadCount : 0,
      })
      return
    }

    // create new window
    if (openWindows.value.length >= MAX_WINDOWS) {
      // remove the oldest (leftmost) window
      openWindows.value.pop()
    }

    openWindows.value.unshift({
      id: crypto.randomUUID(),
      playerName: playerName,
      windowType: windowType,
      isMinimized: minimized,
      unreadCount: 0,
    })
  }

  /**
   * open a window minimized for incoming message (auto-popup)
   */
  function openWindowMinimized(playerName: string, windowType: ChatWindowType = 'player'): void {
    const windowKey = getWindowKey(playerName, windowType)
    const exists = openWindows.value.some(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )

    if (exists) {
      // already open, don't change its state
      return
    }

    // create new minimized window
    if (openWindows.value.length >= MAX_WINDOWS) {
      openWindows.value.pop()
    }

    openWindows.value.unshift({
      id: crypto.randomUUID(),
      playerName: playerName,
      windowType: windowType,
      isMinimized: true,
      unreadCount: 1,
    })
  }

  /**
   * close a chat window
   */
  function closeWindow(playerName: string, windowType: ChatWindowType = 'player'): void {
    const windowKey = getWindowKey(playerName, windowType)
    const index = openWindows.value.findIndex(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )
    if (index !== -1) {
      openWindows.value.splice(index, 1)
    }
  }

  /**
   * toggle minimize state of a window
   */
  function minimizeWindow(playerName: string, windowType: ChatWindowType = 'player'): void {
    const windowKey = getWindowKey(playerName, windowType)
    const window = openWindows.value.find(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )
    if (window) {
      window.isMinimized = !window.isMinimized
      if (!window.isMinimized) {
        window.unreadCount = 0
      }
    }
  }

  /**
   * bring window to front (rightmost position)
   */
  function focusWindow(playerName: string, windowType: ChatWindowType = 'player'): void {
    const windowKey = getWindowKey(playerName, windowType)
    const index = openWindows.value.findIndex(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )
    if (index > 0) {
      const window = openWindows.value.splice(index, 1)[0]!
      openWindows.value.unshift({
        id: window.id,
        playerName: window.playerName,
        windowType: window.windowType,
        isMinimized: false,
        unreadCount: 0,
      })
    } else if (index === 0 && openWindows.value[0]) {
      // already at front, just expand
      openWindows.value[0].isMinimized = false
      openWindows.value[0].unreadCount = 0
    }
  }

  /**
   * clear unread count
   */
  function markAsRead(playerName: string, windowType: ChatWindowType = 'player'): void {
    const windowKey = getWindowKey(playerName, windowType)
    const window = openWindows.value.find(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )
    if (window) {
      window.unreadCount = 0
    }
  }

  /**
   * increment unread count
   */
  function incrementUnread(playerName: string, windowType: ChatWindowType = 'player'): void {
    const windowKey = getWindowKey(playerName, windowType)
    const window = openWindows.value.find(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )
    if (window) {
      window.unreadCount++
    }
  }

  /**
   * check if window is open for player/channel
   */
  function isWindowOpen(playerName: string, windowType: ChatWindowType = 'player'): boolean {
    const windowKey = getWindowKey(playerName, windowType)
    return openWindows.value.some(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )
  }

  /**
   * get window state for player/channel
   */
  function getWindow(playerName: string, windowType: ChatWindowType = 'player'): ChatWindowState | undefined {
    const windowKey = getWindowKey(playerName, windowType)
    return openWindows.value.find(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )
  }

  // =========================================================================
  // positioning
  // =========================================================================

  /**
   * calculate CSS right position for window at given index
   * index 0 = rightmost window
   */
  function getWindowPosition(index: number): number {
    return BASE_OFFSET + index * (WINDOW_WIDTH + WINDOW_GAP)
  }

  // =========================================================================
  // computed
  // =========================================================================

  const windowCount = computed(() => openWindows.value.length)

  return {
    // state
    openWindows,

    // window management
    openWindow,
    openWindowMinimized,
    closeWindow,
    minimizeWindow,
    focusWindow,
    markAsRead,
    incrementUnread,
    isWindowOpen,
    getWindow,

    // positioning
    getWindowPosition,

    // computed
    windowCount,

    // config
    WINDOW_WIDTH,
  }
}
