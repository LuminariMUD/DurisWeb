<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Current Uptime -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          Current Uptime
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading || isMudLoading" class="flex items-center justify-center py-4">
          <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <div v-else class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">MUD</span>
            <span class="text-sm font-mono font-semibold">{{ formatUptime(mudHealth?.mudUptimeSeconds || 0) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Server</span>
            <span class="text-sm font-mono font-semibold text-green-500">{{ formatUptime(stats?.currentUptime || 0) }}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Average Uptime -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          Average Uptime
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="flex items-center justify-center py-4">
          <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <div v-else class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">MUD</span>
            <span class="text-sm font-mono font-semibold">{{ mudStats?.averageUptime ? formatUptime(mudStats.averageUptime) : 'N/A' }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Server</span>
            <span class="text-sm font-mono font-semibold">{{ stats?.averageUptime ? formatUptime(stats.averageUptime) : 'N/A' }}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Longest Uptime -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          Longest Uptime
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="flex items-center justify-center py-4">
          <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <div v-else class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">MUD</span>
            <span class="text-sm font-mono font-semibold">{{ mudStats?.longestUptime ? formatUptime(mudStats.longestUptime) : 'N/A' }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Server</span>
            <span class="text-sm font-mono font-semibold text-green-500">{{ stats?.longestUptime ? formatUptime(stats.longestUptime) : 'N/A' }}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Total Reboots (Last 30 Days) -->
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm font-medium text-muted-foreground">
          Reboots (30 days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="flex items-center justify-center py-4">
          <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <div v-else class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">MUD</span>
            <span class="text-sm font-semibold">{{ mudStats?.rebootsLast30Days || 0 }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Server</span>
            <span class="text-sm font-semibold">{{ stats?.rebootsLast30Days || 0 }}</span>
          </div>
          <div class="text-xs text-muted-foreground pt-1 border-t">
            Total: MUD {{ mudStats?.totalReboots || 0 }} / Server {{ stats?.totalReboots || 0 }}
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUptimeStats, useMudUptimeStats, formatUptime } from '@/composables/useServerReboot';
import { useServerHealth } from '@/composables/useServerHealth';

const { data: stats, isLoading } = useUptimeStats();
const { data: mudStats } = useMudUptimeStats();
const { health: mudHealth, isLoading: isMudLoading } = useServerHealth(true);
</script>
