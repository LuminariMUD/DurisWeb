import { ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'

export type FloatingPanelId = 'chat' | 'affects' | 'room' | 'affectsOnly' | 'group' | 'ship'

const STORAGE_KEY = 'duris_floating_panels'

// global state
const floatingPanels = ref<Record<FloatingPanelId, boolean>>({
  chat: false,
  affects: false,
  room: false,
  affectsOnly: false,
  group: false,
  ship: false,
})

export function useFloatingPanels() {
  const { accountName } = useAuth()

  function getStorageKey(): string {
    return `${STORAGE_KEY}_${accountName.value?.toLowerCase() || 'default'}`
  }

  function loadState(): void {
    const saved = localStorage.getItem(getStorageKey())
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
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  function saveState(): void {
    localStorage.setItem(getStorageKey(), JSON.stringify(floatingPanels.value))
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

  // load state on account change
  watch(accountName, () => {
    loadState()
  }, { immediate: true })

  return {
    floatingPanels,
    isFloating,
    setFloating,
    toggleFloating,
    loadState,
  }
}
