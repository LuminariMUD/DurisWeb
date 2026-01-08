<script setup lang="ts">
import { computed } from 'vue'
import {
  Chart as ChartJS,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { Pie } from 'vue-chartjs'

ChartJS.register(
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
)

interface Props {
  data: ChartData<'pie'>
  options?: ChartOptions<'pie'>
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  height: 300
})

const defaultOptions: ChartOptions<'pie'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right',
      labels: {
        color: 'rgba(255, 255, 255, 0.7)',
        padding: 15,
        usePointStyle: true,
        pointStyle: 'circle',
      },
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleColor: '#fff',
      bodyColor: '#fff',
      borderColor: '#444',
      borderWidth: 1,
      padding: 12,
    },
    datalabels: {
      color: '#fff',
      font: {
        weight: 'bold',
        size: 12,
      },
      formatter: (value: number, context: any) => {
        const dataset = context.dataset.data as number[]
        const total = dataset.reduce((acc: number, val: number) => acc + val, 0)
        const percentage = ((value / total) * 100).toFixed(1)
        // Only show label if percentage is >= 5%
        return parseFloat(percentage) >= 5 ? `${percentage}%` : ''
      },
      anchor: 'center',
      align: 'center',
    },
  },
}

const mergedOptions = computed(() => {
  return {
    ...defaultOptions,
    ...props.options,
    plugins: {
      ...defaultOptions.plugins,
      ...props.options?.plugins,
      // Always include datalabels
      datalabels: {
        ...defaultOptions.plugins?.datalabels,
        ...(props.options?.plugins as any)?.datalabels,
      },
    },
  }
})
</script>

<template>
  <div :style="{ height: `${height}px` }">
    <Pie :data="data" :options="mergedOptions" />
  </div>
</template>
