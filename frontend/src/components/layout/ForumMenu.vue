<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { forumApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { useCategories } from '@/composables/useCategories'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from '@/components/ui/sidebar'
import {
  Home,
  Search,
  Bookmark,
  Bell,
  TrendingUp,
  Flame,
  Settings,
  Shield,
  Archive,
} from 'lucide-vue-next'
import AnsiText from '@/components/ui/AnsiText.vue'

const router = useRouter()
const { isAuthenticated, permissions } = useAuth()

const isModerator = computed(() => permissions.value?.canModerate || false)
const isOverlord = computed(() => (permissions.value?.immortalLevel ?? 0) >= 60)

// Use TanStack Query for categories (auto-refreshes when invalidated)
const { data: categories, isLoading: isLoadingCategories } = useCategories()

const latestThreads = ref<any[]>([])
const popularThreads = ref<any[]>([])
const isLoadingActivity = ref(false)

async function loadActivity() {
  if (isLoadingActivity.value) return

  isLoadingActivity.value = true
  try {
    const [latest, popular] = await Promise.all([
      forumApi.getLatestThreads(5),
      forumApi.getPopularThreads(5),
    ])
    latestThreads.value = latest
    popularThreads.value = popular
  } catch (error) {
    console.error('Failed to load activity:', error)
  } finally {
    isLoadingActivity.value = false
  }
}

function getCategoryIcon(accessType: string): string {
  switch (accessType) {
    case 'public':
      return '📢'
    case 'authenticated':
      return '🔓'
    case 'guild':
      return '⚔️'
    case 'immortal':
      return '✨'
    case 'god':
      return '👑'
    default:
      return '📁'
  }
}

onMounted(() => {
  loadActivity()
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Quick Actions -->
    <SidebarGroup v-if="isAuthenticated">
      <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Forum Home" @click="router.push('/forum')">
              <Home class="h-4 w-4" />
              <span>Forum Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Search Forum" @click="router.push('/forum/search')">
              <Search class="h-4 w-4" />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton tooltip="My Subscriptions" @click="router.push('/forum')">
              <Bookmark class="h-4 w-4" />
              <span>My Subscriptions</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Notifications" @click="router.push('/forum/notifications')">
              <Bell class="h-4 w-4" />
              <span>Notifications</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <!-- Categories -->
    <SidebarGroup>
      <SidebarGroupLabel>Categories</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem v-if="isLoadingCategories">
            <SidebarMenuButton disabled>
              <span>⏳</span>
              <span>Loading...</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem
            v-for="category in categories"
            :key="category.id"
          >
            <SidebarMenuButton
              :tooltip="category.name"
              @click="router.push(`/forum/category/${category.id}`)"
              :isActive="router.currentRoute.value.params.categoryId === category.id.toString()"
            >
              <span>{{ getCategoryIcon(category.access_type) }}</span>
              <AnsiText :text="category.name" />
              <SidebarMenuBadge v-if="category.thread_count > 0" class="ml-auto">
                {{ category.thread_count }}
              </SidebarMenuBadge>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem v-if="!isLoadingCategories && categories?.length === 0">
            <SidebarMenuButton tooltip="No categories available" disabled>
              <span>📭</span>
              <span>No categories</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <!-- Latest Topics -->
    <SidebarGroup>
      <SidebarGroupLabel>
        <TrendingUp class="h-4 w-4 inline mr-1" />
        Latest Topics
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem v-if="isLoadingActivity">
            <SidebarMenuButton disabled>
              <span>⏳</span>
              <span>Loading...</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem
            v-for="thread in latestThreads"
            :key="thread.id"
          >
            <SidebarMenuButton
              :tooltip="thread.title"
              @click="router.push(`/forum/thread/${thread.id}`)"
              class="text-xs"
            >
              <span class="truncate">{{ thread.title }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem v-if="!isLoadingActivity && latestThreads.length === 0">
            <SidebarMenuButton disabled>
              <span>📭</span>
              <span>No recent threads</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <!-- Popular Threads -->
    <SidebarGroup>
      <SidebarGroupLabel>
        <Flame class="h-4 w-4 inline mr-1" />
        Popular
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem v-if="isLoadingActivity">
            <SidebarMenuButton disabled>
              <span>⏳</span>
              <span>Loading...</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem
            v-for="thread in popularThreads"
            :key="thread.id"
          >
            <SidebarMenuButton
              :tooltip="`${thread.title} (${thread.recentPosts} recent posts)`"
              @click="router.push(`/forum/thread/${thread.id}`)"
              class="text-xs"
            >
              <span class="truncate">{{ thread.title }}</span>
              <SidebarMenuBadge class="ml-auto">{{ thread.recentPosts }}</SidebarMenuBadge>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem v-if="!isLoadingActivity && popularThreads.length === 0">
            <SidebarMenuButton disabled>
              <span>📭</span>
              <span>No popular threads</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>

    <!-- Admin Section (Immortal+ only) -->
    <SidebarGroup v-if="permissions?.immortalLevel && permissions.immortalLevel >= 57">
      <SidebarGroupLabel>Administration</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Admin Panel" @click="router.push('/admin')">
              <Settings class="h-4 w-4" />
              <span>Admin Panel</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem v-if="isModerator">
            <SidebarMenuButton tooltip="Moderation Log" @click="router.push('/admin/moderation-log')">
              <Shield class="h-4 w-4" />
              <span>Moderation Log</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem v-if="isOverlord">
            <SidebarMenuButton tooltip="Archives" @click="router.push('/admin/archives')">
              <Archive class="h-4 w-4" />
              <span>Archives</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </div>
</template>
