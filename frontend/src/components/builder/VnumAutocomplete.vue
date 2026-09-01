<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ChevronsUpDown, Check, X } from 'lucide-vue-next'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import { cn } from '@/lib/utils'

export interface VnumOption {
  vnum: number
  name: string
}

const props = defineProps<{
  modelValue: number
  options: VnumOption[]
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  allowClear?: boolean
  allowCustom?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const open = ref(false)
const searchQuery = ref('')

// Find the selected option
const selectedOption = computed(() => props.options.find((opt) => opt.vnum === props.modelValue))

// Filter options based on search
const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options
  const query = searchQuery.value.toLowerCase()
  return props.options.filter(
    (opt) => opt.vnum.toString().includes(query) || opt.name.toLowerCase().includes(query),
  )
})

// Handle selection
function selectOption(vnum: number) {
  emit('update:modelValue', vnum)
  open.value = false
  searchQuery.value = ''
}

// Handle clear
function clearSelection() {
  emit('update:modelValue', -1)
}

// Handle custom vnum entry (when typing a number that's not in options)
function handleCustomVnum() {
  if (props.allowCustom && searchQuery.value) {
    const num = parseInt(searchQuery.value, 10)
    if (!isNaN(num) && num >= 0) {
      selectOption(num)
    }
  }
}

// Reset search when closing
watch(open, (isOpen) => {
  if (!isOpen) {
    searchQuery.value = ''
  }
})
</script>

<template>
  <div class="flex gap-1">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          role="combobox"
          :aria-expanded="open"
          :disabled="disabled"
          class="w-full justify-between font-normal"
        >
          <span
            v-if="selectedOption"
            class="truncate"
            v-html="parseAnsiToHtml(`${selectedOption.vnum} - ${selectedOption.name}`)"
          />
          <span v-else-if="modelValue >= 0" class="truncate text-muted-foreground">
            {{ modelValue }} (unknown)
          </span>
          <span v-else class="text-muted-foreground">
            {{ placeholder || 'Select...' }}
          </span>
          <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-[400px] p-0" align="start">
        <Command>
          <CommandInput
            v-model="searchQuery"
            :placeholder="placeholder || 'Search by vnum or name...'"
            @keydown.enter="handleCustomVnum"
          />
          <CommandList>
            <CommandEmpty>
              <div v-if="allowCustom && searchQuery && !isNaN(parseInt(searchQuery, 10))" class="p-2">
                <Button
                  variant="ghost"
                  class="w-full justify-start"
                  @click="handleCustomVnum"
                >
                  Use custom vnum: {{ parseInt(searchQuery, 10) }}
                </Button>
              </div>
              <span v-else>{{ emptyText || 'No results found.' }}</span>
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                v-for="option in filteredOptions"
                :key="option.vnum"
                :value="option.vnum.toString()"
                @select="selectOption(option.vnum)"
              >
                <Check
                  :class="cn(
                    'mr-2 h-4 w-4',
                    modelValue === option.vnum ? 'opacity-100' : 'opacity-0'
                  )"
                />
                <span class="font-mono text-xs mr-2 text-muted-foreground">
                  {{ option.vnum }}
                </span>
                <span v-html="parseAnsiToHtml(option.name)" />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <Button
      v-if="allowClear && modelValue >= 0"
      variant="ghost"
      size="icon"
      class="shrink-0"
      :disabled="disabled"
      @click="clearSelection"
    >
      <X class="h-4 w-4" />
    </Button>
  </div>
</template>
