<script setup lang="ts">
import { computed } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { FlagDefinition } from '@/types'

const props = defineProps<{
  value: number
  flags: FlagDefinition[]
}>()

const emit = defineEmits<{
  (e: 'update', value: number): void
}>()

// Check if a flag is active (bitfield check)
function isFlagActive(flag: FlagDefinition): boolean {
  return (props.value & flag.value) !== 0
}

// Toggle a flag
function toggleFlag(flag: FlagDefinition) {
  let newValue: number
  if (isFlagActive(flag)) {
    // Remove flag (bitwise AND with NOT flag)
    newValue = props.value & ~flag.value
  } else {
    // Add flag (bitwise OR)
    newValue = props.value | flag.value
  }
  emit('update', newValue)
}

// Group flags into columns for better display
const flagColumns = computed(() => {
  const cols: FlagDefinition[][] = [[], [], []]
  props.flags.forEach((flag, index) => {
    const colIndex = index % 3
    if (cols[colIndex]) {
      cols[colIndex].push(flag)
    }
  })
  return cols
})
</script>

<template>
  <TooltipProvider>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="(column, colIndex) in flagColumns" :key="colIndex" class="space-y-2">
        <div
          v-for="flag in column"
          :key="flag.value"
          class="flex items-center space-x-2"
        >
          <Checkbox
            :id="`flag-${flag.value}`"
            :model-value="isFlagActive(flag)"
            @update:model-value="toggleFlag(flag)"
          />
          <Tooltip v-if="flag.description">
            <TooltipTrigger asChild>
              <Label
                :for="`flag-${flag.value}`"
                class="text-sm cursor-pointer hover:text-primary"
              >
                {{ flag.name }}
              </Label>
            </TooltipTrigger>
            <TooltipContent>
              <p class="max-w-xs">{{ flag.description }}</p>
            </TooltipContent>
          </Tooltip>
          <Label
            v-else
            :for="`flag-${flag.value}`"
            class="text-sm cursor-pointer"
          >
            {{ flag.name }}
          </Label>
        </div>
      </div>
    </div>

    <!-- Show raw value for debugging -->
    <div class="mt-4 pt-4 border-t">
      <p class="text-xs text-muted-foreground font-mono">
        Raw flags value: {{ value }} (0x{{ value.toString(16).toUpperCase() }})
      </p>
    </div>
  </TooltipProvider>
</template>
