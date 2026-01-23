import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { profileApi, wikiApi } from '@/services/api'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/FrontPageView.vue'),
    },
    {
      path: '/news',
      name: 'news',
      component: () => import('../views/NewsView.vue'),
    },
    {
      path: '/pvp',
      name: 'pvp-list',
      component: () => import('../views/PvPListView.vue'),
    },
    {
      path: '/pvp/:id',
      name: 'battle-detail',
      component: () => import('../views/BattleDetailView.vue'),
      props: true,
    },
    {
      path: '/pvp/stats',
      name: 'stats',
      component: () => import('../views/StatsView.vue'),
    },
    {
      path: '/statistics/faction-activity',
      name: 'faction-activity',
      component: () => import('../views/FactionActivityView.vue'),
    },
    {
      path: '/frag-leaderboard',
      name: 'frag-leaderboard',
      component: () => import('../views/FragLeaderboardView.vue'),
    },

    // Auction House
    {
      path: '/auction',
      name: 'auction-list',
      component: () => import('../views/AuctionListView.vue'),
    },
    {
      path: '/auction/:id',
      name: 'auction-detail',
      component: () => import('../views/AuctionDetailView.vue'),
    },
    {
      path: '/auction-history',
      name: 'auction-history',
      component: () => import('../views/AuctionHistoryView.vue'),
    },

    // MUD Client
    {
      path: '/play',
      name: 'mud-client',
      component: () => import('../views/MudClientView.vue'),
      meta: {
        fullscreen: true, // Hide sidebar for full game experience
      },
    },
    {
      path: '/play/map',
      name: 'mud-map-popout',
      component: () => import('../views/PopOutMapView.vue'),
      meta: {
        fullscreen: true,
        hideNav: true, // No navigation needed in pop-out
      },
    },

    // Authentication
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: () => import('../views/ChangePasswordView.vue'),
      meta: { requiresAuth: true },
    },

    // Forum Routes
    {
      path: '/forum',
      name: 'forum',
      component: () => import('../views/ForumView.vue'),
      meta: { requiresAuth: false }, // Public view, but shows different content for logged in users
    },
    {
      path: '/forum/search',
      name: 'forum-search',
      component: () => import('../views/ForumSearchView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/forum/category/:categoryId',
      name: 'forum-category',
      component: () => import('../views/CategoryView.vue'),
      props: true,
      meta: { requiresAuth: false },
    },
    {
      path: '/forum/thread/:threadId',
      name: 'forum-thread',
      component: () => import('../views/ThreadView.vue'),
      props: true,
      meta: { requiresAuth: false },
    },
    {
      path: '/forum/new-thread/:categoryId',
      name: 'new-thread',
      component: () => import('../views/NewThreadView.vue'),
      props: true,
      meta: { requiresAuth: true },
    },
    {
      path: '/forum/notifications',
      name: 'forum-notifications',
      redirect: '/notifications', // Redirect old path to unified notifications
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('../views/NotificationsView.vue'),
      meta: { requiresAuth: true },
    },
    // Admin Routes (Level 57+ Immortal required for parent route)
    {
      path: '/admin',
      component: () => import('../views/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresImmortal: true },
      children: [
        {
          path: '',
          redirect: '/admin/dashboard',
        },
        {
          path: 'dashboard',
          name: 'admin-dashboard',
          component: () => import('../views/DashboardView.vue'),
          meta: { requiresAuth: true, requiresGreaterGod: true },
        },
        {
          path: 'analytics/web',
          name: 'admin-web-analytics',
          component: () => import('../views/admin/WebAnalyticsView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'web-settings',
          name: 'admin-web-settings',
          component: () => import('../views/admin/WebSettingsView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'front-page',
          name: 'admin-front-page',
          component: () => import('../views/admin/FrontPageSettingsView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('../views/AdminView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'moderation-log',
          name: 'admin-moderation-log',
          component: () => import('../views/ModerationLogView.vue'),
          meta: { requiresAuth: true, requiresModerator: true },
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/UserManagementView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'archives',
          name: 'admin-archives',
          component: () => import('../views/ArchivesView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'help-files',
          name: 'admin-help-files',
          component: () => import('../views/admin/HelpFilesView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_help_files' },
        },
        {
          path: 'help-suggestions',
          name: 'admin-help-suggestions',
          component: () => import('../views/admin/HelpSuggestionsQueueView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_help_suggestions' },
        },
        {
          path: 'news',
          name: 'admin-news',
          component: () => import('../views/admin/NewsAdminView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_news' },
        },
        {
          path: 'changelog',
          name: 'admin-changelog',
          component: () => import('../views/admin/ChangelogAdminView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_news' },
        },
        {
          path: 'motd',
          name: 'admin-motd',
          component: () => import('../views/admin/MotdView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_motd' },
        },
        {
          path: 'wizmotd',
          name: 'admin-wizmotd',
          component: () => import('../views/admin/WizMotdView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_motd' },
        },
        {
          path: 'rules',
          name: 'admin-rules',
          component: () => import('../views/admin/RulesView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_motd' },
        },
        {
          path: 'credits',
          name: 'admin-credits',
          component: () => import('../views/admin/CreditsView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_motd' },
        },
        {
          path: 'wizlist',
          name: 'admin-wizlist',
          component: () => import('../views/admin/WizlistView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_motd' },
        },
        {
          path: 'faq',
          name: 'admin-faq',
          component: () => import('../views/admin/FaqView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_motd' },
        },
        {
          path: 'logs',
          name: 'admin-logs',
          component: () => import('../views/admin/ServerLogsView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'view_server_logs' },
        },
        {
          path: 'connections/logs',
          name: 'admin-connections-logs',
          component: () => import('../views/admin/ConnectionLogsView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'view_connection_logs' },
        },
        {
          path: 'connections/suspicious',
          name: 'admin-connections-suspicious',
          component: () => import('../views/admin/SuspiciousAccountsView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'ai-analysis',
          name: 'admin-ai-analysis',
          component: () => import('../views/admin/AIAnalysisView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'use_ai_analysis' },
        },
        {
          path: 'audit-log',
          name: 'admin-audit-log',
          component: () => import('../views/admin/AuditLogView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'view_audit_log' },
        },
        // MUD Settings Routes (Phase 1: Read-Only)
        {
          path: 'mud/dashboard',
          name: 'admin-mud-dashboard',
          component: () => import('../views/admin/mud/MudDashboardView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'mud/properties',
          name: 'admin-mud-properties',
          component: () => import('../views/admin/mud/PropertiesView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_mud_properties' },
        },
        {
          path: 'mud/level-cap',
          name: 'admin-mud-level-cap',
          component: () => import('../views/admin/mud/LevelCapView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_level_cap' },
        },
        {
          path: 'mud/timers',
          name: 'admin-mud-timers',
          component: () => import('../views/admin/mud/TimersView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_timers' },
        },
        {
          path: 'mud/player-wipe',
          name: 'admin-mud-player-wipe',
          component: () => import('../views/admin/mud/PlayerWipeView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
        {
          path: 'mud/backup',
          name: 'admin-mud-backup',
          component: () => import('../views/admin/mud/MudBackupView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_mud_backup' },
        },
        {
          path: 'mud/control',
          name: 'admin-mud-control',
          component: () => import('../views/admin/mud/MudControlView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'mud_control' },
        },
        {
          path: 'zones',
          name: 'admin-zones',
          component: () => import('../views/ZoneManagementView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'manage_zones' },
        },
        {
          path: 'server-health',
          name: 'admin-server-health',
          component: () => import('../views/admin/ServerHealthView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'view_server_health' },
        },
        {
          path: 'git-history',
          name: 'admin-git-history',
          component: () => import('../views/admin/GitHistoryView.vue'),
          meta: { requiresAuth: true, requiredPermission: 'view_git_history' },
        },
        {
          path: 'permissions',
          name: 'admin-permissions',
          component: () => import('../views/admin/PermissionsManagementView.vue'),
          meta: { requiresAuth: true, requiresOverlord: true },
        },
      ],
    },

    // Zone Builder Mockups (for design review)
    {
      path: '/builder-mockups',
      name: 'builder-mockups',
      component: () => import('../views/builder/BuilderMockupsView.vue'),
      meta: { public: true },
    },

    // Zone Builder
    {
      path: '/builder',
      name: 'builder-dashboard',
      component: () => import('../views/builder/BuilderDashboardView.vue'),
      meta: { requiresAuth: true, requiredPermission: 'manage_zones' },
    },
    {
      path: '/builder/zone/:id',
      name: 'zone-editor',
      component: () => import('../views/builder/ZoneEditorView.vue'),
      props: true,
      meta: { requiresAuth: true, requiredPermission: 'manage_zones' },
    },
    {
      path: '/builder/settings',
      name: 'builder-settings',
      component: () => import('../views/builder/BuilderSettingsView.vue'),
      meta: { requiresAuth: true, requiredPermission: 'manage_zones' },
    },

    // Wiki Routes
    {
      path: '/wiki',
      component: () => import('../views/WikiView.vue'),
      meta: { checkWikiAccess: true },
      children: [
        {
          path: '',
          redirect: '/wiki/map',
        },
        {
          path: 'map',
          name: 'wiki-map',
          component: () => import('../views/wiki/WikiMapView.vue'),
        },
        {
          path: 'zones',
          name: 'wiki-zones',
          component: () => import('../views/wiki/WikiZonesView.vue'),
        },
        {
          path: 'zones/:number',
          name: 'wiki-zone-detail',
          component: () => import('../views/wiki/WikiZoneDetailView.vue'),
          props: true,
        },
        {
          path: 'objects',
          name: 'wiki-objects',
          component: () => import('../views/wiki/WikiObjectsView.vue'),
        },
        {
          path: 'objects/:vnum',
          name: 'wiki-object-detail',
          component: () => import('../views/wiki/WikiObjectDetailView.vue'),
          props: true,
        },
        {
          path: 'mobs',
          name: 'wiki-mobs',
          component: () => import('../views/wiki/WikiMobsView.vue'),
        },
        {
          path: 'mobs/:zoneNumber/:vnum',
          name: 'wiki-mob-detail',
          component: () => import('../views/wiki/WikiMobDetailView.vue'),
          props: true,
        },
      ],
    },

    // Public Guide (Help Files) Page
    {
      path: '/guide',
      name: 'guide',
      component: () => import('../views/GuideView.vue'),
      meta: { public: true },
    },

    // Help File Suggestions (requires auth)
    {
      path: '/guide/suggest',
      name: 'guide-suggest',
      component: () => import('../views/HelpSuggestionsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/guide/my-suggestions',
      name: 'my-suggestions',
      component: () => import('../views/MySuggestionsView.vue'),
      meta: { requiresAuth: true },
    },

    // Public Status Page (no auth required)
    {
      path: '/status',
      name: 'status',
      component: () => import('../views/StatusView.vue'),
      meta: { public: true },
    },

    // 403 Forbidden Page
    {
      path: '/forbidden',
      name: 'forbidden',
      component: () => import('../views/ForbiddenView.vue'),
      meta: { public: true },
    },

    // User, Character & Guild Profile Routes
    {
      path: '/user/:accountName',
      name: 'user-profile',
      component: () => import('../views/UserProfileView.vue'),
      props: true,
      meta: { requiresAuth: false },
    },
    {
      path: '/guild/:guildName',
      name: 'guild-profile',
      component: () => import('../views/GuildProfileView.vue'),
      props: true,
      meta: { requiresAuth: false },
    },
  ],
})

// Navigation guard for authentication
router.beforeEach(async (to, from, next) => {
  const { isAuthenticated, isOverlord, permissions, loadUser, hasPermission } = useAuth()

  // Redirect character routes to user profile
  if (to.meta.redirectToUserProfile && to.params.characterName) {
    try {
      const { accountName } = await profileApi.getCharacterAccount(to.params.characterName as string)
      next({ name: 'user-profile', params: { accountName } })
      return
    } catch {
      // If lookup fails, try using character name as account name
      next({ name: 'user-profile', params: { accountName: to.params.characterName } })
      return
    }
  }

  // Try to load user if not loaded yet (only on first navigation)
  if (!isAuthenticated.value && !to.meta.public) {
    await loadUser()
  }

  // Check if route requires authentication
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    // Redirect to login with return URL
    next({
      name: 'login',
      query: { redirect: to.fullPath },
    })
    return
  }

  // Check if route requires Immortal status (level 57+)
  if (to.meta.requiresImmortal && (!permissions.value?.immortalLevel || permissions.value.immortalLevel < 57)) {
    // Redirect to 403 Forbidden page
    next({
      name: 'forbidden',
      query: { error: 'immortal_required' },
    })
    return
  }

  // Check if route requires Moderator status (level 59+)
  if (to.meta.requiresModerator && !permissions.value?.canModerate) {
    // Redirect to 403 Forbidden page
    next({
      name: 'forbidden',
      query: { error: 'moderator_required' },
    })
    return
  }

  // Check if route requires Greater God status (level 60+)
  if (to.meta.requiresGreaterGod && (!permissions.value?.immortalLevel || permissions.value.immortalLevel < 60)) {
    // Redirect to 403 Forbidden page
    next({
      name: 'forbidden',
      query: { error: 'greater_god_required' },
    })
    return
  }

  // Check if route requires Overlord status
  if (to.meta.requiresOverlord && !isOverlord.value) {
    // Redirect to 403 Forbidden page
    next({
      name: 'forbidden',
      query: { error: 'overlord_required' },
    })
    return
  }

  // Check if route requires specific permission
  if (to.meta.requiredPermission && !hasPermission(to.meta.requiredPermission as string)) {
    // Redirect to 403 Forbidden page
    next({
      name: 'forbidden',
      query: { error: 'permission_required', permission: to.meta.requiredPermission as string },
    })
    return
  }

  // Check wiki access level
  if (to.meta.checkWikiAccess || to.matched.some((r) => r.meta.checkWikiAccess)) {
    try {
      const { accessLevel } = await wikiApi.getAccessLevel()
      if (accessLevel === 'registered' && !isAuthenticated.value) {
        // Wiki requires login, redirect to login
        next({
          name: 'login',
          query: { redirect: to.fullPath },
        })
        return
      }
    } catch {
      // If we can't check access, allow navigation (API might be down)
    }
  }

  // Allow navigation
  next()
})

export default router
