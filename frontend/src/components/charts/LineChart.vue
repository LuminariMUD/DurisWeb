<script setup lang="ts">
import { chartTheme } from '@/utils/chartTheme'
import { computed } from 'vue'
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
import { Line } from 'vue-chartjs'

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

interface Props {
  data: ChartData<'line'>
  options?: ChartOptions<'line'>
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  height: 300,
})

const defaultOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      ...chartTheme.tooltip,
      displayColors: false,
    },
  },
  scales: {
    x: {
      grid: {
        color: chartTheme.grid,
      },
      ticks: {
        color: chartTheme.muted,
        maxRotation: 0,
        autoSkipPadding: 20,
      },
    },
    y: {
      beginAtZero: true,
      grid: {
        color: chartTheme.grid,
      },
      ticks: {
        color: chartTheme.muted,
        precision: 0,
      },
    },
  },
}

const mergedOptions = computed(() => {
  return {
    ...defaultOptions,
    ...props.options,
  }
})
</script>

<template>
  <div :style="{ height: `${height}px` }">
    <Line :data="data" :options="mergedOptions" />
  </div>
</template>
