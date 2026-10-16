<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { usePrivacyChoices } from '@/services/privacy'

const props = defineProps<{ compact?: boolean }>()
const {
  phase,
  server,
  error,
  busy,
  storageReadable,
  synchronizationReady,
  canAccept,
  canRefuse,
  choose,
  refresh,
} = usePrivacyChoices()
const show = computed(
  () =>
    !props.compact ||
    (!!server.value?.choicesAvailable &&
      phase.value !== 'accepted' &&
      phase.value !== 'refused' &&
      phase.value !== 'withdrawn'),
)
const message = computed(
  () =>
    ({
      loading: 'Checking your privacy choice. Visit tracking is off while we check.',
      unknown: 'Visit tracking is off in this browser. You can choose below.',
      accepted: 'You allowed optional visit statistics. You can withdraw at any time.',
      refused: 'Your refusal is saved. Optional visit tracking is off.',
      withdrawn: 'Your withdrawal is saved. Optional visit tracking is off.',
      disabled: 'Optional visit statistics are paused. They cannot be turned on here.',
      obsolete:
        'The privacy details have changed. Visit tracking is off until this page matches the current notice.',
      unavailable: 'Your privacy choice could not be checked. Visit tracking is off.',
      saving: 'Saving your choice. Visit tracking is off until confirmation.',
      unsaved: 'Your choice was not confirmed. Visit tracking is off in this tab.',
    })[phase.value],
)
const withdraw = computed(
  () => phase.value === 'accepted' || server.value?.decision === 'accepted' || busy.value > 0,
)
</script>

<template>
  <section v-if="show" aria-labelledby="privacy-choice-heading" class="space-y-4 border border-border bg-card p-4 sm:p-6">
    <h2 id="privacy-choice-heading" class="text-2xl">Your privacy choice</h2>
    <p role="status" aria-live="polite" class="text-muted-foreground">{{ message }}</p>
    <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
    <p v-if="server?.choicesAvailable && (!storageReadable || !synchronizationReady)" class="text-muted-foreground">
      This browser cannot safely remember or share privacy choices between tabs. Visit tracking stays off here. You can still try to save a refusal or withdrawal.
    </p>
    <div v-if="server?.choicesAvailable" class="flex flex-wrap gap-3">
      <Button type="button" variant="outline" class="min-h-11" :disabled="!canAccept" @click="choose('accepted')">Allow visit statistics</Button>
      <Button type="button" variant="outline" class="min-h-11" :disabled="!canRefuse" @click="choose(withdraw ? 'withdrawn' : 'refused')">{{ withdraw ? 'Withdraw permission' : 'Refuse visit statistics' }}</Button>
    </div>
    <div class="flex flex-wrap items-center gap-4">
      <Button type="button" variant="ghost" :disabled="busy > 0" @click="refresh">Check saved choice</Button>
      <RouterLink v-if="compact" to="/privacy" class="underline underline-offset-4">Read privacy details</RouterLink>
    </div>
    <p v-if="phase === 'withdrawn' || phase === 'refused'" class="text-sm text-muted-foreground">
      This stops future optional collection. It does not delete statistics already received. You can ask about removal below.
    </p>
  </section>
</template>
