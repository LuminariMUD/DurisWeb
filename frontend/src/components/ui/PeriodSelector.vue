<script setup lang="ts">
import { computed } from 'vue'

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all'

interface Props {
  modelValue: AnalyticsPeriod
}

interface Emits {
  (e: 'update:modelValue', value: AnalyticsPeriod): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const periods: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'all', label: 'All Time' },
]

const selectedPeriod = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

function selectPeriod(period: AnalyticsPeriod) {
  selectedPeriod.value = period
}
</script>

<template>
  <div class="inline-flex gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
    <button
      v-for="period in periods"
      :key="period.value"
      type="button"
      :class="[
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        selectedPeriod === period.value
          ? 'bg-cyan-600 text-white shadow-sm'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
      ]"
      @click="selectPeriod(period.value)"
    >
      {{ period.label }}
    </button>
  </div>
</template>
