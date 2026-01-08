<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import type { ProgressRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { reactiveOmit } from "@vueuse/core"
import {
  ProgressIndicator,
  ProgressRoot,
} from "reka-ui"
import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<ProgressRootProps & { class?: HTMLAttributes["class"] }>(),
  {
    modelValue: undefined,
  },
)

const delegatedProps = reactiveOmit(props, "class")

// Check if indeterminate (undefined or null modelValue)
const isIndeterminate = computed(() => props.modelValue === undefined || props.modelValue === null)
</script>

<template>
  <ProgressRoot
    data-slot="progress"
    v-bind="delegatedProps"
    :class="
      cn(
        'bg-primary/20 relative h-2 w-full overflow-hidden rounded-full',
        props.class,
      )
    "
  >
    <ProgressIndicator
      data-slot="progress-indicator"
      :class="cn(
        'bg-primary h-full flex-1 transition-all',
        isIndeterminate ? 'w-1/3 animate-progress-indeterminate' : 'w-full'
      )"
      :style="isIndeterminate ? undefined : `transform: translateX(-${100 - (props.modelValue ?? 0)}%);`"
    />
  </ProgressRoot>
</template>
