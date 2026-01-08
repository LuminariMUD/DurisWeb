<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Server Uptime Card -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle class="flex items-center gap-2">
            <Server class="h-5 w-5" />
            Server Uptime
          </CardTitle>
          <Badge :class="serverHealthColorClass">
            {{ serverUptimeStatus }}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="error" class="text-center py-8 text-destructive">
          Failed to load uptime data
          <div class="text-xs mt-2">{{ error }}</div>
        </div>

        <div v-else class="space-y-4">
          <!-- Current Server Uptime Display -->
          <div class="text-center py-4 bg-muted/50 rounded-lg">
            <div class="text-4xl font-bold font-mono text-green-500">
              {{ formattedUptime }}
            </div>
            <div class="text-sm text-muted-foreground mt-2">
              Linux System Uptime
            </div>
          </div>

          <!-- Boot Time Info -->
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-muted-foreground">Last Boot</div>
              <div class="font-medium">{{ formatDate(bootDate) }}</div>
            </div>
            <div>
              <div class="text-muted-foreground">Boot Time</div>
              <div class="font-medium">{{ formatTime(bootDate) }}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- MUD Uptime Card -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle class="flex items-center gap-2">
            <Activity class="h-5 w-5" />
            MUD Uptime
          </CardTitle>
          <Badge :class="mudHealthColorClass">
            {{ mudUptimeStatus }}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div v-if="isMudLoading" class="flex items-center justify-center py-8">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="mudError" class="text-center py-8 text-destructive">
          Failed to load MUD uptime
        </div>

        <div v-else class="space-y-4">
          <!-- Current MUD Uptime Display -->
          <div class="text-center py-4 bg-muted/50 rounded-lg">
            <div class="text-4xl font-bold font-mono" :class="mudUptimeColorClass">
              {{ formattedMudUptime }}
            </div>
            <div class="text-sm text-muted-foreground mt-2">
              MUD Process Uptime
            </div>
          </div>

          <!-- MUD Process Info -->
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-muted-foreground">Status</div>
              <div class="font-medium">{{ mudHealth?.mudIsRunning ? 'Online' : 'Offline' }}</div>
            </div>
            <div>
              <div class="text-muted-foreground">Players</div>
              <div class="font-medium">{{ mudHealth?.onlinePlayers || 0 }}</div>
            </div>
          </div>

          <!-- Warning Banner for High MUD Uptime -->
          <Alert v-if="showAutoRebootWarning" variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <AlertDescription>
              MUD uptime has exceeded 65 hours. Auto-reboot may trigger soon.
            </AlertDescription>
          </Alert>

          <Alert v-else-if="showApproachingWarning">
            <AlertCircle class="h-4 w-4" />
            <AlertDescription>
              MUD uptime is approaching the 65-hour auto-reboot threshold.
            </AlertDescription>
          </Alert>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Server, Activity, Loader2, AlertCircle } from 'lucide-vue-next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCurrentUptime, formatUptime } from '@/composables/useServerReboot';
import { useServerHealth } from '@/composables/useServerHealth';
import { format } from 'date-fns';

// Server uptime (Linux system)
const { bootDate, uptime, isLoading, error } = useCurrentUptime();

// MUD uptime (process)
const { health: mudHealth, isLoading: isMudLoading, error: mudError } = useServerHealth(true);

const formattedUptime = computed(() => formatUptime(uptime.value));
const formattedMudUptime = computed(() => formatUptime(mudHealth.value?.mudUptimeSeconds || 0));

const uptimeDays = computed(() => uptime.value / 86400);
const mudUptimeHours = computed(() => (mudHealth.value?.mudUptimeSeconds || 0) / 3600);

// Server uptime styling
const serverHealthColorClass = computed(() => {
  const days = uptimeDays.value;
  if (days >= 30) return 'bg-green-500 text-white'; // Great uptime!
  if (days >= 7) return 'bg-blue-500 text-white';   // Good
  return 'bg-yellow-500 text-black';                 // Recently rebooted
});

const serverUptimeStatus = computed(() => {
  const days = uptimeDays.value;
  if (days >= 30) return 'Excellent';
  if (days >= 7) return 'Stable';
  return 'Recent Reboot';
});

// MUD uptime styling (with 65h warning)
const mudUptimeColorClass = computed(() => {
  const hours = mudUptimeHours.value;
  if (hours >= 65) return 'text-red-500';
  if (hours >= 60) return 'text-yellow-500';
  return 'text-green-500';
});

const mudHealthColorClass = computed(() => {
  const hours = mudUptimeHours.value;
  if (hours >= 65) return 'bg-red-500 text-white';
  if (hours >= 60) return 'bg-yellow-500 text-black';
  return 'bg-green-500 text-white';
});

const mudUptimeStatus = computed(() => {
  const hours = mudUptimeHours.value;
  if (hours >= 65) return 'Critical';
  if (hours >= 60) return 'Warning';
  return 'Healthy';
});

const showAutoRebootWarning = computed(() => mudUptimeHours.value >= 65);
const showApproachingWarning = computed(() => mudUptimeHours.value >= 60 && mudUptimeHours.value < 65);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'N/A';
  return format(new Date(dateStr), 'MMM dd, yyyy');
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return 'N/A';
  return format(new Date(dateStr), 'HH:mm:ss');
};
</script>
