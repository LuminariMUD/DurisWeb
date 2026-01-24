<script setup lang="ts">
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
import { Calendar } from 'lucide-vue-next'
import { useFactionActivity, useAvailableDates } from '@/composables/usePublicStatistics'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const { data: availableDatesData, isLoading: loadingDates } = useAvailableDates()

const selectedDate = ref('')
const dateInput = ref<HTMLInputElement | null>(null)
let datePicker: flatpickr.Instance | null = null

function initFlatpickr() {
  if (datePicker || !dateInput.value || !availableDatesData.value?.dates?.length) return

  const dates = availableDatesData.value.dates
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  // use yesterday if available, otherwise first available date
  const defaultDate = dates.includes(yesterdayStr) ? yesterdayStr : dates[0]
  selectedDate.value = defaultDate

  datePicker = flatpickr(dateInput.value, {
    dateFormat: 'Y-m-d',
    maxDate: yesterday,
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

const { data: activityData, isLoading: loadingActivity } = useFactionActivity(selectedDate)

const chartData = computed<ChartData<'line'>>(() => {
  const points = activityData.value?.data || []

  return {
    labels: points.map(p => {
      const date = new Date(p.timestamp * 1000)
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    }),
    datasets: [
      {
        label: 'Goods',
        data: points.map(p => p.goods),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Evils',
        data: points.map(p => p.evils),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Neutrals',
        data: points.map(p => p.neutrals),
        borderColor: 'rgb(234, 179, 8)',
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Undeads',
        data: points.map(p => p.undeads),
        borderColor: 'rgb(168, 85, 247)',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
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
      labels: { color: 'rgb(156, 163, 175)' },
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
      title: { display: true, text: 'Player Count', color: 'rgb(156, 163, 175)' },
      grid: { color: 'rgba(75, 85, 99, 0.3)' },
      ticks: { color: 'rgb(156, 163, 175)' },
    },
    x: {
      title: { display: true, text: 'Time', color: 'rgb(156, 163, 175)' },
      grid: { color: 'rgba(75, 85, 99, 0.3)' },
      ticks: { color: 'rgb(156, 163, 175)', maxRotation: 45 },
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
        <h1 class="text-3xl font-bold text-white mb-2">Faction Activity</h1>
        <p class="text-gray-400">
          Historical player activity by faction. Data is delayed by 24 hours.
        </p>
      </div>

      <!-- Date Picker -->
      <div class="flex items-center gap-2">
        <Calendar class="w-5 h-5 text-gray-400" />
        <div v-if="loadingDates" class="text-gray-400 text-sm">Loading...</div>
        <input
          v-else
          ref="dateInput"
          type="text"
          placeholder="Select date"
          readonly
          class="bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2 w-40 cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>

    <!-- Chart -->
    <div class="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
      <div v-if="loadingActivity" class="h-96 flex items-center justify-center text-gray-400">
        Loading activity data...
      </div>
      <div v-else-if="!activityData?.data?.length" class="h-96 flex items-center justify-center text-gray-400">
        No data available for selected date
      </div>
      <div v-else class="h-96">
        <Line :data="chartData" :options="chartOptions" />
      </div>
    </div>

    <!-- Legend Info -->
    <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full bg-green-500"></div>
          <span class="text-green-400 font-medium">Goods</span>
        </div>
        <p class="text-xs text-gray-400">Light races fighting for good</p>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
          <span class="text-red-400 font-medium">Evils</span>
        </div>
        <p class="text-xs text-gray-400">Dark races serving darkness</p>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span class="text-yellow-400 font-medium">Neutrals</span>
        </div>
        <p class="text-xs text-gray-400">Independent factions</p>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full bg-purple-500"></div>
          <span class="text-purple-400 font-medium">Undeads</span>
        </div>
        <p class="text-xs text-gray-400">The risen dead</p>
      </div>
    </div>
  </div>
</template>
