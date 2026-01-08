<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Activity, Sparkles, GitBranch, HardDrive, Power, ChevronDown, Map,
  LayoutDashboard, Settings, ScrollText, Users, ShieldCheck, BookOpen,
  Newspaper, Megaphone, Wand2, Scale, Palette, Info, Crown, HelpCircle,
  FileText, ClipboardList, Gamepad2, Cog, AlertTriangle, TrendingUp, Timer, MapPin,
  BarChart3, Home, History
} from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'
import { helpSuggestionApi } from '@/services/api'
import { Badge } from '@/components/ui/badge'
import {
  CollapsibleRoot,
  CollapsibleTrigger,
  CollapsibleContent,
} from 'radix-vue'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'

const router = useRouter()
const { hasPermission, isOverlord } = useAuth()

// Collapsible state for each section (default all open)
const dashboardOpen = ref(true)
const forumAdminOpen = ref(true)
const contentOpen = ref(true)
const serverControlOpen = ref(true)
const mudSettingsOpen = ref(true)

// Pending suggestions count
const pendingSuggestionsCount = ref(0)

async function loadPendingCount() {
  if (hasPermission('manage_help_suggestions')) {
    try {
      const { count } = await helpSuggestionApi.getPendingCount()
      pendingSuggestionsCount.value = count
    } catch {
      // Ignore errors
    }
  }
}

onMounted(() => {
  loadPendingCount()
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Dashboard -->
    <SidebarGroup>
      <CollapsibleRoot v-model:open="dashboardOpen">
        <CollapsibleTrigger as-child>
          <SidebarGroupLabel class="cursor-pointer hover:bg-sidebar-accent/50 rounded-md flex items-center justify-between pr-2">
            <span>Dashboard</span>
            <ChevronDown class="h-4 w-4 transition-transform duration-200" :class="dashboardOpen ? '' : '-rotate-90'" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Server Dashboard"
                  @click="router.push('/admin/dashboard')"
                  :isActive="router.currentRoute.value.path === '/admin/dashboard'"
                >
                  <LayoutDashboard class="h-4 w-4" />
                  <span>Server Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem v-if="isOverlord">
                <SidebarMenuButton
                  tooltip="Web Analytics"
                  @click="router.push('/admin/analytics/web')"
                  :isActive="router.currentRoute.value.path === '/admin/analytics/web'"
                >
                  <BarChart3 class="h-4 w-4" />
                  <span>Web Analytics</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </CollapsibleRoot>
    </SidebarGroup>

    <!-- Web Settings -->
    <SidebarGroup>
      <CollapsibleRoot v-model:open="forumAdminOpen">
        <CollapsibleTrigger as-child>
          <SidebarGroupLabel class="cursor-pointer hover:bg-sidebar-accent/50 rounded-md flex items-center justify-between pr-2">
            <span>Web Settings</span>
            <ChevronDown class="h-4 w-4 transition-transform duration-200" :class="forumAdminOpen ? '' : '-rotate-90'" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Settings"
                  @click="router.push('/admin/web-settings')"
                  :isActive="router.currentRoute.value.path === '/admin/web-settings'"
                >
                  <Cog class="h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Front Page"
                  @click="router.push('/admin/front-page')"
                  :isActive="router.currentRoute.value.path === '/admin/front-page'"
                >
                  <Home class="h-4 w-4" />
                  <span>Front Page</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Forum Settings"
                  @click="router.push('/admin/settings')"
                  :isActive="router.currentRoute.value.path === '/admin/settings'"
                >
                  <Settings class="h-4 w-4" />
                  <span>Forum Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Moderation Log"
                  @click="router.push('/admin/moderation-log')"
                  :isActive="router.currentRoute.value.path === '/admin/moderation-log'"
                >
                  <ScrollText class="h-4 w-4" />
                  <span>Moderation Log</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton as-child tooltip="User Management">
                  <RouterLink to="/admin/users">
                    <Users class="h-4 w-4" />
                    <span>User Management</span>
                  </RouterLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Permissions"
                  @click="router.push('/admin/permissions')"
                  :isActive="router.currentRoute.value.path === '/admin/permissions'"
                >
                  <ShieldCheck class="h-4 w-4" />
                  <span>Permissions</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </CollapsibleRoot>
    </SidebarGroup>

    <!-- Content Management -->
    <SidebarGroup v-if="hasPermission('manage_help_files') || hasPermission('manage_news') || hasPermission('manage_motd') || hasPermission('manage_zone_permissions') || isOverlord">
      <CollapsibleRoot v-model:open="contentOpen">
        <CollapsibleTrigger as-child>
          <SidebarGroupLabel class="cursor-pointer hover:bg-sidebar-accent/50 rounded-md flex items-center justify-between pr-2">
            <span>Content Management</span>
            <ChevronDown class="h-4 w-4 transition-transform duration-200" :class="contentOpen ? '' : '-rotate-90'" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-if="hasPermission('manage_zone_permissions') || isOverlord">
                <SidebarMenuButton
                  tooltip="Zone Builder"
                  @click="router.push('/builder')"
                  :isActive="router.currentRoute.value.path.startsWith('/builder')"
                >
                  <Map class="h-4 w-4" />
                  <span>Zone Builder</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_help_files')">
                <SidebarMenuButton
                  tooltip="Help Files"
                  @click="router.push('/admin/help-files')"
                  :isActive="router.currentRoute.value.path === '/admin/help-files'"
                >
                  <BookOpen class="h-4 w-4" />
                  <span>Help Files</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_help_suggestions')">
                <SidebarMenuButton
                  tooltip="Help Suggestions"
                  @click="router.push('/admin/help-suggestions')"
                  :isActive="router.currentRoute.value.path === '/admin/help-suggestions'"
                >
                  <ClipboardList class="h-4 w-4" />
                  <span class="flex-1">Help Suggestions</span>
                  <Badge v-if="pendingSuggestionsCount > 0" variant="destructive" class="ml-auto h-5 min-w-5 px-1.5 text-xs">
                    {{ pendingSuggestionsCount }}
                  </Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_news')">
                <SidebarMenuButton
                  tooltip="MUD News"
                  @click="router.push('/admin/news')"
                  :isActive="router.currentRoute.value.path === '/admin/news'"
                >
                  <Newspaper class="h-4 w-4" />
                  <span>MUD News</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_news')">
                <SidebarMenuButton
                  tooltip="Website Changelog"
                  @click="router.push('/admin/changelog')"
                  :isActive="router.currentRoute.value.path === '/admin/changelog'"
                >
                  <History class="h-4 w-4" />
                  <span>Changelog</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_motd')">
                <SidebarMenuButton
                  tooltip="MOTD"
                  @click="router.push('/admin/motd')"
                  :isActive="router.currentRoute.value.path === '/admin/motd'"
                >
                  <Megaphone class="h-4 w-4" />
                  <span>MOTD</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_motd')">
                <SidebarMenuButton
                  tooltip="Wizard MOTD"
                  @click="router.push('/admin/wizmotd')"
                  :isActive="router.currentRoute.value.path === '/admin/wizmotd'"
                >
                  <Wand2 class="h-4 w-4" />
                  <span>Wiz MOTD</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_motd')">
                <SidebarMenuButton
                  tooltip="Rules"
                  @click="router.push('/admin/rules')"
                  :isActive="router.currentRoute.value.path === '/admin/rules'"
                >
                  <Scale class="h-4 w-4" />
                  <span>Rules</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_motd')">
                <SidebarMenuButton
                  tooltip="Credits"
                  @click="router.push('/admin/credits')"
                  :isActive="router.currentRoute.value.path === '/admin/credits'"
                >
                  <Palette class="h-4 w-4" />
                  <span>Credits</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_motd')">
                <SidebarMenuButton
                  tooltip="Info"
                  @click="router.push('/admin/info')"
                  :isActive="router.currentRoute.value.path === '/admin/info'"
                >
                  <Info class="h-4 w-4" />
                  <span>Info</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_motd')">
                <SidebarMenuButton
                  tooltip="Wizlist"
                  @click="router.push('/admin/wizlist')"
                  :isActive="router.currentRoute.value.path === '/admin/wizlist'"
                >
                  <Crown class="h-4 w-4" />
                  <span>Wizlist</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_motd')">
                <SidebarMenuButton
                  tooltip="FAQ"
                  @click="router.push('/admin/faq')"
                  :isActive="router.currentRoute.value.path === '/admin/faq'"
                >
                  <HelpCircle class="h-4 w-4" />
                  <span>FAQ</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </CollapsibleRoot>
    </SidebarGroup>

    <!-- Server Control -->
    <SidebarGroup v-if="hasPermission('view_server_logs') || hasPermission('view_server_health') || hasPermission('view_connection_logs') || hasPermission('view_git_history')">
      <CollapsibleRoot v-model:open="serverControlOpen">
        <CollapsibleTrigger as-child>
          <SidebarGroupLabel class="cursor-pointer hover:bg-sidebar-accent/50 rounded-md flex items-center justify-between pr-2">
            <span>Server Control</span>
            <ChevronDown class="h-4 w-4 transition-transform duration-200" :class="serverControlOpen ? '' : '-rotate-90'" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-if="hasPermission('view_server_logs')">
                <SidebarMenuButton
                  tooltip="Server Logs"
                  @click="router.push('/admin/logs')"
                  :isActive="router.currentRoute.value.path === '/admin/logs'"
                >
                  <FileText class="h-4 w-4" />
                  <span>Server Logs</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('view_connection_logs')">
                <SidebarMenuButton
                  tooltip="Login/Logout Logs"
                  @click="router.push('/admin/connections/logs')"
                  :isActive="router.currentRoute.value.path.startsWith('/admin/connections')"
                >
                  <Activity class="h-4 w-4" />
                  <span>Connection Logs</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('use_ai_analysis')">
                <SidebarMenuButton
                  tooltip="AI-Powered Analysis"
                  @click="router.push('/admin/ai-analysis')"
                  :isActive="router.currentRoute.value.path === '/admin/ai-analysis'"
                >
                  <Sparkles class="h-4 w-4" />
                  <span>AI Analysis</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('view_audit_log')">
                <SidebarMenuButton
                  tooltip="Audit Log"
                  @click="router.push('/admin/audit-log')"
                  :isActive="router.currentRoute.value.path === '/admin/audit-log'"
                >
                  <ClipboardList class="h-4 w-4" />
                  <span>Audit Log</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('view_server_health')">
                <SidebarMenuButton
                  tooltip="Server Health & Monitoring"
                  @click="router.push('/admin/server-health')"
                  :isActive="router.currentRoute.value.path === '/admin/server-health'"
                >
                  <Activity class="h-4 w-4" />
                  <span>Server Health</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('view_git_history')">
                <SidebarMenuButton
                  tooltip="Git History"
                  @click="router.push('/admin/git-history')"
                  :isActive="router.currentRoute.value.path === '/admin/git-history'"
                >
                  <GitBranch class="h-4 w-4" />
                  <span>Git History</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_mud_backup') || isOverlord">
                <SidebarMenuButton
                  tooltip="Backup MUD"
                  @click="router.push('/admin/mud/backup')"
                  :isActive="router.currentRoute.value.path === '/admin/mud/backup'"
                >
                  <HardDrive class="h-4 w-4" />
                  <span>Backup MUD</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('mud_control') || isOverlord">
                <SidebarMenuButton
                  tooltip="MUD Control"
                  @click="router.push('/admin/mud/control')"
                  :isActive="router.currentRoute.value.path === '/admin/mud/control'"
                >
                  <Power class="h-4 w-4" />
                  <span>MUD Control</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </CollapsibleRoot>
    </SidebarGroup>

    <!-- MUD Settings -->
    <SidebarGroup v-if="hasPermission('manage_mud_properties') || hasPermission('manage_level_cap') || hasPermission('manage_timers') || hasPermission('manage_zones') || isOverlord">
      <CollapsibleRoot v-model:open="mudSettingsOpen">
        <CollapsibleTrigger as-child>
          <SidebarGroupLabel class="cursor-pointer hover:bg-sidebar-accent/50 rounded-md flex items-center justify-between pr-2">
            <span>MUD Settings</span>
            <ChevronDown class="h-4 w-4 transition-transform duration-200" :class="mudSettingsOpen ? '' : '-rotate-90'" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-if="isOverlord">
                <SidebarMenuButton
                  tooltip="MUD Dashboard"
                  @click="router.push('/admin/mud/dashboard')"
                  :isActive="router.currentRoute.value.path === '/admin/mud/dashboard'"
                >
                  <Gamepad2 class="h-4 w-4" />
                  <span>MUD Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_mud_properties')">
                <SidebarMenuButton
                  tooltip="Properties"
                  @click="router.push('/admin/mud/properties')"
                  :isActive="router.currentRoute.value.path === '/admin/mud/properties'"
                >
                  <Cog class="h-4 w-4" />
                  <span>Properties</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="isOverlord">
                <SidebarMenuButton
                  tooltip="Player Wipe"
                  @click="router.push('/admin/mud/player-wipe')"
                  :isActive="router.currentRoute.value.path === '/admin/mud/player-wipe'"
                >
                  <AlertTriangle class="h-4 w-4" />
                  <span>Player Wipe</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_level_cap')">
                <SidebarMenuButton
                  tooltip="Level Cap"
                  @click="router.push('/admin/mud/level-cap')"
                  :isActive="router.currentRoute.value.path === '/admin/mud/level-cap'"
                >
                  <TrendingUp class="h-4 w-4" />
                  <span>Level Cap</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_timers')">
                <SidebarMenuButton
                  tooltip="Timers"
                  @click="router.push('/admin/mud/timers')"
                  :isActive="router.currentRoute.value.path === '/admin/mud/timers'"
                >
                  <Timer class="h-4 w-4" />
                  <span>Timers</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem v-if="hasPermission('manage_zones')">
                <SidebarMenuButton
                  tooltip="Zone Management"
                  @click="router.push('/admin/zones')"
                  :isActive="router.currentRoute.value.path === '/admin/zones'"
                >
                  <MapPin class="h-4 w-4" />
                  <span>Zone Management</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </CollapsibleRoot>
    </SidebarGroup>
  </div>
</template>
