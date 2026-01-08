import { ref, watch } from 'vue'

export interface FontSettings {
  fontFamily: string
  fontSize: string
  lineHeight: string
}

export interface FontOption {
  label: string
  value: string
}

const STORAGE_KEY = 'mud_font_settings'

export const FONT_FAMILIES: FontOption[] = [
  // monospace
  { label: 'System Mono', value: 'monospace' },
  { label: 'Terminal', value: 'Terminal, monospace' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Consolas', value: 'Consolas, monospace' },
  // sans-serif
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  // serif
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  // fun
  { label: 'Comic Sans', value: '"Comic Sans MS", cursive' },
]

export const FONT_SIZES: FontOption[] = [
  { label: '10px', value: '10px' },
  { label: '12px', value: '12px' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
]

export const LINE_HEIGHTS: FontOption[] = [
  { label: 'Compact', value: '1' },
  { label: 'Tight', value: '1.2' },
  { label: 'Normal', value: '1.4' },
  { label: 'Relaxed', value: '1.6' },
  { label: 'Loose', value: '1.8' },
]

const DEFAULT_SETTINGS: FontSettings = {
  fontFamily: 'monospace',
  fontSize: '14',
  lineHeight: '1.4',
}

// singleton state (shared across all instances)
const settings = ref<FontSettings>(loadSettings())
let watcherInitialized = false

function loadSettings(): FontSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings() {
  applyFontSettings()
}

// style element for dynamic font settings
let styleEl: HTMLStyleElement | null = null

function applyFontSettings() {
  // save to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))

  // create or update a style element with high specificity
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'mud-font-settings'
    document.head.appendChild(styleEl)
  }

  styleEl.textContent = `
    .mud-output,
    .mud-output *,
    .mud-output span,
    .mud-output div {
      font-family: ${settings.value.fontFamily} !important;
      font-size: ${settings.value.fontSize}px !important;
      line-height: ${settings.value.lineHeight} !important;
    }
  `
}

// Apply on initial load
applyFontSettings()

export function useFontSettings() {
  // watch settings changes and save to localStorage (backup for v-model inputs)
  if (!watcherInitialized) {
    watcherInitialized = true
    watch(
      settings,
      () => {
        saveSettings()
      },
      { deep: true }
    )
  }

  return {
    settings,
    applyFontSettings,
    FONT_FAMILIES,
    FONT_SIZES,
    LINE_HEIGHTS,
  }
}
