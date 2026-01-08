<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { notificationApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import type { UnifiedNotification } from '@/types'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import Pagination from '@/components/forum/PaginationWithEllipsis.vue'
import {
  MoreHorizontal,
  Bell,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  UserPlus,
  RefreshCw,
  Trash2,
  Check,
  Gavel,
  TrendingUp,
  Trophy,
  DollarSign,
} from 'lucide-vue-next'
import AnsiText from '@/components/ui/AnsiText.vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const router = useRouter()
const { isAuthenticated } = useAuth()

const notifications = ref<UnifiedNotification[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const currentPage = ref(1)
const totalPages = ref(1)
const total = ref(0)
const unreadCount = ref(0)
const activeTab = ref<'all' | 'unread'>('all')
const deletingNotification = ref<UnifiedNotification | null>(null)

const unreadOnly = computed(() => activeTab.value === 'unread')

async function loadNotifications(page: number = 1) {
  isLoading.value = true
  error.value = null

  try {
    const result = await notificationApi.getNotifications(page, 50, unreadOnly.value)
    notifications.value = result.notifications
    currentPage.value = result.pagination.page
    totalPages.value = result.pagination.totalPages
    total.value = result.pagination.total
    unreadCount.value = result.unreadCount
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load notifications'
  } finally {
    isLoading.value = false
  }
}

async function handleNotificationClick(notification: UnifiedNotification) {
  try {
    if (!notification.isRead) {
      await notificationApi.markAsRead(notification.id)
      notification.isRead = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }

    // Use the link field directly if available
    if (notification.link) {
      router.push(notification.link)
    }
  } catch {
    // Ignore navigation errors
  }
}

async function markAsRead(notification: UnifiedNotification, event: MouseEvent) {
  event.stopPropagation()
  if (notification.isRead) return

  try {
    await notificationApi.markAsRead(notification.id)
    notification.isRead = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  } catch {
    // Ignore errors
  }
}

async function markAllAsRead() {
  try {
    await notificationApi.markAllAsRead()
    unreadCount.value = 0
    loadNotifications(currentPage.value)
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to mark all as read'
  }
}

function startDeleteNotification(notification: UnifiedNotification, event: MouseEvent) {
  event.stopPropagation()
  deletingNotification.value = notification
}

async function confirmDeleteNotification() {
  if (!deletingNotification.value) return

  try {
    await notificationApi.deleteNotification(deletingNotification.value.id)
    notifications.value = notifications.value.filter(
      (n) => n.id !== deletingNotification.value!.id
    )
    total.value--
    if (!deletingNotification.value.isRead) {
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
    deletingNotification.value = null
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to delete notification'
    deletingNotification.value = null
  }
}

function cancelDeleteNotification() {
  deletingNotification.value = null
}

function getNotificationIcon(notification: UnifiedNotification) {
  if (notification.source === 'forum') {
    return MessageSquare
  }
  if (notification.source === 'auction') {
    switch (notification.notificationType) {
      case 'outbid':
        return TrendingUp
      case 'auction_won':
        return Trophy
      case 'item_sold':
        return DollarSign
      default:
        return Gavel
    }
  }
  switch (notification.notificationType) {
    case 'help_suggestion_approve':
      return CheckCircle
    case 'help_suggestion_reject':
      return XCircle
    case 'help_suggestion_needs_revision':
      return AlertCircle
    case 'comment_mention':
      return MessageSquare
    case 'proc_assigned':
      return UserPlus
    case 'proc_status_change':
      return RefreshCw
    default:
      return Bell
  }
}

function getIconBgClass(notification: UnifiedNotification): string {
  if (notification.isRead) return 'bg-muted'
  switch (notification.notificationType) {
    case 'help_suggestion_approve':
    case 'auction_won':
    case 'item_sold':
      return 'bg-green-500/20'
    case 'help_suggestion_reject':
    case 'outbid':
      return 'bg-red-500/20'
    case 'help_suggestion_needs_revision':
      return 'bg-orange-500/20'
    default:
      return 'bg-primary/20'
  }
}

function getIconClass(notification: UnifiedNotification): string {
  if (notification.isRead) return 'text-muted-foreground'
  switch (notification.notificationType) {
    case 'help_suggestion_approve':
    case 'auction_won':
    case 'item_sold':
      return 'text-green-500'
    case 'help_suggestion_reject':
    case 'outbid':
      return 'text-red-500'
    case 'help_suggestion_needs_revision':
      return 'text-orange-500'
    default:
      return 'text-primary'
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return date.toLocaleDateString()
  } else if (days > 0) {
    return `${days}d`
  } else if (hours > 0) {
    return `${hours}h`
  } else if (minutes > 0) {
    return `${minutes}m`
  } else {
    return 'Just now'
  }
}

function handleTabChange(tab: 'all' | 'unread') {
  activeTab.value = tab
  currentPage.value = 1
  loadNotifications(1)
}

onMounted(() => {
  if (!isAuthenticated.value) {
    router.push('/login')
    return
  }
  loadNotifications()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div class="max-w-2xl mx-auto mb-4 px-4">
        <div class="flex items-center justify-between py-4">
          <h1 class="text-2xl font-bold">Notifications</h1>
          <button
            v-if="unreadCount > 0"
            class="text-sm text-primary hover:underline"
            @click="markAllAsRead"
          >
            Mark all as read
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 pb-1">
          <button
            class="px-4 py-2 text-sm font-medium rounded-full transition-colors"
            :class="activeTab === 'all'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted'"
            @click="handleTabChange('all')"
          >
            All
          </button>
          <button
            class="px-4 py-2 text-sm font-medium rounded-full transition-colors flex items-center gap-2"
            :class="activeTab === 'unread'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted'"
            @click="handleTabChange('unread')"
          >
            Unread
            <span
              v-if="unreadCount > 0"
              class="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
            >
              {{ unreadCount }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="max-w-2xl mt-4 mx-auto">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-20">
        <div class="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-20 px-4">
        <p class="text-destructive mb-4">{{ error }}</p>
        <Button @click="loadNotifications(currentPage)">Retry</Button>
      </div>

      <!-- Empty State -->
      <div v-else-if="notifications.length === 0" class="text-center py-20 px-4">
        <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Bell class="h-8 w-8 text-muted-foreground" />
        </div>
        <p class="text-lg font-medium mb-1">No notifications</p>
        <p class="text-sm text-muted-foreground">
          {{ activeTab === 'unread' ? "You're all caught up!" : "When you get notifications, they'll show up here." }}
        </p>
      </div>

      <!-- Notifications List -->
      <div v-else>
        <div
          v-for="notification in notifications"
          :key="`${notification.source}-${notification.id}`"
          class="relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 group"
          :class="{ 'bg-primary/5': !notification.isRead }"
          @click="handleNotificationClick(notification)"
        >
          <!-- Unread indicator -->
          <div
            v-if="!notification.isRead"
            class="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary"
          />

          <!-- Icon -->
          <div
            class="shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
            :class="getIconBgClass(notification)"
          >
            <component
              :is="getNotificationIcon(notification)"
              class="h-5 w-5"
              :class="getIconClass(notification)"
            />
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0 pt-0.5">
            <p
              class="text-sm leading-snug"
              :class="notification.isRead ? 'text-muted-foreground' : 'text-foreground'"
            >
              <AnsiText :text="notification.message" />
            </p>
            <p
              class="text-xs mt-0.5"
              :class="notification.isRead ? 'text-muted-foreground' : 'text-primary font-medium'"
            >
              {{ formatDate(notification.createdAt) }}
            </p>
          </div>

          <!-- Actions -->
          <div class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button
                  class="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"
                  @click.stop
                >
                  <MoreHorizontal class="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  v-if="!notification.isRead"
                  @click="(e: any) => markAsRead(notification, e)"
                >
                  <Check class="h-4 w-4 mr-2" />
                  Mark as read
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  @click="(e: any) => startDeleteNotification(notification, e)"
                >
                  <Trash2 class="h-4 w-4 mr-2" />
                  Remove notification
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="py-6 px-4">
        <Pagination
          :current-page="currentPage"
          :total-pages="totalPages"
          @update:current-page="loadNotifications"
        />
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog :open="deletingNotification !== null">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove notification?</AlertDialogTitle>
          <AlertDialogDescription>
            This notification will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="cancelDeleteNotification">Cancel</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDeleteNotification"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
