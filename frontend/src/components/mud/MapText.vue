<script setup lang="ts">
import { computed } from 'vue'
import { parseMapText } from '../../utils/mapText.js'
const props = defineProps<{ text: string; fontSize?: number }>()
const runs = computed(() => parseMapText(props.text))
</script>
<template>
  <pre class="font-mono whitespace-pre leading-tight" :style="{ fontSize: `${fontSize ?? 18}px` }"><span v-for="(run, index) in runs" :key="index" :style="{ color: run.foreground, backgroundColor: run.background }">{{ run.text }}</span></pre>
</template>
