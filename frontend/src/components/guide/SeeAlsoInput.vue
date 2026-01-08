<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { guideApi } from '@/services/api'
import { stripAnsiCodes } from '@/utils/ansiParser'
import { X, Search, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Parse comma-separated string to array
const selectedTitles = computed(() => {
  if (!props.modelValue) return []
  return props.modelValue.split(',').map(s => s.trim()).filter(Boolean)
})

// Search state
const searchQuery = ref('')
const searchResults = ref<string[]>([])
const isSearching = ref(false)
const showDropdown = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

// Debounced search
const debouncedSearch = useDebounceFn(async () => {
  if (searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  isSearching.value = true
  try {
    const result = await guideApi.searchHelpFiles(searchQuery.value, 10)
    // Filter out already selected and map to titles
    searchResults.value = result.results
      .map(r => r.title || '')
      .filter(title => title && !selectedTitles.value.includes(title))
  } catch {
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}, 300)

watch(searchQuery, () => {
  debouncedSearch()
})

// Add a title to selection
function addTitle(title: string) {
  if (!title || selectedTitles.value.includes(title)) return
  const newTitles = [...selectedTitles.value, title]
  emit('update:modelValue', newTitles.join(', '))
  searchQuery.value = ''
  searchResults.value = []
  // Keep input focused for adding more
  inputRef.value?.focus()
}

// Remove a title from selection
function removeTitle(title: string) {
  const newTitles = selectedTitles.value.filter(t => t !== title)
  emit('update:modelValue', newTitles.join(', '))
}

// Handle input focus
function handleFocus() {
  showDropdown.value = true
}

// Handle input blur with delay to allow click on dropdown
function handleBlur() {
  setTimeout(() => {
    showDropdown.value = false
  }, 200)
}

// Handle keyboard navigation
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    showDropdown.value = false
    searchQuery.value = ''
  }
}
</script>

<template>
  <div class="space-y-2">
    <!-- Selected tags -->
    <div v-if="selectedTitles.length > 0" class="flex flex-wrap gap-1.5">
      <Badge
        v-for="title in selectedTitles"
        :key="title"
        variant="secondary"
        class="gap-1 pr-1"
      >
        {{ stripAnsiCodes(title) }}
        <button
          type="button"
          class="ml-1 rounded-full hover:bg-muted p-0.5"
          @click="removeTitle(title)"
        >
          <X class="h-3 w-3" />
        </button>
      </Badge>
    </div>

    <!-- Search input -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref="inputRef"
        v-model="searchQuery"
        placeholder="Search help files to add..."
        class="pl-10"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
      />
      <Loader2
        v-if="isSearching"
        class="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin"
      />

      <!-- Dropdown -->
      <div
        v-if="showDropdown && (searchResults.length > 0 || (searchQuery.length >= 2 && !isSearching))"
        class="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto"
      >
        <div v-if="searchResults.length === 0 && !isSearching" class="px-3 py-2 text-sm text-muted-foreground">
          No help files found
        </div>
        <button
          v-for="title in searchResults"
          :key="title"
          type="button"
          class="w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
          @mousedown.prevent="addTitle(title)"
        >
          {{ stripAnsiCodes(title) }}
        </button>
      </div>
    </div>
  </div>
</template>
