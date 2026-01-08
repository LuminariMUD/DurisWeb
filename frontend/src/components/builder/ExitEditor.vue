<script setup lang="ts">
import { ref, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  MoveUp,
  MoveDown,
  Trash2,
  Edit,
  DoorOpen,
  Key,
  AlertCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-vue-next'
import { builderApi } from '@/services/api'
import type { RoomExit, FlagDefinition, Direction } from '@/types'

const props = defineProps<{
  exits: RoomExit[]
  doorFlags: FlagDefinition[]
  zoneId: string
}>()

const emit = defineEmits<{
  (e: 'update', exits: RoomExit[]): void
}>()

// Dialog state
const editDialogOpen = ref(false)
const editingExit = ref<RoomExit | null>(null)
const editForm = ref<RoomExit>({
  direction: 'north',
  description: '',
  keywords: '',
  doorFlag: 0,
  keyVnum: -1,
  toRoom: -1,
})

// Validation state
const validationErrors = ref<string[]>([])
const validationWarnings = ref<string[]>([])
const isValidating = ref(false)

// Debounce timer for validation
let validationTimer: ReturnType<typeof setTimeout> | null = null

// Run validation when toRoom or keyVnum changes
async function runValidation() {
  if (!props.zoneId) return

  // Only validate if we have meaningful values
  const toRoom = editForm.value.toRoom >= 0 ? editForm.value.toRoom : undefined
  const keyVnum = editForm.value.keyVnum > 0 ? editForm.value.keyVnum : undefined

  if (toRoom === undefined && keyVnum === undefined) {
    validationErrors.value = []
    validationWarnings.value = []
    return
  }

  isValidating.value = true
  try {
    const result = await builderApi.validateExit(props.zoneId, toRoom, keyVnum)
    validationErrors.value = result.errors
    validationWarnings.value = result.warnings
  } catch {
    // Silently ignore validation errors - don't block the user
    validationErrors.value = []
    validationWarnings.value = []
  } finally {
    isValidating.value = false
  }
}

// Debounced validation trigger
function triggerValidation() {
  if (validationTimer) {
    clearTimeout(validationTimer)
  }
  validationTimer = setTimeout(runValidation, 500)
}

// Watch for changes to trigger validation
watch(() => editForm.value.toRoom, triggerValidation)
watch(() => editForm.value.keyVnum, triggerValidation)

// Get exit for a direction
function getExit(direction: Direction): RoomExit | undefined {
  return props.exits.find(e => e.direction === direction)
}

// Check if direction has an exit
function hasExit(direction: Direction): boolean {
  return props.exits.some(e => e.direction === direction)
}

// Check if exit has a door
function hasDoor(exit: RoomExit): boolean {
  return exit.doorFlag > 0 || exit.keyVnum > 0 || Boolean(exit.keywords && exit.keywords.trim() !== '')
}

// Open edit dialog for a direction
function openEditDialog(direction: Direction) {
  // Clear validation state
  validationErrors.value = []
  validationWarnings.value = []

  const existing = getExit(direction)
  if (existing) {
    editingExit.value = existing
    editForm.value = { ...existing }
    // Run validation for existing exit
    triggerValidation()
  } else {
    editingExit.value = null
    editForm.value = {
      direction,
      description: '',
      keywords: '',
      doorFlag: 0,
      keyVnum: -1,
      toRoom: -1,
    }
  }
  editDialogOpen.value = true
}

// Save exit from dialog
function saveExit() {
  const newExits = props.exits.filter(e => e.direction !== editForm.value.direction)

  // Only add if toRoom is valid
  if (editForm.value.toRoom >= 0) {
    newExits.push({ ...editForm.value })
  }

  emit('update', newExits)
  editDialogOpen.value = false
}

// Delete an exit
function deleteExit(direction: Direction) {
  const newExits = props.exits.filter(e => e.direction !== direction)
  emit('update', newExits)
}

// Toggle a door flag
function toggleDoorFlag(flag: FlagDefinition) {
  if (editForm.value.doorFlag & flag.value) {
    editForm.value.doorFlag &= ~flag.value
  } else {
    editForm.value.doorFlag |= flag.value
  }
}

// Check if door flag is set
function isDoorFlagSet(flag: FlagDefinition): boolean {
  return (editForm.value.doorFlag & flag.value) !== 0
}
</script>

<template>
  <div class="space-y-4">
    <!-- Exit Grid - 3x3 compass layout -->
    <div class="grid grid-cols-3 gap-2 max-w-md mx-auto">
      <!-- Top row: NW, N, NE -->
      <div>
        <Button
          variant="outline"
          size="sm"
          class="w-full h-14 flex flex-col items-center justify-center gap-0.5"
          :class="{ 'border-primary bg-primary/10': hasExit('northwest') }"
          @click="openEditDialog('northwest')"
        >
          <ArrowUpLeft class="h-4 w-4" />
          <span class="text-[10px]">NW</span>
          <Badge v-if="hasExit('northwest')" variant="secondary" class="text-[9px] px-1 py-0">
            {{ getExit('northwest')?.toRoom }}
          </Badge>
        </Button>
      </div>
      <div>
        <Button
          variant="outline"
          size="sm"
          class="w-full h-14 flex flex-col items-center justify-center gap-0.5"
          :class="{ 'border-primary bg-primary/10': hasExit('north') }"
          @click="openEditDialog('north')"
        >
          <ArrowUp class="h-4 w-4" />
          <span class="text-[10px]">N</span>
          <Badge v-if="hasExit('north')" variant="secondary" class="text-[9px] px-1 py-0">
            {{ getExit('north')?.toRoom }}
          </Badge>
        </Button>
      </div>
      <div>
        <Button
          variant="outline"
          size="sm"
          class="w-full h-14 flex flex-col items-center justify-center gap-0.5"
          :class="{ 'border-primary bg-primary/10': hasExit('northeast') }"
          @click="openEditDialog('northeast')"
        >
          <ArrowUpRight class="h-4 w-4" />
          <span class="text-[10px]">NE</span>
          <Badge v-if="hasExit('northeast')" variant="secondary" class="text-[9px] px-1 py-0">
            {{ getExit('northeast')?.toRoom }}
          </Badge>
        </Button>
      </div>

      <!-- Middle row: W, center, E -->
      <div>
        <Button
          variant="outline"
          size="sm"
          class="w-full h-14 flex flex-col items-center justify-center gap-0.5"
          :class="{ 'border-primary bg-primary/10': hasExit('west') }"
          @click="openEditDialog('west')"
        >
          <ArrowLeft class="h-4 w-4" />
          <span class="text-[10px]">W</span>
          <Badge v-if="hasExit('west')" variant="secondary" class="text-[9px] px-1 py-0">
            {{ getExit('west')?.toRoom }}
          </Badge>
        </Button>
      </div>
      <div class="flex items-center justify-center">
        <div class="text-xs text-muted-foreground font-medium">Exits</div>
      </div>
      <div>
        <Button
          variant="outline"
          size="sm"
          class="w-full h-14 flex flex-col items-center justify-center gap-0.5"
          :class="{ 'border-primary bg-primary/10': hasExit('east') }"
          @click="openEditDialog('east')"
        >
          <ArrowRight class="h-4 w-4" />
          <span class="text-[10px]">E</span>
          <Badge v-if="hasExit('east')" variant="secondary" class="text-[9px] px-1 py-0">
            {{ getExit('east')?.toRoom }}
          </Badge>
        </Button>
      </div>

      <!-- Bottom row: SW, S, SE -->
      <div>
        <Button
          variant="outline"
          size="sm"
          class="w-full h-14 flex flex-col items-center justify-center gap-0.5"
          :class="{ 'border-primary bg-primary/10': hasExit('southwest') }"
          @click="openEditDialog('southwest')"
        >
          <ArrowDownLeft class="h-4 w-4" />
          <span class="text-[10px]">SW</span>
          <Badge v-if="hasExit('southwest')" variant="secondary" class="text-[9px] px-1 py-0">
            {{ getExit('southwest')?.toRoom }}
          </Badge>
        </Button>
      </div>
      <div>
        <Button
          variant="outline"
          size="sm"
          class="w-full h-14 flex flex-col items-center justify-center gap-0.5"
          :class="{ 'border-primary bg-primary/10': hasExit('south') }"
          @click="openEditDialog('south')"
        >
          <ArrowDown class="h-4 w-4" />
          <span class="text-[10px]">S</span>
          <Badge v-if="hasExit('south')" variant="secondary" class="text-[9px] px-1 py-0">
            {{ getExit('south')?.toRoom }}
          </Badge>
        </Button>
      </div>
      <div>
        <Button
          variant="outline"
          size="sm"
          class="w-full h-14 flex flex-col items-center justify-center gap-0.5"
          :class="{ 'border-primary bg-primary/10': hasExit('southeast') }"
          @click="openEditDialog('southeast')"
        >
          <ArrowDownRight class="h-4 w-4" />
          <span class="text-[10px]">SE</span>
          <Badge v-if="hasExit('southeast')" variant="secondary" class="text-[9px] px-1 py-0">
            {{ getExit('southeast')?.toRoom }}
          </Badge>
        </Button>
      </div>
    </div>

    <!-- Up/Down exits -->
    <div class="flex justify-center gap-4">
      <Button
        variant="outline"
        size="sm"
        class="h-12 w-24 flex flex-col items-center justify-center gap-1"
        :class="{ 'border-primary bg-primary/10': hasExit('up') }"
        @click="openEditDialog('up')"
      >
        <MoveUp class="h-4 w-4" />
        <span class="text-xs">Up</span>
        <Badge v-if="hasExit('up')" variant="secondary" class="text-[10px] px-1 py-0">
          {{ getExit('up')?.toRoom }}
        </Badge>
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="h-12 w-24 flex flex-col items-center justify-center gap-1"
        :class="{ 'border-primary bg-primary/10': hasExit('down') }"
        @click="openEditDialog('down')"
      >
        <MoveDown class="h-4 w-4" />
        <span class="text-xs">Down</span>
        <Badge v-if="hasExit('down')" variant="secondary" class="text-[10px] px-1 py-0">
          {{ getExit('down')?.toRoom }}
        </Badge>
      </Button>
    </div>

    <!-- Exit Details List -->
    <div v-if="exits.length > 0" class="space-y-2 mt-6">
      <h4 class="text-sm font-medium text-muted-foreground">Exit Details</h4>
      <div class="space-y-2">
        <Card v-for="exit in exits" :key="exit.direction" class="p-3">
          <div class="flex items-start justify-between">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <Badge>{{ exit.direction }}</Badge>
                <span class="text-sm font-mono">-> {{ exit.toRoom }}</span>
                <DoorOpen v-if="hasDoor(exit)" class="h-4 w-4 text-muted-foreground" />
                <Key v-if="exit.keyVnum > 0" class="h-4 w-4 text-yellow-500" />
              </div>
              <p v-if="exit.description" class="text-xs text-muted-foreground">
                {{ exit.description }}
              </p>
              <p v-if="exit.keywords" class="text-xs text-muted-foreground">
                Keywords: {{ exit.keywords }}
              </p>
            </div>
            <div class="flex gap-1">
              <Button variant="ghost" size="icon" class="h-8 w-8" @click="openEditDialog(exit.direction)">
                <Edit class="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive" @click="deleteExit(exit.direction)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>

    <!-- Edit Exit Dialog -->
    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {{ editingExit ? 'Edit' : 'Add' }} Exit - {{ editForm.direction }}
          </DialogTitle>
          <DialogDescription>
            Configure the exit properties. Set destination to -1 to remove the exit.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <!-- Validation Messages -->
          <div v-if="isValidating" class="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 class="h-4 w-4 animate-spin" />
            Validating...
          </div>

          <Alert v-if="validationErrors.length > 0" variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <AlertDescription>
              <ul class="list-disc list-inside space-y-1">
                <li v-for="(error, idx) in validationErrors" :key="`err-${idx}`">{{ error }}</li>
              </ul>
            </AlertDescription>
          </Alert>

          <Alert v-if="validationWarnings.length > 0" class="border-yellow-500 bg-yellow-500/10">
            <AlertTriangle class="h-4 w-4 text-yellow-500" />
            <AlertDescription class="text-yellow-700 dark:text-yellow-300">
              <ul class="list-disc list-inside space-y-1">
                <li v-for="(warning, idx) in validationWarnings" :key="`warn-${idx}`">{{ warning }}</li>
              </ul>
            </AlertDescription>
          </Alert>

          <!-- Destination Room -->
          <div class="space-y-2">
            <Label for="exit-to-room">Destination Room VNUM</Label>
            <Input
              id="exit-to-room"
              v-model.number="editForm.toRoom"
              type="number"
              placeholder="Enter destination room VNUM..."
              :class="{ 'border-yellow-500': validationWarnings.some(w => w.includes('Room')) }"
            />
          </div>

          <!-- Exit Description -->
          <div class="space-y-2">
            <Label for="exit-desc">Exit Description (look direction)</Label>
            <Textarea
              id="exit-desc"
              v-model="editForm.description"
              placeholder="What the player sees when looking this direction..."
              class="min-h-[80px]"
            />
          </div>

          <!-- Door Keywords -->
          <div class="space-y-2">
            <Label for="exit-keywords">Door Keywords</Label>
            <Input
              id="exit-keywords"
              v-model="editForm.keywords"
              placeholder="door gate wooden..."
            />
            <p class="text-xs text-muted-foreground">
              Space-separated keywords for the door (if any)
            </p>
          </div>

          <!-- Key VNUM -->
          <div class="space-y-2">
            <Label for="exit-key">Key Object VNUM (-1 for none)</Label>
            <Input
              id="exit-key"
              v-model.number="editForm.keyVnum"
              type="number"
            />
          </div>

          <!-- Door Flags -->
          <div class="space-y-2">
            <Label>Door Flags</Label>
            <div class="grid grid-cols-2 gap-2">
              <div
                v-for="flag in doorFlags"
                :key="flag.value"
                class="flex items-center space-x-2"
              >
                <Checkbox
                  :id="`door-flag-${flag.value}`"
                  :checked="isDoorFlagSet(flag)"
                  @update:checked="toggleDoorFlag(flag)"
                />
                <Label :for="`door-flag-${flag.value}`" class="text-sm">
                  {{ flag.name }}
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="editDialogOpen = false">
            Cancel
          </Button>
          <Button @click="saveExit">
            Save Exit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
