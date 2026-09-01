<script setup lang="ts">
import { LockKeyhole, ShieldAlert, Unplug } from 'lucide-vue-next'
import type { MudTransportStatus } from '@/types/hooks'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

defineProps<{ transport: MudTransportStatus }>()

function display(value: string | number | null) {
  return value === null ? 'Unknown' : String(value)
}

function certificate(value: string | null, status: MudTransportStatus['certificateStatus']) {
  if (!value) return status.replace('_', ' ')
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? status.replace('_', ' ')
    : `${status}; expires ${date.toLocaleDateString()}`
}
</script>

<template>
  <Alert v-if="transport.blocked" variant="destructive" class="rounded-sm" role="alert">
    <ShieldAlert />
    <AlertTitle>Bridge transport blocked</AlertTitle>
    <AlertDescription>{{ transport.reason ?? 'The configured bridge endpoint is unsafe.' }}</AlertDescription>
  </Alert>
  <section class="rounded-sm border border-border bg-card p-4" aria-labelledby="transport-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="transport-title" class="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em]">
          <LockKeyhole class="size-4" /> Bridge transport
        </h2>
        <p class="mt-1 text-xs text-muted-foreground">Sanitized connection posture; credentials are never exposed.</p>
      </div>
      <Badge :variant="transport.authenticated ? 'default' : 'outline'">
        <Unplug v-if="!transport.connected" />
        {{ transport.authenticated ? 'AUTHENTICATED' : transport.connected ? 'NOT AUTHENTICATED' : 'DISCONNECTED' }}
      </Badge>
    </div>
    <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
      <div><dt class="text-muted-foreground">Scheme</dt><dd class="mt-1 font-mono font-semibold">{{ display(transport.scheme) }}</dd></div>
      <div><dt class="text-muted-foreground">Host</dt><dd class="mt-1 truncate font-mono font-semibold" :title="transport.host ?? undefined">{{ display(transport.host) }}</dd></div>
      <div><dt class="text-muted-foreground">Port</dt><dd class="mt-1 font-mono font-semibold">{{ display(transport.port) }}</dd></div>
      <div><dt class="text-muted-foreground">Loopback</dt><dd class="mt-1 font-mono font-semibold">{{ transport.loopback === null ? 'Unknown' : transport.loopback ? 'Yes' : 'No' }}</dd></div>
      <div><dt class="text-muted-foreground">Certificate</dt><dd class="mt-1 font-mono font-semibold">{{ certificate(transport.certificateExpiresAt, transport.certificateStatus) }}</dd></div>
      <div><dt class="text-muted-foreground">Secret age</dt><dd class="mt-1 font-mono font-semibold">{{ transport.secretAgeDays === null ? 'Unknown' : `${transport.secretAgeDays} days` }}</dd></div>
    </dl>
  </section>
</template>
