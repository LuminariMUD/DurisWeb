<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SuggestionKeyDownProps } from '@tiptap/suggestion'

interface MentionItem {
  id: string
  label: string
}

const props = defineProps<{
  items: MentionItem[]
  command: (item: MentionItem) => void
}>()

const selectedIndex = ref(0)

watch(
  () => props.items,
  () => {
    selectedIndex.value = 0
  },
)

function onKeyDown({ event }: SuggestionKeyDownProps): boolean {
  if (event.key === 'ArrowUp') {
    upHandler()
    return true
  }

  if (event.key === 'ArrowDown') {
    downHandler()
    return true
  }

  if (event.key === 'Enter') {
    enterHandler()
    return true
  }

  return false
}

function upHandler() {
  selectedIndex.value = (selectedIndex.value + props.items.length - 1) % props.items.length
}

function downHandler() {
  selectedIndex.value = (selectedIndex.value + 1) % props.items.length
}

function enterHandler() {
  selectItem(selectedIndex.value)
}

function selectItem(index: number) {
  const item = props.items[index]

  if (item) {
    props.command(item)
  }
}

defineExpose({
  onKeyDown,
})
</script>

<template>
  <div class="mention-dropdown bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[200px]">
    <template v-if="items.length">
      <button
        v-for="(item, index) in items"
        :key="item.id"
        type="button"
        class="w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2"
        :class="index === selectedIndex ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-700'"
        @click="selectItem(index)"
      >
        <span class="text-gray-400">@</span>
        <span>{{ item.label }}</span>
      </button>
    </template>
    <div v-else class="px-3 py-2 text-sm text-gray-500">
      No results
    </div>
  </div>
</template>

<style scoped>
.mention-dropdown {
  max-height: 200px;
  overflow-y: auto;
}
</style>
