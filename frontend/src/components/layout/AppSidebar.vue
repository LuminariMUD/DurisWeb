<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, KeyRound, LogOut, ChevronUp } from 'lucide-vue-next'
import ForumMenu from './ForumMenu.vue'
import AdminMenu from './AdminMenu.vue'
import NotificationBell from '@/components/forum/NotificationBell.vue'

const route = useRoute()
const router = useRouter()
const { accountName, avatarUrl, isAuthenticated, getRoleDisplayName, getRoleBadgeColor, logout } = useAuth()
const { state } = useSidebar()

const isForumSection = computed(() => route.path.startsWith('/forum'))
const isAdminSection = computed(() => route.path.startsWith('/admin') || route.path.startsWith('/dashboard'))

async function handleLogout() {
  await logout()
  router.push('/login')
}
</script>

<template>
  <Sidebar collapsible="icon">
    <!-- Header -->
    <SidebarHeader>
      <div class="flex items-center gap-2 px-2" :class="state === 'collapsed' ? 'justify-center' : 'justify-between'">
        <NotificationBell v-if="isForumSection && state !== 'collapsed'" :is-authenticated="isAuthenticated" />
        <div v-if="state !== 'collapsed'" class="flex-1" />
        <Tooltip>
          <TooltipTrigger as-child>
            <SidebarTrigger />
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Toggle Sidebar</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </SidebarHeader>

    <!-- Content -->
    <SidebarContent>
      <!-- Forum Menu -->
      <ForumMenu v-if="isForumSection" />

      <!-- Admin Menu -->
      <AdminMenu v-if="isAdminSection" />
    </SidebarContent>

    <!-- Footer -->
    <SidebarFooter>
      <SidebarMenu>
        <!-- Show login button when not authenticated -->
        <SidebarMenuItem v-if="!isAuthenticated">
          <SidebarMenuButton tooltip="Login" @click="router.push('/login')">
            <span>🔐</span>
            <span>Login</span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <!-- Show user info when authenticated -->
        <SidebarMenuItem v-else>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton
                size="lg"
                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div class="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden" :class="!avatarUrl ? getRoleBadgeColor() : ''">
                  <img v-if="avatarUrl" :src="avatarUrl" :alt="accountName || ''" class="w-full h-full object-cover" />
                  <span v-else class="text-sm">{{ accountName?.charAt(0).toUpperCase() }}</span>
                </div>
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-semibold">{{ accountName }}</span>
                  <span class="truncate text-xs text-muted-foreground">{{ getRoleDisplayName() }}</span>
                </div>
                <ChevronUp class="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              class="w-[--reka-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side="top"
              align="end"
              :side-offset="4"
            >
              <DropdownMenuLabel class="p-0 font-normal">
                <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <div class="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden" :class="!avatarUrl ? getRoleBadgeColor() : ''">
                    <img v-if="avatarUrl" :src="avatarUrl" :alt="accountName || ''" class="w-full h-full object-cover" />
                    <span v-else class="text-sm">{{ accountName?.charAt(0).toUpperCase() }}</span>
                  </div>
                  <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-semibold">{{ accountName }}</span>
                    <span class="truncate text-xs text-muted-foreground">{{ getRoleDisplayName() }}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="router.push(`/user/${accountName}`)">
                <User class="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem @click="router.push('/change-password')">
                <KeyRound class="mr-2 size-4" />
                Change Password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="handleLogout">
                <LogOut class="mr-2 size-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>
