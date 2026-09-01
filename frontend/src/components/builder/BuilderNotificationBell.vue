<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient, useMutation } from '@tanstack/vue-query'
import { notificationApi } from '@/services/api'
import { formatDistanceToNow } from 'date-fns'
import {
  Bell,
  CheckCheck,
  MessageSquare,
  UserPlus,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Gavel,
  TrendingUp,
  Trophy,
  DollarSign,
  Swords,
} from 'lucide-vue-next'
import AnsiText from '@/components/ui/AnsiText.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useWebSocket } from '@/composables/useWebSocket'
import { useAuth } from '@/composables/useAuth'
import { toast } from 'vue-sonner'
import { h } from 'vue'
import NotificationToast from '@/components/ui/NotificationToast.vue'
import type { UnifiedNotification } from '@/types'

const router = useRouter()
const queryClient = useQueryClient()
const { onNotification, offNotification, onNewEvent, offNewEvent } = useWebSocket()
const { user } = useAuth()

const isOpen = ref(false)

// Session-only PVP notifications (not persisted, disappears on refresh)
const pvpNotifications = ref<UnifiedNotification[]>([])

// Count of unread PVP notifications
const unreadPvpCount = computed(() => pvpNotifications.value.filter((n) => !n.isRead).length)

// Fetch unread count
const { data: unreadCount, refetch: refetchCount } = useQuery({
  queryKey: ['notifications-unread-count'],
  queryFn: () => notificationApi.getUnreadCount(),
})

// Total unread count (API + PVP session notifications)
const totalUnreadCount = computed(() => (unreadCount.value || 0) + unreadPvpCount.value)

// Fetch notifications when popover opens
const {
  data: notificationsData,
  isLoading,
  refetch: refetchNotifications,
} = useQuery({
  queryKey: ['notifications-popover'],
  queryFn: () => notificationApi.getNotifications(1, 20, false),
  enabled: computed(() => isOpen.value),
})

// Combine API notifications with session PVP notifications
const notifications = computed(() => {
  const apiNotifications = notificationsData.value?.notifications || []
  // Merge and sort by createdAt (newest first)
  return [...pvpNotifications.value, ...apiNotifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
})

// Mark single as read mutation
const markAsReadMutation = useMutation({
  mutationFn: (id: number) => notificationApi.markAsRead(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-popover'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
  },
})

// Mark all as read mutation
const markAllAsReadMutation = useMutation({
  mutationFn: () => notificationApi.markAllAsRead(),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-popover'] })
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
  },
})

// Get icon for notification type
function getNotificationIcon(notification: UnifiedNotification) {
  if (notification.source === 'forum') {
    return MessageSquare
  }
  if (notification.source === 'pvp') {
    return Swords
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
    case 'comment_mention':
      return MessageSquare
    case 'proc_assigned':
      return UserPlus
    case 'proc_status_change':
      return RefreshCw
    case 'help_suggestion_approve':
      return CheckCircle
    case 'help_suggestion_reject':
      return XCircle
    case 'help_suggestion_needs_revision':
      return AlertCircle
    default:
      return Bell
  }
}

// Handle notification click - navigate and mark as read
async function handleNotificationClick(notification: UnifiedNotification) {
  // For PVP notifications (session-only), just mark as read locally
  if (notification.source === 'pvp') {
    const pvpNotif = pvpNotifications.value.find((n) => n.id === notification.id)
    if (pvpNotif) {
      pvpNotif.isRead = true
    }
  } else if (!notification.isRead) {
    // For API notifications, mark as read via API
    await markAsReadMutation.mutateAsync(notification.id)
  }

  // Close popover
  isOpen.value = false

  // Navigate using link field
  if (notification.link) {
    router.push(notification.link)
  }
}

// Format relative time
function formatTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return dateString
  }
}

// Refetch when popover opens
function handleOpenChange(open: boolean) {
  isOpen.value = open
  if (open) {
    refetchNotifications()
    refetchCount()
  }
}

// Handle WebSocket notification
function handleNotification(accountName: string, data: any) {
  // Only update if notification is for the current user
  if (user.value?.accountName === accountName) {
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    if (isOpen.value) {
      queryClient.invalidateQueries({ queryKey: ['notifications-popover'] })
    }
    // Show toast notification with ANSI parsing
    toast.custom(
      (toastId) =>
        h(NotificationToast, {
          message: data.message,
          onDismiss: () => toast.dismiss(toastId),
        }),
      {
        duration: 5000,
      },
    )
  }
}

// Handle PVP event - add to session notifications
function handlePvPEvent(event: any) {
  // Format killers/victims from array of objects to string (keep ANSI for display)
  const formatParticipants = (
    participants: Array<{ description: string }> | string | undefined,
  ): string => {
    if (!participants) return 'Unknown'
    if (typeof participants === 'string') return participants
    if (Array.isArray(participants)) {
      return participants.map((p) => p.description).join(', ') || 'Unknown'
    }
    return 'Unknown'
  }

  const killers = formatParticipants(event.killers)
  const victims = formatParticipants(event.victims)
  const location = event.room_name || 'Unknown location'

  // Create a session-only notification
  const pvpNotification: UnifiedNotification = {
    id: event.id,
    source: 'pvp',
    accountName: '', // broadcast to all, no specific account
    notificationType: 'pvp_battle',
    message: `${killers} killed ${victims} at ${location}`,
    link: `/pvp/battle/${event.id}`,
    isRead: false,
    createdAt: new Date().toISOString(),
    readAt: null,
    triggeredByAccount: null,
  }

  // Add to the beginning (newest first)
  pvpNotifications.value.unshift(pvpNotification)

  // Limit to 20 session notifications
  if (pvpNotifications.value.length > 20) {
    pvpNotifications.value = pvpNotifications.value.slice(0, 20)
  }
}

onMounted(() => {
  onNotification(handleNotification)
  onNewEvent(handlePvPEvent)

  // expose test function globally (remove after testing)
  ;(window as any).testPvpNotification = () => {
    handlePvPEvent({
      id: Date.now(),
      killers: [{ description: '[56 &+cWarrior&n] TestKiller (&+LOrc&n)' }],
      victims: [{ description: '[45 &+gCleric&n] TestVictim (&+LHuman&n)' }],
      room_name: '&+YThe Test Arena&n',
    })
  }
})

onUnmounted(() => {
  offNotification(handleNotification)
  offNewEvent(handlePvPEvent)
})
</script>

<template>
  <Popover v-model:open="isOpen" @update:open="handleOpenChange">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="relative h-8 w-8"
        title="Notifications"
      >
        <Bell class="h-4 w-4" />
        <Badge
          v-if="totalUnreadCount > 0"
          class="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px] bg-red-500 text-white border-0"
        >
          {{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}
        </Badge>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-80 p-0" align="end">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b">
        <h4 class="font-semibold text-sm">Notifications</h4>
        <Button
          v-if="notifications.length > 0 && notifications.some(n => !n.isRead)"
          variant="ghost"
          size="sm"
          class="text-xs h-7"
          :disabled="markAllAsReadMutation.isPending.value"
          @click="markAllAsReadMutation.mutate()"
        >
          <CheckCheck class="h-3 w-3 mr-1" />
          Mark all read
        </Button>
      </div>

      <!-- Content -->
      <ScrollArea class="h-[300px]">
        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <div class="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>

        <!-- Empty state -->
        <div v-else-if="notifications.length === 0" class="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Bell class="h-8 w-8 mb-2 opacity-20" />
          <p class="text-sm">No notifications</p>
        </div>

        <!-- Notification list -->
        <div v-else class="divide-y">
          <div
            v-for="notification in notifications"
            :key="`${notification.source}-${notification.id}`"
            class="px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
            :class="{ 'bg-muted/30': !notification.isRead }"
            @click="handleNotificationClick(notification)"
          >
            <div class="flex items-start gap-3">
              <!-- Icon -->
              <div
                class="p-1.5 rounded-full shrink-0"
                :class="notification.isRead ? 'bg-muted' : 'bg-primary/10'"
              >
                <component
                  :is="getNotificationIcon(notification)"
                  class="h-3.5 w-3.5"
                  :class="notification.isRead ? 'text-muted-foreground' : 'text-primary'"
                />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <p class="text-sm leading-tight" :class="{ 'font-medium': !notification.isRead }">
                  <AnsiText :text="notification.message" />
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  {{ formatTime(notification.createdAt) }}
                </p>
              </div>

              <!-- Unread indicator -->
              <div
                v-if="!notification.isRead"
                class="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5"
              />
            </div>
          </div>
        </div>
      </ScrollArea>

      <!-- Footer -->
      <div v-if="notifications.length > 0" class="px-4 py-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          class="w-full text-xs h-7"
          @click="isOpen = false; router.push('/notifications')"
        >
          View all
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
