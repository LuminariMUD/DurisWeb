<template>
  <Teleport to="body">
    <div
      v-if="isOpen && suggestions.length > 0"
      class="fixed z-50 w-64 bg-popover border border-border rounded-md shadow-lg"
      :style="{
        top: `${position.top}px`,
        left: `${position.left}px`
      }"
    >
      <div class="p-1">
        <button
          v-for="(username, index) in suggestions"
          :key="username"
          @click="selectMention(username)"
          @mouseenter="selectedIndex = index"
          class="w-full text-left px-3 py-2 rounded-sm text-sm transition-colors"
          :class="[
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'
          ]"
        >
          <span class="font-medium">@{{ username }}</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, toRefs } from 'vue'

export interface MentionAutocompleteProps {
  suggestions: string[]
  selectedIndex: number
  isOpen: boolean
  position: { top: number; left: number }
}

const props = defineProps<MentionAutocompleteProps>()
const emit = defineEmits<{
  selectMention: [username: string]
  'update:selectedIndex': [index: number]
}>()

const { suggestions, isOpen, position } = toRefs(props)

const selectedIndex = computed({
  get: () => props.selectedIndex,
  set: (value) => emit('update:selectedIndex', value)
})

function selectMention(username: string) {
  emit('selectMention', username)
}
</script>
