<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'

interface Option {
  value: string | number
  label: string
  html?: string
}

interface Props {
  modelValue: string | number | null
  options: Option[]
  placeholder?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const selectedOption = computed(() => {
  if (!props.modelValue) return null
  return props.options.find(opt => opt.value === props.modelValue)
})

const isOpen = ref(false)
const selectRef = ref<HTMLDivElement | null>(null)

const selectOption = (value: string | number) => {
  emit('update:modelValue', value)
  isOpen.value = false
}

// Click outside handler
const handleClickOutside = (event: MouseEvent) => {
  if (selectRef.value && !selectRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="selectRef" class="relative">
    <button
      @click="isOpen = !isOpen"
      type="button"
      class="flex h-10 w-full items-center justify-between rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
    >
      <span v-if="selectedOption?.html" v-html="selectedOption.html"></span>
      <span v-else-if="selectedOption">{{ selectedOption.label }}</span>
      <span v-else class="text-gray-500">{{ placeholder || 'Select...' }}</span>
      <svg class="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div
      v-if="isOpen"
      class="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-700 bg-gray-900 py-1 shadow-lg"
    >
      <button
        v-for="option in options"
        :key="option.value"
        @click="selectOption(option.value)"
        type="button"
        class="w-full px-3 py-2 text-left text-sm hover:bg-gray-800 focus:bg-gray-800 focus:outline-none"
        :class="{ 'bg-gray-800': option.value === modelValue }"
      >
        <span v-if="option.html" v-html="option.html"></span>
        <span v-else>{{ option.label }}</span>
      </button>
    </div>
  </div>
</template>
