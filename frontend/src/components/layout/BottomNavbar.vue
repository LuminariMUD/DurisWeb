<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Home,
  Play,
  Swords,
  MessageSquare,
  MoreHorizontal,
  Gavel,
  Map,
  BarChart3,
  Trophy,
  BookOpen,
  LogIn,
  User,
  Bell,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { isAuthenticated, accountName } = useAuth()

// main nav items (shown in bottom bar)
const mainNavItems = [
  { name: 'Home', path: '/', icon: Home },
  { name: 'Play', path: '/play', icon: Play },
  { name: 'PvP', path: '/pvp', icon: Swords },
  { name: 'Forum', path: '/forum', icon: MessageSquare },
]

// more items (shown in sheet)
const moreNavItems = computed(() => [
  { name: 'Auction', path: '/auction', icon: Gavel },
  { name: 'Map', path: '/wiki/map', icon: Map },
  { name: 'Stats', path: '/pvp/stats', icon: BarChart3 },
  { name: 'Leaderboard', path: '/frag-leaderboard', icon: Trophy },
  { name: 'Guide', path: '/guide', icon: BookOpen },
  ...(isAuthenticated.value
    ? [
        { name: 'Profile', path: `/user/${accountName.value}`, icon: User },
        { name: 'Notifications', path: '/notifications', icon: Bell },
      ]
    : [{ name: 'Login', path: '/login', icon: LogIn }]),
])

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const navigateTo = (path: string) => {
  router.push(path)
}
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 z-40 bg-gray-950 border-t border-gray-800 lg:hidden">
    <div class="flex items-center justify-around h-16">
      <!-- main nav items -->
      <button
        v-for="item in mainNavItems"
        :key="item.path"
        @click="navigateTo(item.path)"
        class="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors"
        :class="isActive(item.path) ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span class="text-xs">{{ item.name }}</span>
      </button>

      <!-- more button with sheet -->
      <Sheet>
        <SheetTrigger as-child>
          <button
            class="flex flex-col items-center justify-center flex-1 h-full gap-1 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <MoreHorizontal class="w-5 h-5" />
            <span class="text-xs">More</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" class="rounded-t-xl">
          <SheetHeader class="text-left">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div class="grid grid-cols-4 gap-4 py-6">
            <button
              v-for="item in moreNavItems"
              :key="item.path"
              @click="navigateTo(item.path)"
              class="flex flex-col items-center gap-2 p-3 rounded-lg transition-colors hover:bg-gray-800"
              :class="isActive(item.path) ? 'text-cyan-400 bg-gray-800/50' : 'text-gray-300'"
            >
              <component :is="item.icon" class="w-6 h-6" />
              <span class="text-xs">{{ item.name }}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  </nav>
</template>
