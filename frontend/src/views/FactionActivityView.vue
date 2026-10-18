<script setup lang="ts">
import { chartTheme, withAlpha } from '@/utils/chartTheme'
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/themes/dark.css'
import { Button } from '@/components/ui/button'
import { Calendar } from '@lucide/vue'
import { useFactionActivity, useAvailableDates } from '@/composables/usePublicStatistics'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const {
  data: availableDatesData,
  isLoading: loadingDates,
  isError: datesError,
  refetch: retryDates,
} = useAvailableDates()

const selectedDate = ref('')
const dateInput = ref<HTMLInputElement | null>(null)
let datePicker: flatpickr.Instance | null = null

function initFlatpickr() {
  if (datePicker || !dateInput.value || !availableDatesData.value?.dates?.length) return

  const dates = availableDatesData.value.dates
  const defaultDate = dates[0]!
  selectedDate.value = defaultDate

  datePicker = flatpickr(dateInput.value, {
    dateFormat: 'Y-m-d',
    maxDate: defaultDate,
    enable: dates,
    defaultDate,
    onChange: (_selectedDates: Date[], dateStr: string) => {
      selectedDate.value = dateStr
    },
  })
}

// when data loads, wait for DOM update then init
watch(availableDatesData, async (data) => {
  if (data?.dates?.length) {
    await nextTick()
    initFlatpickr()
  }
})

onMounted(() => {
  initFlatpickr()
})

const {
  data: activityData,
  isLoading: loadingActivity,
  isError: activityError,
  refetch: retryActivity,
} = useFactionActivity(selectedDate)

const chartData = computed<ChartData<'line'>>(() => {
  const points = activityData.value?.data || []

  return {
    labels: points.map((p) => {
      const date = new Date(p.timestamp * 1000)
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC',
      })
    }),
    datasets: [
      {
        label: 'Goods',
        data: points.map((p) => p.goods),
        borderColor: chartTheme.faction.good,
        backgroundColor: withAlpha(chartTheme.faction.good, 0.1),
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Evils',
        data: points.map((p) => p.evils),
        borderColor: chartTheme.faction.evil,
        backgroundColor: withAlpha(chartTheme.faction.evil, 0.1),
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Neutrals',
        data: points.map((p) => p.neutrals),
        borderColor: chartTheme.faction.neutral,
        backgroundColor: withAlpha(chartTheme.faction.neutral, 0.1),
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Undeads',
        data: points.map((p) => p.undeads),
        borderColor: chartTheme.faction.undead,
        backgroundColor: withAlpha(chartTheme.faction.undead, 0.1),
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      labels: { color: chartTheme.muted },
    },
    title: {
      display: false,
    },
    tooltip: {
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: 'Player Count', color: chartTheme.muted },
      grid: { color: chartTheme.grid },
      ticks: { color: chartTheme.muted },
    },
    x: {
      title: { display: true, text: 'Time (UTC)', color: chartTheme.muted },
      grid: { color: chartTheme.grid },
      ticks: { color: chartTheme.muted, maxRotation: 45 },
    },
  },
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false,
  },
}))

onUnmounted(() => {
  if (datePicker) {
    datePicker.destroy()
    datePicker = null
  }
})
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <!-- Header with date picker on right -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
      <div>
        <h1 class="text-4xl md:text-5xl text-foreground mb-2">Faction Activity</h1>
        <p class="text-muted-foreground">
          Recorded player counts by faction. Complete UTC days appear after a minimum 24-hour delay.
        </p>
      </div>

      <!-- Date Picker -->
      <div class="flex items-center gap-2">
        <Calendar class="w-5 h-5 text-muted-foreground" aria-hidden="true" />
        <div v-if="loadingDates" class="text-muted-foreground text-sm">Loading...</div>
        <input
          v-else-if="availableDatesData?.dates.length"
          ref="dateInput"
          aria-label="Activity date (UTC)"
          type="text"
          placeholder="Select date"
          readonly
          class="bg-ink-top border border-faint text-white rounded-lg px-4 py-2 w-40 cursor-pointer focus:ring-2 focus:ring-info focus:border-transparent"
        />
      </div>
    </div>

    <!-- Chart -->
    <div class="bg-ink-high/50 rounded-lg p-6 border border-border">
      <div v-if="datesError || activityError" role="alert" class="py-12 text-center space-y-4">
        <p>Unable to load faction activity. Please try again.</p>
        <Button variant="outline" @click="datesError ? retryDates() : retryActivity()">Try again</Button>
      </div>
      <div v-else-if="loadingDates || loadingActivity" role="status" class="h-96 flex items-center justify-center text-muted-foreground">
        Loading activity data...
      </div>
      <div v-else-if="!activityData?.data?.length" role="status" class="h-96 flex items-center justify-center text-muted-foreground">
        {{ availableDatesData?.dates.length ? 'No data available for selected date' : 'No published faction activity yet. Check back after the 24-hour delay.' }}
      </div>
      <div v-else class="h-96">
        <Line :data="chartData" :options="chartOptions" :aria-label="`Faction player counts for ${selectedDate}, times in UTC`" role="img" />
      </div>
    </div>

    <!-- Legend Info -->
    <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-ink-high/50 rounded-lg p-4 border border-border">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full bg-success"></div>
          <span class="text-success font-medium">Goods</span>
        </div>
        <p class="text-xs text-muted-foreground">Light races fighting for good</p>
      </div>
      <div class="bg-ink-high/50 rounded-lg p-4 border border-border">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full bg-danger"></div>
          <span class="text-danger font-medium">Evils</span>
        </div>
        <p class="text-xs text-muted-foreground">Dark races serving darkness</p>
      </div>
      <div class="bg-ink-high/50 rounded-lg p-4 border border-border">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full bg-warning"></div>
          <span class="text-warning font-medium">Neutrals</span>
        </div>
        <p class="text-xs text-muted-foreground">Independent factions</p>
      </div>
      <div class="bg-ink-high/50 rounded-lg p-4 border border-border">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full bg-purple-500"></div>
          <span class="text-purple-400 font-medium">Undeads</span>
        </div>
        <p class="text-xs text-muted-foreground">The risen dead</p>
      </div>
    </div>
  </div>
</template>
