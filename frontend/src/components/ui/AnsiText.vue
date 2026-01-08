<script setup lang="ts">
import { computed } from 'vue'
import { parseAnsiForVue } from '@/utils/ansiParser'

const props = defineProps<{
  text: string
  tag?: string
}>()

const htmlContent = computed(() => parseAnsiForVue(props.text || ''))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-text-v-html-on-component -->
  <component :is="tag || 'span'" v-html="htmlContent"></component>
</template>
