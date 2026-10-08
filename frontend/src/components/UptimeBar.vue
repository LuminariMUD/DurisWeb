<script setup lang="ts">
import { computed } from 'vue'
import { format } from 'date-fns'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { UptimeHistoryDay } from '@/composables/usePublicStatus'

const props = defineProps<{
  day: UptimeHistoryDay
}>()

const barColor = computed(() => {
  const { uptime_percent, worst_severity, total_checks } = props.day

  if (!total_checks || total_checks === 0) {
    return 'bg-ink-top hover:bg-rule'
  }

  if (uptime_percent === 100 && !worst_severity) {
    return 'bg-success-deep hover:bg-success-deep/80'
  }

  if (worst_severity) {
    if (worst_severity === 'critical') return 'bg-danger-deep hover:bg-danger-deep/80'
    if (worst_severity === 'major') return 'bg-orange-500 hover:bg-orange-600'
    if (worst_severity === 'minor') return 'bg-warning hover:bg-warning-deep/80'
    return 'bg-info hover:bg-info/80'
  }

  if (uptime_percent >= 99.5) return 'bg-success hover:bg-success-deep/80'
  if (uptime_percent >= 95) return 'bg-warning hover:bg-warning-deep/80'
  if (uptime_percent >= 90) return 'bg-orange-500 hover:bg-orange-600'
  return 'bg-danger-deep hover:bg-danger-deep/80'
})

const formattedDate = computed(() => format(new Date(props.day.date), 'MMM d, yyyy'))

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Ongoing'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    const hrText = hours === 1 ? 'hr' : 'hrs'
    const minText = minutes === 1 ? 'min' : 'mins'
    return `${hours} ${hrText} ${minutes} ${minText}`
  }
  if (minutes > 0) {
    const minText = minutes === 1 ? 'min' : 'mins'
    return `${minutes} ${minText}`
  }
  return 'Less than 1 min'
}

function formatDowntime(uptimePercent: number, totalChecks: number): string {
  const downtimePercent = 100 - uptimePercent
  const downtimeChecks = Math.round((downtimePercent / 100) * totalChecks)

  // Assuming checks are every 5 minutes
  const downtimeMinutes = downtimeChecks * 5
  const hours = Math.floor(downtimeMinutes / 60)
  const minutes = downtimeMinutes % 60

  if (hours > 0) {
    const hrText = hours === 1 ? 'hr' : 'hrs'
    const minText = minutes === 1 ? 'min' : 'mins'
    return `${hours} ${hrText} ${minutes} ${minText}`
  }
  const minText = minutes === 1 ? 'min' : 'mins'
  return `${minutes} ${minText}`
}

function getIncidentLabel(incident: any): string {
  // Map severity to outage type like Claude does
  if (incident.severity === 'critical') return 'Major outage'
  if (incident.severity === 'major') return 'Partial outage'
  if (incident.severity === 'minor') return 'Degraded performance'
  return incident.title || 'Incident'
}
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          :class="['h-16 w-3 rounded-sm flex-shrink-0 cursor-pointer transition-colors', barColor]"
        ></div>
      </TooltipTrigger>
      <TooltipContent class="max-w-xs p-3 bg-card border-border" side="top">
        <div class="space-y-2">
          <!-- Date Header -->
          <div class="text-sm font-semibold text-foreground">{{ formattedDate }}</div>

          <!-- Incidents List -->
          <div v-if="day.incidents && day.incidents.length > 0" class="space-y-2">
            <div
              v-for="incident in day.incidents"
              :key="incident.id"
              class="space-y-0.5"
            >
              <!-- Incident Type -->
              <div class="flex items-center gap-2">
                <span class="text-warning text-sm">⚠</span>
                <span class="text-sm text-foreground capitalize">{{ getIncidentLabel(incident) }}</span>
              </div>
              <!-- Duration -->
              <div class="text-sm text-muted-foreground pl-5">
                {{ formatDuration(incident.duration_seconds) }}
              </div>
            </div>
          </div>

          <!-- Downtime without incident record -->
          <div v-else-if="day.uptime_percent < 100" class="space-y-0.5">
            <div class="flex items-center gap-2">
              <span class="text-warning text-sm">⚠</span>
              <span class="text-sm text-foreground">Partial outage</span>
            </div>
            <div class="text-sm text-muted-foreground pl-5">
              {{ formatDowntime(day.uptime_percent, day.total_checks) }}
            </div>
          </div>

          <!-- No incidents -->
          <div v-else class="text-sm text-muted-foreground">
            No downtime recorded
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
