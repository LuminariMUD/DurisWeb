<script setup lang="ts">
import { computed } from 'vue'
import { useGroups } from '@/composables/useGroups'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const props = defineProps<{
  modelValue: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const { groups, rootGroups, getChildGroups } = useGroups()

// build flat list with indentation info
interface GroupOption {
  id: string | null
  name: string
  indent: number
}

const groupOptions = computed((): GroupOption[] => {
  const options: GroupOption[] = [{ id: null, name: 'None (Ungrouped)', indent: 0 }]

  for (const root of rootGroups.value) {
    options.push({ id: root.id, name: root.name, indent: 0 })
    const children = getChildGroups(root.id)
    for (const child of children) {
      options.push({ id: child.id, name: child.name, indent: 1 })
    }
  }

  return options
})

const selectedLabel = computed(() => {
  if (!props.modelValue) return 'None (Ungrouped)'
  const group = groups.value.find(g => g.id === props.modelValue)
  return group?.name || 'Unknown'
})

function handleChange(value: unknown) {
  if (value === '__none__' || value === null || value === undefined) {
    emit('update:modelValue', null)
  } else {
    emit('update:modelValue', String(value))
  }
}
</script>

<template>
  <Select
    :model-value="modelValue ?? '__none__'"
    @update:model-value="handleChange"
  >
    <SelectTrigger>
      <SelectValue>{{ selectedLabel }}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem
        v-for="opt in groupOptions"
        :key="opt.id ?? '__none__'"
        :value="opt.id ?? '__none__'"
        :class="{ 'pl-6': opt.indent === 1 }"
      >
        <span v-if="opt.indent === 1" class="text-muted-foreground mr-1">└</span>
        {{ opt.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
