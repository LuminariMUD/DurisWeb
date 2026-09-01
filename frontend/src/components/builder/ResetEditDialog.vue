<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import VnumAutocomplete from './VnumAutocomplete.vue'
import type { ResetCommand, ResetWithMetadata, MobIndex, ObjIndex, RoomIndex } from '@/types'
import { RESET_COMMANDS, EQUIP_SLOTS, DOOR_STATES, DIRECTION_NAMES } from '@/types'

const props = defineProps<{
  open: boolean
  reset?: ResetWithMetadata | null
  mobs: MobIndex[]
  objects: ObjIndex[]
  rooms: RoomIndex[]
  isNew?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', reset: ResetCommand): void
}>()

// Form state
const command = ref<keyof typeof RESET_COMMANDS>('M')
const ifFlag = ref(0)
const arg1 = ref(0)
const arg2 = ref(1)
const arg3 = ref(0)
const arg4 = ref<number | undefined>(undefined)
const comment = ref('')

// Command type options
const commandOptions = Object.entries(RESET_COMMANDS).map(([key, label]) => ({
  value: key,
  label: `${key} - ${label}`,
}))

// Convert data to autocomplete options
const mobOptions = computed(() => props.mobs.map((m) => ({ vnum: m.vnum, name: m.shortDesc })))

const objectOptions = computed(() =>
  props.objects.map((o) => ({ vnum: o.vnum, name: o.shortDesc })),
)

const roomOptions = computed(() => props.rooms.map((r) => ({ vnum: r.vnum, name: r.name })))

// Labels and visibility based on command type
const fieldConfig = computed(() => {
  switch (command.value) {
    case 'M': // Load Mob
      return {
        arg1Label: 'Mob VNUM',
        arg1Type: 'mob' as const,
        arg2Label: 'Max in World',
        arg2Type: 'number' as const,
        arg3Label: 'Room VNUM',
        arg3Type: 'room' as const,
        arg4Show: false,
        description: 'Load a mobile into a room',
      }
    case 'O': // Load Object in Room
      return {
        arg1Label: 'Object VNUM',
        arg1Type: 'object' as const,
        arg2Label: 'Max in World',
        arg2Type: 'number' as const,
        arg3Label: 'Room VNUM',
        arg3Type: 'room' as const,
        arg4Show: false,
        description: 'Load an object into a room',
      }
    case 'G': // Give Object to Mob
      return {
        arg1Label: 'Object VNUM',
        arg1Type: 'object' as const,
        arg2Label: 'Max in World',
        arg2Type: 'number' as const,
        arg3Label: '(unused)',
        arg3Type: 'hidden' as const,
        arg4Show: false,
        description: 'Give an object to the last loaded mob',
      }
    case 'E': // Equip Object on Mob
      return {
        arg1Label: 'Object VNUM',
        arg1Type: 'object' as const,
        arg2Label: 'Max in World',
        arg2Type: 'number' as const,
        arg3Label: 'Equipment Slot',
        arg3Type: 'slot' as const,
        arg4Show: false,
        description: 'Equip an object on the last loaded mob',
      }
    case 'P': // Put Object in Container
      return {
        arg1Label: 'Object VNUM',
        arg1Type: 'object' as const,
        arg2Label: 'Max in World',
        arg2Type: 'number' as const,
        arg3Label: 'Container VNUM',
        arg3Type: 'object' as const,
        arg4Show: false,
        description: 'Put an object into a container',
      }
    case 'D': // Set Door State
      return {
        arg1Label: 'Room VNUM',
        arg1Type: 'room' as const,
        arg2Label: 'Direction',
        arg2Type: 'direction' as const,
        arg3Label: 'Door State',
        arg3Type: 'doorState' as const,
        arg4Show: false,
        description: 'Set the state of a door',
      }
    case 'F': // Follow (mob follows leader)
      return {
        arg1Label: 'Leader Mob VNUM',
        arg1Type: 'mob' as const,
        arg2Label: '(unused)',
        arg2Type: 'hidden' as const,
        arg3Label: '(unused)',
        arg3Type: 'hidden' as const,
        arg4Show: false,
        description: 'Make last loaded mob follow a leader',
      }
    case 'R': // Remove Object from Room
      return {
        arg1Label: 'Room VNUM',
        arg1Type: 'room' as const,
        arg2Label: 'Object VNUM',
        arg2Type: 'object' as const,
        arg3Label: '(unused)',
        arg3Type: 'hidden' as const,
        arg4Show: false,
        description: 'Remove an object from a room',
      }
    default:
      return {
        arg1Label: 'Arg 1',
        arg1Type: 'number' as const,
        arg2Label: 'Arg 2',
        arg2Type: 'number' as const,
        arg3Label: 'Arg 3',
        arg3Type: 'number' as const,
        arg4Show: false,
        description: 'Unknown command',
      }
  }
})

// Initialize form when dialog opens or reset changes
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.reset) {
      command.value = props.reset.command as keyof typeof RESET_COMMANDS
      ifFlag.value = props.reset.ifFlag
      arg1.value = props.reset.arg1
      arg2.value = props.reset.arg2
      arg3.value = props.reset.arg3
      arg4.value = props.reset.arg4
      comment.value = props.reset.comment || ''
    } else if (isOpen && props.isNew) {
      // Default values for new reset
      command.value = 'M'
      ifFlag.value = 0
      arg1.value = 0
      arg2.value = 1
      arg3.value = 0
      arg4.value = undefined
      comment.value = ''
    }
  },
)

// Handle save
function handleSave() {
  const reset: ResetCommand = {
    command: command.value,
    ifFlag: ifFlag.value,
    arg1: arg1.value,
    arg2: arg2.value,
    arg3: arg3.value,
    arg4: arg4.value,
    comment: comment.value || undefined,
  }
  emit('save', reset)
  emit('update:open', false)
}

// Handle cancel
function handleCancel() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{{ isNew ? 'Add Reset' : 'Edit Reset' }}</DialogTitle>
        <DialogDescription>
          {{ fieldConfig.description }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- Command Type -->
        <div class="grid gap-2">
          <Label>Command Type</Label>
          <Select v-model="command">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="opt in commandOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- If Flag (dependency on previous M command) -->
        <div class="flex items-center gap-2">
          <Checkbox
            id="if-flag"
            :model-value="ifFlag > 0"
            @update:model-value="ifFlag = $event ? 1 : 0"
          />
          <Label for="if-flag" class="cursor-pointer">
            Depends on previous mob loading successfully
          </Label>
        </div>

        <!-- Arg 1 (always visible - never hidden) -->
        <div class="grid gap-2">
          <Label>{{ fieldConfig.arg1Label }}</Label>
          <VnumAutocomplete
            v-if="fieldConfig.arg1Type === 'mob'"
            v-model="arg1"
            :options="mobOptions"
            placeholder="Select mob..."
            allow-custom
          />
          <VnumAutocomplete
            v-else-if="fieldConfig.arg1Type === 'object'"
            v-model="arg1"
            :options="objectOptions"
            placeholder="Select object..."
            allow-custom
          />
          <VnumAutocomplete
            v-else-if="fieldConfig.arg1Type === 'room'"
            v-model="arg1"
            :options="roomOptions"
            placeholder="Select room..."
            allow-custom
          />
          <Input
            v-else
            v-model.number="arg1"
            type="number"
          />
        </div>

        <!-- Arg 2 -->
        <div v-if="fieldConfig.arg2Type !== 'hidden'" class="grid gap-2">
          <Label>{{ fieldConfig.arg2Label }}</Label>
          <VnumAutocomplete
            v-if="fieldConfig.arg2Type === 'object'"
            v-model="arg2"
            :options="objectOptions"
            placeholder="Select object..."
            allow-custom
          />
          <Select
            v-else-if="fieldConfig.arg2Type === 'direction'"
            :model-value="arg2.toString()"
            @update:model-value="(val) => { if (val) arg2 = parseInt(val.toString(), 10) }"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="(name, idx) in DIRECTION_NAMES"
                :key="idx"
                :value="idx.toString()"
              >
                {{ idx }} - {{ name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            v-else
            v-model.number="arg2"
            type="number"
            min="1"
          />
        </div>

        <!-- Arg 3 -->
        <div v-if="fieldConfig.arg3Type !== 'hidden'" class="grid gap-2">
          <Label>{{ fieldConfig.arg3Label }}</Label>
          <VnumAutocomplete
            v-if="fieldConfig.arg3Type === 'room'"
            v-model="arg3"
            :options="roomOptions"
            placeholder="Select room..."
            allow-custom
          />
          <VnumAutocomplete
            v-else-if="fieldConfig.arg3Type === 'object'"
            v-model="arg3"
            :options="objectOptions"
            placeholder="Select container..."
            allow-custom
          />
          <Select
            v-else-if="fieldConfig.arg3Type === 'slot'"
            :model-value="arg3.toString()"
            @update:model-value="(val) => { if (val) arg3 = parseInt(val.toString(), 10) }"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="slot in EQUIP_SLOTS"
                :key="slot.value"
                :value="slot.value.toString()"
              >
                {{ slot.value }} - {{ slot.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            v-else-if="fieldConfig.arg3Type === 'doorState'"
            :model-value="arg3.toString()"
            @update:model-value="(val) => { if (val) arg3 = parseInt(val.toString(), 10) }"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="state in DOOR_STATES"
                :key="state.value"
                :value="state.value.toString()"
              >
                {{ state.value }} - {{ state.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            v-else
            v-model.number="arg3"
            type="number"
          />
        </div>

        <!-- Comment -->
        <div class="grid gap-2">
          <Label>Comment (optional)</Label>
          <Input
            v-model="comment"
            placeholder="Describe this reset..."
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">Cancel</Button>
        <Button @click="handleSave">{{ isNew ? 'Add' : 'Save' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
