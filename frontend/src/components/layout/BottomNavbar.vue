<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useSiteConfig } from '@/composables/useSiteConfig'
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
} from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const { isAuthenticated, accountName } = useAuth()
const { supportUrl } = useSiteConfig()

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
  ...(supportUrl.value
    ? [
        {
          name: 'Donate',
          path: supportUrl.value,
          icon: Heart,
          external: true,
          highlight: true,
        },
      ]
    : []),
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
  <nav aria-label="Primary navigation" class="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background lg:hidden">
    <div class="flex items-center justify-around h-16">
      <!-- main nav items -->
      <button
        v-for="item in mainNavItems"
        :key="item.path"
        type="button"
        @click="navigateTo(item.path)"
        class="flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors"
        :class="isActive(item.path) ? 'text-vermilion' : 'text-muted-foreground hover:text-foreground'"
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
            class="flex flex-col items-center justify-center flex-1 h-full gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <MoreHorizontal class="w-5 h-5" />
            <span class="text-xs">More</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader class="text-left">
            <SheetTitle class="font-display text-2xl font-normal">Menu</SheetTitle>
          </SheetHeader>
          <div class="grid grid-cols-4 gap-4 py-6">
            <button
              v-for="item in moreNavItems"
              :key="item.path"
              type="button"
              @click="navigateTo(item)"
              class="flex flex-col items-center gap-2 p-3 transition-colors hover:bg-ink-high"
              :class="item.highlight ? 'text-ember' : isActive(item.path) ? 'text-vermilion bg-ink-high/60' : 'text-bone-muted'"
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
