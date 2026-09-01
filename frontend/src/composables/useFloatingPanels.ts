import { ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'

export type FloatingPanelId = 'chat' | 'affects' | 'room' | 'affectsOnly' | 'group' | 'ship' | 'map'
export type MinimizedPanelId = 'chat' | 'map' | 'affects' | 'room'

const STORAGE_KEY = 'duris_floating_panels'
const STORAGE_KEY_MINIMIZED = 'duris_minimized_panels'

// global state
const floatingPanels = ref<Record<FloatingPanelId, boolean>>({
  chat: false,
  affects: false,
  room: false,
  affectsOnly: false,
  group: false,
  ship: false,
  map: false,
})

const minimizedPanels = ref<Record<MinimizedPanelId, boolean>>({
  chat: false,
  map: false,
  affects: false,
  room: false,
})

// track if state has been loaded for current account
let loadedForAccount: string | null = null
let isLoading = false
let watchersRegistered = false

export function useFloatingPanels() {
  const { accountName } = useAuth()

  function getStorageKey(): string | null {
    // only return valid key if accountName is available
    if (!accountName.value) return null
    return `${STORAGE_KEY}_${accountName.value.toLowerCase()}`
  }

  function getMinimizedStorageKey(): string | null {
    if (!accountName.value) return null
    return `${STORAGE_KEY_MINIMIZED}_${accountName.value.toLowerCase()}`
  }

  function loadState(): void {
    const key = getStorageKey()
    // don't load if no valid key or already loaded for this account
    if (!key || loadedForAccount === accountName.value) return

    isLoading = true

    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        const state = JSON.parse(saved)
        floatingPanels.value = {
          chat: state.chat ?? false,
          affects: state.affects ?? false,
          room: state.room ?? false,
          affectsOnly: state.affectsOnly ?? false,
          group: state.group ?? false,
          ship: state.ship ?? false,
          map: state.map ?? false,
        }
      } catch {
        // ignore parse errors
      }
    } else {
      // no saved state, reset to defaults
      floatingPanels.value = {
        chat: false,
        affects: false,
        room: false,
        affectsOnly: false,
        group: false,
        ship: false,
        map: false,
      }
    }

    // load minimized state
    const minKey = getMinimizedStorageKey()
    if (minKey) {
      const savedMin = localStorage.getItem(minKey)
      if (savedMin) {
        try {
          const state = JSON.parse(savedMin)
          minimizedPanels.value = {
            chat: state.chat ?? false,
            map: state.map ?? false,
            affects: state.affects ?? false,
            room: state.room ?? false,
          }
        } catch {
          // ignore parse errors
        }
      } else {
        // no saved state, reset to defaults
        minimizedPanels.value = {
          chat: false,
          map: false,
          affects: false,
          room: false,
        }
      }
    }

    loadedForAccount = accountName.value
    isLoading = false
  }

  function saveState(): void {
    const key = getStorageKey()
    if (!key) return
    localStorage.setItem(key, JSON.stringify(floatingPanels.value))
  }

  function saveMinimizedState(): void {
    const key = getMinimizedStorageKey()
    if (!key) return
    localStorage.setItem(key, JSON.stringify(minimizedPanels.value))
  }

  function isFloating(panel: FloatingPanelId): boolean {
    return floatingPanels.value[panel]
  }

  function setFloating(panel: FloatingPanelId, floating: boolean): void {
    floatingPanels.value[panel] = floating
    saveState()
  }

  function toggleFloating(panel: FloatingPanelId): void {
    floatingPanels.value[panel] = !floatingPanels.value[panel]
    saveState()
  }

  function isMinimized(panel: MinimizedPanelId): boolean {
    return minimizedPanels.value[panel]
  }

  function setMinimized(panel: MinimizedPanelId, minimized: boolean): void {
    minimizedPanels.value[panel] = minimized
    saveMinimizedState()
  }

  function toggleMinimized(panel: MinimizedPanelId): void {
    minimizedPanels.value[panel] = !minimizedPanels.value[panel]
    saveMinimizedState()
  }

  // register watchers only once (prevents duplicate watchers when multiple components use this)
  if (!watchersRegistered) {
    watchersRegistered = true

    // load state on account change
    watch(
      accountName,
      () => {
        loadState()
      },
      { immediate: true },
    )

    // auto-save when floatingPanels changes (handles v-model updates from FloatingMapWindow)
    watch(
      floatingPanels,
      () => {
        if (!isLoading) saveState()
      },
      { deep: true },
    )

    // auto-save when minimizedPanels changes
    watch(
      minimizedPanels,
      () => {
        if (!isLoading) saveMinimizedState()
      },
      { deep: true },
    )
  }

  return {
    floatingPanels,
    minimizedPanels,
    isFloating,
    setFloating,
    toggleFloating,
    isMinimized,
    setMinimized,
    toggleMinimized,
    loadState,
  }
}
