import { ref, computed } from 'vue'
import type { ChatWindowState, ChatWindowType } from '@/types/chat'
import { CHANNEL_KEYS } from '@/types/chat'

// global state (shared across components)
const openWindows = ref<ChatWindowState[]>([])

// configuration
const MAX_WINDOWS = 5
const WINDOW_WIDTH = 280
const WINDOW_HEIGHT_MINIMIZED = 32 // header bar only
const WINDOW_HEIGHT_EXPANDED = 320 // full window height
const STACK_GAP = 4
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

    // if opening expanded, minimize all other windows first
    if (!minimized) {
      openWindows.value.forEach((w) => {
        w.isMinimized = true
      })
    }

    if (existingIndex !== -1) {
      // window exists - bring to front and set state
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
      // remove the oldest window
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
   * bring window to front and expand (minimize all others)
   */
  function focusWindow(playerName: string, windowType: ChatWindowType = 'player'): void {
    const windowKey = getWindowKey(playerName, windowType)
    const index = openWindows.value.findIndex(
      (w) => getWindowKey(w.playerName, w.windowType) === windowKey
    )
    if (index >= 0) {
      // minimize all other windows first
      openWindows.value.forEach((w, i) => {
        if (i !== index) {
          w.isMinimized = true
        }
      })
      // expand the focused window and move to front
      const window = openWindows.value.splice(index, 1)[0]!
      openWindows.value.unshift({
        id: window.id,
        playerName: window.playerName,
        windowType: window.windowType,
        isMinimized: false,
        unreadCount: 0,
      })
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
   * calculate CSS bottom position for window at given index
   * windows stack vertically from bottom - index 0 is at bottom
   */
  function getWindowPosition(index: number): { bottom: number; right: number } {
    let bottom = BASE_OFFSET
    // stack windows from bottom up - calculate cumulative height of windows below this one
    for (let i = 0; i < index; i++) {
      const w = openWindows.value[i]
      if (w) {
        bottom += (w.isMinimized ? WINDOW_HEIGHT_MINIMIZED : WINDOW_HEIGHT_EXPANDED) + STACK_GAP
      }
    }
    return { bottom, right: BASE_OFFSET }
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
    WINDOW_HEIGHT_MINIMIZED,
    WINDOW_HEIGHT_EXPANDED,
  }
}
