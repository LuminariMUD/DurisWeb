<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AnsiText from '@/components/ui/AnsiText.vue'

interface BreadcrumbItem {
  label: string
  path?: string
  isActive: boolean
}

const props = defineProps<{
  category?: { id: number; name: string } | null
  thread?: { id: number; title: string } | null
}>()

const route = useRoute()
const router = useRouter()

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const items: BreadcrumbItem[] = [
    { label: 'Home', path: '/', isActive: false }
  ]

  // Check if we're in a forum-related route
  if (route.path.startsWith('/forum')) {
    items.push({ label: 'Forum', path: '/forum', isActive: route.path === '/forum' })

    // If we have a category
    if (props.category) {
      items.push({
        label: props.category.name,
        path: `/forum/category/${props.category.id}`,
        isActive: !props.thread
      })
    }

    // If we have a thread
    if (props.thread) {
      items.push({
        label: props.thread.title.length > 50
          ? props.thread.title.substring(0, 50) + '...'
          : props.thread.title,
        path: `/forum/thread/${props.thread.id}`,
        isActive: true
      })
    }

    // Handle new thread page
    if (route.name === 'new-thread') {
      items.push({
        label: 'New Thread',
        isActive: true
      })
    }
  } else if (route.path.startsWith('/pvp')) {
    items.push({ label: 'PvP Logs', path: '/pvp', isActive: route.path === '/pvp' })

    if (route.name === 'battle-detail') {
      items.push({ label: 'Battle Details', isActive: true })
    } else if (route.name === 'stats') {
      items.push({ label: 'Statistics', path: '/pvp/stats', isActive: true })
    }
  } else if (route.path.startsWith('/news')) {
    items.push({ label: 'News', path: '/news', isActive: true })
  } else if (route.path.startsWith('/help')) {
    items.push({ label: 'Help Files', path: '/help', isActive: true })
  } else if (route.path.startsWith('/user/')) {
    items.push({ label: 'Users', path: '/users', isActive: false })

    // Extract account name from route params
    const accountName = route.params.accountName as string
    if (accountName) {
      items.push({ label: accountName, isActive: true })
    }
  } else if (route.path.startsWith('/admin')) {
    items.push({ label: 'Admin', path: '/admin', isActive: route.path === '/admin' })

    if (route.path === '/admin/dashboard') {
      items.push({ label: 'Dashboard', isActive: true })
    } else if (route.path === '/admin/settings') {
      items.push({ label: 'Settings', isActive: true })
    } else if (route.path === '/admin/moderation-log') {
      items.push({ label: 'Moderation Log', isActive: true })
    } else if (route.path === '/admin/help-files') {
      items.push({ label: 'Help Files', isActive: true })
    } else if (route.path === '/admin/news') {
      items.push({ label: 'MUD News', isActive: true })
    } else if (route.path === '/admin/motd') {
      items.push({ label: 'MOTD', isActive: true })
    } else if (route.path === '/admin/wizmotd') {
      items.push({ label: 'Wizard MOTD', isActive: true })
    } else if (route.path === '/admin/rules') {
      items.push({ label: 'Rules', isActive: true })
    } else if (route.path === '/admin/credits') {
      items.push({ label: 'Credits', isActive: true })
    } else if (route.path === '/admin/wizlist') {
      items.push({ label: 'Wizlist', isActive: true })
    } else if (route.path === '/admin/faq') {
      items.push({ label: 'FAQ', isActive: true })
    }
  }

  return items
})

function navigate(path?: string) {
  if (path) {
    router.push(path)
  }
}
</script>

<template>
  <nav class="flex items-center gap-2 text-sm text-muted-foreground mb-6">
    <template v-for="(item, index) in breadcrumbs" :key="index">
      <AnsiText
        v-if="item.isActive"
        :text="item.label"
        tag="span"
        class="text-foreground font-medium"
      />
      <button
        v-else
        @click="navigate(item.path)"
        class="hover:text-foreground transition-colors"
      >
        <AnsiText :text="item.label" />
      </button>

      <span v-if="index < breadcrumbs.length - 1" class="text-muted-foreground/50">
        /
      </span>
    </template>
  </nav>
</template>
