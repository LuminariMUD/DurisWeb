<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Filter, X } from 'lucide-vue-next'
import { useFragRaces, useFragClasses } from '@/composables/useFragLeaderboard'
import type { FragLeaderboardFilters } from '@/types'

interface Props {
  modelValue: FragLeaderboardFilters
}

interface Emits {
  (e: 'update:modelValue', value: FragLeaderboardFilters): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { data: races } = useFragRaces()
const { data: classes } = useFragClasses()

const filters = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

function updateFilter<K extends keyof FragLeaderboardFilters>(
  key: K,
  value: FragLeaderboardFilters[K],
) {
  filters.value = {
    ...filters.value,
    [key]: value,
    page: 1, // Reset to page 1 when filter changes
  }
}

function resetFilters() {
  filters.value = {
    page: 1,
    limit: 50,
  }
}

const hasActiveFilters = computed(() => {
  return !!(
    filters.value.racewar ||
    filters.value.race ||
    filters.value.class ||
    filters.value.level_min ||
    filters.value.level_max ||
    filters.value.char_name ||
    filters.value.min_frags
  )
})
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Filter class="w-4 h-4" />
          <CardTitle class="text-lg">Filters</CardTitle>
        </div>
        <Button
          v-if="hasActiveFilters"
          variant="ghost"
          size="sm"
          @click="resetFilters"
        >
          <X class="w-4 h-4 mr-1" />
          Clear
        </Button>
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- Character Name Search -->
      <div class="space-y-2">
        <Label for="char-search">Character Name</Label>
        <Input
          id="char-search"
          :model-value="filters.char_name || ''"
          @update:model-value="(val: string | number) => updateFilter('char_name', String(val) || undefined)"
          placeholder="Search by name..."
        />
      </div>

      <!-- Alignment Filter -->
      <div class="space-y-2">
        <Label for="alignment">Alignment</Label>
        <Select
          :model-value="filters.racewar?.toString() || 'all'"
          @update:model-value="(val: any) =>
            updateFilter('racewar', (!val || val === 'all') ? undefined : parseInt(String(val)))
          "
        >
          <SelectTrigger id="alignment">
            <SelectValue placeholder="All Alignments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Alignments</SelectItem>
            <SelectItem value="1">Good</SelectItem>
            <SelectItem value="2">Evil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Race Filter -->
      <div class="space-y-2">
        <Label for="race">Race</Label>
        <Select
          :model-value="filters.race || 'all'"
          @update:model-value="(val: any) => updateFilter('race', (!val || val === 'all') ? undefined : String(val))"
        >
          <SelectTrigger id="race">
            <SelectValue placeholder="All Races" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Races</SelectItem>
            <SelectItem
              v-for="race in races || []"
              :key="race.value"
              :value="race.value"
            >
              {{ race.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Class Filter -->
      <div class="space-y-2">
        <Label for="class">Class</Label>
        <Select
          :model-value="filters.class || 'all'"
          @update:model-value="(val: any) => updateFilter('class', (!val || val === 'all') ? undefined : String(val))"
        >
          <SelectTrigger id="class">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            <SelectItem
              v-for="cls in classes || []"
              :key="cls.value"
              :value="cls.value"
            >
              {{ cls.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Level Range -->
      <div class="space-y-2">
        <Label>Level Range</Label>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <Input
              type="number"
              :model-value="filters.level_min?.toString() || ''"
              @update:model-value="(val: string | number) =>
                updateFilter('level_min', val ? parseInt(String(val)) : undefined)
              "
              placeholder="Min"
              min="1"
              max="100"
            />
          </div>
          <div>
            <Input
              type="number"
              :model-value="filters.level_max?.toString() || ''"
              @update:model-value="(val: string | number) =>
                updateFilter('level_max', val ? parseInt(String(val)) : undefined)
              "
              placeholder="Max"
              min="1"
              max="100"
            />
          </div>
        </div>
      </div>

      <!-- Minimum Frags -->
      <div class="space-y-2">
        <Label for="min-frags">Minimum Frags</Label>
        <Input
          id="min-frags"
          type="number"
          :model-value="filters.min_frags?.toString() || ''"
          @update:model-value="(val: string | number) =>
            updateFilter('min_frags', val ? parseFloat(String(val)) : undefined)
          "
          placeholder="0"
          min="0"
          step="0.5"
        />
      </div>
    </CardContent>
  </Card>
</template>
