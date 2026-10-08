<script setup lang="ts">
import { computed } from 'vue'

/**
 * Page or section heading in the display face. Wrap the accent words in
 * `<em>` inside the default slot to render them in vermilion italic.
 */
const props = withDefaults(
  defineProps<{ level?: 1 | 2 | 3; size?: 'page' | 'section' | 'none' }>(),
  { level: 1, size: undefined },
)

const tag = computed(() => `h${props.level}`)
const sizeClass = computed(() => {
  const size = props.size ?? (props.level === 1 ? 'page' : 'section')
  return size === 'none' ? '' : `display-heading--${size}`
})
</script>

<template>
  <component :is="tag" class="display-heading" :class="sizeClass"><slot /></component>
</template>
