<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useWebSocket } from './composables/useWebSocket'
import { useToast } from './composables/useToast'
import { useNotifications } from './composables/useNotifications'
import { useAuth } from './composables/useAuth'
import { useMudConnection } from './composables/useMudConnection'
import { useSiteConfig } from './composables/useSiteConfig'
import { useOfflineStatus } from './composables/useOfflineStatus'
import { usePwaUpdate } from './composables/usePwaUpdate'
import { SidebarProvider } from './components/ui/sidebar'
import AppSidebar from './components/layout/AppSidebar.vue'
import InstallBanner from './components/pwa/InstallBanner.vue'
import BottomNavbar from './components/layout/BottomNavbar.vue'
import NewsAnnouncementModal from './components/NewsAnnouncementModal.vue'
import ChangelogBanner from './components/changelog/ChangelogBanner.vue'
import { Toaster } from 'vue-sonner'
import { parseAnsiForVue } from './utils/ansiParser'
import BuilderNotificationBell from './components/builder/BuilderNotificationBell.vue'
import {
  Play,
  User,
  KeyRound,
  LogOut,
  Bell,
  BellOff,
  LogIn,
  Map,
  Layers,
  Package,
  Skull,
  BookOpen,
  FileText,
  ChevronDown,
  BarChart3,
  Trophy,
  Gavel,
  WifiOff,
  RefreshCw,
  X,
  Activity,
  Heart,
  Radio,
} from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// NProgress is initialized automatically when useGlobalProgress is imported

const route = useRoute()
const router = useRouter()

const {
  isConnected,
  onNewEvent,
  onCrashAlert,
  onMudOnline,
  onMudCrash,
  onMudShutdown,
  connect,
  disconnect,
} = useWebSocket()
const { success, successHtml, warning } = useToast()
const {
  loadUser,
  isOverlord,
  isLesserGod,
  permissions,
  isAuthenticated,
  accountName,
  avatarUrl,
  getRoleDisplayName,
  getRoleBadgeColor,
  logout,
  clearMudCredentials,
} = useAuth()
const { disconnect: disconnectMud } = useMudConnection()
const {
  siteTitle,
  siteLogoUrl,
  supportUrl,
  mudHost,
  mudPort,
  mudPortTls,
  isAvailable: isSiteConfigAvailable,
  error: siteConfigError,
  loadConfig,
} = useSiteConfig()

watch(siteTitle, (title) => {
  if (title) document.title = title
})

// pwa and offline status
const { isOffline } = useOfflineStatus()
const { needRefresh, updateApp, dismissUpdate } = usePwaUpdate()

// Check if user has any admin access (for showing Admin link in navbar)
const hasAnyAdminAccess = computed(() => {
  return (
    isOverlord.value || isLesserGod.value || (permissions.value?.adminPermissions?.length ?? 0) > 0
  )
})
const {
  isSupported,
  hasPermission,
  permissionState,
  isEnabled,
  requestPermission,
  toggleNotifications,
  showNotification,
  showPvPNotification,
  showCrashNotification,
} = useNotifications()

// Restore session on mount
onMounted(async () => {
  // Initialize WebSocket connection (singleton - only creates one connection)
  connect()

  // Site configuration failure is exposed by the shared unavailable state.
  loadConfig().catch(() => {})

  // Restore user session from cookies
  await loadUser()
})

// Clean up WebSocket on unmount
onUnmounted(() => {
  disconnect()
})

// Handle notification bell click
const handleNotificationClick = async () => {
  if (!hasPermission.value) {
    // No permission yet - request it
    const permission = await requestPermission()
    if (permission === 'granted') {
      success(
        "Browser notifications enabled! You'll now receive alerts even when the tab is in the background.",
        '🔔 Notifications Enabled',
        5000,
      )
    }
  } else if (permissionState.value === 'denied') {
    // Permission denied - show instructions
    warning(
      "Notifications are blocked. To enable them, click the lock icon in your browser's address bar and allow notifications for this site.",
      '🔕 Notifications Blocked',
      10000,
    )
  } else {
    // Permission granted - toggle on/off
    const enabled = toggleNotifications()
    if (enabled) {
      success('Browser notifications enabled!', '🔔 Notifications On', 3000)
    } else {
      success(
        "Browser notifications disabled. You'll still see in-app notifications.",
        '🔕 Notifications Off',
        3000,
      )
    }
  }
}

// Handle logout
async function handleLogout() {
  await logout()
  router.push('/login')
}

async function handleMudLogout() {
  clearMudCredentials()
  try {
    disconnectMud()
  } catch {
    /* ignore */
  }
  success('Logged out from MUD. Next /play will prompt for password.', 'MUD Logout', 3000)
}

// Handle new PvP events
onNewEvent((event) => {
  // format killers/victims from array of objects to string
  const formatParticipants = (
    participants: Array<{ description: string }> | string | undefined,
  ): string => {
    if (!participants) return 'Unknown'
    if (typeof participants === 'string') return participants
    if (Array.isArray(participants)) {
      return participants.map((p) => p.description).join(', ') || 'Unknown'
    }
    return 'Unknown'
  }

  const killers = formatParticipants(event.killers)
  const victims = formatParticipants(event.victims)
  const location = event.room_name || 'Unknown location'

  // Show browser notification (if permission granted)
  if (hasPermission.value) {
    showPvPNotification({
      id: event.id,
      killers,
      victims,
      room_name: location,
    })
  }

  // Also show in-app toast notification
  const message = `
    <div class="space-y-1">
      <div><span class="text-green-400">Killers:</span> ${parseAnsiForVue(killers)}</div>
      <div><span class="text-red-400">Victims:</span> ${parseAnsiForVue(victims)}</div>
      <div><span class="text-gray-400">Location:</span> ${parseAnsiForVue(location)}</div>
      <div class="text-xs text-cyan-400 cursor-pointer hover:underline" onclick="window.location.href='/pvp/battle/${event.id}'">Click to view details →</div>
    </div>
  `

  successHtml(message, '⚔️ New PvP Battle!', 8000)
})

// Handle incident alerts (crash, reboot, shutdown, recovery, etc.)
onCrashAlert((incident) => {
  // Show browser notification (if permission granted)
  if (hasPermission.value) {
    showCrashNotification({
      id: incident.id,
      incident_type: incident.incident_type,
      initiated_by: incident.initiated_by,
      shutdown_reason: incident.shutdown_reason,
      started_at: incident.started_at,
    })
  }

  // Simple user-friendly message
  let title = `${siteTitle.value} MUD Status Update`
  let message = ''

  if (incident.incident_type === 'recovery') {
    title = `${siteTitle.value} MUD is Back UP!`
  } else if (incident.incident_type === 'copyover') {
    title = `${siteTitle.value} MUD is Updated!`
    // Show initiated by and reason for planned shutdowns
    const initiatedBy = incident.initiated_by || 'System'
    const reason = incident.shutdown_reason || ''
    message = reason ? `Initiated by ${initiatedBy}: ${reason}` : `Initiated by ${initiatedBy}`
  } else if (incident.incident_type === 'reboot') {
    title = `${siteTitle.value} MUD is Rebooting!`
    // Show initiated by and reason for planned shutdowns
    const initiatedBy = incident.initiated_by || 'System'
    const reason = incident.shutdown_reason || ''
    message = reason ? `Initiated by ${initiatedBy}: ${reason}` : `Initiated by ${initiatedBy}`
  } else if (incident.incident_type === 'shutdown') {
    title = `${siteTitle.value} MUD is DOWN`
    // Show initiated by and reason for planned shutdowns
    const initiatedBy = incident.initiated_by || 'System'
    const reason = incident.shutdown_reason || ''
    message = reason ? `Initiated by ${initiatedBy}: ${reason}` : `Initiated by ${initiatedBy}`
  } else if (incident.incident_type === 'crash' || incident.incident_type === 'hung') {
    title = `${siteTitle.value} MUD is DOWN`
    // No details for crashes/hangs
  }

  warning(message, title, 10000)
})

// Handle MUD online (after crash/reboot)
onMudOnline(() => {
  success('The game server is back online!', 'MUD is UP', 10000)
  if (hasPermission.value) {
    showNotification({
      title: `${siteTitle.value} MUD is Back UP!`,
      body: 'The game server is back online.',
      tag: 'mud-online',
      sound: true,
    })
  }
})

// Handle MUD crash
onMudCrash(() => {
  warning('The game server has crashed unexpectedly.', 'MUD Crashed', 10000)
  if (hasPermission.value) {
    showNotification({
      title: `${siteTitle.value} MUD is DOWN`,
      body: 'The game server has crashed unexpectedly.',
      tag: 'mud-crash',
      sound: true,
    })
  }
})

// Handle MUD shutdown
onMudShutdown((data) => {
  const type = data?.type || 'unknown'
  let title = 'MUD Shutdown'
  let message = 'The game server is shutting down.'

  if (type === 'reboot') {
    title = 'MUD Rebooting'
    message = 'The game server is rebooting.'
  } else if (type === 'copyover') {
    title = 'MUD Copyover'
    message = 'The game server is performing a copyover (hot restart).'
  } else if (type === 'autoreboot') {
    title = 'MUD Auto-Reboot'
    message = 'The game server is performing scheduled auto-reboot.'
  }

  warning(message, title, 10000)
})

// Check if current route should show sidebar
const showSidebar = computed(() => {
  return (
    route.path.startsWith('/forum') ||
    route.path.startsWith('/admin') ||
    route.path.startsWith('/dashboard')
  )
})

// Check if current route is fullscreen (no padding)
const isFullscreen = computed(() => {
  return route.meta?.fullscreen === true
})

// Check if current route should hide navigation (pop-out windows)
const hideNav = computed(() => {
  return route.meta?.hideNav === true
})

// Check if on /play page (hide navbars on mobile for full game experience)
const isPlayPage = computed(() => route.path === '/play')
</script>

<template>
  <!-- Pop-out window mode: no nav, full screen -->
  <div v-if="hideNav" class="h-screen w-screen overflow-hidden">
    <RouterView />
    <Toaster position="top-right" theme="dark" :rich-colors="true" :close-button="true" />
  </div>

  <!-- Normal mode: with nav -->
  <div v-else class="flex flex-col h-screen bg-black text-gray-300">
    <!-- Top Progress Bar is handled by NProgress (CSS-based, no component needed) -->

    <div
      v-if="siteConfigError"
      role="alert"
      class="bg-red-950 border-b border-red-800 px-4 py-2 text-center text-sm text-red-200"
    >
      {{ siteConfigError }}
    </div>

    <!-- Header - hidden on mobile when on /play page -->
    <header :class="{ 'hidden lg:block': isPlayPage }" class="border-b border-gray-800 bg-gray-950">
      <div class="px-4 py-4">
        <div class="flex items-center justify-between">
          <RouterLink to="/" class="flex items-center space-x-4 hover:opacity-80 transition-opacity">
            <img
              v-if="siteLogoUrl"
              :src="siteLogoUrl"
              :alt="siteTitle"
              class="h-8 max-w-[120px] object-contain"
            />
            <h1 v-if="isSiteConfigAvailable" class="text-2xl font-bold text-gray-100">
              {{ siteTitle }}
            </h1>
            <h1 v-else class="text-2xl font-bold text-gray-400">Site unavailable</h1>
          </RouterLink>

          <!-- MUD Address (Centered) - Click to play - hidden on mobile -->
          <RouterLink
            v-if="isSiteConfigAvailable"
            to="/play"
            class="hidden lg:flex flex-1 justify-center hover:opacity-80 transition-opacity"
          >
            <div class="flex items-center gap-2">
              <div class="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400">
                <Play class="w-4 h-4 fill-current" />
              </div>
              <div class="text-center">
                <div class="text-sm font-mono text-cyan-400">{{ mudHost }}</div>
                <div class="text-xs text-gray-500">
                  Port {{ mudPort }}<span v-if="mudPortTls"> | TLS {{ mudPortTls }}</span>
                </div>
              </div>
            </div>
          </RouterLink>

          <nav class="hidden lg:flex items-center space-x-6">
                <RouterLink
                  to="/news"
                  class="text-sm font-medium transition-colors hover:text-cyan-400"
                  :class="$route.path.startsWith('/news') ? 'text-cyan-400' : 'text-gray-400'"
                >
                  News
                </RouterLink>
                <RouterLink
                  to="/pvp"
                  class="text-sm font-medium transition-colors hover:text-cyan-400"
                  :class="$route.path === '/pvp' || $route.path.startsWith('/pvp/') && !$route.path.includes('stats') ? 'text-cyan-400' : 'text-gray-400'"
                >
                  PvP Logs
                </RouterLink>
                <!-- Browse Dropdown -->
                <DropdownMenu>
                  <DropdownMenuTrigger class="focus:outline-none">
                    <span
                      class="text-sm font-medium transition-colors hover:text-cyan-400 flex items-center gap-1"
                      :class="$route.path === '/pvp/stats' || $route.path.startsWith('/statistics/') || $route.path === '/frag-leaderboard' || $route.path.startsWith('/auction') || $route.path === '/status' ? 'text-cyan-400' : 'text-gray-400'"
                    >
                      Browse
                      <ChevronDown class="h-3 w-3" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" class="w-48">
                    <DropdownMenuItem @click="router.push('/pvp/stats')" class="cursor-pointer">
                      <BarChart3 class="mr-2 h-4 w-4" />
                      <span>Statistics</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="router.push('/statistics/faction-activity')" class="cursor-pointer">
                      <Activity class="mr-2 h-4 w-4" />
                      <span>Faction Activity</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="router.push('/frag-leaderboard')" class="cursor-pointer">
                      <Trophy class="mr-2 h-4 w-4" />
                      <span>Frag Leaderboard</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="router.push('/auction')" class="cursor-pointer">
                      <Gavel class="mr-2 h-4 w-4" />
                      <span>Auction House</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="router.push('/status')" class="cursor-pointer">
                      <Radio class="mr-2 h-4 w-4" />
                      <span>Server Status</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <!-- Wiki Dropdown -->
                <DropdownMenu>
                  <DropdownMenuTrigger class="focus:outline-none">
                    <span
                      class="text-sm font-medium transition-colors hover:text-cyan-400 flex items-center gap-1"
                      :class="$route.path.startsWith('/wiki') || $route.path.startsWith('/guide') ? 'text-cyan-400' : 'text-gray-400'"
                    >
                      Wiki
                      <ChevronDown class="h-3 w-3" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" class="w-48">
                    <DropdownMenuItem @click="router.push('/wiki/map')" class="cursor-pointer">
                      <Map class="mr-2 h-4 w-4" />
                      <span>Map</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="router.push('/wiki/zones')" class="cursor-pointer">
                      <Layers class="mr-2 h-4 w-4" />
                      <span>Zones</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="router.push('/wiki/objects')" class="cursor-pointer">
                      <Package class="mr-2 h-4 w-4" />
                      <span>Objects</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="router.push('/wiki/mobs')" class="cursor-pointer">
                      <Skull class="mr-2 h-4 w-4" />
                      <span>Mobs</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="router.push('/guide')" class="cursor-pointer">
                      <BookOpen class="mr-2 h-4 w-4" />
                      <span>Guide</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem v-if="isAuthenticated" @click="router.push('/guide/my-suggestions')" class="cursor-pointer">
                      <FileText class="mr-2 h-4 w-4" />
                      <span>My Suggestions</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <RouterLink
                  to="/forum"
                  class="text-sm font-medium transition-colors hover:text-cyan-400"
                  :class="$route.path.startsWith('/forum') ? 'text-cyan-400' : 'text-gray-400'"
                >
                  Forum
                </RouterLink>
                <a
                  v-if="supportUrl"
                  :href="supportUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-1 text-sm font-medium text-pink-400 hover:text-pink-300 transition-colors"
                >
                  <Heart class="h-4 w-4" />
                  Donate
                </a>
                <RouterLink
                  v-if="hasAnyAdminAccess"
                  to="/admin/dashboard"
                  class="text-sm font-medium transition-colors hover:text-cyan-400"
                  :class="$route.path.startsWith('/admin') ? 'text-cyan-400' : 'text-gray-400'"
                >
                  Admin
                </RouterLink>
            </nav>

            <!-- notification + profile (always visible) -->
            <div class="flex items-center space-x-4">
                <!-- Builder Notification Bell (only for authenticated users) -->
                <BuilderNotificationBell v-if="isAuthenticated" />

                <!-- Profile Avatar with Connection Status -->
                <DropdownMenu v-if="isAuthenticated">
                  <DropdownMenuTrigger class="focus:outline-none">
                    <div
                      class="relative cursor-pointer hover:opacity-80 transition-opacity"
                      :title="isConnected ? 'Connected to live updates' : 'Disconnected'"
                    >
                      <!-- Avatar -->
                      <div class="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden" :class="!avatarUrl ? getRoleBadgeColor() : 'bg-gray-700'">
                        <img v-if="avatarUrl" :src="avatarUrl" :alt="accountName || ''" class="w-full h-full object-cover" />
                        <span v-else class="text-sm font-medium text-white">{{ accountName?.charAt(0).toUpperCase() }}</span>
                      </div>
                      <!-- Connection Status Indicator -->
                      <div
                        class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900"
                        :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
                      ></div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-56">
                    <DropdownMenuLabel class="font-normal">
                      <div class="flex flex-col space-y-1">
                        <p class="text-sm font-medium leading-none">{{ accountName }}</p>
                        <p class="text-xs leading-none text-muted-foreground">{{ getRoleDisplayName() }}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="router.push(`/user/${accountName}`)">
                      <User class="mr-2 h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="router.push('/change-password')">
                      <KeyRound class="mr-2 h-4 w-4" />
                      Change Password
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem v-if="isSupported" @click="handleNotificationClick">
                      <Bell v-if="hasPermission && isEnabled" class="mr-2 h-4 w-4" />
                      <BellOff v-else class="mr-2 h-4 w-4" />
                      {{ hasPermission && isEnabled ? 'Disable Notifications' : 'Enable Notifications' }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="handleMudLogout">
                      <Play class="mr-2 h-4 w-4" />
                      Logout from MUD
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="handleLogout">
                      <LogOut class="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <!-- Login button when not authenticated -->
                <RouterLink
                  v-else
                  to="/login"
                  class="flex items-center gap-1 ml-2 text-sm font-medium text-gray-400 hover:text-cyan-400 transition-colors"
                >
                  <LogIn class="h-4 w-4" />
                  Login
                </RouterLink>
            </div>
          </div>
        </div>
      </header>

    <!-- Changelog Banner (for logged-in users with unread entries) -->
    <ChangelogBanner />

    <!-- Main Content Area with Sidebar -->
    <SidebarProvider>
      <div class="flex flex-1 overflow-hidden">
        <!-- Sidebar (conditional) -->
        <AppSidebar v-if="showSidebar" />

        <!-- Main Content -->
        <main
          class="flex-1 overflow-hidden"
          :class="isFullscreen ? '' : 'overflow-y-auto px-4 py-4 pb-20 lg:pb-4'"
        >
          <RouterView />
        </main>
      </div>
    </SidebarProvider>

    <!-- Footer -->
    <!-- <footer class="border-t border-gray-800 bg-gray-950 mt-auto">
      <div class="px-4 py-6">
        <p class="text-center text-sm text-gray-500">
          DurisMUD PvP Logs - Real-time Player vs Player combat tracking
        </p>
      </div>
    </footer> -->

    <!-- pwa offline indicator -->
    <Transition name="slide-down">
      <div
        v-if="isOffline"
        class="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium"
      >
        <WifiOff class="h-4 w-4" />
        <span>you're offline - some features may not work</span>
      </div>
    </Transition>

    <!-- pwa update available banner -->
    <Transition name="slide-down">
      <div
        v-if="needRefresh"
        class="fixed top-0 left-0 right-0 z-50 bg-cyan-600 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium"
      >
        <RefreshCw class="h-4 w-4" />
        <span>a new version is available</span>
        <button
          @click="updateApp"
          class="px-3 py-1 bg-white text-cyan-600 rounded text-xs font-semibold hover:bg-gray-100 transition-colors"
        >
          update now
        </button>
        <button
          @click="dismissUpdate"
          class="p-1 hover:bg-cyan-700 rounded transition-colors"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </Transition>

    <!-- pwa install banner -->
    <InstallBanner />

    <!-- mobile bottom navbar - hidden on /play page -->
    <BottomNavbar v-if="!isPlayPage" />

    <!-- news announcement modal -->
    <NewsAnnouncementModal />

    <!-- Toast notifications (vue-sonner) -->
    <Toaster position="top-right" theme="dark" :rich-colors="true" :close-button="true" />
  </div>
</template>

<style scoped>
/* pwa banner transition animations */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
