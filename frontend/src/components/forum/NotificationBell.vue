<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { notificationApi } from '@/services/api'
import { Bell } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import AnsiText from '@/components/ui/AnsiText.vue'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useWebSocket } from '@/composables/useWebSocket'
import { useAuth } from '@/composables/useAuth'
import { toast } from 'vue-sonner'
import { h } from 'vue'
import NotificationToast from '@/components/ui/NotificationToast.vue'
import type { UnifiedNotification } from '@/types'

interface Props {
  isAuthenticated: boolean
}

const props = defineProps<Props>()
const { onNotification, offNotification } = useWebSocket()
const { user } = useAuth()

const router = useRouter()
const unreadCount = ref(0)
const notifications = ref<UnifiedNotification[]>([])
const isOpen = ref(false)
const isLoading = ref(false)

async function loadUnreadCount() {
  if (!props.isAuthenticated) return

  try {
    unreadCount.value = await notificationApi.getUnreadCount()
  } catch {
  }
}

async function loadNotifications() {
  if (!props.isAuthenticated) return

  isLoading.value = true
  try {
    const result = await notificationApi.getNotifications(1, 10, true) // Only unread, limited to 10
    notifications.value = result.notifications
  } catch {
  } finally {
    isLoading.value = false
  }
}

async function handleNotificationClick(notification: UnifiedNotification) {
  try {
    // Mark as read
    await notificationApi.markAsRead(notification.id)

    // Update local state
    unreadCount.value = Math.max(0, unreadCount.value - 1)

    // Navigate using link field
    if (notification.link) {
      router.push(notification.link)
    }

    // Close popover
    isOpen.value = false
  } catch {
  }
}

async function markAllAsRead() {
  try {
    await notificationApi.markAllAsRead()
    unreadCount.value = 0
    notifications.value = []
    isOpen.value = false
  } catch {
  }
}

function viewAllNotifications() {
  router.push('/notifications')
  isOpen.value = false
}

watch(() => isOpen.value, (newValue) => {
  if (newValue && props.isAuthenticated) {
    loadNotifications()
    loadUnreadCount()
  }
})

// Watch for auth changes
watch(() => props.isAuthenticated, (isAuth) => {
  if (isAuth) {
    loadUnreadCount()
  } else {
    unreadCount.value = 0
    notifications.value = []
  }
})

// Handle WebSocket notification
function handleNotification(accountName: string, data: any) {
  // Only update if notification is for the current user
  if (props.isAuthenticated && user.value?.accountName === accountName) {
    loadUnreadCount()
    if (isOpen.value) {
      loadNotifications()
    }
    // Show toast notification with ANSI parsing
    toast.custom((toastId) => h(NotificationToast, {
      message: data.message,
      onDismiss: () => toast.dismiss(toastId),
    }), {
      duration: 5000,
    })
  }
}

onMounted(() => {
  if (props.isAuthenticated) {
    loadUnreadCount()
  }
  onNotification(handleNotification)
})

onUnmounted(() => {
  offNotification(handleNotification)
})
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="relative"
        :class="{ 'cursor-not-allowed opacity-50': !isAuthenticated }"
        :disabled="!isAuthenticated"
      >
        <Bell class="h-5 w-5" />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center font-semibold"
        >
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-96 p-0" align="end">
      <div class="flex items-center justify-between p-4 border-b">
        <h3 class="font-semibold text-lg">Notifications</h3>
        <Button
          v-if="notifications.length > 0"
          variant="ghost"
          size="sm"
          @click="markAllAsRead"
        >
          Mark all as read
        </Button>
      </div>

      <div v-if="isLoading" class="p-8 text-center text-muted-foreground">
        Loading...
      </div>

      <div v-else-if="notifications.length === 0" class="p-8 text-center text-muted-foreground">
        No new notifications
      </div>

      <div v-else class="max-h-[400px] overflow-y-auto">
        <button
          v-for="notification in notifications"
          :key="notification.id"
          class="w-full text-left p-4 hover:bg-muted/50 border-b last:border-b-0 transition-colors"
          @click="handleNotificationClick(notification)"
        >
          <div class="flex items-start gap-3">
            <div class="h-2 w-2 mt-2 rounded-full bg-blue-500 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium"><AnsiText :text="notification.message" /></p>
              <p class="text-xs text-muted-foreground mt-1">
                {{ new Date(notification.createdAt).toLocaleString() }}
              </p>
            </div>
          </div>
        </button>
      </div>

      <div class="p-2 border-t">
        <Button
          variant="ghost"
          class="w-full"
          @click="viewAllNotifications"
        >
          View all notifications
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
