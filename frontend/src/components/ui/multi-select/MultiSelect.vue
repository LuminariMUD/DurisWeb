<script setup lang="ts" generic="T extends { value: string | number; label: string }">
import { ref, computed } from 'vue'
import { X, ChevronsUpDown, Search } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const props = withDefaults(defineProps<{
  options: T[]
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  maxDisplayed?: number
}>(), {
  placeholder: 'Select items...',
  searchPlaceholder: 'Search...',
  emptyMessage: 'No items found.',
  maxDisplayed: 5,
})

const model = defineModel<(string | number)[]>({ default: () => [] })

const open = ref(false)
const searchQuery = ref('')

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options
  const query = searchQuery.value.toLowerCase()
  return props.options.filter(opt => opt.label.toLowerCase().includes(query))
})

const selectedItems = computed(() => {
  return props.options.filter(opt => model.value.includes(opt.value))
})

function toggleItem(value: string | number) {
  const index = model.value.indexOf(value)
  if (index > -1) {
    model.value = model.value.filter(v => v !== value)
  } else {
    model.value = [...model.value, value]
  }
}

function removeItem(value: string | number) {
  model.value = model.value.filter(v => v !== value)
}

function selectAll() {
  model.value = props.options.map(opt => opt.value)
}

function clearAll() {
  model.value = []
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        role="combobox"
        :aria-expanded="open"
        class="w-full justify-between h-auto min-h-10"
      >
        <div class="flex flex-wrap gap-1 flex-1 text-left">
          <template v-if="selectedItems.length === 0">
            <span class="text-muted-foreground">{{ placeholder }}</span>
          </template>
          <template v-else-if="selectedItems.length <= maxDisplayed">
            <Badge
              v-for="item in selectedItems"
              :key="item.value"
              variant="secondary"
              class="mr-1"
            >
              {{ item.label }}
              <button
                class="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                @click.stop="removeItem(item.value)"
              >
                <X class="h-3 w-3" />
              </button>
            </Badge>
          </template>
          <template v-else>
            <Badge variant="secondary">
              {{ selectedItems.length }} selected
            </Badge>
          </template>
        </div>
        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[400px] p-0" align="start">
      <Command :filter="() => 1">
        <div class="flex items-center border-b px-3">
          <Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            v-model="searchQuery"
            :placeholder="searchPlaceholder"
            class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div class="flex items-center justify-between px-2 py-1.5 border-b">
          <span class="text-xs text-muted-foreground">
            {{ selectedItems.length }} of {{ options.length }} selected
          </span>
          <div class="flex gap-1">
            <Button variant="ghost" size="sm" class="h-7 text-xs" @click="selectAll">
              Select All
            </Button>
            <Button variant="ghost" size="sm" class="h-7 text-xs" @click="clearAll">
              Clear
            </Button>
          </div>
        </div>
        <CommandList class="max-h-[300px]">
          <CommandEmpty>{{ emptyMessage }}</CommandEmpty>
          <CommandGroup>
            <CommandItem
              v-for="option in filteredOptions"
              :key="option.value"
              :value="option.label"
              @select="toggleItem(option.value)"
              class="cursor-pointer"
            >
              <div
                class="mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary"
                :class="model.includes(option.value) ? 'bg-primary text-primary-foreground' : 'opacity-50'"
              >
                <svg
                  v-if="model.includes(option.value)"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="h-3 w-3"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span>{{ option.label }}</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
