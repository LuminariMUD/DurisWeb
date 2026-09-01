<script setup lang="ts">
import { computed } from 'vue'
import { useServerHealth } from '@/composables/useAdminAnalytics'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-vue-next'

const { data: health, isLoading, error } = useServerHealth()

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

const formatUptime = (ms: number) => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

const diskUsagePercent = computed(() => {
  if (!health.value?.diskSpace) return 0
  const { used, total } = health.value.diskSpace
  return Math.round((used / total) * 100)
})

const memoryUsagePercent = computed(() => {
  if (!health.value?.memory) return 0
  const { used, total } = health.value.memory
  return Math.round((used / total) * 100)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Error Alert -->
    <Alert v-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load server health. Please try refreshing the page.
      </AlertDescription>
    </Alert>

    <!-- DMS Process Stats -->
    <div v-if="health?.dmsProcess?.isRunning" class="rounded-lg border p-6 bg-green-500/10 border-green-500/50">
      <h3 class="text-lg font-semibold mb-4 text-green-400">DurisMUD Server Process</h3>
      <div class="grid gap-4 md:grid-cols-4">
        <div class="space-y-1">
          <div class="text-sm text-muted-foreground">CPU Usage</div>
          <div class="text-2xl font-bold">{{ (health.dmsProcess.cpu || 0).toFixed(1) }}%</div>
        </div>
        <div class="space-y-1">
          <div class="text-sm text-muted-foreground">Memory Usage</div>
          <div class="text-2xl font-bold">{{ (health.dmsProcess.memory || 0).toFixed(1) }} MiB</div>
          <div class="text-xs text-muted-foreground">{{ (health.dmsProcess.memoryPercent || 0).toFixed(1) }}%</div>
        </div>
        <div class="space-y-1">
          <div class="text-sm text-muted-foreground">Uptime</div>
          <div class="text-2xl font-bold">{{ formatUptime((health.dmsProcess.uptime || 0) * 1000) }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-sm text-muted-foreground">Process ID</div>
          <div class="text-2xl font-bold font-mono">{{ health.dmsProcess.pid }}</div>
        </div>
      </div>
    </div>
    <Alert v-else variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        DurisMUD Server process is not running!
      </AlertDescription>
    </Alert>

    <!-- Detailed Metrics -->
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Disk Space Details -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Disk Space</h3>
        <div v-if="isLoading" class="space-y-3">
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
        </div>
        <div v-else-if="!health?.diskSpace" class="text-center py-8 text-muted-foreground">
          No disk data available
        </div>
        <div v-else class="space-y-4">
          <div class="flex justify-between items-center">
            <span class="text-muted-foreground">Total</span>
            <span class="font-medium">{{ formatBytes(health.diskSpace.total) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-muted-foreground">Used</span>
            <span class="font-medium">{{ formatBytes(health.diskSpace.used) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-muted-foreground">Available</span>
            <span class="font-medium">{{ formatBytes(health.diskSpace.available || 0) }}</span>
          </div>
          <div class="mt-4">
            <div class="flex justify-between text-sm mb-2">
              <span>Usage</span>
              <span>{{ diskUsagePercent }}%</span>
            </div>
            <div class="h-2 bg-muted rounded-full overflow-hidden">
              <div
                class="h-full bg-primary transition-all"
                :style="{ width: `${diskUsagePercent}%` }"
                :class="{
                  'bg-green-500': diskUsagePercent < 70,
                  'bg-yellow-500': diskUsagePercent >= 70 && diskUsagePercent < 90,
                  'bg-red-500': diskUsagePercent >= 90
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Memory Details -->
      <div class="rounded-lg border p-6">
        <h3 class="text-lg font-semibold mb-4">Memory</h3>
        <div v-if="isLoading" class="space-y-3">
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
          <div class="h-10 bg-muted animate-pulse rounded"></div>
        </div>
        <div v-else-if="!health?.memory" class="text-center py-8 text-muted-foreground">
          No memory data available
        </div>
        <div v-else class="space-y-4">
          <div class="flex justify-between items-center">
            <span class="text-muted-foreground">Total</span>
            <span class="font-medium">{{ formatBytes(health.memory.total) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-muted-foreground">Used</span>
            <span class="font-medium">{{ formatBytes(health.memory.used) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-muted-foreground">Free</span>
            <span class="font-medium">{{ formatBytes(health.memory.free || 0) }}</span>
          </div>
          <div class="mt-4">
            <div class="flex justify-between text-sm mb-2">
              <span>Usage</span>
              <span>{{ memoryUsagePercent }}%</span>
            </div>
            <div class="h-2 bg-muted rounded-full overflow-hidden">
              <div
                class="h-full transition-all"
                :style="{ width: `${memoryUsagePercent}%` }"
                :class="{
                  'bg-green-500': memoryUsagePercent < 70,
                  'bg-yellow-500': memoryUsagePercent >= 70 && memoryUsagePercent < 90,
                  'bg-red-500': memoryUsagePercent >= 90
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Database Table Sizes -->
    <div v-if="health?.database?.tables" class="rounded-lg border p-6">
      <h3 class="text-lg font-semibold mb-4">Database Table Sizes</h3>
      <div class="space-y-2">
        <div
          v-for="table in health.database.tables.slice(0, 10)"
          :key="table.name"
          class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
        >
          <span class="font-medium">{{ table.name }}</span>
          <div class="text-right">
            <div class="text-sm font-medium">{{ formatBytes(table.size) }}</div>
            <div class="text-xs text-muted-foreground">{{ table.rows.toLocaleString() }} rows</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
