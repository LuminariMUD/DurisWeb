import { ref, computed } from 'vue'
import { authApi } from '@/services/api'
import type { UserContext, CharacterInfo } from '@/types'

// Global auth state (shared across all components)
const user = ref<UserContext | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const selectedCharacter = ref<CharacterInfo | null>(null)

// MUD credentials storage key (sessionStorage - cleared on tab close)
const MUD_CREDS_KEY = 'mud_session_creds'

export function useAuth() {
  // Computed properties
  const isAuthenticated = computed(() => user.value !== null)
  const accountName = computed(() => user.value?.accountName || null)
  const email = computed(() => user.value?.email || null)
  const avatarUrl = computed(() => user.value?.avatarUrl || null)
  const characters = computed(() => user.value?.characters || [])
  const permissions = computed(() => user.value?.permissions)

  // Role helpers
  const isPlayer = computed(() => permissions.value?.role === 'player')
  const isAvatar = computed(() => permissions.value?.immortalLevel !== null && permissions.value?.immortalLevel !== undefined && permissions.value.immortalLevel >= 57)
  const isImmortal = computed(() => permissions.value?.immortalLevel !== null && permissions.value?.immortalLevel !== undefined && permissions.value.immortalLevel >= 58)
  const isLesserGod = computed(() => permissions.value?.immortalLevel !== null && permissions.value?.immortalLevel !== undefined && permissions.value.immortalLevel >= 59)
  const isGreaterGod = computed(() => permissions.value?.immortalLevel !== null && permissions.value?.immortalLevel !== undefined && permissions.value.immortalLevel >= 60)
  const isForger = computed(() => permissions.value?.immortalLevel !== null && permissions.value?.immortalLevel !== undefined && permissions.value.immortalLevel >= 61)
  const isOverlord = computed(() => permissions.value?.role === 'overlord')

  // Permission helpers
  const canModerate = computed(() => permissions.value?.canModerate || false)
  const canBan = computed(() => permissions.value?.canBan || false)
  const canAccessImmortalForum = computed(() => permissions.value?.canAccessImmortalForum || false)
  const canAccessGodForum = computed(() => permissions.value?.canAccessGodForum || false)
  const canEditPosts = computed(() => permissions.value?.canEditPosts || false)
  const canDeletePosts = computed(() => permissions.value?.canDeletePosts || false)
  const canPinThreads = computed(() => permissions.value?.canPinThreads || false)
  const canLockThreads = computed(() => permissions.value?.canLockThreads || false)

  /**
   * Store MUD credentials in sessionStorage for auto-login
   * Uses base64 encoding for basic obfuscation (not encryption)
   */
  function storeMudCredentials(account: string, password: string): void {
    try {
      const encoded = btoa(JSON.stringify({ a: account, p: password }))
      sessionStorage.setItem(MUD_CREDS_KEY, encoded)
    } catch {
      // Ignore storage errors (e.g., private browsing mode)
    }
  }

  /**
   * Retrieve stored MUD credentials for auto-login
   */
  function getMudCredentials(): { account: string; password: string } | null {
    try {
      const stored = sessionStorage.getItem(MUD_CREDS_KEY)
      if (!stored) return null
      const { a, p } = JSON.parse(atob(stored))
      return { account: a, password: p }
    } catch {
      return null
    }
  }

  /**
   * Clear stored MUD credentials
   */
  function clearMudCredentials(): void {
    try {
      sessionStorage.removeItem(MUD_CREDS_KEY)
    } catch {
      // Ignore errors
    }
  }

  /**
   * Login with MUD credentials
   */
  async function login(username: string, password: string): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const userData = await authApi.login(username, password)
      user.value = userData

      // Store credentials for MUD auto-login
      storeMudCredentials(username, password)

      // Auto-select first active character
      if (userData.characters.length > 0) {
        const activeChar = userData.characters.find((c) => c.active)
        selectedCharacter.value = activeChar ?? userData.characters[0] ?? null
      }

      return true
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Login failed'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Logout
   */
  async function logout(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      await authApi.logout()
      user.value = null
      selectedCharacter.value = null
      // Clear stored MUD credentials
      clearMudCredentials()
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Logout failed'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Refresh access token
   */
  async function refresh(): Promise<boolean> {
    try {
      await authApi.refresh()
      return true
    } catch {
      return false
    }
  }

  /**
   * Load user context (call on app init)
   */
  async function loadUser(): Promise<boolean> {
    isLoading.value = true
    error.value = null

    try {
      const userData = await authApi.getMe()

      if (!userData) {
        user.value = null
        selectedCharacter.value = null
        return false
      }

      user.value = userData

      // Auto-select first active character
      if (userData.characters.length > 0) {
        const activeChar = userData.characters.find((c) => c.active)
        selectedCharacter.value = activeChar ?? userData.characters[0] ?? null
      }

      return true
    } catch (err: any) {
      // Not authenticated (401) is expected, don't treat as error
      if (err.response?.status !== 401) {
        error.value = err.response?.data?.error || 'Failed to load user'
      }
      user.value = null
      selectedCharacter.value = null
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Check authentication status (quick check without loading full profile)
   */
  async function checkAuth(): Promise<boolean> {
    try {
      const status = await authApi.checkAuth()
      return status.authenticated
    } catch {
      return false
    }
  }

  /**
   * Select a character to post as
   */
  function selectCharacter(character: CharacterInfo | null): void {
    selectedCharacter.value = character
  }

  /**
   * Get role display name
   */
  function getRoleDisplayName(): string {
    if (!permissions.value) return 'Player'

    switch (permissions.value.role) {
      case 'overlord':
        return 'Overlord'
      case 'forger':
        return 'Forger'
      case 'greater_god':
        return 'Greater God'
      case 'lesser_god':
        return 'Lesser God'
      case 'immortal':
        return 'Immortal'
      case 'avatar':
        return 'Avatar'
      default:
        return 'Player'
    }
  }

  /**
   * Get role badge color
   */
  function getRoleBadgeColor(): string {
    if (!permissions.value) return 'bg-gray-500'

    switch (permissions.value.role) {
      case 'overlord':
        return 'bg-purple-600'
      case 'forger':
        return 'bg-red-600'
      case 'greater_god':
        return 'bg-yellow-600'
      case 'lesser_god':
        return 'bg-blue-600'
      case 'immortal':
        return 'bg-green-600'
      case 'avatar':
        return 'bg-cyan-600'
      default:
        return 'bg-gray-500'
    }
  }

  /**
   * Check if user has a specific admin permission
   */
  function hasPermission(permissionKey: string): boolean {
    if (!permissions.value) return false
    // Overlords bypass all permission checks
    if (permissions.value.role === 'overlord') return true
    return permissions.value.adminPermissions?.includes(permissionKey) || false
  }

  return {
    // State
    user,
    isLoading,
    error,
    selectedCharacter,

    // Computed
    isAuthenticated,
    accountName,
    email,
    avatarUrl,
    characters,
    permissions,

    // Role checks
    isPlayer,
    isAvatar,
    isImmortal,
    isLesserGod,
    isGreaterGod,
    isForger,
    isOverlord,

    // Permission checks
    canModerate,
    canBan,
    canAccessImmortalForum,
    canAccessGodForum,
    canEditPosts,
    canDeletePosts,
    canPinThreads,
    canLockThreads,

    // Actions
    login,
    logout,
    refresh,
    loadUser,
    checkAuth,
    selectCharacter,

    // MUD credential helpers
    storeMudCredentials,
    getMudCredentials,
    clearMudCredentials,

    // Helpers
    getRoleDisplayName,
    getRoleBadgeColor,
    hasPermission,
  }
}
