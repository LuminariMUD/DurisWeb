<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

/** Vermilion call to action ("Enter the world") with a trailing arrow. */
const props = withDefaults(defineProps<{ to: RouteLocationRaw; compact?: boolean }>(), {
  compact: false,
})
</script>

<template>
  <RouterLink :to="props.to" class="brand-action" :class="{ 'brand-action--compact': props.compact }">
    <span><slot /></span><ArrowRight aria-hidden="true" />
  </RouterLink>
</template>
