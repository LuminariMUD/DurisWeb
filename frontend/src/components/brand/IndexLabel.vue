<script setup lang="ts">
/** Monospace uppercase label for indexes, rails, metadata and timestamps. */
const props = withDefaults(defineProps<{ as?: string }>(), { as: 'span' })
</script>

<template>
  <component :is="props.as" class="index-label"><slot /></component>
</template>
