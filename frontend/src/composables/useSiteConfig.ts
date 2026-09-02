import { ref, computed } from 'vue'
import { getSiteConfig } from '@/services/api'
import type { SiteConfig } from '@/types'

// Global site config state (shared across all components)
const config = ref<SiteConfig | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const isLoaded = ref(false)
let loadPromise: Promise<void> | null = null

const REQUIRED_STRING_KEYS = [
  'siteTitle',
  'siteLogoUrl',
  'supportUrl',
  'mudHost',
  'mudPort',
  'mudPortTls',
  'mudWsUrl',
  'frontPageHeroTitle',
  'frontPageHeroSubtitle',
  'frontPageHeroImageUrl',
  'frontPageContent',
] as const satisfies readonly (keyof SiteConfig)[]

export function parseSiteConfig(value: unknown): SiteConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Site configuration response must be an object')
  }
  const record = value as Record<string, unknown>
  const missing: string[] = REQUIRED_STRING_KEYS.filter((key) => typeof record[key] !== 'string')
  if (typeof record.frontPageHeroEnabled !== 'boolean') missing.push('frontPageHeroEnabled')
  if (missing.length > 0) {
    throw new Error(`Site configuration response is incomplete: ${missing.join(', ')}`)
  }
  for (const key of ['mudPort'] as const) {
    const port = String(record[key])
    const parsed = Number(port)
    if (!/^\d+$/.test(port) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
      throw new Error(`Site configuration response contains an invalid ${key}`)
    }
  }
  const tlsPort = String(record.mudPortTls)
  if (tlsPort) {
    const parsed = Number(tlsPort)
    if (!/^\d+$/.test(tlsPort) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
      throw new Error('Site configuration response contains an invalid mudPortTls')
    }
  }
  const mudWsUrl = String(record.mudWsUrl)
  try {
    const parsed = new URL(mudWsUrl)
    if (!['ws:', 'wss:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('invalid')
    }
  } catch {
    throw new Error('Site configuration response contains an invalid mudWsUrl')
  }
  return {
    siteTitle: String(record.siteTitle),
    siteLogoUrl: String(record.siteLogoUrl),
    supportUrl: String(record.supportUrl),
    mudHost: String(record.mudHost),
    mudPort: String(record.mudPort),
    mudPortTls: String(record.mudPortTls),
    mudWsUrl,
    frontPageHeroEnabled: record.frontPageHeroEnabled === true,
    frontPageHeroTitle: String(record.frontPageHeroTitle),
    frontPageHeroSubtitle: String(record.frontPageHeroSubtitle),
    frontPageHeroImageUrl: String(record.frontPageHeroImageUrl),
    frontPageContent: String(record.frontPageContent),
  }
}

export function useSiteConfig() {
  const isAvailable = computed(() => config.value !== null && error.value === null)
  const siteTitle = computed(() => config.value?.siteTitle ?? '')
  const siteLogoUrl = computed(() => config.value?.siteLogoUrl ?? '')
  const supportUrl = computed(() => config.value?.supportUrl ?? '')
  const mudHost = computed(() => config.value?.mudHost ?? '')
  const mudPort = computed(() => config.value?.mudPort ?? '')
  const mudPortTls = computed(() => config.value?.mudPortTls ?? '')
  const configuredMudWsUrl = computed(() => config.value?.mudWsUrl ?? '')

  // Full MUD address for display
  const mudAddress = computed(() =>
    config.value ? `${config.value.mudHost}:${config.value.mudPort}` : '',
  )

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

  // The configured endpoint is exact; only an explicit user proxy can override it.
  const mudWsUrl = computed(() => {
    if (!config.value) return null
    const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'

    // check user's proxy settings from localStorage
    const proxy = getUserProxySettings()
    if (proxy.enabled && proxy.host) {
      const protocol = isSecure ? 'wss' : 'ws'
      const port = proxy.port ? `:${proxy.port}` : ''
      return `${protocol}://${proxy.host}${port}`
    }

    return configuredMudWsUrl.value
  })

  // Front page computed properties
  const frontPageHeroEnabled = computed(() => config.value?.frontPageHeroEnabled ?? false)
  const frontPageHeroTitle = computed(() => config.value?.frontPageHeroTitle ?? '')
  const frontPageHeroSubtitle = computed(() => config.value?.frontPageHeroSubtitle ?? '')
  const frontPageHeroImageUrl = computed(() => config.value?.frontPageHeroImageUrl ?? '')
  const frontPageContent = computed(() => config.value?.frontPageContent ?? '')

  /**
   * Load site configuration from API
   * A failed or incomplete response leaves the site in an explicit unavailable state.
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
        config.value = parseSiteConfig(await getSiteConfig())
      } catch {
        config.value = null
        error.value = 'Site configuration is unavailable. Retry after the server is configured.'
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
    isAvailable,
    // Computed
    siteTitle,
    siteLogoUrl,
    supportUrl,
    mudHost,
    mudPort,
    mudPortTls,
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

export function resetSiteConfigForTests(): void {
  config.value = null
  isLoading.value = false
  error.value = null
  isLoaded.value = false
  loadPromise = null
}
