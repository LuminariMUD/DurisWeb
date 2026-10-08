<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'

/** Underlined secondary link in the display face. */
const props = defineProps<{ to: RouteLocationRaw }>()
</script>

<template>
  <RouterLink :to="props.to" class="brand-link brand-text-link"><slot /></RouterLink>
</template>
