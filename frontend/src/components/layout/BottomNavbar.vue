<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
  Activity,
  Radio,
  Heart,
  Newspaper,
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
  { name: 'News & Updates', path: '/news', icon: Newspaper },
  { name: 'Auction', path: '/auction', icon: Gavel },
  { name: 'Map', path: '/wiki/map', icon: Map },
  { name: 'Stats', path: '/pvp/stats', icon: BarChart3 },
  { name: 'Faction', path: '/statistics/faction-activity', icon: Activity },
  { name: 'Leaderboard', path: '/frag-leaderboard', icon: Trophy },
  { name: 'Guide', path: '/guide', icon: BookOpen },
  { name: 'Status', path: '/status', icon: Radio },
  {
    name: 'Donate',
    path: 'https://ko-fi.com/newduris',
    icon: Heart,
    external: true,
    highlight: true,
  },
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

const navigateTo = (item: string | { path: string; external?: boolean }) => {
  if (typeof item === 'string') {
    router.push(item)
  } else if (item.external) {
    window.open(item.path, '_blank', 'noopener,noreferrer')
  } else {
    router.push(item.path)
  }
}
</script>

<template>
  <nav aria-label="Primary navigation" class="fixed bottom-0 left-0 right-0 z-40 bg-gray-950 border-t border-gray-800 lg:hidden">
    <div class="flex items-center justify-around h-16">
      <!-- main nav items -->
      <button
        v-for="item in mainNavItems"
        :key="item.path"
        type="button"
        @click="navigateTo(item.path)"
        class="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors"
        :class="isActive(item.path) ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'"
        :aria-current="isActive(item.path) ? 'page' : undefined"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span class="text-xs">{{ item.name }}</span>
      </button>

      <!-- more button with sheet -->
      <Sheet>
        <SheetTrigger as-child>
          <button
            type="button"
            aria-label="Open more navigation"
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
              type="button"
              @click="navigateTo(item)"
              class="flex flex-col items-center gap-2 p-3 rounded-lg transition-colors hover:bg-gray-800"
              :class="item.highlight ? 'text-pink-400' : isActive(item.path) ? 'text-cyan-400 bg-gray-800/50' : 'text-gray-300'"
              :aria-current="isActive(item.path) ? 'page' : undefined"
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
