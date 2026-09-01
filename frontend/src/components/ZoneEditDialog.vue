<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useZoneQuery, useUpdateZoneMutation, type ZoneUpdateData } from '@/composables/useZones'
import { parseAnsiForVue } from '@/utils/ansiParser'
import { useToast } from '@/composables/useToast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Save } from 'lucide-vue-next'

const props = defineProps<{
  zoneNumber: number
}>()

const emit = defineEmits<{
  close: []
}>()

const toast = useToast()

const zoneNumber = computed(() => props.zoneNumber)
const { data: zone, isLoading } = useZoneQuery(zoneNumber)
const { mutate: updateZone, isPending } = useUpdateZoneMutation()

// Form state
const formData = ref<ZoneUpdateData>({})
const showConfirmDialog = ref(false)

// Initialize form when zone loads
watch(
  zone,
  (newZone) => {
    if (newZone) {
      formData.value = {
        epicType: newZone.epicType,
        alignment: newZone.alignment,
        suggestedGroupSize: newZone.suggestedGroupSize,
        difficulty: newZone.difficulty,
        epicPayout: newZone.epicPayout,
        taskZone: newZone.taskZone,
        questZone: newZone.questZone,
        trophyZone: newZone.trophyZone,
        randomsZone: newZone.randomsZone,
      }
    }
  },
  { immediate: true },
)

// Validation
const errors = ref<Record<string, string>>({})

function validateForm(): boolean {
  errors.value = {}

  if (
    formData.value.epicType !== undefined &&
    (formData.value.epicType < 0 || formData.value.epicType > 3)
  ) {
    errors.value.epicType = 'Epic type must be between 0 and 3'
  }

  if (
    formData.value.alignment !== undefined &&
    (formData.value.alignment < -5 || formData.value.alignment > 5)
  ) {
    errors.value.alignment = 'Alignment must be between -5 and 5'
  }

  if (
    formData.value.suggestedGroupSize !== undefined &&
    (formData.value.suggestedGroupSize < 1 || formData.value.suggestedGroupSize > 20)
  ) {
    errors.value.suggestedGroupSize = 'Group size must be between 1 and 20'
  }

  if (
    formData.value.difficulty !== undefined &&
    (formData.value.difficulty < 0 || formData.value.difficulty > 10)
  ) {
    errors.value.difficulty = 'Difficulty must be between 0 and 10'
  }

  if (formData.value.epicPayout !== undefined && formData.value.epicPayout < 0) {
    errors.value.epicPayout = 'Epic payout must be 0 or greater'
  }

  return Object.keys(errors.value).length === 0
}

// Handle save
function handleSave() {
  if (!validateForm()) {
    toast.error('Please fix the errors before saving', 'Validation Error')
    return
  }

  showConfirmDialog.value = true
}

function confirmSave() {
  showConfirmDialog.value = false

  updateZone(
    {
      zoneNumber: props.zoneNumber,
      data: formData.value,
    },
    {
      onSuccess: () => {
        toast.success(`Zone ${props.zoneNumber} settings saved successfully`, 'Zone Updated')
        emit('close')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to update zone', 'Update Failed')
      },
    },
  )
}

// Alignment label
const alignmentLabel = computed(() => {
  const value = formData.value.alignment || 0
  if (value < -3) return 'Very Evil'
  if (value < -1) return 'Evil'
  if (value < 0) return 'Slightly Evil'
  if (value === 0) return 'Neutral'
  if (value <= 1) return 'Slightly Good'
  if (value <= 3) return 'Good'
  return 'Very Good'
})
</script>

<template>
  <Dialog :open="true" @update:open="(open) => !open && emit('close')">
    <DialogContent class="!max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit Zone Settings</DialogTitle>
        <DialogDescription>
          <span v-if="zone">Zone #{{ zone.number }}: <span v-html="parseAnsiForVue(zone.name)"></span></span>
          <span v-else>Loading zone information...</span>
        </DialogDescription>
      </DialogHeader>

      <!-- Loading State -->
      <div v-if="isLoading" class="space-y-4 py-4">
        <Skeleton class="h-10 w-full" v-for="i in 6" :key="i" />
      </div>

      <!-- Form -->
      <div v-else-if="zone" class="space-y-6 py-4">
        <!-- Epic Type -->
        <div class="space-y-2">
          <Label for="epic-type">Epic Type</Label>
          <Select v-model="formData.epicType">
            <SelectTrigger id="epic-type">
              <SelectValue placeholder="Select epic type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="0">None - No epic stone</SelectItem>
              <SelectItem :value="1">Small - Small epic stone</SelectItem>
              <SelectItem :value="2">Large - Large epic stone</SelectItem>
              <SelectItem :value="3">Monolith - Epic monolith</SelectItem>
            </SelectContent>
          </Select>
          <p v-if="errors.epicType" class="text-sm text-destructive">{{ errors.epicType }}</p>
        </div>

        <!-- Alignment Slider -->
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <Label>Alignment</Label>
            <span class="text-sm font-medium">
              {{ formData.alignment }} - {{ alignmentLabel }}
            </span>
          </div>
          <Slider
            :model-value="[formData.alignment ?? 0]"
            @update:model-value="(value) => formData.alignment = value?.[0]"
            :min="-5"
            :max="5"
            :step="1"
            class="w-full"
          />
          <div class="flex justify-between text-xs text-muted-foreground">
            <span class="text-red-600 dark:text-red-400">Very Evil (-5)</span>
            <span>Neutral (0)</span>
            <span class="text-blue-600 dark:text-blue-400">Very Good (+5)</span>
          </div>
          <p v-if="errors.alignment" class="text-sm text-destructive">{{ errors.alignment }}</p>
        </div>

        <!-- Suggested Group Size -->
        <div class="space-y-2">
          <Label for="group-size">Suggested Group Size</Label>
          <Input
            id="group-size"
            v-model.number="formData.suggestedGroupSize"
            type="number"
            min="1"
            max="20"
          />
          <p class="text-xs text-muted-foreground">Recommended number of players (1-20)</p>
          <p v-if="errors.suggestedGroupSize" class="text-sm text-destructive">{{ errors.suggestedGroupSize }}</p>
        </div>

        <!-- Difficulty -->
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <Label>Difficulty</Label>
            <span class="text-sm font-medium">{{ formData.difficulty }}/10</span>
          </div>
          <Slider
            :model-value="[formData.difficulty ?? 0]"
            @update:model-value="(value) => formData.difficulty = value?.[0]"
            :min="0"
            :max="10"
            :step="1"
            class="w-full"
          />
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>Easy (0)</span>
            <span>Moderate (5)</span>
            <span>Extreme (10)</span>
          </div>
          <p v-if="errors.difficulty" class="text-sm text-destructive">{{ errors.difficulty }}</p>
        </div>

        <!-- Epic Payout -->
        <div class="space-y-2">
          <Label for="epic-payout">Epic Payout</Label>
          <Input
            id="epic-payout"
            v-model.number="formData.epicPayout"
            type="number"
            min="0"
          />
          <p class="text-xs text-muted-foreground">Epic points awarded on completion</p>
          <p v-if="errors.epicPayout" class="text-sm text-destructive">{{ errors.epicPayout }}</p>
        </div>

        <!-- Boolean Flags -->
        <div class="space-y-4 border-t pt-4">
          <Label class="text-base">Zone Flags</Label>

          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label for="task-zone" class="text-sm font-normal">Task Zone</Label>
              <p class="text-xs text-muted-foreground">Zone has epic tasks</p>
            </div>
            <Switch
              id="task-zone"
              :model-value="formData.taskZone ?? false"
              @update:model-value="(val: boolean) => formData.taskZone = val"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label for="quest-zone" class="text-sm font-normal">Quest Zone</Label>
              <p class="text-xs text-muted-foreground">Zone has quests</p>
            </div>
            <Switch
              id="quest-zone"
              :model-value="formData.questZone ?? false"
              @update:model-value="(val: boolean) => formData.questZone = val"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label for="trophy-zone" class="text-sm font-normal">Trophy Zone</Label>
              <p class="text-xs text-muted-foreground">Zone allows trophy drops</p>
            </div>
            <Switch
              id="trophy-zone"
              :model-value="formData.trophyZone ?? false"
              @update:model-value="(val: boolean) => formData.trophyZone = val"
            />
          </div>

          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <Label for="randoms-zone" class="text-sm font-normal">Randoms Zone</Label>
              <p class="text-xs text-muted-foreground">Zone allows random mob spawns</p>
            </div>
            <Switch
              id="randoms-zone"
              :model-value="formData.randomsZone ?? false"
              @update:model-value="(val: boolean) => formData.randomsZone = val"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('close')" :disabled="isPending">
          Cancel
        </Button>
        <Button @click="handleSave" :disabled="isPending || isLoading">
          <Loader2 v-if="isPending" class="h-4 w-4 mr-2 animate-spin" />
          <Save v-else class="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Confirmation Dialog -->
  <AlertDialog :open="showConfirmDialog" @update:open="showConfirmDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm Zone Update</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to update the settings for Zone #{{ zoneNumber }}?
          <span v-if="zone" class="block mt-2 font-medium" v-html="parseAnsiForVue(zone.name)"></span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="confirmSave">
          Confirm Update
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
