<template>
  <div class="space-y-4">
    <!-- Tabs for MUD vs Server reboots -->
    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="mud">MUD Reboots</TabsTrigger>
        <TabsTrigger value="server">Server Reboots</TabsTrigger>
      </TabsList>

      <!-- MUD Reboots Tab -->
      <TabsContent value="mud" class="space-y-4">
        <div v-if="isMudLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="mudError" class="text-center py-8 text-destructive">
          Failed to load MUD reboot history
        </div>

        <div v-else-if="mudReboots && mudReboots.length === 0" class="text-center py-8 text-muted-foreground">
          No MUD reboot history available
        </div>

        <div v-else class="space-y-4">
          <div class="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reboot Time</TableHead>
                  <TableHead>Session Uptime</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Initiated By</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(reboot, index) in mudReboots" :key="index">
                  <TableCell>
                    <div class="text-sm">
                      {{ formatDateTime(reboot.rebootTime) }}
                    </div>
                    <div class="text-xs text-muted-foreground">
                      {{ formatRelative(reboot.rebootTime) }}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="font-mono text-sm">
                      {{ formatUptime(reboot.uptimeBeforeReboot) }}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge :class="getShutdownTypeBadge(reboot.shutdownType).color">
                      {{ getShutdownTypeBadge(reboot.shutdownType).label }}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span v-if="reboot.initiatedBy" class="text-sm">
                      {{ reboot.initiatedBy }}
                    </span>
                    <span v-else class="text-sm text-muted-foreground">
                      System
                    </span>
                  </TableCell>
                  <TableCell>
                    <span v-if="reboot.reason" class="text-sm text-muted-foreground">
                      {{ reboot.reason }}
                    </span>
                    <span v-else class="text-sm text-muted-foreground">
                      -
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </TabsContent>

      <!-- Server Reboots Tab -->
      <TabsContent value="server" class="space-y-4">
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="error" class="text-center py-8 text-destructive">
          Failed to load server reboot history
        </div>

        <div v-else-if="data && data.reboots.length === 0" class="text-center py-8 text-muted-foreground">
          No server reboot history available
        </div>

        <div v-else class="space-y-4">
      <!-- Reboot History Table -->
      <div class="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Boot Time</TableHead>
              <TableHead>Shutdown Time</TableHead>
              <TableHead>Uptime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="reboot in data?.reboots" :key="reboot.id">
              <TableCell>
                <div class="text-sm">
                  {{ formatDateTime(reboot.bootTime) }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ formatRelative(reboot.bootTime) }}
                </div>
              </TableCell>
              <TableCell>
                <div v-if="reboot.shutdownTime" class="text-sm">
                  {{ formatDateTime(reboot.shutdownTime) }}
                </div>
                <Badge v-else variant="outline" class="bg-green-500/10 text-green-500">
                  Running
                </Badge>
              </TableCell>
              <TableCell>
                <div class="font-mono text-sm">
                  {{ formatUptime(reboot.uptimeSeconds) }}
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination -->
      <div v-if="data && data.total > data.limit" class="flex items-center justify-between">
        <div class="text-sm text-muted-foreground">
          Showing {{ (data.page - 1) * data.limit + 1 }} to
          {{ Math.min(data.page * data.limit, data.total) }} of
          {{ data.total }} reboots
        </div>
        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
          >
            <ChevronLeft class="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
          >
            Next
            <ChevronRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useRebootHistory,
  useMudRebootHistory,
  formatUptime,
  getShutdownTypeBadge,
} from '@/composables/useServerReboot'
import { format, formatDistanceToNow } from 'date-fns'

const activeTab = ref('mud') // Default to MUD tab

const currentPage = ref(1)
const pageSize = ref(20)

// Server reboot history
const { data, isLoading, error } = useRebootHistory(currentPage.value, pageSize.value)

// MUD reboot history
const { data: mudReboots, isLoading: isMudLoading, error: mudError } = useMudRebootHistory()

const totalPages = computed(() => {
  if (!data.value) return 0
  return Math.ceil(data.value.total / data.value.limit)
})

const goToPage = (page: number) => {
  currentPage.value = page
}

const formatDateTime = (timestamp: number | string) => {
  // MUD reboots are Unix timestamps, server reboots are Unix timestamps
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp)

  if (isNaN(date.getTime())) {
    return 'Invalid date'
  }

  return format(date, 'MMM dd, yyyy HH:mm:ss')
}

const formatRelative = (timestamp: number | string) => {
  // MUD reboots are Unix timestamps, server reboots are Unix timestamps
  const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) : new Date(timestamp)

  if (isNaN(date.getTime())) {
    return 'Invalid date'
  }

  return formatDistanceToNow(date, { addSuffix: true })
}
</script>
