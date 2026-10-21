<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useFactionOverlap } from '@/composables/usePublicStatistics'
import type { FactionOverlapDays } from '@/services/api'
import { chartTheme, heatColor } from '@/utils/chartTheme'
import {
  type LocalOverlapHour,
  timeZoneLabel,
  toLocalOverlapHours,
  topOverlapWindows,
} from '@/utils/factionOverlap'

const dayOptions: FactionOverlapDays[] = [7, 14, 30]
const days = ref<FactionOverlapDays>(14)

const { data, isLoading, isError, refetch } = useFactionOverlap(days)

const zone = timeZoneLabel()
const hours = computed(() => toLocalOverlapHours(data.value?.hours ?? []))
const top = computed(() => topOverlapWindows(hours.value))
const best = computed(() => top.value[0])
const hasSamples = computed(() => (data.value?.samples ?? 0) > 0)

// Bars share one scale per side so peaks compare across the day.
const goodsAxis = computed(() => Math.max(3, ...hours.value.map((hour) => hour.goodsPeak)))
const evilsAxis = computed(() => Math.max(3, ...hours.value.map((hour) => hour.evilsPeak)))
const maxShare = computed(() => Math.max(0, ...hours.value.map((hour) => hour.bothShare)))
const topHours = computed(() => new Set(top.value.map((hour) => hour.utcHour)))

const focusedHour = ref<number | null>(null)
const detail = computed(
  () => hours.value.find((hour) => hour.utcHour === focusedHour.value) ?? best.value,
)

function heat(share: number): string {
  return share > 0 && maxShare.value > 0 ? heatColor(share / maxShare.value) : chartTheme.noData
}

function formatDate(date: string | null | undefined): string {
  if (!date) return ''
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

const coverage = computed(() =>
  data.value?.firstDate && data.value.lastDate
    ? `${formatDate(data.value.firstDate)} to ${formatDate(data.value.lastDate)} (UTC days)`
    : '',
)

function hourLabel(hour: LocalOverlapHour): string {
  return `${hour.label} ${zone}: goods peak ${hour.goodsPeak}, evils peak ${hour.evilsPeak}, both online ${hour.bothShare}% of samples`
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-8 gap-4">
      <div>
        <h1 class="text-4xl md:text-5xl text-foreground mb-2">Faction Overlap</h1>
        <p class="text-muted-foreground max-w-3xl">
          When goods and evils are most often online at the same time. Times are shown in your
          timezone ({{ zone }}). Complete UTC days appear after a minimum 24-hour delay.
        </p>
        <RouterLink
          to="/statistics/faction-activity"
          class="mt-2 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          See daily faction activity
        </RouterLink>
      </div>

      <div role="group" aria-label="Days to include" class="inline-flex gap-1 rounded-lg border border-border bg-card p-1 self-start lg:self-auto">
        <button
          v-for="option in dayOptions"
          :key="option"
          type="button"
          :aria-pressed="days === option"
          :class="[
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors min-h-9',
            days === option
              ? 'bg-vermilion-deep text-white shadow-sm'
              : 'text-muted-foreground hover:bg-ink-high hover:text-foreground',
          ]"
          @click="days = option"
        >
          Last {{ option }} days
        </button>
      </div>
    </div>

    <div v-if="isError" role="alert" class="bg-ink-high/50 rounded-lg p-6 border border-border py-12 text-center space-y-4">
      <p>Unable to load faction overlap. Please try again.</p>
      <Button variant="outline" @click="refetch()">Try again</Button>
    </div>
    <div
      v-else-if="isLoading"
      role="status"
      class="bg-ink-high/50 rounded-lg border border-border h-96 flex items-center justify-center text-muted-foreground"
    >
      Loading overlap data...
    </div>
    <div
      v-else-if="!hasSamples"
      role="status"
      class="bg-ink-high/50 rounded-lg border border-border h-96 flex items-center justify-center text-muted-foreground px-6 text-center"
    >
      No published faction activity yet. Check back after the 24-hour delay.
    </div>

    <div v-else class="space-y-10">
      <section aria-label="Best hour" class="grid grid-cols-1 sm:grid-cols-3 rounded-lg border border-border bg-ink-high/50">
        <div class="p-6 border-b sm:border-b-0 sm:border-r border-border">
          <p class="index-label">Best hour</p>
          <p class="font-display text-6xl leading-none mt-2">{{ best ? best.label : '—' }}</p>
          <p class="text-sm text-muted-foreground mt-2">
            {{ best ? `Both sides online in ${best.bothShare}% of samples` : 'Goods and evils were not online together in this period' }}
          </p>
        </div>
        <div class="p-6 border-b sm:border-b-0 sm:border-r border-border">
          <p class="font-label uppercase tracking-[0.14em] text-[0.6875rem] text-success">Goods peak</p>
          <p class="font-display text-6xl leading-none mt-2 text-success">{{ best ? best.goodsPeak : '—' }}</p>
          <p v-if="best" class="text-sm text-muted-foreground mt-2">
            players at {{ best.label }} · avg {{ best.goodsAverageWhileBoth.toFixed(1) }} while both online
          </p>
        </div>
        <div class="p-6">
          <p class="font-label uppercase tracking-[0.14em] text-[0.6875rem] text-danger">Evils peak</p>
          <p class="font-display text-6xl leading-none mt-2 text-danger">{{ best ? best.evilsPeak : '—' }}</p>
          <p v-if="best" class="text-sm text-muted-foreground mt-2">
            players at {{ best.label }} · avg {{ best.evilsAverageWhileBoth.toFixed(1) }} while both online
          </p>
        </div>
      </section>

      <section v-if="top.length" aria-labelledby="overlap-top">
        <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 id="overlap-top" class="text-3xl text-foreground">Top {{ top.length === 1 ? 'window' : `${top.length} windows` }}</h2>
          <p class="text-sm text-muted-foreground">
            Ranked by how often both sides were online together. One dot per player at that hour's peak.
          </p>
        </div>
        <div class="rounded-lg border border-border bg-ink-high/50 overflow-x-auto">
          <table class="w-full min-w-[640px] text-left">
            <thead>
              <tr class="border-b border-border">
                <th scope="col" class="index-label font-normal px-4 py-3">Rank</th>
                <th scope="col" class="index-label font-normal px-4 py-3">Time ({{ zone }})</th>
                <th scope="col" class="font-label uppercase tracking-[0.14em] text-[0.6875rem] font-normal px-4 py-3 text-success">Goods peak</th>
                <th scope="col" class="font-label uppercase tracking-[0.14em] text-[0.6875rem] font-normal px-4 py-3 text-danger">Evils peak</th>
                <th scope="col" class="index-label font-normal px-4 py-3 text-right">Both online</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(window, index) in top" :key="window.utcHour" class="border-b border-border last:border-b-0">
                <td class="px-4 py-3 font-display text-2xl text-ember">{{ index + 1 }}</td>
                <td class="px-4 py-3 font-display text-2xl">{{ window.label }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <span class="text-lg font-semibold text-success tabular-nums">{{ window.goodsPeak }}</span>
                    <span class="flex gap-1" aria-hidden="true">
                      <span v-for="n in window.goodsPeak" :key="n" class="block size-3 rounded-full bg-success" />
                    </span>
                    <span class="text-xs text-muted-foreground">avg {{ window.goodsAverageWhileBoth.toFixed(1) }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <span class="text-lg font-semibold text-danger tabular-nums">{{ window.evilsPeak }}</span>
                    <span class="flex gap-1" aria-hidden="true">
                      <span v-for="n in window.evilsPeak" :key="n" class="block size-3 rounded-full bg-danger" />
                    </span>
                    <span class="text-xs text-muted-foreground">avg {{ window.evilsAverageWhileBoth.toFixed(1) }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-col items-end gap-1.5">
                    <span class="text-lg font-semibold tabular-nums">{{ window.bothShare.toFixed(1) }}%</span>
                    <span class="block h-1 w-32 bg-ink-high" aria-hidden="true">
                      <span class="block h-1 bg-ember" :style="{ width: `${(window.bothShare / maxShare) * 100}%` }" />
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="overlap-day">
        <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 id="overlap-day" class="text-3xl text-foreground">The whole day</h2>
          <div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span class="flex items-center gap-2"><span class="block size-2.5 bg-success" aria-hidden="true" />Goods peak</span>
            <span class="flex items-center gap-2"><span class="block size-2.5 bg-danger" aria-hidden="true" />Evils peak</span>
            <span class="flex items-center gap-2">
              <span class="block h-2.5 w-6" aria-hidden="true" :style="{ background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(1)})` }" />
              Both online
            </span>
          </div>
        </div>
        <div class="rounded-lg border border-border bg-ink-high/50 p-4 sm:p-6">
          <div class="overflow-x-auto">
            <ul class="grid grid-cols-24 gap-1 min-w-[640px]" aria-label="Peak players and overlap by hour">
              <li v-for="hour in hours" :key="hour.utcHour">
                <button
                  type="button"
                  :aria-label="hourLabel(hour)"
                  :aria-pressed="detail?.utcHour === hour.utcHour"
                  :class="[
                    'flex w-full flex-col items-center rounded-sm border py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    topHours.has(hour.utcHour) ? 'border-ember/60' : 'border-transparent',
                  ]"
                  @mouseenter="focusedHour = hour.utcHour"
                  @focus="focusedHour = hour.utcHour"
                  @click="focusedHour = hour.utcHour"
                >
                  <span class="flex h-24 w-full items-end justify-center">
                    <span
                      class="block w-3/5 bg-success"
                      :class="topHours.has(hour.utcHour) ? '' : 'opacity-60'"
                      :style="{ height: `${(hour.goodsPeak / goodsAxis) * 100}%` }"
                    />
                  </span>
                  <span class="block h-px w-full bg-faint" />
                  <span class="flex h-32 w-full items-start justify-center">
                    <span
                      class="block w-3/5 bg-danger"
                      :class="topHours.has(hour.utcHour) ? '' : 'opacity-60'"
                      :style="{ height: `${(hour.evilsPeak / evilsAxis) * 100}%` }"
                    />
                  </span>
                  <span class="mt-2 block h-3.5 w-5/6" :style="{ background: heat(hour.bothShare) }" />
                  <span
                    class="mt-2 font-label text-[11px] tabular-nums"
                    :class="topHours.has(hour.utcHour) ? 'text-foreground font-semibold' : 'text-muted-foreground'"
                  >
                    {{ hour.label.endsWith(':00') ? hour.label.slice(0, 2) : hour.label }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
          <p v-if="detail" class="mt-4 text-sm text-muted-foreground" aria-live="polite">
            <span class="text-foreground font-semibold">{{ detail.label }} {{ zone }}</span>:
            <span class="text-success">{{ detail.goodsPeak }} goods</span> and
            <span class="text-danger">{{ detail.evilsPeak }} evils</span> at peak, both online in
            {{ detail.bothShare.toFixed(1) }}% of samples. Average {{ detail.goodsAverage.toFixed(2) }} goods and
            {{ detail.evilsAverage.toFixed(2) }} evils.
          </p>
        </div>
      </section>

      <p class="text-sm text-muted-foreground border-t border-border pt-4 max-w-4xl">
        Based on {{ data?.samples.toLocaleString() }} recorded samples, {{ coverage }}. “Both online” means at
        least one goods and one evils player were on at that moment. Hover or select an hour for its numbers;
        outlined hours are the top windows.
      </p>
    </div>
  </div>
</template>
