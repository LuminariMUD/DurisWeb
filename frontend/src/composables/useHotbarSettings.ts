import { ref, computed } from 'vue'
import type { HotbarButton, HotbarSettings, HotbarIconOption } from '@/types/hotbar'

const STORAGE_KEY = 'mud_hotbar_settings'

// curated icon list for game actions
export const HOTBAR_ICONS: HotbarIconOption[] = [
  { name: 'Sword', value: 'Sword' },
  { name: 'Shield', value: 'Shield' },
  { name: 'Heart', value: 'Heart' },
  { name: 'Zap', value: 'Zap' },
  { name: 'Flame', value: 'Flame' },
  { name: 'Snowflake', value: 'Snowflake' },
  { name: 'Eye', value: 'Eye' },
  { name: 'Target', value: 'Target' },
  { name: 'Move', value: 'Move' },
  { name: 'LogOut', value: 'LogOut' },
  { name: 'RefreshCw', value: 'RefreshCw' },
  { name: 'Play', value: 'Play' },
  { name: 'Pause', value: 'Pause' },
  { name: 'SkipForward', value: 'SkipForward' },
  { name: 'Search', value: 'Search' },
  { name: 'Map', value: 'Map' },
  { name: 'Compass', value: 'Compass' },
  { name: 'Users', value: 'Users' },
  { name: 'MessageSquare', value: 'MessageSquare' },
  { name: 'Bell', value: 'Bell' },
  { name: 'Star', value: 'Star' },
  { name: 'Moon', value: 'Moon' },
  { name: 'Sun', value: 'Sun' },
  { name: 'Droplet', value: 'Droplet' },
  { name: 'Wind', value: 'Wind' },
  { name: 'Skull', value: 'Skull' },
  { name: 'Crown', value: 'Crown' },
  { name: 'Footprints', value: 'Footprints' },
  { name: 'Hand', value: 'Hand' },
  { name: 'CircleDot', value: 'CircleDot' },
]

function createDefaultButton(index: number): HotbarButton {
  return {
    id: crypto.randomUUID(),
    icon: 'CircleDot',
    command: '',
    label: `Button ${index + 1}`,
    color: '#6b7280', // gray-500
    enabled: false,
  }
}

// pre-configured default buttons
const DEFAULT_BUTTONS: Omit<HotbarButton, 'id'>[] = [
  { icon: 'Users', command: 'who', label: 'who', color: '#3b82f6', enabled: true }, // blue
  { icon: 'Eye', command: 'scan', label: 'scan', color: '#22c55e', enabled: true }, // green
  { icon: 'LogOut', command: 'exit', label: 'exit', color: '#ef4444', enabled: true }, // red
]

function createDefaultSettings(): HotbarSettings {
  const buttons: HotbarButton[] = DEFAULT_BUTTONS.map((btn, i) => ({
    ...createDefaultButton(i),
    ...btn,
  }))
  // pad to 6 buttons
  while (buttons.length < 6) {
    buttons.push(createDefaultButton(buttons.length))
  }
  return {
    buttons,
    position: { x: 700, y: 100 }, // will be clamped to container on first drag
    snapEdge: 'right',
    orientation: 'auto',
    buttonSize: 'medium',
    visible: true,
  }
}

function loadSettings(): HotbarSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as HotbarSettings
      // ensure all buttons have required fields
      parsed.buttons = parsed.buttons.map((btn, i) => ({
        ...createDefaultButton(i),
        ...btn,
      }))
      return parsed
    }
  } catch (e) {
    console.error('[Hotbar] Failed to load settings:', e)
  }
  return createDefaultSettings()
}

// singleton state
const settings = ref<HotbarSettings>(loadSettings())

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
  } catch (e) {
    console.error('[Hotbar] Failed to save settings:', e)
  }
}

export function useHotbarSettings() {
  const enabledButtons = computed(() => settings.value.buttons.filter((b) => b.enabled && b.command))

  const isVertical = computed(() => {
    if (settings.value.orientation === 'vertical') return true
    if (settings.value.orientation === 'horizontal') return false
    // auto: based on snap edge
    return settings.value.snapEdge === 'left' || settings.value.snapEdge === 'right'
  })

  function updateButton(id: string, updates: Partial<HotbarButton>) {
    const index = settings.value.buttons.findIndex((b) => b.id === id)
    const existing = settings.value.buttons[index]
    if (index !== -1 && existing) {
      settings.value.buttons[index] = {
        ...existing,
        ...updates,
      }
      saveSettings()
    }
  }

  function setButtonCount(count: number) {
    const currentCount = settings.value.buttons.length
    if (count > currentCount) {
      // add more buttons
      for (let i = currentCount; i < count; i++) {
        settings.value.buttons.push(createDefaultButton(i))
      }
    } else if (count < currentCount) {
      // remove buttons from end
      settings.value.buttons = settings.value.buttons.slice(0, count)
    }
    saveSettings()
  }

  function setPosition(x: number, y: number) {
    settings.value.position = { x, y }
    // note: don't call saveSettings() here - it's called in endDrag() to avoid excessive writes during drag
  }

  function setSnapEdge(edge: HotbarSettings['snapEdge']) {
    settings.value.snapEdge = edge
    saveSettings()
  }

  function setVisible(visible: boolean) {
    settings.value.visible = visible
    saveSettings()
  }

  function setOrientation(orientation: HotbarSettings['orientation']) {
    settings.value.orientation = orientation
    saveSettings()
  }

  function setButtonSize(size: HotbarSettings['buttonSize']) {
    settings.value.buttonSize = size
    saveSettings()
  }

  function resetPosition() {
    settings.value.position = { x: window.innerWidth - 300, y: window.innerHeight - 80 }
    settings.value.snapEdge = 'bottom'
    saveSettings()
  }

  return {
    settings,
    enabledButtons,
    isVertical,
    updateButton,
    setButtonCount,
    setPosition,
    setSnapEdge,
    setVisible,
    setOrientation,
    setButtonSize,
    resetPosition,
    saveSettings,
    HOTBAR_ICONS,
  }
}
