<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { Input } from '@/components/ui/input'
import { User, Loader2 } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    placeholder: 'Search accounts...',
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'select', value: string): void
}>()

// Local input value
const inputValue = ref(props.modelValue)
const showDropdown = ref(false)
const selectedIndex = ref(-1)

// Debounced search query
const searchQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(inputValue, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    searchQuery.value = val
  }, 300)
})

// Search accounts query
const { data: accounts, isLoading } = useQuery({
  queryKey: ['account-search', searchQuery],
  queryFn: () => builderApi.searchAccounts(searchQuery.value, 10),
  enabled: computed(() => searchQuery.value.length >= 2),
})

// Filter out empty results and show dropdown
const filteredAccounts = computed((): string[] => {
  if (!accounts.value) return []
  const lowerInput = inputValue.value.toLowerCase()
  return accounts.value.filter((a): a is string => !!a && a.toLowerCase().includes(lowerInput))
})

// Handle input change
function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  inputValue.value = target.value
  emit('update:modelValue', target.value)
  showDropdown.value = true
  selectedIndex.value = -1
}

// Handle account selection
function selectAccount(account: string) {
  inputValue.value = account
  emit('update:modelValue', account)
  emit('select', account)
  showDropdown.value = false
  selectedIndex.value = -1
}

// Handle keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  if (!showDropdown.value || filteredAccounts.value.length === 0) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex.value = Math.min(selectedIndex.value + 1, filteredAccounts.value.length - 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, -1)
      break
    case 'Enter':
      event.preventDefault()
      if (selectedIndex.value >= 0 && selectedIndex.value < filteredAccounts.value.length) {
        const account = filteredAccounts.value[selectedIndex.value]
        if (account) selectAccount(account)
      }
      break
    case 'Escape':
      showDropdown.value = false
      selectedIndex.value = -1
      break
  }
}

// Handle focus
function handleFocus() {
  if (inputValue.value.length >= 2) {
    showDropdown.value = true
  }
}

// Handle blur with delay to allow click
function handleBlur() {
  setTimeout(() => {
    showDropdown.value = false
    selectedIndex.value = -1
  }, 200)
}

// Sync with external model changes
watch(
  () => props.modelValue,
  (val) => {
    inputValue.value = val
  },
)
</script>

<template>
  <div class="relative">
    <div class="relative">
      <User class="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        :value="inputValue"
        :placeholder="placeholder"
        :disabled="disabled"
        class="pl-8"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
      />
      <Loader2 v-if="isLoading" class="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
    </div>

    <!-- Dropdown -->
    <div
      v-if="showDropdown && (filteredAccounts.length > 0 || isLoading)"
      class="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto"
    >
      <div v-if="isLoading" class="px-3 py-2 text-sm text-muted-foreground">
        Searching...
      </div>
      <div v-else-if="filteredAccounts.length === 0" class="px-3 py-2 text-sm text-muted-foreground">
        No accounts found
      </div>
      <button
        v-else
        v-for="(account, index) in filteredAccounts"
        :key="account"
        class="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
        :class="{ 'bg-accent': index === selectedIndex }"
        @click="selectAccount(account)"
        @mouseenter="selectedIndex = index"
      >
        <User class="h-3 w-3 text-muted-foreground" />
        {{ account }}
      </button>
    </div>
  </div>
</template>
