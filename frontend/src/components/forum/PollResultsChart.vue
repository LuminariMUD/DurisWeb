<template>
  <div class="bg-muted/30 p-4 rounded-md">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Left Column: Poll Description -->
      <div class="space-y-2 text-sm">
        <div v-for="option in options" :key="option.id" class="flex items-start gap-2">
          <div
            class="w-3 h-3 rounded-full flex-shrink-0 mt-1"
            :style="{ backgroundColor: getColor(option.id) }"
          ></div>
          <div class="flex-1 break-words">
            <span class="font-medium">{{ option.optionText }}</span>
            <span class="text-muted-foreground ml-2">({{ option.voteCount }} {{ option.voteCount === 1 ? 'vote' : 'votes' }})</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Pie Chart -->
      <div class="flex flex-col items-center justify-center">
        <div class="w-full max-w-[280px] aspect-square">
          <Pie :data="chartData" :options="chartOptions" />
        </div>
        <div class="mt-2 text-sm text-muted-foreground font-medium">
          Total: {{ totalVotes }} {{ totalVotes === 1 ? 'vote' : 'votes' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Pie } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartOptions
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import type { PollOption } from '@/types'

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels)

const props = defineProps<{
  options: PollOption[]
  totalVotes: number
  userVotes: number[]
}>()

// Generate colors for each option
function getColor(optionId: number): string {
  const index = props.options.findIndex(o => o.id === optionId)
  const hue = (index * 360) / props.options.length
  const isUserVote = props.userVotes.includes(optionId)
  const saturation = isUserVote ? 70 : 50
  const lightness = isUserVote ? 55 : 45
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

const chartData = computed(() => ({
  labels: props.options.map(o => o.optionText),
  datasets: [
    {
      data: props.options.map(o => o.voteCount),
      backgroundColor: props.options.map(o => getColor(o.id)),
      borderColor: '#18181b',
      borderWidth: 2,
    }
  ]
}))

const chartOptions = computed<ChartOptions<'pie'>>(() => ({
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          const label = context.label || ''
          const value = context.parsed || 0
          const percentage = props.totalVotes > 0 ? Math.round((value / props.totalVotes) * 100) : 0
          return `${label}: ${value} vote${value !== 1 ? 's' : ''} (${percentage}%)`
        }
      }
    },
    datalabels: {
      color: '#ffffff',
      font: {
        weight: 'bold',
        size: 14
      },
      formatter: (value: number) => {
        const percentage = props.totalVotes > 0 ? Math.round((value / props.totalVotes) * 100) : 0
        return percentage > 0 ? `${percentage}%` : ''
      },
      // Only show label if slice is large enough (>5%)
      display: (context) => {
        const value = context.dataset.data[context.dataIndex] as number
        const percentage = props.totalVotes > 0 ? (value / props.totalVotes) * 100 : 0
        return percentage > 5
      }
    }
  }
}))
</script>
