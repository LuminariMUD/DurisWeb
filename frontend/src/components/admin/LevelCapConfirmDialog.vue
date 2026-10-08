<template>
  <AlertDialog :open="open" @update:open="handleOpenChange">
    <AlertDialogContent class="bg-ink-high border border-border max-w-lg">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-white text-xl">
          {{ isReset ? 'Reset Level Cap?' : 'Confirm Level Cap Change' }}
        </AlertDialogTitle>
        <AlertDialogDescription class="text-muted-foreground">
          {{ isReset
            ? 'This will reset the level cap to defaults and clear racewar progress.'
            : 'You are about to manually override the level cap. This change takes effect immediately.' }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="space-y-4 py-4">
        <!-- Current vs New Values -->
        <div class="bg-card/50 rounded-lg p-3">
          <p class="text-sm text-muted-foreground mb-2">{{ isReset ? 'Changes' : 'Level Cap Change' }}</p>
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <p class="text-xs text-faint mb-1">Current</p>
              <p class="text-lg font-mono text-danger">Level {{ currentLevel }}</p>
              <p class="text-xs text-faint mt-1">
                {{ racewarLabel(currentRacewar) }}
              </p>
            </div>
            <ArrowRight class="w-5 h-5 text-faint" />
            <div class="flex-1">
              <p class="text-xs text-faint mb-1">New</p>
              <p class="text-lg font-mono text-success">Level {{ newLevel }}</p>
              <p class="text-xs text-faint mt-1">
                {{ newRacewar !== undefined ? racewarLabel(newRacewar) : racewarLabel(currentRacewar) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Warning -->
        <div class="bg-warning-deep/20 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle class="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-warning font-medium">Manual Override Warning</p>
            <p class="text-xs text-muted-foreground mt-1">
              {{ isReset
                ? 'This will reset all racewar progress and set the level cap back to 25. The auto-update system will resume normal operation.'
                : 'This manual change may conflict with the automatic level cap system. The MUD will continue auto-updating based on frag counts.' }}
            </p>
          </div>
        </div>

        <!-- Notes Field -->
        <div class="bg-card/50 border border-border rounded-lg p-3">
          <label class="block text-sm text-muted-foreground mb-2">
            Reason for {{ isReset ? 'Reset' : 'Change' }} (Required)
          </label>
          <textarea
            v-model="notes"
            rows="3"
            class="w-full bg-ink-high border border-faint rounded px-3 py-2 text-white placeholder:text-faint focus:outline-none focus:border-info focus:ring-1 focus:ring-info text-sm"
            :placeholder="isReset ? 'e.g., Starting new season, fixing database corruption' : 'e.g., Event override, special gameplay mode, bug fix'"
          ></textarea>
          <p v-if="notesError" class="text-xs text-danger mt-1">{{ notesError }}</p>
        </div>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel
          class="bg-ink-top text-white hover:bg-rule border-faint"
          @click="handleCancel"
        >
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          :class="isReset
            ? 'bg-danger-deep text-white hover:bg-danger-deep/80'
            : 'bg-info-deep text-white hover:bg-info-deep/80'"
          :disabled="saving || !notes.trim()"
          @click="handleConfirm"
        >
          <span v-if="saving" class="flex items-center gap-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            {{ isReset ? 'Resetting...' : 'Updating...' }}
          </span>
          <span v-else>{{ isReset ? 'Reset Level Cap' : 'Confirm Change' }}</span>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ArrowRight, AlertTriangle } from '@lucide/vue'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

interface Props {
  open: boolean
  currentLevel: number
  currentRacewar: number
  newLevel: number
  newRacewar?: number
  saving?: boolean
  isReset?: boolean
}

interface Emits {
  (e: 'update:open', value: boolean): void
  (e: 'confirm', notes: string): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const notes = ref('')
const notesError = ref('')

// Reset notes when dialog opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      notes.value = ''
      notesError.value = ''
    }
  },
)

const racewarLabel = (racewar: number): string => {
  if (racewar === 1) return 'Good Leading'
  if (racewar === 2) return 'Evil Leading'
  return 'Neutral'
}

const handleOpenChange = (value: boolean) => {
  emit('update:open', value)
}

const handleConfirm = () => {
  if (!notes.value.trim()) {
    notesError.value = 'Please provide a reason for this change'
    return
  }
  emit('confirm', notes.value)
}

const handleCancel = () => {
  emit('cancel')
}
</script>
