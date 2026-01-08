<script setup lang="ts">
import { computed } from 'vue'
import { usePublicStatus, usePublicUptime, usePublicIncidents, useUptimeHistory, formatUptime } from '@/composables/usePublicStatus'
import { formatDistanceToNow } from 'date-fns'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-vue-next'
import UptimeBar from '@/components/UptimeBar.vue'

// Fetch public status data
const { status, isLoading: isLoadingStatus } = usePublicStatus(true)
const { uptime, isLoading: isLoadingUptime } = usePublicUptime()
const { incidents, isLoading: isLoadingIncidents } = usePublicIncidents()
const { history, isLoading: isLoadingHistory } = useUptimeHistory()

// Status badge styling
const statusVariant = computed(() => {
  const s = status.value?.status
  if (s === 'operational') return 'default'
  if (s === 'degraded') return 'secondary'
  if (s === 'offline') return 'destructive'
  return 'outline'
})

const statusIcon = computed(() => {
  const s = status.value?.status
  if (s === 'operational') return CheckCircle2
  if (s === 'degraded') return AlertTriangle
  return XCircle
})

const statusColor = computed(() => {
  const s = status.value?.status
  if (s === 'operational') return 'text-green-500'
  if (s === 'degraded') return 'text-yellow-500'
  if (s === 'offline') return 'text-red-500'
  return 'text-gray-500'
})

// Helper functions
function formatTimestamp(timestamp: string): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Ongoing'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

function getSeverityVariant(severity: string | null): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (severity === 'critical') return 'destructive'
  if (severity === 'major') return 'secondary'
  return 'outline'
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="container mx-auto py-12 space-y-8">
      <!-- Hero Section -->
      <div class="text-center space-y-4">
        <h1 class="text-4xl font-bold">NewDuris MUD Status</h1>
        <p class="text-muted-foreground">Current system status and uptime</p>

        <div v-if="isLoadingStatus" class="py-8">
          <div class="text-lg">Loading status...</div>
        </div>

        <div v-else-if="status" class="flex flex-col items-center gap-4 py-6">
          <component :is="statusIcon" :class="['h-16 w-16', statusColor]" />
          <div>
            <Badge :variant="statusVariant" class="text-lg px-4 py-2">
              {{ status.status }}
            </Badge>
          </div>
          <p class="text-xl">{{ status.message }}</p>
          <p class="text-sm text-muted-foreground">
            Last updated {{ formatTimestamp(status.lastUpdated) }}
          </p>
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Uptime Percentage -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">90-Day Uptime</CardTitle>
            <div v-if="!isLoadingUptime && uptime" class="text-3xl font-bold text-green-500">
              {{ uptime.last90Days?.toFixed(2) }}%
            </div>
            <div v-else class="text-3xl font-bold">Loading...</div>
          </CardHeader>
          <CardContent>
            <p class="text-xs text-muted-foreground">
              Last 30 days: {{ uptime?.last30Days?.toFixed(2) }}%
            </p>
          </CardContent>
        </Card>

        <!-- Current Session Uptime -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">Current Session</CardTitle>
            <div v-if="!isLoadingStatus && status" class="text-3xl font-bold">
              {{ formatUptime(status.uptimeSeconds) }}
            </div>
            <div v-else class="text-3xl font-bold">--</div>
          </CardHeader>
          <CardContent>
            <p class="text-xs text-muted-foreground">
              Since last restart
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- 90-Day Uptime Calendar -->
      <Card>
        <CardHeader>
          <CardTitle>90-Day Uptime History</CardTitle>
          <CardDescription>Daily uptime percentage over the last 90 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="isLoadingHistory" class="text-center py-8">Loading history...</div>

          <div v-else-if="history && history.length > 0" class="space-y-4">
            <!-- Calendar Grid - Vertical Layout -->
            <div class="flex gap-1 overflow-x-auto pb-2">
              <UptimeBar
                v-for="day in history"
                :key="day.date"
                :day="day"
              />
            </div>

            <!-- Timeline Labels -->
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>90 days ago</span>
              <span>Today</span>
            </div>

            <!-- Legend -->
            <div class="flex items-center justify-end gap-4 text-xs text-muted-foreground flex-wrap">
              <div class="flex items-center gap-1">
                <div class="h-3 w-3 rounded-sm bg-gray-700"></div>
                <span>No data</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="h-3 w-3 rounded-sm bg-red-600"></div>
                <span>Critical outage</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="h-3 w-3 rounded-sm bg-orange-500"></div>
                <span>Major incident</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="h-3 w-3 rounded-sm bg-yellow-500"></div>
                <span>Minor issues</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="h-3 w-3 rounded-sm bg-green-500"></div>
                <span>Partial uptime</span>
              </div>
              <div class="flex items-center gap-1">
                <div class="h-3 w-3 rounded-sm bg-green-600"></div>
                <span>100% operational</span>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-8 text-muted-foreground">
            No uptime data available yet. Monitoring system is collecting data...
          </div>
        </CardContent>
      </Card>

      <!-- Incidents Timeline -->
      <Card>
        <CardHeader>
          <CardTitle>Recent Incidents</CardTitle>
          <CardDescription>Server incidents over the last 90 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="isLoadingIncidents" class="text-center py-8">Loading incidents...</div>

          <div v-else-if="incidents && incidents.length > 0" class="space-y-4">
            <div
              v-for="incident in incidents"
              :key="incident.id"
              class="flex items-start gap-4 p-4 border rounded-lg"
            >
              <AlertTriangle class="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold">{{ incident.incident_type }}</span>
                  <Badge v-if="incident.severity" :variant="getSeverityVariant(incident.severity)" class="text-xs">
                    {{ incident.severity }}
                  </Badge>
                  <Badge variant="outline" class="text-xs">
                    {{ formatTimestamp(incident.started_at) }}
                  </Badge>
                  <Badge v-if="incident.resolved" variant="default" class="text-xs">
                    Resolved
                  </Badge>
                </div>
                <p v-if="incident.title" class="text-sm font-medium mt-1">{{ incident.title }}</p>
                <p class="text-sm text-muted-foreground mt-1">{{ incident.description }}</p>
                <p class="text-xs text-muted-foreground mt-1">
                  Duration: {{ formatDuration(incident.duration_seconds) }}
                  <span v-if="incident.ended_at">
                    • Ended {{ formatTimestamp(incident.ended_at) }}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-8 text-green-600">
            No incidents recorded in the last 90 days
          </div>
        </CardContent>
      </Card>

      <!-- Footer -->
      <div class="text-center text-sm text-muted-foreground">
        <p>Status page automatically updates every 30 seconds</p>
      </div>
    </div>
  </div>
</template>
