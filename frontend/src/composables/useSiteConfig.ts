import { ref, computed } from 'vue'
import { getSiteConfig } from '@/services/api'
import type { SiteConfig } from '@/types'

// Global site config state (shared across all components)
const config = ref<SiteConfig | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const isLoaded = ref(false)
let loadPromise: Promise<void> | null = null

// Default values for when config hasn't loaded yet
// NOTE: These are fallbacks for local development - production values come from database
const defaultConfig: SiteConfig = {
  siteTitle: 'NewDuris',
  siteLogoUrl: '',
  mudHost: 'localhost',
  mudPort: '7777',
  mudPortTls: '7778',
  mudWsPort: '4050',
  // Front page defaults
  frontPageHeroEnabled: true,
  frontPageHeroTitle: 'Welcome to DurisMUD',
  frontPageHeroSubtitle: 'The Premier PvP MUD Since 1994',
  frontPageHeroImageUrl: '',
  frontPageContent: '<p>Welcome to the official DurisMUD website.</p>',
}

export function useSiteConfig() {
  // Computed properties - use nullish coalescing to only fallback when truly undefined/null
  // This ensures empty strings from the database are respected, and settings are used when loaded
  const siteTitle = computed(() => config.value?.siteTitle ?? defaultConfig.siteTitle)
  const siteLogoUrl = computed(() => config.value?.siteLogoUrl ?? defaultConfig.siteLogoUrl)
  const mudHost = computed(() => config.value?.mudHost ?? defaultConfig.mudHost)
  const mudPort = computed(() => config.value?.mudPort ?? defaultConfig.mudPort)
  const mudPortTls = computed(() => config.value?.mudPortTls ?? defaultConfig.mudPortTls)
  const mudWsPort = computed(() => config.value?.mudWsPort ?? defaultConfig.mudWsPort)

  // Full MUD address for display
  const mudAddress = computed(() => `${mudHost.value}:${mudPort.value}`)

  // Get user's proxy settings from localStorage
  function getUserProxySettings(): { enabled: boolean; host: string; port: string } {
    if (typeof window === 'undefined') return { enabled: false, host: '', port: '' }
    try {
      const stored = localStorage.getItem('duris-ws-proxy')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {}
    return { enabled: false, host: '', port: '' }
  }

  // WebSocket URL for MUD client (auto-switch ws/wss based on page protocol)
  const mudWsUrl = computed(() => {
    const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'

    // check user's proxy settings from localStorage
    const proxy = getUserProxySettings()
    if (proxy.enabled && proxy.host) {
      const protocol = isSecure ? 'wss' : 'ws'
      const port = proxy.port ? `:${proxy.port}` : ''
      return `${protocol}://${proxy.host}${port}`
    }

    // default behavior
    if (isSecure) {
      // WSS via NPM proxy on port 443
      return `wss://${mudHost.value}`
    }
    // Local dev: plain ws with explicit port
    return `ws://${mudHost.value}:${mudWsPort.value}`
  })

  // Front page computed properties
  const frontPageHeroEnabled = computed(() => config.value?.frontPageHeroEnabled ?? defaultConfig.frontPageHeroEnabled)
  const frontPageHeroTitle = computed(() => config.value?.frontPageHeroTitle || defaultConfig.frontPageHeroTitle)
  const frontPageHeroSubtitle = computed(() => config.value?.frontPageHeroSubtitle || defaultConfig.frontPageHeroSubtitle)
  const frontPageHeroImageUrl = computed(() => config.value?.frontPageHeroImageUrl || defaultConfig.frontPageHeroImageUrl)
  const frontPageContent = computed(() => config.value?.frontPageContent || defaultConfig.frontPageContent)

  /**
   * Load site configuration from API
   * Fails fast and uses defaults - not critical
   * Returns a promise that resolves when config is loaded (even if called while loading)
   */
  async function loadConfig(): Promise<void> {
    // Already loaded, return immediately
    if (isLoaded.value) return

    // If already loading, wait for the existing load to complete
    if (isLoading.value && loadPromise) {
      return loadPromise
    }

    isLoading.value = true
    error.value = null

    loadPromise = (async () => {
      try {
        config.value = await getSiteConfig()
      } catch {
        // Use defaults on failure
      } finally {
        isLoaded.value = true
        isLoading.value = false
        loadPromise = null
      }
    })()

    return loadPromise
  }

  /**
   * Force reload of site configuration
   * Useful after settings are updated
   */
  async function reloadConfig(): Promise<void> {
    isLoaded.value = false
    await loadConfig()
  }

  return {
    // State
    config,
    isLoading,
    error,
    isLoaded,
    // Computed
    siteTitle,
    siteLogoUrl,
    mudHost,
    mudPort,
    mudPortTls,
    mudWsPort,
    mudAddress,
    mudWsUrl,
    // Front page
    frontPageHeroEnabled,
    frontPageHeroTitle,
    frontPageHeroSubtitle,
    frontPageHeroImageUrl,
    frontPageContent,
    // Actions
    loadConfig,
    reloadConfig,
  }
}
